import {DOMParser as PMParser,Mark,type Node as PMNode} from 'prosemirror-model';
import {EditorState,TextSelection,Plugin,type Transaction} from 'prosemirror-state';
import {EditorView,Decoration,DecorationSet} from 'prosemirror-view';
import {baseKeymap,splitBlock,toggleMark,deleteSelection} from 'prosemirror-commands';
import {history,undo,redo,closeHistory,undoDepth} from 'prosemirror-history';
import {keymap} from 'prosemirror-keymap';
import {schema,exportHTML,parseHTMLDOM} from './codec';

type Entry={root:HTMLElement;view:EditorView;commands:number;transactions:number;plugins:EditorState['plugins']};
const entries=new Map<HTMLElement,Entry>();let transactionCount=0;
// A counted Vim command may issue several deletes during one author keypress.
let keydownCommandEntries:Set<Entry>|undefined;
const nativeExec=document.execCommand.bind(document),nativeState=document.queryCommandState.bind(document),nativeEnabled=document.queryCommandEnabled.bind(document);
function selectedEntry():Entry|undefined{
 if(document.activeElement?.matches('input,textarea'))return undefined;
 const selection=window.getSelection();let node:Node|null=selection?.anchorNode??document.activeElement;
 for(;node;node=node.parentNode){if(node instanceof HTMLElement&&entries.has(node))return entries.get(node);}
 return undefined;
}
function syncSelection(entry:Entry){const {selection}=readDOM(entry.root);synchronize(entry);if(selection&&!selection.eq(entry.view.state.selection))entry.view.dispatch(entry.view.state.tr.setSelection(TextSelection.create(entry.view.state.doc,selection.anchor,selection.head)).setMeta('addToHistory',false));}
/** Native spelling ranges must be rebuilt after PM replaces their text nodes. */
function rescanSpelling(root:HTMLElement){
 const schedule=(window as Window & {scheduleSpellRescan?:(key:string,el:HTMLElement)=>void}).scheduleSpellRescan;
 const key=root.id==='aux-editor'?'aux-'+(root.dataset.kind||'notes'):root.closest<HTMLElement>('.chapter[data-id]')?.dataset.id;
 if(key)schedule?.(key,root);
}
/** Commit legacy controller DOM edits to the visible PM state before another command. */
function readDOM(root:HTMLElement){
 const sel=window.getSelection();const positions:{node:Node;offset:number;pos?:number}[]=[];
 if(sel&&root.contains(sel.anchorNode)&&root.contains(sel.focusNode)){
  const point=(node:Node,offset:number)=>{const el=node instanceof Element?node:node.parentElement;const atom=el?.closest('.ph-mark,.darling-anchor');if(atom?.parentNode&&root.contains(atom))return{node:atom.parentNode,offset:Array.from(atom.parentNode.childNodes).indexOf(atom)+(offset>0?1:0)};return{node,offset};};
  positions.push(point(sel.anchorNode!,sel.anchorOffset),point(sel.focusNode!,sel.focusOffset));
 }
 const options={preserveWhitespace:'full' as const,findPositions:positions,ruleFromNode(node:Node){return node instanceof HTMLElement&&(node.matches('br.ProseMirror-trailingBreak,.ProseMirror-widget,img.ProseMirror-separator')||(node.tagName==='BR'&&node.parentElement?.tagName==='P'&&node.parentElement.childNodes.length===1))?{ignore:true as const}:null;}};
 const doc=parseHTMLDOM(root,options);
 const selection=positions.length===2&&positions.every(p=>p.pos!==undefined)?TextSelection.between(doc.resolve(positions[0].pos!),doc.resolve(positions[1].pos!),-1):undefined;
 const anchor=sel?.anchorNode;const element=anchor instanceof Element?anchor:anchor?.parentElement;
 const italic=!!element?.closest('i,em');
 return {doc,selection,italic};
}
function synchronize(entry:Entry,reset=false){
 const {doc,selection,italic}=readDOM(entry.root);const view=entry.view;
 if(reset){discardObservedMutations(view);invalidateControllerDOM(view);view.updateState(EditorState.create({schema,doc,selection,plugins:entry.plugins}));}
 else if(!doc.eq(view.state.doc)){discardObservedMutations(view);
  let tr=attributeUpdate(view,doc);
  if(!tr){invalidateControllerDOM(view);tr=view.state.tr.replaceWith(0,view.state.doc.content.size,doc.content);}
  tr=tr.setMeta('addToHistory',false);
  if(selection)tr=tr.setSelection(TextSelection.create(tr.doc,selection.anchor,selection.head));
  if(italic&&selection?.empty)tr=tr.setStoredMarks([schema.marks.italic.create()]);
  view.dispatch(tr);
  rescanSpelling(entry.root);
 }
}
/** Paragraph styling keeps the content positions used by existing history. */
function attributeUpdate(view:EditorView,doc:PMNode):Transaction|undefined{
 const previous=view.state.doc;if(previous.childCount!==doc.childCount)return;
 for(let i=0;i<previous.childCount;i++){const a=previous.child(i),b=doc.child(i);if(a.type!==b.type||!a.content.eq(b.content)||!Mark.sameSet(a.marks,b.marks))return;}
 const tr=view.state.tr;let pos=0;
 for(let i=0;i<previous.childCount;i++){const a=previous.child(i),b=doc.child(i);if(!a.sameMarkup(b))tr.setNodeMarkup(pos,b.type,b.attrs,b.marks);pos+=a.nodeSize;}
 return tr.docChanged?tr:undefined;
}
/** Use Chromium's character boundary, then perform the deletion in PM history. */
function deleteCharacter(entry:Entry,direction:'forward'|'backward',dispatch:(tr:Transaction)=>void):boolean{
 const selection=window.getSelection();if(!selection?.rangeCount)return false;
 const before=selection.getRangeAt(0).cloneRange();
 selection.modify('extend',direction,'character');
 const range=readDOM(entry.root).selection;
 if(!range||range.empty){selection.removeAllRanges();selection.addRange(before);return false;}
 dispatch(entry.view.state.tr.setSelection(TextSelection.create(entry.view.state.doc,range.anchor,range.head)).deleteSelection());return true;
}
function notify(entry:Entry){entry.root.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));}
function command(entry:Entry,name:string,value?:string):boolean{
 syncSelection(entry);const view=entry.view;entry.commands++;
 const dispatch=(tr:Transaction)=>{const first=!keydownCommandEntries?.has(entry);keydownCommandEntries?.add(entry);view.dispatch((first?closeHistory(tr):tr).setMeta('neo-command',true));};
 switch(name.toLowerCase()){
  case 'inserttext':dispatch(view.state.tr.insertText(value??''));return true;
  case 'inserthtml':{const holder=document.createElement('div');holder.innerHTML=value??'';dispatch(view.state.tr.replaceSelection(PMParser.fromSchema(schema).parseSlice(holder,{preserveWhitespace:true})));return true;}
  case 'insertparagraph':return splitBlock(view.state,dispatch,view);
  case 'bold':case 'italic':return toggleMark(schema.marks[name.toLowerCase()])(view.state,dispatch,view);
  case 'undo':return undo(view.state,dispatch,view);
  case 'redo':return redo(view.state,dispatch,view);
  case 'delete':return view.state.selection.empty?deleteCharacter(entry,'backward',dispatch):deleteSelection(view.state,dispatch,view);
  case 'forwarddelete':return view.state.selection.empty?deleteCharacter(entry,'forward',dispatch):deleteSelection(view.state,dispatch,view);
  case 'selectall':view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,1,view.state.doc.content.size-1)));return true;
  default:return nativeExec(name,false,value);
 }
}
document.execCommand=(name:string,_ui?:boolean,value?:string):boolean=>{const entry=selectedEntry();return entry?command(entry,name,value):nativeExec(name,_ui,value);};
document.queryCommandState=(name:string):boolean=>{const entry=selectedEntry();if(!entry||!['bold','italic'].includes(name))return nativeState(name);syncSelection(entry);const state=entry.view.state,mark=schema.marks[name];return state.selection.empty?!!mark.isInSet(state.storedMarks??state.selection.$from.marks()):state.doc.rangeHasMark(state.selection.from,state.selection.to,mark);};
document.queryCommandEnabled=(name:string):boolean=>{const entry=selectedEntry();if(!entry)return nativeEnabled(name);if(name==='undo')return undo(entry.view.state);if(name==='redo')return redo(entry.view.state);return true;};
function mount(root:HTMLElement){
 const initial=readDOM(root);const doc=initial.doc;const entry={} as Entry;
 const oldClass=root.className;
 const decorationPlugin=new Plugin({props:{decorations(state){
  const attributed=!!root.closest('.kind-dedication,.kind-epigraph,.kind-part');const marks:Decoration[]=[];
  state.doc.descendants((node,pos)=>{if(node.type.name!=='paragraph')return;const attrs:Record<string,string>={};
   if(attributed&&/^(?:[—–]|--?\s)/.test(node.textContent.trim()))attrs['data-attr']='';
   if(Object.keys(attrs).length)marks.push(Decoration.node(pos,pos+node.nodeSize,attrs));
  });return DecorationSet.create(state.doc,marks);
 }}});
 const plugins=[decorationPlugin,history(),keymap({'Shift-Enter':(s,d)=>{if(root.matches('.chapter-body'))return false;d?.(s.tr.replaceSelectionWith(schema.nodes.hard_break.create()).setMeta('neo-command',true));return true;},'Mod-z':(s,d,v)=>undo(s,tr=>d?.(tr.setMeta('neo-command',true)),v),'Mod-Shift-z':(s,d,v)=>redo(s,tr=>d?.(tr.setMeta('neo-command',true)),v),'Mod-y':(s,d,v)=>redo(s,tr=>d?.(tr.setMeta('neo-command',true)),v)}),keymap(baseKeymap)];
 const view=new EditorView({mount:root},{state:EditorState.create({schema,doc,selection:initial.selection,plugins}),attributes:{class:oldClass+' ProseMirror',spellcheck:'false'},
  dispatchTransaction(tr){entry.transactions++;transactionCount++;view.updateState(view.state.apply(tr));if(tr.getMeta('neo-command')&&tr.docChanged)notify(entry);},
  handleDOMEvents:{copy(){syncSelection(entry);return false;},cut(){syncSelection(entry);return false;}},
  handleTextInput(view,from,to,text){view.dispatch(view.state.tr.insertText(text,from,to).setMeta('neo-command',true));return true;},
 });
 Object.assign(entry,{root,view,commands:0,transactions:0,plugins});entries.set(root,entry);if(initial.selection)view.focus();
 rescanSpelling(root);
}
let dialogHeadingId=0;
const fontInputs=new WeakSet<HTMLInputElement>();
function reconcile(){
 // The source closes this dialog synchronously in its input handler. Consume
 // only keys it handled, after that handler, before global navigation sees them.
 for(const input of document.querySelectorAll<HTMLInputElement>('.font-picker input')){
  if(fontInputs.has(input))continue;fontInputs.add(input);
  const backdrop=input.closest('.font-picker')!;
  input.addEventListener('keydown',event=>{if((event.key==='Escape'||event.key==='Enter')&&!backdrop.isConnected){event.preventDefault();event.stopPropagation();}});
 }

 // NEO's explicitly-role'd update notice bypasses its generic dialog naming.
 for(const box of document.querySelectorAll<HTMLElement>('.modal-backdrop .modal[role="dialog"]:not([aria-labelledby]):not([aria-label])')){
  const heading=box.querySelector<HTMLElement>(':scope > h2');
  if(heading){heading.id ||= 'pm-dialog-heading-'+(++dialogHeadingId);box.setAttribute('aria-labelledby',heading.id);}
 }
 for(const [root,entry] of entries)if(!root.isConnected){entry.view.destroy();entries.delete(root);}
 for(const root of document.querySelectorAll<HTMLElement>('.chapter-body[contenteditable="true"],#aux-editor[contenteditable="true"],.ps-body[contenteditable="true"]'))if(!entries.has(root))mount(root);
}
function consume(records:MutationRecord[]){
 const resets=new Set<HTMLElement>();
 for(const record of records)if(record.type==='attributes'&&record.attributeName==='contenteditable'&&record.oldValue==='false'&&record.target instanceof HTMLElement)resets.add(record.target);
 reconcile();for(const entry of entries.values())if(resets.has(entry.root)||records.some(r=>r.type==='attributes'&&['class','style'].includes(r.attributeName??'')&&r.target instanceof HTMLElement&&r.target.tagName==='P'&&entry.root.contains(r.target)))synchronize(entry,resets.has(entry.root));
}
const observer=new MutationObserver(consume);
type ObservedView=EditorView & {domObserver:{stop():void;start():void;flush():void;queue:MutationRecord[];observer:MutationObserver|null}};
function invalidateControllerDOM(view:EditorView){(view as EditorView & {docView:{markDirty(from:number,to:number):void}}).docView.markDirty(0,view.state.doc.content.size);}
// NEO's input listeners read and normalize the DOM before PM's asynchronous
// mutation observer runs. Commit the browser edit first, with PM's real history,
// so captureBody only synchronizes the subsequent controller normalization.
document.addEventListener('input',event=>{const root=event.target;const entry=root instanceof HTMLElement?entries.get(root):undefined;if(entry)(entry.view as ObservedView).domObserver.flush();},true);
document.addEventListener('selectionchange',()=>{const entry=selectedEntry();if(entry)syncSelection(entry);},true);
let keydownBoundaryPending=false;
let keydownBoundaryTimer:ReturnType<typeof setTimeout>|undefined;
function finishKeydownBoundary(){if(!keydownBoundaryPending)return;keydownBoundaryPending=false;
 clearTimeout(keydownBoundaryTimer);keydownBoundaryTimer=undefined;
 try{consume(observer.takeRecords());for(const entry of entries.values())synchronize(entry);const active=selectedEntry();if(active)syncSelection(active);}
 finally{keydownCommandEntries=undefined;for(const entry of entries.values())(entry.view as ObservedView).domObserver.start();}
}
window.addEventListener('keydown',event=>{finishKeydownBoundary();
 // Fullscreen owns modified Enter before NEO's paragraph/scene handlers.
 // The source's document listener otherwise runs after those author edits.
 if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)&&!event.shiftKey&&!event.altKey&&!event.isComposing&&event.keyCode!==229&&!document.querySelector('.modal-backdrop:not([hidden])')){
  const toggle=(window as Window & {neo?:{fullscreenToggle:()=>Promise<unknown>}}).neo?.fullscreenToggle;
  if(toggle){event.preventDefault();event.stopImmediatePropagation();void toggle();return;}
 }
 for(const entry of entries.values()){syncSelection(entry);(entry.view as ObservedView).domObserver.stop();}keydownCommandEntries=new Set();keydownBoundaryPending=true;keydownBoundaryTimer=setTimeout(finishKeydownBoundary,0);},true);
