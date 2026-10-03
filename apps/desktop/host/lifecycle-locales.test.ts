import { it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, cp, rename } from 'node:fs/promises';
import { join,basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { LocaleProvider } from './locales.ts';
import { LibraryHost } from './library.ts';
import { Checkpoint, type Opened } from '@leafloom/editor-contracts';
import type { DocumentChange } from '@leafloom/desktop-host';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-watcher-'));
  await writeFile(join(root, '.leafloom-fixture'), '');
  const host = new LibraryHost(root);
  await host.initialize();
  return {
    root,
    host,
    dispose: async () => {
      await host.shutdown();
      await rm(root, { recursive: true, force: true });
    },
  };
}
it('resolves regional language fallback, lists native language names, persists validated choice', async () => {
  const f = await fixture();
  try {
    const languages = (await f.host.request('listLanguages', {})) as {
      code: string;
      name: string;
    }[];
    expect(languages).toContainEqual({ code: 'fr-CA', name: 'Français (Canada)' });
    const chosen = (await f.host.request('setLanguage', { language: 'fr_CA' })) as {
      locale: string;
      dict: Record<string, string>;
      base: Record<string, string>;
    };
    expect(chosen.locale).toBe('fr-CA');
    expect(Object.keys(chosen.dict).length).toBeGreaterThan(100);
    expect(chosen.base['{n} words']).toEqual({ one: '{n} word', other: '{n} words' });
    expect(await f.host.request('getLanguage', {})).toEqual(chosen);
    await expect(f.host.request('setLanguage', { language: '../private' })).rejects.toThrow(
      'INVALID',
    );
  } finally {
    await f.dispose();
  }
});
it('suppresses own receipts and emits external changes, protecting unsaved work from conflict', async () => {
  const f = await fixture();
  try {
    const metadata = (await f.host.request('createBook', { title: 'Watch' })) as { id: string };
    const opened = (await f.host.request('openBook', { bookId: metadata.id })) as Opened & {
      lease: string;
    };
    const events: DocumentChange[] = [];
    const unsubscribe = f.host.subscribeEvents((event) => events.push(event));
    const version = randomUUID(),
      checkpoint = Checkpoint.parse({
        book: { ...opened.book, formatVersion: 'neo-composed/v1', revision: 1, version },
        reviews: {
          formatVersion: 'neo-composed-reviews/v1',
          bookId: metadata.id,
          version,
          references: [],
          items: [],
        },
        notes: 'Own saved notes',
        outline: '',
      });
    const receipt = (await f.host.request('checkpoint', {
      bookId: metadata.id,
      lease: opened.lease,
      checkpoint,
      expected: opened.versions,
    })) as { versions: Opened['versions'] };
    await pause(200);
    expect(events).toEqual([]);
    await writeFile(join(f.root, metadata.id, 'notes.html'), 'External notes');
    await expect.poll(() => events.length).toBe(1);
    expect(events[0].bookId).toBe(metadata.id);
    expect(events[0].versions?.notes).not.toBe(receipt.versions.notes);
    await expect(
      f.host.request('checkpoint', {
        bookId: metadata.id,
        lease: opened.lease,
        checkpoint,
        expected: receipt.versions,
      }),
    ).rejects.toThrow('EXTERNAL_CHANGE');
    expect(await readFile(join(f.root, metadata.id, 'notes.html'), 'utf8')).toBe('External notes');
    expect(await f.host.request('consumeDocumentChanges', {})).toEqual(events);
    expect(await f.host.request('consumeDocumentChanges', {})).toEqual([]);
    unsubscribe();
    await f.host.request('closeBook', { bookId: metadata.id, lease: opened.lease });
    await writeFile(join(f.root, metadata.id, 'notes.html'), 'After close');
    await pause(200);
    expect(events).toHaveLength(1);
  } finally {
    await f.dispose();
  }
});

it('continues with English keys when translation resources are missing or a selected catalog is corrupt',async()=>{
 const root=await mkdtemp(join(tmpdir(),'leafloom-locales-'));
 try {
 const missing=new LocaleProvider(join(root,'missing'));expect(await missing.get('fr')).toEqual({locale:'en',dict:{},base:{}});
 await writeFile(join(root,'fr.json'),'{broken');
 await writeFile(join(root,'en.json'),JSON.stringify({_meta:{name:'English'},Hello:'Hello'}));
 const partial=new LocaleProvider(root);expect(await partial.languages()).toEqual([{code:'en',name:'English'}]);
 expect(await partial.get('fr')).toEqual({locale:'en',dict:{Hello:'Hello'},base:{Hello:'Hello'}});
 }finally{await rm(root,{recursive:true,force:true});}
});

