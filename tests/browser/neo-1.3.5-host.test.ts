// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {Metadata} from '../../packages/documents/document-contracts/src/index';
import {Library} from '../../packages/library/src/index';
import {CoverArtViewModel,type CoverArtContext,type CoverArtPresentation} from '../../apps/desktop/src/lib/cover-art';
it('[NEO135-017 cover] the production cover choice saves an image without rerolling or changing author metadata',async()=>{
 const meta=Metadata.parse({id:'story',title:'River',author:'Writer'});let shown:CoverArtPresentation|null=null;const saveImage=vi.fn(async()=>{}),updateMetadata=vi.fn(async()=>{});
 const context:CoverArtContext&{saveImage:(id:string)=>Promise<void>}={snapshot:()=>({book:meta,books:[meta],library:Library.parse({})}),requestOS:async()=>({provider:'openai',configured:false,storage:'fixture'}),requestHost:async()=>null,saveBook:async()=>{},updateMetadata,writeLibrary:async()=>{},prepareCovers:async()=>{},publish:value=>{shown=value;},hint:()=>{},t:key=>key,saveImage};
 const vm=new CoverArtViewModel(context);await vm.openChoices('story');expect(shown).toMatchObject({kind:'choices',options:expect.arrayContaining([expect.objectContaining({value:'save-image',label:'Save cover as image…'})])});await vm.choose('story','save-image' as never);expect(saveImage).toHaveBeenCalledWith('story');expect(updateMetadata).not.toHaveBeenCalled();
});

it('[NEO135-019 voice] native Read Aloud explains unavailable local speech without changing author writing',async()=>{
 const {fixture}=await import('./application-fixture');const {get}=await import('svelte/store');const f=await fixture();try{
 await f.vm.onboard('Writer','pantser');await f.vm.newBook(get(f.vm.state).library.shelves[0]!.id);f.vm.createChapter();f.vm.editor!.select(f.vm.editor!.chapters[0]!.id,1);f.vm.editor!.insert('Keep these words.');const before=f.vm.editor!.checkpoint();
 Object.defineProperty(window,'speechSynthesis',{configurable:true,value:undefined});await f.vm.nativeCommand('read-aloud');expect(get(f.vm.state).hint).toBe('Read aloud needs a voice on this computer');expect(f.vm.editor!.checkpoint()).toEqual(before);
 }finally{await f.close();}
});

it('[NEO135-020 first save] a denied destination keeps onboarding recoverable, names the folder and supports retry',async()=>{
 const {fixture,fixturePlatform}=await import('./application-fixture');const {get}=await import('svelte/store');const platform=fixturePlatform(),os=platform.os!.request.bind(platform.os!);platform.os!.request=async(method,payload)=>method==='getLibraryConfiguration'?{current:'/unavailable/Leafloom',default:'/unavailable/Leafloom',custom:false}:os(method,payload);
 const f=await fixture(platform);try{const request=f.host.request.bind(f.host);f.host.request=async(method,payload)=>method==='writeLibrary'?{ok:false,code:'FILESYSTEM'}:request(method,payload);
 await f.vm.onboard('Retained Writer','plotter','Pen Name',{body:'iA Writer Quattro',dropcap:'scifi'});expect(get(f.vm.state).library.firstRunDone).toBe(false);expect(get(f.vm.state).hint).toContain('/unavailable/Leafloom');expect(get(f.vm.state).hint).toContain('then press Start writing again');expect(get(f.vm.state).library.authorName).toBe('Retained Writer');expect(await f.provider.request('readLibrary',{})).toBeNull();
 f.host.request=request;await f.vm.onboard('Retained Writer','plotter','Pen Name',{body:'iA Writer Quattro',dropcap:'scifi'});expect(get(f.vm.state).library.firstRunDone).toBe(true);expect(await f.provider.request('readLibrary',{})).toMatchObject({authorName:'Retained Writer',fonts:{body:'iA Writer Quattro'}});
 }finally{await f.close();}
});

it('[NEO135-024 live state] font, initial and alignment author commands send fresh native tick selections and survive reopen',async()=>{
 const {fixture,fixturePlatform}=await import('./application-fixture');const {get}=await import('svelte/store');const platform=fixturePlatform(),os=platform.os!.request.bind(platform.os!),states:unknown[]=[];platform.os!.request=async(method,payload)=>{if(method==='setMenuState')states.push(structuredClone(payload));return os(method,payload);};
 const f=await fixture(platform);try{await f.vm.onboard('Writer','pantser');await f.vm.newBook(get(f.vm.state).library.shelves[0]!.id);f.vm.createChapter();f.vm.editor!.select(f.vm.editor!.chapters[0]!.id,1);f.vm.editor!.insert('A sentence.');await f.vm.nativeCommand('body-font:iA Writer Quattro');await f.vm.nativeCommand('dropcap:scifi');await f.vm.nativeCommand('align:right');await vi.waitFor(()=>expect(states.at(-1)).toMatchObject({bodyFont:'iA Writer Quattro',dropcap:'scifi',align:'right'}));
 const id=f.vm.editor!.metadata.id;await f.vm.closeBook();await f.vm.openBook(id);f.vm.editor!.select(f.vm.editor!.chapters[0]!.id,1);await vi.waitFor(()=>expect(states.at(-1)).toMatchObject({bodyFont:'iA Writer Quattro',dropcap:'scifi',align:'right'}));expect(f.vm.editor!.html(f.vm.editor!.chapters[0]!.id)).toContain('text-align: right');
 }finally{await f.close();}
});
