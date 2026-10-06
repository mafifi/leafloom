import {it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Metadata,type MetadataValue} from '@leafloom/document-contracts';
import {LibraryHost} from './library';
import {saveCoverImage,type CoverImageContext} from '../src/lib/cover-image';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
it('[NEO135-017 bytes] saving custom cover art writes its exact bytes through a chosen host destination; cancellation preserves source and destination',async()=>{
 const root=await mkdtemp(join(tmpdir(),'leafloom-cover-image-'));const host=new LibraryHost(root);try{await host.initialize();const meta=Metadata.parse(await host.request('createBook',{title:'Cover Edition',author:'Writer'}));const source=join(root,'source.png'),destination=join(root,'Cover Edition-cover.png');await writeFile(source,png);await host.request('setCover',{bookId:meta.id,source});const authored:MetadataValue={...meta,coverMode:'image',coverImage:'cover.png'};await host.request('writeBookMeta',{bookId:meta.id,metadata:authored});const before=await host.request('readBookMeta',{bookId:meta.id});
 const hint=vi.fn(),generated=vi.fn(async()=>undefined);const context:CoverImageContext={metadata:async(bookId)=>Metadata.parse(await host.request('readBookMeta',{bookId})),generated,destination:async(name)=>{expect(name).toBe('Cover-Edition-cover.png');return destination;},request:(method,payload)=>host.request(method,payload),hint,t:(key,args)=>key.replace('{file}',String(args?.file))};await saveCoverImage(context,meta.id);expect(await readFile(destination)).toEqual(png);expect(await readFile(source)).toEqual(png);expect(generated).not.toHaveBeenCalled();expect(hint).toHaveBeenCalledWith('Saved: Cover Edition-cover.png');
 await writeFile(destination,'preserve destination');context.destination=async()=>null;await saveCoverImage(context,meta.id);expect(await readFile(destination,'utf8')).toBe('preserve destination');expect(await readFile(source)).toEqual(png);expect(await host.request('readBookMeta',{bookId:meta.id})).toEqual(before);
 }finally{await host.shutdown();await rm(root,{recursive:true,force:true});}
});
it('[NEO135-017 generated] painted covers export the generated publication image without changing title, seed or paint metadata',async()=>{
 const meta=Metadata.parse({id:'story',title:'Full Size',author:'Writer',coverSeed:'stable-seed',coverMode:'painted',coverArt:{status:'done',file:'art-1.png'}}),request=vi.fn(async()=>null),generated=vi.fn(async()=> 'data:image/png;base64,'+png.toString('base64'));await saveCoverImage({metadata:async()=>meta,generated,destination:async()=>'/owned/Full Size-cover.png',request,hint:()=>{},t:key=>key},meta.id);expect(generated).toHaveBeenCalledWith('story');expect(request).toHaveBeenCalledExactlyOnceWith('saveExport',{destination:'/owned/Full Size-cover.png',encoding:'base64',content:png.toString('base64')});expect(meta.coverSeed).toBe('stable-seed');expect(meta.coverArt).toEqual({status:'done',file:'art-1.png'});
});
