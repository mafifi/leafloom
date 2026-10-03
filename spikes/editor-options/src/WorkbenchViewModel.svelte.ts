import { ManuscriptSchema, ProposalSchema } from './contracts';
import type { EngineId, Manuscript, ManuscriptEditor, ManuscriptEvent, ManuscriptStore, Proposal, Selection } from './contracts';
import { createFixture } from './fixture';
import { ManuscriptSession } from './session';
import { textOf, locate } from './document';
import { createDeterministicAgent } from './agent';
import { createBrowserStore } from './persistence/browser-store';
import { createNeoEditor } from './editors/neo';
import { createProseMirrorEditor } from './editors/prosemirror';
import { createLexicalEditor } from './editors/lexical';
const factories={neo:createNeoEditor,prosemirror:createProseMirrorEditor,lexical:createLexicalEditor};
export class WorkbenchViewModel {
 engine=$state<EngineId>('neo'); document=$state<Manuscript>(createFixture()); selection=$state<Selection|null>(null);
 events=$state<ManuscriptEvent[]>([]); message=$state(''); proposal=$state<Proposal|null>(null); reviewing=$state(false); saved=$state<number|null>(null);
 dark=$state(false); inspector=$state(true); shelf=$state(false); canUndo=$state(false); canRedo=$state(false);
 words=$derived(this.document.chapters.flatMap(c=>c.blocks).map(textOf).join(' ').trim().split(/\s+/).filter(Boolean).length);
 selectedText=$derived.by(()=>{try {return this.selection?textOf(locate(this.document,this.selection.blockId).block).slice(this.selection.from,this.selection.to):'';}catch{return '';}});
 private session=new ManuscriptSession(createFixture()); private editor:ManuscriptEditor|null=null; private host:HTMLElement|null=null;
 private enterRun=0; private saveTimer:ReturnType<typeof setTimeout>|null=null; private controller:AbortController|null=null; private disposed=false; private generation=0;
 private store:ManuscriptStore; private unsubscribe:()=>void;
 constructor(){this.store=window.spikeHost?{save:async d=>window.spikeHost!.save(ManuscriptSchema.parse(d)),load:async()=>{const d=await window.spikeHost!.load();return d?ManuscriptSchema.parse(d):null;}}:createBrowserStore();
  const option=new URLSearchParams(window.location.search).get('engine');if(option==='neo'||option==='lexical'||option==='prosemirror')this.engine=option;
  this.unsubscribe=this.session.subscribe(event=>{this.events=[...this.events.slice(-39),event];this.sync();if(event.type==='document.changed')this.scheduleSave();});
 }
 private sync(){this.document=structuredClone(this.session.document);this.selection=this.session.selection;this.canUndo=this.session.canUndo;this.canRedo=this.session.canRedo;}
 mount(host:HTMLElement){this.host=host;this.mountEngine();}
 private mountEngine(){if(!this.host)return;this.editor?.destroy();this.editor=factories[this.engine]();this.editor.mount(this.host,this.session.document,{changed:(doc,sel,cause)=>{try{this.session.nativeChange(doc,sel,cause);this.message='';}catch(e){this.fail(e);}},gesture:e=>this.gesture(e),selectionChanged:sel=>{this.session.setSelection(sel);this.selection=sel;}});if(this.selection)this.editor.select(this.selection);}
 switchEngine(id:EngineId){this.capture();this.engine=id;this.enterRun=0;this.mountEngine();const url=new URL(window.location.href);url.searchParams.set('engine',id);if(url.protocol!=='file:')history.replaceState(null,'',url);}
 private capture(){if(this.editor){const current=this.editor.read();this.session.setSelection(current.selection);this.selection=current.selection;}}
 private redraw(){this.sync();this.editor?.replace(this.session.document,this.session.selection);}
 private fail(error:unknown){this.message=error instanceof Error?error.message:'Operation failed.';}
 private run(command:()=>void){try{this.capture();command();this.redraw();this.message='';}catch(e){this.fail(e);}}
 private gesture(event:KeyboardEvent):boolean {
  if(event.isComposing||event.keyCode===229)return false;
  const mod=event.metaKey||event.ctrlKey;
  if(mod&&event.key.toLowerCase()==='z'){this.run(()=>event.shiftKey?this.session.redo():this.session.undo());this.enterRun=0;return true;}
  if(mod&&event.key.toLowerCase()==='y'){this.run(()=>this.session.redo());return true;}
  if(mod&&(event.key.toLowerCase()==='b'||event.key.toLowerCase()==='i')){this.format(event.key.toLowerCase()==='b'?'bold':'italic');return true;}
  if(mod&&event.shiftKey&&event.key.toLowerCase()==='d'){this.archive();return true;}
  if(mod&&event.key.toLowerCase()==='s'){void this.save();return true;}
  this.capture();if(!this.selection)return false;
  if(event.key==='Enter'&&!event.shiftKey&&!mod&&this.selection.from===this.selection.to){this.enterRun++;this.run(()=>this.session.enter(this.enterRun));return true;}
  this.enterRun=0;
  if(event.key==='Backspace'&&!mod&&this.selection.from===0&&this.selection.to===0){this.run(()=>this.session.backspace());return true;}
  return false;
 }
 select(selection:Selection){this.session.setSelection(selection);this.selection=selection;this.editor?.select(selection);}
 focusChapter(id:string){const c=this.document.chapters.find(c=>c.id===id);if(c){this.select({chapterId:id,blockId:c.blocks.find(b=>b.kind!=='scene-break')?.id??c.blocks[0].id,from:0,to:0});this.host?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({block:'start',behavior:'smooth'});}}
 format(mark:'bold'|'italic'){this.editor?.format(mark);}
 archive(){this.run(()=>this.session.archive());}
 restore(id:string){this.run(()=>this.session.restore(id));}
 undo(){this.run(()=>this.session.undo());} redo(){this.run(()=>this.session.redo());}
 reset(){this.generation++;this.cancelReview();if(this.saveTimer){clearTimeout(this.saveTimer);this.saveTimer=null;}this.proposal=null;this.session.load(createFixture());this.saved=null;this.redraw();this.message='Fixture restored.';}
 private scheduleSave(){if(this.saveTimer)clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>{this.saveTimer=null;void this.save();},800);}
 async save(throwOnError=false){try {const generation=this.generation;const doc=structuredClone(this.session.document);await this.store.save(doc);if(!this.disposed&&generation===this.generation&&doc.revision===this.session.document.revision){this.saved=doc.revision;this.session.emit({type:'document.saved',revision:doc.revision});this.message='Saved.';}}catch(e){this.fail(e);if(throwOnError)throw e;}}
 async reopen(){try{if(this.saveTimer){clearTimeout(this.saveTimer);this.saveTimer=null;}const generation=this.generation,revision=this.session.document.revision;const doc=await this.store.load();if(generation!==this.generation||revision!==this.session.document.revision){this.message='You kept writing while reopening. Reopen again when ready.';return;}if(!doc){this.message='No saved manuscript yet.';return;}this.generation++;this.cancelReview();this.proposal=null;this.session.load(doc);this.redraw();this.message='Reopened saved manuscript.';}catch(e){this.fail(e);}}
 async review(){if(this.reviewing)return;this.capture();if(!this.selection||!this.selectedText.trim()){this.message='Select a passage to review.';return;}const controller=new AbortController();this.controller=controller;this.reviewing=true;this.proposal=null;
  try{const result=ProposalSchema.parse(await createDeterministicAgent().review(structuredClone(this.session.document),{...this.selection},controller.signal));if(this.disposed||controller.signal.aborted||this.controller!==controller)return;this.proposal=result;this.session.emit({type:'proposal.received',proposalId:result.id,sourceRevision:result.sourceRevision});}catch(e){if(!this.disposed&&!controller.signal.aborted)this.fail(e);}finally{if(this.controller===controller){this.reviewing=false;this.controller=null;}}
 }
 cancelReview(){this.controller?.abort();this.controller=null;this.reviewing=false;}
 accept(){if(!this.proposal)return;const proposal=this.proposal;this.run(()=>this.session.apply(proposal));if(this.events.at(-1)?.type==='proposal.applied'){this.proposal=null;this.message='Revision applied. Undo restores your text.';}}
 dismiss(){this.proposal=null;}
 dispose(){this.disposed=true;this.controller?.abort();if(this.saveTimer)clearTimeout(this.saveTimer);this.unsubscribe();this.editor?.destroy();}
}
