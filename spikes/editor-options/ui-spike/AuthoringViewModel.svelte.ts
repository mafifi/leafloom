import type { AuthoringUI, DarlingRow, WritingPanel } from './ui-contracts';
import { EditorCore, type ChapterRow } from './core';
import { Diagnostics } from './telemetry';
import type { Manuscript } from '../src/contracts';
import type { BookStore } from './storage';
export class AuthoringViewModel implements AuthoringUI {
 readonly core:EditorCore;readonly diagnostics:Diagnostics;
 chapters=$state.raw<ChapterRow[]>([]);darlings=$state.raw<DarlingRow[]>([]);
 revision=$state(0);words=$state(0);canUndo=$state(false);canRedo=$state(false);currentChapter=$state('');
 panel=$state<WritingPanel>('notes');notes=$state('');outline=$state('');status=$state('Writing locally');dark=$state(false);
 title=$state('');author=$state('');private inputStarted:number|null=null;private darlingSource:Manuscript['darlings']|null=null;private timer:ReturnType<typeof setTimeout>|null=null;private auxiliaryRevision=0;private saves:Promise<void>=Promise.resolve();private disposed=false;private unsubscribe:()=>void;
 constructor(document:Manuscript,private store:BookStore,diagnostics=new Diagnostics()){
  this.diagnostics=diagnostics;this.core=new EditorCore(document,diagnostics);this.title=document.title;this.author=document.author;this.project();
  this.unsubscribe=this.core.subscribe(event=>{this.project();if(event.type==='editor.changed'&&this.inputStarted!==null){this.diagnostics.recordCommit(event.command==='typing'?'input':'command',performance.now()-this.inputStarted);this.inputStarted=null;}if(event.type==='editor.changed'&&event.command!=='reopen'){this.status='Writing locally';this.schedule();}});
 }
 private project(){this.revision=this.core.revision;this.words=this.core.words;this.canUndo=this.core.canUndo;this.canRedo=this.core.canRedo;this.currentChapter=this.core.selection?.chapterId??'';
  const rows=this.core.chapters;if(rows.length!==this.chapters.length||rows.some((r,i)=>r.id!==this.chapters[i].id||r.title!==this.chapters[i].title))this.chapters=rows;
  if(this.core.darlings!==this.darlingSource){this.darlingSource=this.core.darlings;this.darlings=this.core.darlings.map(d=>({id:d.id,text:d.runs.map(r=>r.text).join('')}));}
 }
 mount(host:HTMLElement){this.core.mount(host,()=>void this.save(),kind=>{this.inputStarted=performance.now();this.diagnostics.startFrame(kind==='input'?'input':'command');});}
 private command(operation:()=>void){this.inputStarted=performance.now();this.diagnostics.startFrame('command');try{this.diagnostics.sync('editor.command',operation);this.status='Writing locally';}catch(error){this.status=error instanceof Error?error.message:'Command failed';}}
 format(mark:'bold'|'italic'){this.command(()=>this.core.format(mark));}
 undo(){this.command(()=>this.core.undo());}redo(){this.command(()=>this.core.redo());}
 archive(){this.command(()=>this.core.archive());}restore(id:string){this.command(()=>this.core.restore(id));}
 navigate(id:string){this.command(()=>this.core.navigate(id));}
 selectPanel(panel:WritingPanel){this.panel=panel;}toggleDark(){this.dark=!this.dark;}
 setNotes(value:string){this.notes=value;this.auxiliaryRevision++;this.status='Writing locally';this.schedule();}
 setOutline(value:string){this.outline=value;this.auxiliaryRevision++;this.status='Writing locally';this.schedule();}
 private schedule(){if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;void this.save();},600);}
 async save(){if(this.timer){clearTimeout(this.timer);this.timer=null;}try{await this.diagnostics.run('save',async parent=>{
  const version=this.auxiliaryRevision,document=this.diagnostics.sync('save.snapshot',()=>this.core.snapshot(),parent),notes=this.notes,outline=this.outline;
  const operation=this.saves.then(()=>this.diagnostics.run('save.port',async()=>{await this.store.save(document);await this.store.saveText('notes',notes);await this.store.saveText('outline',outline);},parent));this.saves=operation.catch(()=>{});await operation;
  if(!this.disposed&&document.revision===this.revision&&version===this.auxiliaryRevision)this.status='Saved';
 });}catch(error){if(!this.disposed)this.status=error instanceof Error?error.message:'Save failed';}}
 async reopen(){if(this.timer){clearTimeout(this.timer);this.timer=null;}const revision=this.revision,auxiliary=this.auxiliaryRevision;try{await this.saves;const [document,notes,outline]=await this.diagnostics.run('reopen',async()=>Promise.all([this.store.load(),this.store.loadText('notes'),this.store.loadText('outline')]));if(this.disposed)return;
  if(revision!==this.revision||auxiliary!==this.auxiliaryRevision){this.status='Writing changed while reopening. Reopen again when ready.';return;}
  if(!document){this.status='No saved manuscript';return;}this.core.reopen(document);this.title=document.title;this.author=document.author;this.notes=notes;this.outline=outline;this.status='Reopened';
 }catch(error){this.status=error instanceof Error?error.message:'Reopen failed';}}
 dispose(){this.disposed=true;if(this.timer)clearTimeout(this.timer);this.unsubscribe();this.core.destroy();void this.diagnostics.dispose();}
}
