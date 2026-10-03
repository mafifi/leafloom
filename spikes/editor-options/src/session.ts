import { ManuscriptSchema } from './contracts';
import type { Manuscript, ManuscriptEvent, Selection, Proposal } from './contracts';
import { enter, backspace, archiveSelection, restoreDarling, applyProposal } from './document';
type Snapshot = { document: Manuscript; selection: Selection | null };
export class ManuscriptSession {
 document: Manuscript; selection: Selection | null = null;
 private past: Snapshot[] = []; private future: Snapshot[] = [];
 private listeners = new Set<(event:ManuscriptEvent)=>void>();
 private typing: { blockId: string | undefined; at: number } | null = null;
 constructor(document: Manuscript) { this.document=ManuscriptSchema.parse(document); }
 subscribe(callback:(event:ManuscriptEvent)=>void) { this.listeners.add(callback); return ()=>this.listeners.delete(callback); }
 emit(event:ManuscriptEvent) { for (const callback of this.listeners) callback(event); }
 private snapshot(): Snapshot {return {document:structuredClone(this.document),selection:this.selection ? {...this.selection}:null};}
 private commit(document:Manuscript,selection:Selection|null,cause:string,group=false) {
  const next=ManuscriptSchema.parse(document); if (JSON.stringify(next.chapters)===JSON.stringify(this.document.chapters) && JSON.stringify(next.darlings)===JSON.stringify(this.document.darlings)) {this.selection=selection; return;}
  if (!group) {this.past.push(this.snapshot()); if(this.past.length>100)this.past.shift();}
  this.future=[]; next.revision=this.document.revision+1; this.document=next; this.selection=selection;
  this.emit({type:'document.changed',revision:next.revision,cause});
 }
 nativeChange(document:Manuscript,selection:Selection|null,cause:string) {
  const now=Date.now(); const group=cause==='typing' && !!this.typing && this.typing.blockId===selection?.blockId && now-this.typing.at<750;
  this.commit({...this.document,chapters:document.chapters},selection,cause,group);
  this.typing=cause==='typing'?{blockId:selection?.blockId,at:now}:null;
 }
 setSelection(selection:Selection|null) { this.selection=selection; }
 private act(cause:string,op:()=>{document:Manuscript;selection:Selection}) {this.typing=null;const result=op();this.commit(result.document,result.selection,cause);}
 enter(count:number) {if(this.selection)this.act('enter',()=>enter(this.document,this.selection!,count));}
 backspace() {if(this.selection)this.act('backspace',()=>backspace(this.document,this.selection!));}
 archive() {if(this.selection)this.act('darling.archived',()=>archiveSelection(this.document,this.selection!));}
 restore(id:string) {this.act('darling.restored',()=>restoreDarling(this.document,id));}
 apply(proposal:Proposal) {
  try {this.act('proposal',()=>applyProposal(this.document,proposal));this.emit({type:'proposal.applied',proposalId:proposal.id,rebased:proposal.sourceRevision<this.document.revision-1});}
  catch(error){this.emit({type:'proposal.rejected',proposalId:proposal.id,reason:error instanceof Error?error.message:'Proposal rejected'});throw error;}
 }
 undo() {const previous=this.past.pop();if(!previous)return;this.future.push(this.snapshot());this.restoreHistory(previous,'undo');}
 redo() {const next=this.future.pop();if(!next)return;this.past.push(this.snapshot());this.restoreHistory(next,'redo');}
 private restoreHistory(snapshot:Snapshot,cause:string) {this.typing=null;const revision=this.document.revision+1;this.document=structuredClone(snapshot.document);this.document.revision=revision;this.selection=snapshot.selection;this.emit({type:'document.changed',revision,cause});}
 load(document:Manuscript) {this.document=ManuscriptSchema.parse(document);this.selection=null;this.past=[];this.future=[];this.typing=null;this.emit({type:'document.loaded',revision:document.revision});}
 get canUndo(){return this.past.length>0;} get canRedo(){return this.future.length>0;}
}
