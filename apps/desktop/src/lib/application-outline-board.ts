import type { EditorPort, OutlineCardTarget, SurfacePort } from '@leafloom/editor-contracts';
import type { AppState, MenuItem } from './application-types';
import type { OutlineBoardActions } from './outline-board-presentation';
export interface OutlineBoardContext {
 value: AppState; editor: EditorPort | null; surfaces: SurfacePort<HTMLElement> | null;
 bindAuthorDraft(flush:()=>void):()=>void; showSide(open:boolean):void; writable():boolean; setPanel(panel:string):void; rendered():Promise<void>;
 preference(key:string,value:unknown):Promise<void>; background(command:()=>void|Promise<void>):Promise<void>;
 menu(event:MouseEvent,items:MenuItem[]):void; chapterContext(id:string,index:number):MenuItem[];
}
/** Bind cards to the live editor command owner; card state is always a projection. */
export function outlineBoardActions(context:OutlineBoardContext):OutlineBoardActions {
 const go=(target:OutlineCardTarget)=>{
  if(target.kind==='loose')return;
  const card=context.editor?.outlineCards.find(card=>card.chapterId===target.chapterId && (target.kind==='chapter'?card.kind==='chapter':target.kind==='scene'?card.passageId===target.passageId:target.sectionId?card.sectionId===target.sectionId:card.segmentIndex===target.segmentIndex));
  context.setPanel('manuscript');
  void context.rendered().then(()=>{
   const passage=card?.passageId??context.editor?.passageRows(target.chapterId)[0]?.id;
   if(passage){const row=context.editor?.passageRows(target.chapterId).find(row=>row.id===passage), end=target.kind==='scene'?row?.size??0:0;context.editor?.selectPassage(passage,end,card?.ghost?row?.size??0:end);}
   context.surfaces?.focus({preventScroll:true});context.surfaces?.revealSelection({viewportFraction:target.kind==='scene'?1/4:1/3});
  });
 };
 return {
  bindFlush:flush=>context.bindAuthorDraft(flush),
  showAside:()=>context.showSide(true),
  edit:(target,text,slug)=>{if(context.writable())context.editor?.saveOutlineCard(target,text,slug);},
  insert:(location,text,slug)=>context.writable()?context.editor?.insertOutlineCard(location,text,slug)??null:null,
  removeNote:target=>{if(context.writable())context.editor?.deleteOutlineCardNote(target);},
  drop:(source,target,side)=>context.writable()?context.editor?.dropOutlineCard(source,target,side)??false:false,
  go,
  menu:(event,target)=>{
   const card = context.editor?.outlineCards.find(card=>card.chapterId===target.chapterId && (target.kind==='chapter'?card.kind==='chapter':target.kind==='scene'?card.passageId===target.passageId:target.sectionId?card.sectionId===target.sectionId:card.segmentIndex===target.segmentIndex));
   if(target.kind==='chapter') { context.menu(event,context.chapterContext(target.chapterId,context.value.chapters.findIndex(ch=>ch.id===target.chapterId)));return; }
   if(target.kind==='loose') { context.menu(event,[{label:'Delete card',danger:true,disabled:!context.writable(),run:()=>context.editor?.deleteOutlineCardNote(target)}]);return; }
   context.menu(event,[
    {label:'Go to the page',disabled:Boolean(card?.virtual),run:()=>go(target)},
    ...(target.kind==='section'?[
     {label:'Make it a chapter',disabled:!context.writable()||Boolean(card?.virtual),run:()=>{context.editor?.promoteOutlineSection(target);}},
     {label:'Move to loose cards',disabled:!context.writable()||Boolean(card?.written)||!target.sectionId,run:()=>{context.editor?.dropOutlineCard(target,'loose','into');}},
    ]:[]),
    {label:'Delete the note',danger:true,disabled:!context.writable()||(target.kind==='scene'?!card?.sceneId:!target.sectionId),run:()=>{context.editor?.deleteOutlineCardNote(target);}},
   ]);
  },
  view:value=>{void context.background(()=>context.preference('outlineView',value));},
  zoom:value=>{void context.background(()=>context.preference('cardZoom',Math.max(.55,Math.min(1.5,value))));},
 };
}
