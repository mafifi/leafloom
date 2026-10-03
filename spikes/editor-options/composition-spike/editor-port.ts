import type { ChapterRow,CoreEvent,CheckpointValue,ReviewInput,Opened } from './contracts';import type { PassageReference,ReviewItemValue } from '../identity-spike/contracts';
export type Resolution={status:string;segments:{chapterId:string;passageId:string;from:number;to:number}[];text:string};
export type ReviewRow=ReviewItemValue&{state:string;resolutions:Resolution[]};
export interface EditorPort {
 readonly title:string;readonly author:string;readonly revision:number;readonly words:number;readonly snapshots:number;readonly canUndo:boolean;readonly canRedo:boolean;readonly chapters:ChapterRow[];readonly activeSection:{id:string;role:string}|null;readonly darlings:{id:string;html:string;text?:string}[];
 subscribe(fn:(e:CoreEvent)=>void):()=>void;setTraceParent(carrier?:string):void;supported(id:string):boolean;select(id:string,from:number,to?:number):void;insert(text:string):void;format(mark:'bold'|'italic'):void;undo():boolean;redo():boolean;
 createChapter(title:string):string;renameChapter(id:string,title:string):void;duplicateChapter(id:string):string;deleteChapter(id:string):void;reorderChapter(id:string,index:number):void;movePassage(id:string,targetId:string,index?:number):void;archive():void;restore(id:string):void;
 passageRows(sectionId?:string):{id:string;chapterId:string;kind:string;text:string;size:number}[];capture(id:string,from:number,to:number):PassageReference;captureSelection():PassageReference;resolve(id:string):Resolution;extract(ids:string[],category:ReviewInput['category']):ReviewInput;receive(reply:unknown):void;reviewRows():ReviewRow[];accept(id:string):{ok:boolean;code?:string};reject(id:string):void;checkpoint(traceparent?:string):CheckpointValue;
}
export interface SurfacePort {render(main:HTMLElement,auxiliary:HTMLElement,current:string,panel:string,enabled:boolean):void;update(current:string,panel:string,enabled:boolean):void;focus():void;destroy():void;}
export type SurfaceActions={undo():void;redo():void;save():void;format(mark:'bold'|'italic'):void;archive():void};
