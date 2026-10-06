import {HostOperationError,type HostMethod} from '@leafloom/desktop-host';
type Translate=(key:string,args?:Record<string,string|number>)=>string;
const labels:Partial<Record<HostMethod,string>>={checkpoint:'Save',writeLibrary:'Library settings',createBook:'New Book',importManuscript:'Import…',exportBook:'Export…',exportChapter:'Export Chapter…',saveExport:'Export…',createBackup:'Back Up Now',deleteBook:'Move to Trash'};
/** Content-free feedback leaves the pending author revision available for a retry. */
export function refusedWriteHint(error:unknown,t:Translate,platform?:string):string|null {
 if(!(error instanceof HostOperationError)||error.code!=='WRITE_REFUSED')return null;
 const operation=t(labels[error.operation]??error.operation.replace(/([a-z])([A-Z])/g,'$1 $2'));
 const explanation=platform==='windows'?"This is usually Windows Security's Controlled folder access (Virus & threat protection → Ransomware protection). Allow Leafloom there, or keep your library in another folder.":'Check that the folder exists and that Leafloom may write to it, or keep your library in another folder.';
 return [t("Leafloom can't save in your library folder"),t('Operation: {operation}',{operation}),t(explanation),t('Your words stay on the page until it can.')].join('\n');
}