it('reattaches to a replaced whole-book directory and detects later incoming edits without replaying the old lease',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval']});
  const f=await fixture();
  try {
    const meta=await f.host.request('createBook',{title:'Replacement'}) as {id:string};
    const original=await f.host.request('openBook',{bookId:meta.id}) as Opened&{lease:string};
    const folder=join(f.root,meta.id),stage=join(f.root,'incoming'),aside=join(f.root,'retired');
    const before=await readFile(join(folder,'manuscript.json'));
    const draftVersion=randomUUID();
    const draft=Checkpoint.parse({book:{...original.book,formatVersion:'neo-composed/v1',version:draftVersion,revision:1,chapters:[{id:'local-chapter',html:'<p>Unsaved local prose.</p>',version:randomUUID(),passages:[]}]},reviews:{formatVersion:'neo-composed-reviews/v1',bookId:meta.id,version:draftVersion,references:[],items:[]},notes:'Local notes',outline:''});
    const events:DocumentChange[]=[];f.host.subscribeEvents(event=>events.push(event));
    await cp(folder,stage,{recursive:true,filter:path=>basename(path)!=='.writer.lock'});
    const incoming={...original.book,chapters:[{id:'incoming-chapter',html:'<p>Incoming external prose.</p>'}]};
    await writeFile(join(stage,'manuscript.json'),JSON.stringify(incoming));
    await writeFile(join(stage,'notes.html'),'Incoming first notes');
    await rename(folder,aside);await rename(stage,folder);
    await vi.advanceTimersByTimeAsync(30000);
    await expect.poll(()=>events.length,{timeout:2000}).toBeGreaterThan(0);
    const first=events.at(-1)!;expect(first).toMatchObject({bookId:meta.id,code:'RECOVERY_REQUIRED'});expect(first.versions?.manuscript).not.toBe(original.versions.manuscript);
    const count=events.length;
    await writeFile(join(folder,'notes.html'),'Incoming later notes');
    await expect.poll(()=>events.length,{timeout:2000}).toBeGreaterThan(count);
    expect(events.at(-1)?.versions?.notes).not.toBe(first.versions?.notes);
    await expect(f.host.request('checkpoint',{bookId:meta.id,lease:original.lease,checkpoint:draft,expected:original.versions})).rejects.toThrow('UNAUTHORIZED');
    expect(draft.book.chapters[0].html).toBe('<p>Unsaved local prose.</p>');
    expect(await readFile(join(aside,'manuscript.json'))).toEqual(before);
    expect(JSON.parse(await readFile(join(folder,'manuscript.json'),'utf8')).chapters[0].html).toBe('<p>Incoming external prose.</p>');
    await expect(f.host.request('closeBook',{bookId:meta.id,lease:original.lease})).resolves.toBe(true);
    const fresh=await f.host.request('openBook',{bookId:meta.id}) as Opened&{lease:string};
    expect(fresh.lease).not.toBe(original.lease);expect(fresh.notes).toBe('Incoming later notes');
    const copy=await f.host.request('createBook',{title:'Local copy'}) as {id:string};
    const copyOpened=await f.host.request('openBook',{bookId:copy.id}) as Opened&{lease:string};
    const version=randomUUID(),local=Checkpoint.parse({...draft,book:{...draft.book,metadata:{...draft.book.metadata,id:copy.id},version},reviews:{...draft.reviews,bookId:copy.id,version}});
    await f.host.request('checkpoint',{bookId:copy.id,lease:copyOpened.lease,checkpoint:local,expected:copyOpened.versions});
    expect(JSON.parse(await readFile(join(f.root,copy.id,'manuscript.json'),'utf8')).chapters[0].html).toBe('<p>Unsaved local prose.</p>');
    const eventCount=events.length;
    await f.host.request('closeBook',{bookId:meta.id,lease:fresh.lease});
    await writeFile(join(folder,'notes.html'),'After close');await vi.advanceTimersByTimeAsync(60000);await pause(150);
    expect(events.length).toBe(eventCount);
  } finally {await f.dispose();vi.useRealTimers();}
});

