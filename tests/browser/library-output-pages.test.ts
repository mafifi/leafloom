import {it,expect,vi} from 'vitest';
import {get} from 'svelte/store';
import {Application} from '../../apps/desktop/src/lib/application';
import {LibraryViewModel,type LibraryContext} from '../../apps/desktop/src/lib/library-view-model';
import {Library} from '../../packages/library/src/index';
import {Metadata} from '../../packages/documents/document-contracts/src/index';
import type {DesktopHost} from '../../packages/host/desktop-host/src/index';
const image='data:image/jpeg;base64,aGVsbG8=';
function fixture(){const host:DesktopHost={request:async()=>({ok:false,code:'UNUSED'})};const app=new Application(host,()=>{throw Error('UNUSED');},async()=>{});let state=get(app.state);state={...state,library:Library.parse({authors:[{id:'a',name:'Writer'}],currentAuthorId:'a',shelves:[{id:'s',name:'Collection',authorId:'a',bookIds:['cover','first','second','about'],binding:{bound:true}}]}),books:[['cover','cover'],['first','novel'],['second','novel'],['about','about']].map(([id,kind])=>Metadata.parse({id,title:id,author:'Writer',kind}))};let seq=0;const context:LibraryContext={snapshot:()=>state,patch:patch=>{state={...state,...patch};},request:vi.fn(async()=>true),writeLibrary:vi.fn(async library=>{state={...state,library};}),prompt:vi.fn(async()=>null),confirm:vi.fn(async()=>true),rendered:async()=>{},openBook:vi.fn(async()=>{}),openPage:vi.fn(async()=>{}),generatedCover:vi.fn(async()=>image),createPage:vi.fn(async(_shelf,kind)=>{const page=Metadata.parse({id:'page-'+(++seq),title:kind,author:'Writer',kind});state={...state,books:[...state.books,page]};return page;}),prepareCovers:vi.fn(async()=>{}),platform:{selectExportFile:vi.fn(async()=>'/fixture/export'),selectImportFiles:async()=>[],openExternal:async()=>{},finishClose:async()=>{},fullscreen:async()=>{},print:async()=>{}}};return{context,vm:new LibraryViewModel(context),get state(){return state;},changeShelf:()=>{state={...state,library:{...state.library,shelves:state.library.shelves.map(s=>({...s,bookIds:['cover','second','first','about']}))}};}};}
it('a requested Part seam inserts before its actual story and opens the publication sheet after persisting placement',async()=>{const f=fixture();await f.vm.addBoundPage('s','part','second');expect(f.state.library.shelves[0].bookIds).toEqual(['cover','first','page-1','second','about']);expect(f.context.openPage).toHaveBeenCalledWith('page-1');expect(f.context.openBook).not.toHaveBeenCalled();await f.vm.addBoundPage('s','part','second');expect(f.context.createPage).toHaveBeenCalledTimes(1);expect(f.state.library.shelves[0].bookIds).toEqual(['cover','first','page-1','second','about']);});
it('unknown or ancillary Part destinations create no orphan page; default insertion precedes back matter',async()=>{const f=fixture();for(const id of ['absent','about','cover'])await f.vm.addBoundPage('s','part',id);expect(f.context.createPage).not.toHaveBeenCalled();await f.vm.addBoundPage('s','part');expect(f.state.library.shelves[0].bookIds).toEqual(['cover','first','second','page-1','about']);});
it('page contexts without a publication capability retain the existing openBook fallback',async()=>{const f=fixture();delete f.context.openPage;await f.vm.addBoundPage('s','dedication');expect(f.context.openBook).toHaveBeenCalledWith('page-1');expect(f.state.library.shelves[0].bookIds).toEqual(['cover','page-1','first','second','about']);});
it('visual collection formats use the actual bound cover book and never a constituent story seed',async()=>{for(const format of ['pdf','html','epub','docx','txt','md'] as const){const f=fixture();await f.vm.exportShelf('s',format);expect(f.context.generatedCover).toHaveBeenCalledTimes(['pdf','html','epub'].includes(format)?1:0);if(['pdf','html','epub'].includes(format))expect(f.context.generatedCover).toHaveBeenCalledWith('cover');expect(f.context.request).toHaveBeenCalledWith('exportCollection',expect.objectContaining({bookIds:['cover','first','second','about'],title:'Collection',format,...(['pdf','html','epub'].includes(format)?{generatedCover:image}:{})}));}});
it('changed collection order during asynchronous full-cover rendering never exports a mixed collection',async()=>{const f=fixture();vi.mocked(f.context.generatedCover!).mockImplementation(async()=>{f.changeShelf();return image;});await expect(f.vm.exportShelf('s','pdf')).rejects.toThrow('BOOK_CHANGED');expect(f.context.request).not.toHaveBeenCalled();});
it('persists one bound publication UUID before exporting and reuses it without another library write', async () => {
  const f = fixture();
  await f.vm.exportShelf('s', 'epub');
  const uuid = f.state.library.shelves[0].binding?.uuid;
  expect(uuid).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  expect(f.context.writeLibrary).toHaveBeenCalledTimes(1);
  expect(f.context.request).toHaveBeenCalledWith('exportCollection', expect.objectContaining({ uuid, bound: true }));
  await f.vm.exportShelf('s', 'epub');
  expect(f.context.writeLibrary).toHaveBeenCalledTimes(1);
  expect(f.state.library.shelves[0].binding?.uuid).toBe(uuid);
});
it('an unbound collection does not persist publication identity in the library', async () => {
  const f = fixture();
  f.state.library.shelves[0].binding!.bound = false;
  await f.vm.exportShelf('s', 'epub');
  expect(f.context.writeLibrary).not.toHaveBeenCalled();
  expect(f.state.library.shelves[0].binding?.uuid).toBeUndefined();
  expect(f.context.request).toHaveBeenCalledWith('exportCollection', expect.not.objectContaining({ uuid: expect.anything() }));
});
