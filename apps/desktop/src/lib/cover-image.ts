import {z} from 'zod';
import type {MetadataValue} from '@leafloom/document-contracts';
import type {HostMethod,HostPayload} from '@leafloom/desktop-host';
import {coverMode} from './cover-art';
export interface CoverImageContext {
 metadata(id:string):Promise<MetadataValue>;
 generated(id:string):Promise<string|undefined>;
 destination(name:string):Promise<string|null>;
 request<M extends HostMethod>(method:M,payload:HostPayload<M>):Promise<unknown>;
 hint(message:string):void;
 t(key:string,args?:Record<string,string|number>):string;
}
const Raster=z.string().max(20_000_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
/** A custom cover retains its exact bytes; a generated edition carries the full-size title and byline. */
export async function saveCoverImage(context:CoverImageContext,id:string):Promise<void>{
 const meta=await context.metadata(id);
 if(meta.format==='screenplay')return;
 let image:unknown;
 if(coverMode(meta)==='image')image=await context.request('readCover',{bookId:id,mode:'image'});
 image??=await context.generated(id);
 const url=Raster.parse(image),comma=url.indexOf(','),mime=url.slice(11,url.indexOf(';'));
 const clean=(value:string)=>value.replace(/[^\p{L}\p{M}\p{N}_\s-]/gu,'').trim().replace(/\s+/g,'-');
 const name=(clean(meta.title)||clean(context.t('Untitled')))+'-cover.'+(mime==='jpeg'?'jpg':mime);
 const destination=await context.destination(name);
 if(!destination)return;
 await context.request('saveExport',{destination,content:url.slice(comma+1),encoding:'base64'});
 context.hint(context.t('Saved: {file}',{file:destination.split(/[\\/]/).at(-1)!}));
}
