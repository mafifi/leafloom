import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, cp, rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import {spawn} from 'node:child_process';
import { BookFiles } from './files.ts';
import { Checkpoint, type Opened } from '@leafloom/editor-contracts';
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-files-'));
  await writeFile(join(root, '.leafloom-fixture'), '');
  const folder = join(root, 'book-test');
  await mkdir(folder);
  await writeFile(
    join(folder, 'manuscript.json'),
    JSON.stringify({
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book-test', title: 'Fixture', author: 'Writer' },
      chapters: [{ id: 'chapter-one', html: '<p>Original.</p>' }],
      darlings: [],
    }),
  );
  await writeFile(join(folder, 'notes.html'), 'notes');
  await writeFile(join(folder, 'outline.html'), 'outline');
  return { root, folder };
}
function checkpoint(opened: Opened, revision = 1) {
  const version = randomUUID();
  return Checkpoint.parse({
    book: {
      ...opened.book,
      formatVersion: 'neo-composed/v1',
      revision,
      version,
      chapters: opened.book.chapters.map((c) => ({ ...c, version: randomUUID(), passages: [] })),
    },
    reviews: {
      formatVersion: 'neo-composed-reviews/v1',
      bookId: opened.book.metadata.id,
      version,
      references: [],
      items: [],
    },
    notes: 'New notes',
    outline: 'New outline',
  });
}
describe('durable filesystem document provider', () => {
  it('distinguishes disk full before replacement from uncertain disk failure after replacement',async()=>{
    for(const stage of ['temporary.synced','current.replaced'] as const){
      const f=await fixture();let calls=0;
      const writer=new BookFiles(f.folder,async(value)=>{if(value===stage&&++calls===2)throw Object.assign(Error('synthetic storage capacity fault'),{code:'ENOSPC'});});
      try{
        await writer.acquire();const old=await writer.load(),value=checkpoint(old);
        await expect(writer.checkpoint(value,old.versions)).rejects.toMatchObject({code:stage==='temporary.synced'?'DISK_FULL':'SAVE_UNCERTAIN'});
        // The earlier reviews file is known to this writer. Retrying retains
        // its lease and original expectations; the provider verifies each hash.
        const receipt=await writer.checkpoint(value,old.versions);expect((await writer.load()).versions).toEqual(receipt.versions);expect((await writer.load()).book).toEqual(value.book);
      }finally{await writer.release();await rm(f.root,{recursive:true,force:true});}
    }
  });
  it('survives actual worker SIGKILL across all sequential checkpoint replacements without losing newer files',async()=>{
    const moduleURL=new URL('./files.ts',import.meta.url).href;
    const worker=`import {readFile} from 'node:fs/promises';import {join,dirname} from 'node:path';
      const [moduleURL,folder,stage,target,raw]=process.argv.slice(1);
      await readFile(join(dirname(folder),'.leafloom-fixture'));
      const {BookFiles}=await import(moduleURL);let count=0;
      const files=new BookFiles(folder,async(value)=>{if(value===stage&&++count===Number(target))process.kill(process.pid,'SIGKILL');});
      await files.acquire();const opened=await files.load();await files.checkpoint(JSON.parse(raw),opened.versions);
      throw Error('CRASH_BOUNDARY_NOT_REACHED');`;
    for(const [stage,target,replaced] of [
      ['current.replaced',1,1],['current.replaced',2,2],['current.replaced',3,3],
      ['backup.replaced',4,3],['directory.synced',4,4],
    ] as const){
      const f=await fixture(),initialWriter=new BookFiles(f.folder);let child:ReturnType<typeof spawn>|undefined;
      const reopened=new BookFiles(f.folder);
      try{
        await initialWriter.acquire();const first=await initialWriter.load(),baseline=checkpoint(first);
        await initialWriter.checkpoint(baseline,first.versions);const old=await initialWriter.load();await initialWriter.release();
        const value=checkpoint(old,2);value.book.chapters[0].html='<p>Replacement prose after the crash.</p>';value.notes='Replacement notes';value.outline='Replacement outline';
        child=spawn(process.execPath,['--input-type=module','-e',worker,moduleURL,f.folder,stage,String(target),JSON.stringify(value)],{stdio:['ignore','pipe','pipe']});
        let error='';child.stderr?.on('data',chunk=>{error+=String(chunk).slice(0,1000);});
        const stopped=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{
          const timeout=setTimeout(()=>{child?.kill('SIGKILL');reject(Error('FIXTURE_WORKER_TIMEOUT'));},5000);
          child!.once('error',failure=>{clearTimeout(timeout);reject(failure);});
          child!.once('close',(code,signal)=>{clearTimeout(timeout);resolve({code,signal});});
        });
        expect(error).toBe('');expect(stopped.signal).toBe('SIGKILL');
        const files=['reviews.json','notes.html','outline.html','manuscript.json'];
        const before=new Map(await Promise.all(files.map(async file=>[file,await readFile(join(f.folder,file))] as const)));
        const loaded=await reopened.load(false);expect(loaded.recovered).toBe(replaced<4);
        expect(loaded.reviews).toEqual(value.reviews);expect(loaded.book).toEqual(replaced===4?value.book:baseline.book);
        expect(loaded.notes).toBe(replaced>=2?value.notes:baseline.notes);expect(loaded.outline).toBe(replaced>=3?value.outline:baseline.outline);
        for(const file of files)expect(await readFile(join(f.folder,file))).toEqual(before.get(file));
        const fresh=await reopened.acquire();expect(fresh).toMatch(/^[0-9a-f-]{36}$/);
        await expect(reopened.checkpoint(value,old.versions)).rejects.toMatchObject({code:'EXTERNAL_CHANGE'});
        for(const file of files)expect(await readFile(join(f.folder,file))).toEqual(before.get(file));
        const receipt=await reopened.checkpoint(value,loaded.versions);expect((await reopened.load()).versions).toEqual(receipt.versions);expect((await reopened.load()).book).toEqual(value.book);
      }finally{
        if(child?.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
        await initialWriter.release();await reopened.release();await rm(f.root,{recursive:true,force:true});
      }
    }
  },15000);
  it('hashes and checkpoints exact UTF-8 notes bytes including their BOM',async()=>{
    const f=await fixture(),writer=new BookFiles(f.folder);
    try{
      const bytes=Buffer.from('\ufeff<p>Preserved notes</p>','utf8');await writeFile(join(f.folder,'notes.html'),bytes);
      await writer.acquire();const opened=await writer.load();expect(opened.notes).toBe('\ufeff<p>Preserved notes</p>');
      expect(opened.versions.notes).toBe(createHash('sha256').update(bytes).digest('hex'));
      const receipt=await writer.checkpoint({...checkpoint(opened),notes:opened.notes},opened.versions);
      expect(await readFile(join(f.folder,'notes.html'))).toEqual(bytes);expect(receipt.versions.notes).toBe(opened.versions.notes);
    }finally{await writer.release();await rm(f.root,{recursive:true,force:true});}
  });
  it('issues a four-file receipt that survives release and reopen', async () => {
    const f = await fixture(),
      writer = new BookFiles(f.folder);
    try {
      await writer.acquire();
      const initial = await writer.load();
      const value = checkpoint(initial);
      const receipt = await writer.checkpoint(value, initial.versions);
      await writer.release();
      const reader = new BookFiles(f.folder);
      const reopened = await reader.load(false);
      expect(reopened.versions).toEqual(receipt.versions);
      expect(reopened.book).toEqual(value.book);
      expect(reopened.reviews).toEqual(value.reviews);
      expect(reopened.notes).toBe(value.notes);
    } finally {
      await writer.release();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it('retries a partial checkpoint against the original expectations', async () => {
    const f = await fixture();
    let writes = 0;
    const writer = new BookFiles(f.folder, async (stage) => {
      if (stage === 'temporary.synced' && ++writes === 2) throw Error('Disk fault');
    });
    try {
      await writer.acquire();
      const initial = await writer.load(),
        value = checkpoint(initial);
      await expect(writer.checkpoint(value, initial.versions)).rejects.toThrow('Disk fault');
      expect((await writer.load(false)).book.formatVersion).toBe('neo-lifecycle/v1');
      const receipt = await writer.checkpoint(value, initial.versions);
      expect((await writer.load()).versions).toEqual(receipt.versions);
    } finally {
      await writer.release();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it('retries directory durability after an uncertain replacement', async () => {
    const f = await fixture();
    let fail = true;
    const writer = new BookFiles(f.folder, async (stage) => {
      if (stage === 'current.replaced' && fail) {
        fail = false;
        throw Error('Directory fault');
      }
    });
    try {
      await writer.acquire();
      const initial = await writer.load(),
        value = checkpoint(initial);
      await expect(writer.checkpoint(value, initial.versions)).rejects.toThrow('SAVE_UNCERTAIN');
      const receipt = await writer.checkpoint(value, initial.versions);
      expect((await writer.load()).versions).toEqual(receipt.versions);
    } finally {
      await writer.release();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it('rejects external prose changes before touching any checkpoint file', async () => {
    const f = await fixture(),
      writer = new BookFiles(f.folder);
    try {
      await writer.acquire();
      const initial = await writer.load(),
        value = checkpoint(initial);
      await writeFile(
        join(f.folder, 'manuscript.json'),
        JSON.stringify({
          ...initial.book,
          metadata: { ...initial.book.metadata, title: 'External' },
        }),
      );
      await expect(writer.checkpoint(value, initial.versions)).rejects.toThrow('EXTERNAL_CHANGE');
      expect(await readFile(join(f.folder, 'notes.html'), 'utf8')).toBe('notes');
      await expect(readFile(join(f.folder, 'reviews.json'))).rejects.toThrow();
    } finally {
      await writer.release();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it('rejects a second writer and recovers only a schema-valid backup', async () => {
    const f = await fixture(),
      writer = new BookFiles(f.folder),
      other = new BookFiles(f.folder);
    try {
      await writer.acquire();
      await expect(other.acquire()).rejects.toThrow('BUSY');
      const initial = await writer.load(),
        first = checkpoint(initial);
      await writer.checkpoint(first, initial.versions);
      await writeFile(join(f.folder, 'manuscript.json'), '{broken');
      const recovered = await writer.load();
      expect(recovered.recovered).toBe(true);
      expect(recovered.book.formatVersion).toBe('neo-lifecycle/v1');
      expect(recovered.reviews?.version).toBe(first.reviews.version);
    } finally {
      await writer.release();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it('rejects lost writer ownership before replacing any author files', async () => {
    const f = await fixture(),
      writer = new BookFiles(f.folder);
    try {
      await writer.acquire();
      const opened = await writer.load(),
        value = checkpoint(opened);
      const original = await readFile(join(f.folder, 'manuscript.json'), 'utf8');
      const foreign = JSON.stringify({ pid: process.pid, token: randomUUID() });
      await writeFile(join(f.folder, '.writer.lock'), foreign);
      await expect(writer.checkpoint(value, opened.versions)).rejects.toThrow('UNAUTHORIZED');
      expect(await readFile(join(f.folder, 'manuscript.json'), 'utf8')).toBe(original);
      await writer.release();
      expect(await readFile(join(f.folder, '.writer.lock'), 'utf8')).toBe(foreign);
    } finally {
      await writer.release();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it('rejects identical directory replacement even with the copied live writer cookie and preserves that replacement marker',async()=>{
    const f=await fixture(),writer=new BookFiles(f.folder);
    const stage=join(f.root,'replacement'),aside=join(f.root,'aside');
    try {
      const lease=await writer.acquire(),initial=await writer.load();
      await writer.checkpoint(checkpoint(initial),initial.versions);
      const opened=await writer.load(),value=checkpoint(opened,2);
      value.notes='Rejected local notes';value.outline='Rejected local outline';value.book.chapters[0].html='<p>Rejected local prose.</p>';
      const names=['manuscript.json','reviews.json','notes.html','outline.html'];
      const baseline=new Map(await Promise.all(names.map(async name=>[name,await readFile(join(f.folder,name))] as const)));
      const cookie=await readFile(join(f.folder,'.writer.lock'));
      await cp(f.folder,stage,{recursive:true});await rename(f.folder,aside);await rename(stage,f.folder);
      await expect(writer.checkpoint(value,opened.versions)).rejects.toThrow('UNAUTHORIZED');
      for(const name of names)expect(await readFile(join(f.folder,name))).toEqual(baseline.get(name));
      await writer.release();expect(await readFile(join(f.folder,'.writer.lock'))).toEqual(cookie);
      await unlink(join(f.folder,'.writer.lock'));
      const fresh=new BookFiles(f.folder);try{expect(await fresh.acquire()).not.toBe(lease);expect((await fresh.load()).versions).toEqual(opened.versions);}finally{await fresh.release();}
      for(const name of names)expect(await readFile(join(aside,name))).toEqual(baseline.get(name));
    } finally {await writer.release();await rm(f.root,{recursive:true,force:true});}
  });
  it('releases a locally owned session safely when its current directory or writer marker disappeared',async()=>{
    for(const missing of ['marker','directory'] as const){
      const f=await fixture(),writer=new BookFiles(f.folder);try{
        await writer.acquire();
        if(missing==='marker')await unlink(join(f.folder,'.writer.lock'));else await rename(f.folder,join(f.root,'aside'));
        await expect(writer.release()).resolves.toBeUndefined();await expect(writer.release()).resolves.toBeUndefined();
      }finally{await writer.release();await rm(f.root,{recursive:true,force:true});}
    }
  });
  it('treats malformed lock identities as busy rather than reclaiming them', async () => {
    const f = await fixture();
    try {
      const raw = JSON.stringify({ pid: -9999999, token: 'not-an-owner' });
      await writeFile(join(f.folder, '.writer.lock'), raw);
      await expect(new BookFiles(f.folder).acquire()).rejects.toThrow('BUSY');
      expect(await readFile(join(f.folder, '.writer.lock'), 'utf8')).toBe(raw);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it('marks valid but cross-version review state as recovered without rolling back bytes', async () => {
    const f = await fixture(),
      writer = new BookFiles(f.folder);
    try {
      await writer.acquire();
      const initial = await writer.load(),
        value = checkpoint(initial);
      await writer.checkpoint(value, initial.versions);
      const reviews = { ...value.reviews, version: randomUUID() };
      const raw = JSON.stringify(reviews);
      await writeFile(join(f.folder, 'reviews.json'), raw);
      const opened = await writer.load(false);
      expect(opened.recovered).toBe(true);
      expect(opened.reviews).toEqual(reviews);
      expect(await readFile(join(f.folder, 'reviews.json'), 'utf8')).toBe(raw);
      expect(opened.book).toEqual(value.book);
    } finally {
      await writer.release();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it('reports corrupt UTF-8 current and backup without replacing either', async () => {
    const f = await fixture();
    try {
      const bytes = Buffer.from([0xff, 0xfe, 0x80]);
      await writeFile(join(f.folder, 'manuscript.json'), bytes);
      await writeFile(join(f.folder, 'manuscript.json.bak'), bytes);
      await expect(new BookFiles(f.folder).load(false)).rejects.toThrow('CORRUPT');
      expect(await readFile(join(f.folder, 'manuscript.json'))).toEqual(bytes);
      expect(await readFile(join(f.folder, 'manuscript.json.bak'))).toEqual(bytes);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it('rejects a symbolic link root before acquiring a writer', async () => {
    const f = await fixture();
    try {
      await symlink(f.folder, join(f.root, 'linked'));
      await expect(new BookFiles(join(f.root, 'linked')).acquire()).rejects.toThrow('INVALID');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
it('public legacy export reads a composed checkpoint and reconstructs sticky and custom image sidecars',async()=>{
 const {exportNeo,importNeo}=await import('./legacy.ts'),f=await fixture();
 try{
 const files=new BookFiles(f.folder);await files.acquire();const opened=await files.load(),value=checkpoint(opened);
 value.book.metadata.stickies=[{id:'sticky-one',text:'Preserved note'}];value.book.metadata.coverImage='cover.json';value.book.metadata.coverMode='image';
 await files.checkpoint(value,opened.versions);await files.release();
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64'),destination=join(f.root,'legacy-export');
 await writeFile(join(f.folder,'cover-0.png'),'stale imported image');
 await writeFile(join(f.folder,'cover.json'),JSON.stringify({mime:'image/png',data:bytes.toString('base64')}));
 await exportNeo(f.folder,destination);
 const meta=JSON.parse(await readFile(join(destination,'book.json'),'utf8'));expect(meta.coverImage).toBe('cover-0.png');expect(meta.stickies).toBeUndefined();
 expect(await readFile(join(destination,'cover-0.png'))).toEqual(bytes);expect(JSON.parse(await readFile(join(destination,'stickies.json'),'utf8'))).toEqual(value.book.metadata.stickies);
 const imported=await importNeo(destination,join(f.root,'reimported'));expect(imported.chapters).toEqual(value.book.chapters.map(({id,html})=>({id,html})));expect(imported.metadata.stickies).toEqual(value.book.metadata.stickies);
 expect(JSON.parse(await readFile(join(f.folder,'manuscript.json'),'utf8')).formatVersion).toBe('neo-composed/v1');
 await writeFile(join(f.folder,'cover.json'),'null');await exportNeo(f.folder,join(f.root,'removed-export'));expect(JSON.parse(await readFile(join(f.root,'removed-export','book.json'),'utf8')).coverImage).toBeUndefined();
 }finally{await rm(f.root,{recursive:true,force:true});}
});