function discardObservedMutations(view:EditorView){const observed=(view as ObservedView).domObserver;observed.queue.length=0;observed.observer?.takeRecords();}
document.addEventListener('keydown',finishKeydownBoundary);
// The source resumes an opened book on its next frame. Author input that
// arrives first owns the caret; a delayed saved spot must not interrupt it.
let authorInputRevision=0;
document.addEventListener('input',event=>{if(event.target instanceof Element&&event.target.closest('.chapter-body'))authorInputRevision++;},true);
function protectPendingOpenResume(){
 const legacy=window as Window & {openBook?:(id:string)=>Promise<void>;resumePosition?:(pos:unknown)=>boolean};
 const open=legacy.openBook,resume=legacy.resumePosition;if(!open||!resume)return;
 let pending:{revision:number}|undefined;
 legacy.openBook=async id=>{const token={revision:authorInputRevision};pending=token;try{await open(id);}finally{requestAnimationFrame(()=>{if(pending===token)pending=undefined;});}};
 legacy.resumePosition=pos=>{if(pending&&pending.revision!==authorInputRevision)return false;return resume(pos);};
}
function start(){
 protectPendingOpenResume();
 const legacy=window as Window & {resetNativeUndo?:()=>void;captureBody?:(body:HTMLElement)=>string;syncChapter?:(body:HTMLElement,chId:string)=>void};const reset=legacy.resetNativeUndo;
 const sync=legacy.syncChapter;if(sync)legacy.syncChapter=(body,chId)=>{const entry=entries.get(body);if(entry)synchronize(entry);sync(body,chId);};
 const capture=legacy.captureBody;if(capture)legacy.captureBody=body=>{const entry=entries.get(body);if(!entry)return capture(body);synchronize(entry);return exportHTML(document,readDOM(body).doc);};
 if(reset)legacy.resetNativeUndo=()=>{reconcile();const entry=selectedEntry();if(entry)synchronize(entry,true);else reset();};
 observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeOldValue:true});reconcile();const style=document.createElement('style');style.textContent='.ProseMirror { white-space: pre-wrap; } body.full-screen.focus-mode #bottombar:not(:hover):not(.attn):has(:focus-visible) { opacity: 1; }';document.head.append(style);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
declare global{interface Window{neoProseMirror:{diagnostics:()=>{views:number;transactions:number;documents:string[];commands:number;debug:unknown};}}}
window.neoProseMirror={diagnostics:()=>({debug:[...entries.values()].map(e=>({html:e.root.innerHTML,doc:e.view.state.doc.toJSON(),undo:undoDepth(e.view.state),selection:e.view.state.selection.toJSON()})),views:entries.size,transactions:transactionCount,documents:[...entries.values()].map(e=>e.view.state.doc.textContent),commands:[...entries.values()].reduce((n,e)=>n+e.commands,0)})};

const host=(window as Window & {neo?:{onMenu(cb:(message:{type:string;value?:string})=>void):void}}).neo;
host?.onMenu(message=>{if(message.type==='pmCommand')document.execCommand(message.value??'');});
