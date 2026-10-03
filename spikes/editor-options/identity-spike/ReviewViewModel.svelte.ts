import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { IdentitySession } from './session';
import { deterministicReview } from './fixture';
import type { ReferenceResolution, ReviewState } from './contracts';
export type ReviewRow=ReviewState&{resolutions:ReferenceResolution[]};
export interface ReviewUI {
 readonly rows:ReviewRow[];readonly status:string;readonly activeChapter:string;readonly chapters:string[];readonly unsupported:boolean;
 mount(host:HTMLElement):()=>void;reviewSelection():void;reviewStructure():void;accept(id:string):void;reject(id:string):void;undo():void;redo():void;move():void;switchChapter(id:string):void;saveAndReopen():void;
}
export class ReviewViewModel implements ReviewUI {
 rows=$state<ReviewRow[]>([]);status=$state('Ready');activeChapter=$state('arrival');chapters=$state<string[]>(['arrival','return']);unsupported=$state(false);
 private session:IdentitySession|null=null;private view:EditorView|null=null;private host:HTMLElement|null=null;
 constructor(private initialHTML='<p>Mara whispered softly.</p><p>She kept her promise.</p>'){}
 mount(host:HTMLElement){this.host=host;this.session=new IdentitySession(host.ownerDocument,{formatVersion:'neo-lifecycle/v1',revision:0,metadata:{id:'book-fixture',title:'The promise',author:'Writer'},chapters:[{id:'arrival',html:this.initialHTML},{id:'return',html:'<p>Mara returned at dawn.</p>'}],darlings:[]});this.render();return()=>{this.view?.destroy();this.view=null;this.host=null;this.session=null;};}
 private render(){if(!this.host||!this.session)return;this.view?.destroy();const e=this.session.editor(this.activeChapter);this.unsupported=!e.supported;
  const extra=keymap({'Mod-z':()=>{this.undo();return true;},'Mod-Shift-z':()=>{this.redo();return true;},'Mod-y':()=>{this.redo();return true;},'Mod-b':toggleMark(e.state.schema.marks.bold),'Mod-i':toggleMark(e.state.schema.marks.italic)});
  e.state=e.state.reconfigure({plugins:[...e.state.plugins.filter(p=>!p.spec.props?.handleKeyDown),extra,keymap(baseKeymap)]});
  this.view=new EditorView(this.host,{state:e.state,editable:()=>e.supported,attributes:{role:'textbox','aria-label':'Manuscript'},dispatchTransaction:tr=>{e.dispatch(tr);this.view?.updateState(e.state);this.refresh();}});
  this.refresh();if(this.unsupported)this.status='Unsupported content preserved; editing is disabled.';
 }
 private refresh(){if(!this.session)return;this.rows=this.session.reviews().map(row=>({...row,resolutions:row.references.map(id=>this.session!.resolve(id))}));}
 reviewSelection(){if(!this.session||!this.view)return;const e=this.session.editor(this.activeChapter),{from,to}=e.state.selection;const p=e.passages.find(p=>from>=p.pos+1&&to<=p.pos+1+p.node.content.size);if(!p||from===to){this.status='Select text within one paragraph.';return;}const ref=this.session.capture(this.activeChapter,p.node.attrs.pid,from-p.pos-1,to-p.pos-1);this.session.receive(deterministicReview(this.session.extract([ref.id],'voice')));this.refresh();this.status='Fixture review attached.';}
 reviewStructure(){if(!this.session)return;const refs=this.session.passages().filter(p=>p.size>0).map(p=>this.session!.capture(p.chapterId,p.id,0,p.size));if(!refs.length){this.status='No supported passages to review.';return;}this.session.receive(deterministicReview(this.session.extract(refs.map(r=>r.id),'structure')));this.refresh();this.status='Structure fixture linked across passages.';}
 accept(id:string){if(!this.session)return;const result=this.session.accept(id);this.view?.updateState(this.session.editor(this.activeChapter).state);this.refresh();this.status=result.ok?'Suggestion accepted.':result.code==='STALE'?'Suggestion is stale; your writing is unchanged.':'This suggestion cannot be applied safely.';}
 reject(id:string){if(!this.session)return;const result=this.session.reject(id);this.refresh();this.status=result.ok?'Review dismissed.':'Review cannot be dismissed.';}
 undo(){if(!this.session)return;this.session.editor(this.activeChapter).undo();this.view?.updateState(this.session.editor(this.activeChapter).state);this.refresh();}
 redo(){if(!this.session)return;this.session.editor(this.activeChapter).redo();this.view?.updateState(this.session.editor(this.activeChapter).state);this.refresh();}
 move(){if(!this.session)return;const passages=this.session.passages().filter(p=>p.chapterId===this.activeChapter);if(passages.length<2)return;this.session.move(this.activeChapter,passages[0].id,1);this.view?.updateState(this.session.editor(this.activeChapter).state);this.refresh();}
 switchChapter(id:string){if(!this.chapters.includes(id))return;this.activeChapter=id;this.render();}
 saveAndReopen(){if(!this.session||!this.host)return;const saved=this.session.checkpoint();this.session=new IdentitySession(this.host.ownerDocument,JSON.parse(JSON.stringify(saved.book)),JSON.parse(JSON.stringify(saved.reviews)));this.render();this.status='Book and reviews reopened from their JSON contracts.';}
}
