import type { Diagnostics } from './telemetry';
import { Schema, type Node as PMNode } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo, redo, undoDepth, redoDepth, closeHistory } from 'prosemirror-history';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { schema as baseSchema, toEngine, fromEngine, fromSelection, toSelection } from '../src/editors/prosemirror/mapping';
import { ManuscriptSchema, type Manuscript, type Selection } from '../src/contracts';
import { enter, backspace, archiveSelection, restoreDarling, newId } from '../src/document';
export type EditorEvent={type:'editor.changed'|'selection.changed';revision:number;command:string};
export type ChapterRow={id:string;title:string};
// Book-owned Darlings live in the same immutable tree/history as the prose.
const schema=new Schema({nodes:baseSchema.spec.nodes.update('doc',{content:'chapter+',attrs:{darlings:{default:[]}}}),marks:baseSchema.spec.marks});
const engineDoc=(doc:Manuscript)=>schema.nodeFromJSON({...toEngine(doc).toJSON(),attrs:{darlings:doc.darlings}});
const countWords=(text:string)=>text.trim().split(/\s+/).filter(Boolean).length;
export class EditorCore {
 private metadata:Manuscript; private current:EditorState; private view:EditorView|null=null; private enterRun=0;private keyboardInput=false;
 private listeners=new Set<(event:EditorEvent)=>void>(); revision:number; snapshots=0; words=0;
 constructor(raw:Manuscript,private diagnostics?:Diagnostics){this.metadata=ManuscriptSchema.parse(raw);this.revision=raw.revision;this.current=this.makeState(engineDoc(this.metadata));this.words=this.wordCount(this.current.doc);}
 private makeState(doc:PMNode){return EditorState.create({doc,plugins:[history(),keymap(baseKeymap)]});}
 private wordCount(doc:PMNode){let count=0;doc.descendants(node=>{if(node.isTextblock){count+=countWords(node.textContent);return false;}return true;});return count;}
 get state(){return this.current;}
 get selection(){return fromSelection(this.current.selection);}
 get canUndo(){return undoDepth(this.current)>0;} get canRedo(){return redoDepth(this.current)>0;}
 get darlings():Manuscript['darlings']{return this.current.doc.attrs.darlings;}
 get chapters():ChapterRow[]{const rows:ChapterRow[]=[];this.current.doc.forEach(c=>rows.push({id:c.attrs.id,title:c.attrs.title}));return rows;}
 get title(){return this.metadata.title;}get author(){return this.metadata.author;}
 subscribe(listener:(event:EditorEvent)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 private emit(event:EditorEvent){for(const listener of this.listeners)listener(event);}
 dispatch(tr:Transaction,command='typing'){if(this.diagnostics)this.diagnostics.sync('editor.apply',()=>this.applyTransaction(tr,command));else this.applyTransaction(tr,command);}
 private applyTransaction(tr:Transaction,command:string){
  const old=this.current,oldSelection=old.selection;
  // Formatting and a single inline replace cannot introduce block identities.
  const inline=tr.steps.every(step=>{const data=step.toJSON();if(['addMark','removeMark','docAttr'].includes(data.stepType))return true;if(data.stepType!=='replace'||tr.steps.length!==1)return false;const from=old.doc.resolve(data.from),to=old.doc.resolve(data.to);return from.sameParent(to)&&from.parent.isTextblock&&(data.slice?.content??[]).every((node:{type:string})=>node.type==='text');});
  if(tr.docChanged&&!inline){const ids=new Set([this.metadata.id,...tr.doc.attrs.darlings.map((d:Manuscript['darlings'][number])=>d.id)]);tr.doc.descendants((node,pos)=>{if(!('id' in node.attrs))return true;let id=node.attrs.id;if(!id||ids.has(id)){id=newId(node.type.name);tr.setNodeMarkup(pos,undefined,{...node.attrs,id});}ids.add(id);return true;});}
  this.current=old.apply(tr);this.view?.updateState(this.current);
  if(tr.docChanged){
   this.revision++;
   // Local text changes update only the changed paragraph. Structure uses the slower full count.
   const before=fromSelection(oldSelection),after=this.selection;
   const local=command==='typing'&&before&&after&&before.blockId===after.blockId&&old.doc.childCount===tr.doc.childCount&&oldSelection.$from.parent.isTextblock&&this.current.selection.$from.parent.isTextblock&&oldSelection.$from.parent.type===this.current.selection.$from.parent.type&&tr.steps.every(step=>step.toJSON().stepType==='replace');
   if(local)this.words+=countWords(this.current.selection.$from.parent.textContent)-countWords(oldSelection.$from.parent.textContent);else this.words=this.wordCount(tr.doc);
   this.emit({type:'editor.changed',revision:this.revision,command});
  }else if(tr.selectionSet)this.emit({type:'selection.changed',revision:this.revision,command});
 }
 snapshot():Manuscript{this.snapshots++;return fromEngine(this.current.doc,{...this.metadata,revision:this.revision,darlings:this.darlings});}
 select(selection:Selection){const target=toSelection(this.current.doc,selection);if(target)this.dispatch(this.current.tr.setSelection(target),'select');this.view?.focus();}
 insert(text:string){this.enterRun=0;this.dispatch(this.current.tr.insertText(text),'typing');}
 format(mark:'bold'|'italic'){this.enterRun=0;toggleMark(schema.marks[mark])(this.current,tr=>this.dispatch(closeHistory(tr),'format'));this.view?.focus();}
 undo(){this.enterRun=0;undo(this.current,tr=>this.dispatch(tr,'undo'));this.view?.focus();}
 redo(){this.enterRun=0;redo(this.current,tr=>this.dispatch(tr,'redo'));this.view?.focus();}
 private structural(command:string,op:(doc:Manuscript,selection:Selection)=>{document:Manuscript;selection:Selection}){
  const selection=this.selection;if(!selection)return;
  const result=op(this.snapshot(),selection);const next=engineDoc(result.document);if(next.eq(this.current.doc))return;
  let tr=closeHistory(this.current.tr.replaceWith(0,this.current.doc.content.size,next.content).setDocAttribute('darlings',next.attrs.darlings));
  const target=toSelection(tr.doc,result.selection);if(target)tr=tr.setSelection(target);
  this.dispatch(tr,command);this.view?.focus();
 }
 enter(){this.enterRun++;this.structural('enter',(d,s)=>enter(d,s,this.enterRun));}
 backspace(){this.enterRun=0;this.structural('backspace',backspace);}
 archive(){this.enterRun=0;this.structural('darling.archive',archiveSelection);}
 restore(id:string){this.enterRun=0;this.structural('darling.restore',d=>restoreDarling(d,id));}
 reopen(doc:Manuscript){this.metadata=ManuscriptSchema.parse(doc);this.revision=doc.revision;this.current=this.makeState(engineDoc(this.metadata));this.words=this.wordCount(this.current.doc);this.view?.updateState(this.current);this.emit({type:'editor.changed',revision:this.revision,command:'reopen'});}
 navigate(id:string){const chapter=this.chapters.find(c=>c.id===id);if(!chapter)return;let target:Selection|null=null;this.current.doc.forEach(c=>{if(c.attrs.id===id)c.forEach(b=>{if(!target&&b.isTextblock)target={chapterId:id,blockId:b.attrs.id,from:0,to:0};});});if(target)this.select(target);const sections=this.view?.dom.querySelectorAll<HTMLElement>('[data-id]');sections?.forEach(node=>{if(node.dataset.id===id)node.scrollIntoView({block:'start'});});}
 mount(host:HTMLElement,onSave:()=>void,onInput:(kind:string)=>void){
  this.view=new EditorView(host,{state:this.current,dispatchTransaction:tr=>this.dispatch(tr),attributes:{role:'textbox','aria-label':'Manuscript',spellcheck:'true'},handleDOMEvents:{beforeinput:()=>{if(!this.keyboardInput)onInput('input');this.keyboardInput=false;return false;}},handleKeyDown:(_view,e)=>{
   if(e.isComposing||e.keyCode===229)return false;const mod=e.ctrlKey||e.metaKey;
   if(mod&&e.key.toLowerCase()==='s'){onSave();return true;}
   if(mod&&e.key.toLowerCase()==='z'){onInput('command');e.shiftKey?this.redo():this.undo();return true;}
   if(mod&&e.key.toLowerCase()==='y'){onInput('command');this.redo();return true;}
   if(mod&&['b','i'].includes(e.key.toLowerCase())){onInput('command');this.format(e.key.toLowerCase()==='b'?'bold':'italic');return true;}
   if(mod&&e.shiftKey&&e.key.toLowerCase()==='d'){onInput('command');this.archive();return true;}
   if(e.key==='Enter'&&!e.shiftKey&&!mod&&this.selection?.from===this.selection?.to){onInput('command');this.enter();return true;}
   if(e.key==='Backspace'&&!mod&&this.selection?.from===0&&this.selection.to===0){onInput('command');this.backspace();return true;}
   this.enterRun=0;if(!mod&&e.key.length===1){this.keyboardInput=true;onInput('input');}return false;
  }});
 }
 destroy(){this.view?.destroy();this.view=null;this.listeners.clear();}
}
