import { z } from 'zod';
export const Name=z.enum(['manuscript','notes','outline']);export type DocumentName=z.infer<typeof Name>;
export const Metadata=z.object({id:z.string().min(1),title:z.string(),author:z.string()}).catchall(z.json());
export const Book=z.strictObject({formatVersion:z.literal('neo-lifecycle/v1'),revision:z.number().int().nonnegative(),metadata:Metadata,chapters:z.array(z.strictObject({id:z.string().min(1),html:z.string()})),darlings:z.array(z.json())}).superRefine((book,ctx)=>{const ids=book.chapters.map(c=>c.id);if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Duplicate chapter identity'});if('chapterOrder' in book.metadata)ctx.addIssue({code:'custom',message:'Chapter order belongs to chapters'});});
export type BookDocument=z.infer<typeof Book>;
export const TraceParent=z.string().regex(/^00-(?!0{32}-)[0-9a-f]{32}-(?!0{16}-)[0-9a-f]{16}-0[01]$/);
export const Envelope=z.strictObject({requestId:z.uuid(),traceparent:TraceParent.optional(),command:z.discriminatedUnion('method',[
 z.strictObject({method:z.literal('open')}),z.strictObject({method:z.literal('reload'),lease:z.uuid()}),
 z.strictObject({method:z.literal('save'),lease:z.uuid(),name:Name,revision:z.number().int().nonnegative(),expected:z.string().regex(/^[0-9a-f]{64}$/),content:z.union([Book,z.string()])}),
 z.strictObject({method:z.literal('dirty'),name:Name,revision:z.number().int().nonnegative()}),
 z.strictObject({method:z.literal('close')}),z.strictObject({method:z.literal('finish-close'),discard:z.boolean()}),
 z.strictObject({method:z.literal('new-window')}),z.strictObject({method:z.literal('diagnostics')})])});
export type Command=z.infer<typeof Envelope>['command'];
export type Code='BUSY'|'EXTERNAL_CHANGE'|'CORRUPT'|'DISK_ERROR'|'INVALID'|'UNAUTHORIZED'|'UNSAVED'|'SAVE_UNCERTAIN';
export class LifecycleError extends Error {constructor(readonly code:Code){super(code);}}
export type SavedReceipt={name:DocumentName;revision:number;etag:string};
export type OpenBook={book:BookDocument;notes:string;outline:string;versions:Record<DocumentName,string>;recovered:boolean};
export type OpenResult=OpenBook&{lease:string|null;readOnly:boolean};
export type Result<T>={ok:true;value:T}|{ok:false;code:Code};
export interface LifecyclePort {request<T>(command:Command,traceparent?:string):Promise<Result<T>>;onCloseRequested(listener:()=>void):()=>void;}
export function unwrap<T>(result:Result<T>):T {if(!result.ok)throw new LifecycleError(result.code);return result.value;}
