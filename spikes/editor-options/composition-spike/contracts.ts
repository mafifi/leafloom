import { z } from 'zod';
import { Book, LifecycleError } from '../lifecycle-spike/contracts';
import { IdentityBook, Reference, ReviewItem, Inline, ReviewOutput } from '../identity-spike/contracts';
export { LifecycleError, ReviewOutput };
export const Manuscript=z.strictObject({...IdentityBook.shape,formatVersion:z.literal('neo-composed/v1'),version:z.uuid()}).superRefine((value,ctx)=>{const {version,...base}=value;const result=IdentityBook.safeParse({...base,formatVersion:'neo-identity/v1'});if(!result.success)for(const issue of result.error.issues)ctx.addIssue({code:'custom',path:issue.path,message:issue.message});});
export type ManuscriptValue=z.infer<typeof Manuscript>;
export const SourceBook=z.union([Book,IdentityBook,Manuscript]);
export const Segment=z.strictObject({chapterId:z.string().min(1),passageId:z.string().min(1),from:z.number().int().nonnegative(),to:z.number().int().nonnegative()}).refine(s=>s.to>s.from);
export const Reviews=z.strictObject({formatVersion:z.literal('neo-composed-reviews/v1'),bookId:z.string().min(1),version:z.uuid(),references:z.array(z.strictObject({reference:Reference,segments:z.array(Segment),deleted:z.boolean(),unresolved:z.boolean()})),items:z.array(z.strictObject({item:ReviewItem,reviewId:z.string().min(1),rejected:z.boolean(),accepted:z.boolean()}))});
export type ReviewsValue=z.infer<typeof Reviews>;
export const Name=z.enum(['manuscript','reviews','notes','outline']);
export type DocumentName=z.infer<typeof Name>;
export const Input=z.strictObject({requestId:z.uuid(),bookId:z.string(),revision:z.number().int().nonnegative(),category:z.enum(['voice','character','structure']),extracts:z.array(z.strictObject({reference:Reference,currentSegments:z.array(Segment).min(1),version:z.uuid(),chapterOrder:z.number().int().nonnegative(),passageKind:z.string(),runs:z.array(Inline),text:z.string()})).min(1)});
export type ReviewInput=z.infer<typeof Input>;
export const Checkpoint=z.strictObject({book:Manuscript,reviews:Reviews,notes:z.string(),outline:z.string()}).superRefine((value,ctx)=>{if(value.book.version!==value.reviews.version)ctx.addIssue({code:'custom',path:['reviews','version'],message:'Checkpoint versions must agree'});if(value.book.metadata.id!==value.reviews.bookId)ctx.addIssue({code:'custom',path:['reviews','bookId'],message:'Checkpoint book identities must agree'});});
export type CheckpointValue=z.infer<typeof Checkpoint>;
export type Receipt={revision:number;versions:Record<DocumentName,string>};
export type Opened={book:z.infer<typeof SourceBook>;reviews:ReviewsValue|null;notes:string;outline:string;versions:Record<DocumentName,string>;recovered:boolean};
export const OpenReply=z.strictObject({book:SourceBook,reviews:Reviews.nullable(),notes:z.string(),outline:z.string(),versions:z.record(Name,z.string().regex(/^[0-9a-f]{64}$/)),recovered:z.boolean(),lease:z.uuid().nullable(),readOnly:z.boolean()});
export const SaveReply=z.strictObject({revision:z.number().int().nonnegative(),versions:z.record(Name,z.string().regex(/^[0-9a-f]{64}$/))});
export interface DocumentStore {open():Promise<Opened>;save(checkpoint:CheckpointValue,expected:Record<DocumentName,string>,traceparent?:string):Promise<Receipt>;}
export const Envelope=z.strictObject({requestId:z.uuid(),traceparent:z.string().regex(/^00-(?!0{32}-)[0-9a-f]{32}-(?!0{16}-)[0-9a-f]{16}-0[01]$/).optional(),command:z.discriminatedUnion('method',[
 z.strictObject({method:z.literal('open')}),z.strictObject({method:z.literal('save'),lease:z.uuid(),checkpoint:Checkpoint,expected:z.record(Name,z.string().regex(/^[0-9a-f]{64}$/))}),
 z.strictObject({method:z.literal('dirty'),revision:z.number().int().nonnegative()}),z.strictObject({method:z.literal('close')}),z.strictObject({method:z.literal('finish-close'),discard:z.boolean()}),z.strictObject({method:z.literal('diagnostics')})])});
export type Command=z.infer<typeof Envelope>['command'];
export interface HostPort {request<T>(command:Command,traceparent?:string):Promise<{ok:true;value:T}|{ok:false;code:string}>;onCloseRequested(fn:()=>void):()=>void;}
export type ChapterRow={id:string;title:string;kind:string};
export type CoreEvent={kind:'changed'|'selection';revision:number;command:string};

export interface AuthoringLifecycle {readonly readOnly:boolean;dirty(revision:number):void;onCloseRequested(fn:()=>void):()=>void;finish(discard:boolean):Promise<{ok:true;value:unknown}|{ok:false;code:string}>;}