it('invalidates an identical replacement directory even when the four content hashes have not changed',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval']});
  const f=await fixture();
  try {
    const meta=await f.host.request('createBook',{title:'Same bytes'}) as {id:string};
    const original=await f.host.request('openBook',{bookId:meta.id}) as Opened&{lease:string};
    const folder=join(f.root,meta.id),stage=join(f.root,'identical'),aside=join(f.root,'retired');
    const events:DocumentChange[]=[];f.host.subscribeEvents(event=>events.push(event));
    await cp(folder,stage,{recursive:true,filter:path=>basename(path)!=='.writer.lock'});
    await rename(folder,aside);await rename(stage,folder);await vi.advanceTimersByTimeAsync(30000);
    await expect.poll(()=>events.length,{timeout:2000}).toBe(1);
    expect(events[0]).toEqual({bookId:meta.id,code:'RECOVERY_REQUIRED',versions:original.versions});
    await f.host.request('closeBook',{bookId:meta.id,lease:original.lease});
    const fresh=await f.host.request('openBook',{bookId:meta.id}) as Opened&{lease:string};
    expect(fresh.lease).not.toBe(original.lease);expect(fresh.versions).toEqual(original.versions);
  } finally {await f.dispose();vi.useRealTimers();}
});

it('does not reannounce acknowledged recovery after an unrelated rename but detects a new backup recovery with identical logical hashes',async()=>{
  const f=await fixture();
  try {
    const meta=await f.host.request('createBook',{title:'Known recovery'}) as {id:string};
    const folder=join(f.root,meta.id);
    await writeFile(join(folder,'reviews.json'),JSON.stringify({formatVersion:'neo-composed-reviews/v1',bookId:meta.id,version:randomUUID(),references:[],items:[]}));
    const opened=await f.host.request('openBook',{bookId:meta.id}) as Opened&{lease:string};
    expect(opened.recovered).toBe(true);
    const events:DocumentChange[]=[];f.host.subscribeEvents(event=>events.push(event));
    await writeFile(join(folder,'art-stage.tmp'),'Private derived artifact');await rename(join(folder,'art-stage.tmp'),join(folder,'art.json'));
    await pause(250);expect(events).toEqual([]);
    const version=randomUUID(),value=Checkpoint.parse({book:{...opened.book,formatVersion:'neo-composed/v1',version,revision:1},reviews:{formatVersion:'neo-composed-reviews/v1',bookId:meta.id,version,references:[],items:[]},notes:opened.notes,outline:opened.outline});
    const receipt=await f.host.request('checkpoint',{bookId:meta.id,lease:opened.lease,checkpoint:value,expected:opened.versions}) as {versions:Opened['versions']};
    await pause(250);expect(events).toEqual([]);
    const current=await readFile(join(folder,'manuscript.json'));await writeFile(join(folder,'manuscript.json.bak'),current);
    await writeFile(join(folder,'manuscript.json'),'{new external corruption');
    await expect.poll(()=>events.length).toBe(1);expect(events[0]).toEqual({bookId:meta.id,code:'RECOVERY_REQUIRED'});
    const peek=await f.host.request('readBookMeta',{bookId:meta.id}) as {id:string};expect(peek.id).toBe(meta.id);
    expect(await readFile(join(folder,'manuscript.json'),'utf8')).toBe('{new external corruption');
    expect(receipt.versions.manuscript).toBe((await import('@leafloom/filesystem-documents')).hash(current.toString('utf8')));
  } finally {await f.dispose();}
});

it('acknowledges a restored backup once and still announces later corruption of the same current bytes',async()=>{
  const f=await fixture();
  try {
    const meta=await f.host.request('createBook',{title:'Restored backup'}) as {id:string},folder=join(f.root,meta.id);
    const baseline=await readFile(join(folder,'manuscript.json'));await writeFile(join(folder,'manuscript.json.bak'),baseline);await writeFile(join(folder,'manuscript.json'),'{old corruption');
    const opened=await f.host.request('openBook',{bookId:meta.id}) as Opened&{lease:string};expect(opened.recovered).toBe(true);expect(await readFile(join(folder,'manuscript.json'))).toEqual(baseline);
    const events:DocumentChange[]=[];f.host.subscribeEvents(event=>events.push(event));
    await writeFile(join(folder,'art-stage.tmp'),'Derived');await rename(join(folder,'art-stage.tmp'),join(folder,'art.json'));await pause(250);expect(events).toEqual([]);
    await writeFile(join(folder,'manuscript.json'),'{later corruption');await expect.poll(()=>events.length).toBe(1);
    expect(events[0]).toEqual({bookId:meta.id,code:'RECOVERY_REQUIRED'});expect(await readFile(join(folder,'manuscript.json'),'utf8')).toBe('{later corruption');
  } finally {await f.dispose();}
});
