import type { ChapterRow } from './core';
export type WritingPanel='notes'|'outline'|'darlings';
export type DarlingRow={id:string;text:string};
/** The presentation surface exposes no editor state, snapshots or storage APIs. */
export interface AuthoringUI {
 readonly title:string;readonly author:string;readonly revision:number;readonly words:number;
 readonly chapters:readonly ChapterRow[];readonly darlings:readonly DarlingRow[];readonly currentChapter:string;
 readonly canUndo:boolean;readonly canRedo:boolean;readonly panel:WritingPanel;readonly notes:string;readonly outline:string;readonly status:string;readonly dark:boolean;
 mount(host:HTMLElement):void;dispose():void;
 format(mark:'bold'|'italic'):void;undo():void;redo():void;
 archive():void;restore(id:string):void;navigate(id:string):void;
 setNotes(value:string):void;setOutline(value:string):void;
 selectPanel(panel:WritingPanel):void;toggleDark():void;
 save():Promise<void>;reopen():Promise<void>;
}
