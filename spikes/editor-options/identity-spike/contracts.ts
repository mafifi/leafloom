import { z } from 'zod';
import { Metadata, Book } from '../lifecycle-spike/contracts';
const Id=z.string().min(1);
const Offset=z.number().int().nonnegative();
export const PassageIndex=z.strictObject({id:Id,path:z.array(Offset).min(1),signature:z.string().regex(/^[0-9a-f]{64}$/)});
export const IdentityBook=z.strictObject({formatVersion:z.literal('neo-identity/v1'),revision:Offset,metadata:Metadata,chapters:z.array(z.strictObject({id:Id,html:z.string(),version:z.uuid(),passages:z.array(PassageIndex)})),darlings:z.array(z.json())}).superRefine((b,c)=>{if('chapterOrder' in b.metadata)c.addIssue({code:'custom',message:'Order belongs to chapters'});const ids=b.chapters.map(c=>c.id);if(new Set(ids).size!==ids.length)c.addIssue({code:'custom',message:'Duplicate chapter'});const passages=b.chapters.flatMap(c=>c.passages.map(p=>p.id));if(new Set(passages).size!==passages.length)c.addIssue({code:'custom',message:'Duplicate passage'});});
export type IdentityBookDocument=z.infer<typeof IdentityBook>;
export const Inline=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('text'),text:z.string(),marks:z.array(z.strictObject({kind:Id,attributes:z.record(z.string(),z.json())}))}),
 z.strictObject({kind:z.literal('break')}),
 z.strictObject({kind:z.literal('atom'),name:z.enum(['placeholder','darling_anchor']),id:z.string(),attributes:z.record(z.string(),z.json())})
]);
export type InlineContent=z.infer<typeof Inline>;
export const Reference=z.strictObject({id:Id,chapterId:Id,passageId:Id,from:Offset,to:Offset,version:z.uuid(),expected:z.array(Inline),text:z.string()}).refine(r=>r.to>r.from,{message:'A reference must select content'});
export type PassageReference=z.infer<typeof Reference>;
export const Segment=z.strictObject({passageId:Id,from:Offset,to:Offset}).refine(s=>s.to>=s.from);
export const Resolution=z.strictObject({status:z.enum(['current','changed','deleted','unresolved']),segments:z.array(Segment),text:z.string()});
export type ReferenceResolution=z.infer<typeof Resolution>;
export const ReviewInput=z.strictObject({requestId:Id,bookId:Id,revision:Offset,category:z.enum(['voice','character','structure']),extracts:z.array(z.strictObject({reference:Reference,chapterVersion:z.uuid(),currentSegments:z.array(Segment).min(1),passageOrder:Offset,chapterOrder:Offset,passageKind:Id,runs:z.array(Inline),text:z.string()})).min(1)});
export type ReviewRequest=z.infer<typeof ReviewInput>;
export const ReviewItem=z.discriminatedUnion('kind',[
 z.strictObject({id:Id,kind:z.literal('suggestion'),category:ReviewInput.shape.category,references:z.array(Id).length(1),message:z.string(),replacement:z.string()}),
 z.strictObject({id:Id,kind:z.literal('note'),category:ReviewInput.shape.category,references:z.array(Id).min(1),message:z.string()})
]);
export type ReviewItemValue=z.infer<typeof ReviewItem>;
export const ReviewOutput=z.strictObject({reviewId:Id,requestId:Id,items:z.array(ReviewItem)});
export const ReviewFile=z.strictObject({formatVersion:z.literal('neo-reviews/v1'),bookId:Id,references:z.array(z.strictObject({reference:Reference,version:z.uuid(),location:z.strictObject({segments:z.array(Segment),deleted:z.boolean(),unresolved:z.boolean()})})),reviews:z.array(z.strictObject({item:ReviewItem,reviewId:Id,state:z.enum(['pending','accepted','rejected'])}))});
export type ReviewState=ReviewItemValue&{state:'pending'|'accepted'|'rejected'};
export type Checkpoint={book:IdentityBookDocument;reviews:z.infer<typeof ReviewFile>};
export type Outcome={ok:true}|{ok:false;code:'STALE'|'REJECTED'|'NOT_FOUND'|'UNSUPPORTED_TARGET'};
export type Passage={id:string;chapterId:string;kind:string;text:string;size:number};
/** Provider-neutral values only; no editor, filesystem or agent SDK types. */
export interface IdentityPort {
 passages():Passage[];
 capture(chapterId:string,passageId:string,from:number,to:number):PassageReference;
 resolve(referenceId:string):ReferenceResolution;
 extract(referenceIds:string[],category:ReviewRequest['category']):ReviewRequest;
 receive(output:unknown):void;
 reviews():ReviewState[];
 accept(itemId:string):Outcome;
 reject(itemId:string):Outcome;
 checkpoint():Checkpoint;
}
export const LegacyBook=Book;
