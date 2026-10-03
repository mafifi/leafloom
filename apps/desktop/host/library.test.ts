import { it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { LibraryHost } from './library.ts';
import {CoverArtProvider} from './cover-art.ts';
import { Checkpoint, type Opened } from '@leafloom/editor-contracts';
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-host-'));
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
it('readable catalog maps actual book folders to shelves, includes orphans and avoids unchanged replacement', async () => {
  const f = await fixture();
  try {
    const alpha = await f.host.request('createBook', { title: 'Alpha é東京', author: 'Writer' }) as {id:string;title:string};
    const zulu = await f.host.request('createBook', { title: 'Zulu', author: 'Writer' }) as {id:string;title:string};
    const catalog = join(f.root, '_catalog.txt');
    expect(await readFile(catalog,'utf8')).toContain('Leafloom LIBRARY CATALOG — which folder is which book');
    const library = {shelves:[{id:'desk',name:'Desk',bookIds:[zulu.id]}]};
    await f.host.request('writeLibrary',{library});
    let text = await readFile(catalog,'utf8');
    expect(text).toContain(`Alpha é東京  —  ${alpha.id}  —  shelf: (none — removed from shelves)`);
    expect(text).toContain(`Zulu  —  ${zulu.id}  —  shelf: Desk`);
    expect(text.indexOf('Alpha é東京')).toBeLessThan(text.indexOf('Zulu'));
    const before = await stat(catalog);
    await f.host.request('writeLibrary',{library});
    const after = await stat(catalog);
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    const metadata = await f.host.request('readBookMeta',{bookId:zulu.id}) as Record<string,unknown>;
    await f.host.request('writeBookMeta',{bookId:zulu.id,metadata:{...metadata,title:'A renamed book'}});
    await f.host.request('writeLibrary',{library:{shelves:[{id:'new',name:'Other shelf',bookIds:[zulu.id,alpha.id]}]}});
    text = await readFile(catalog,'utf8');
    expect(text).toContain(`A renamed book  —  ${zulu.id}  —  shelf: Other shelf`);
    expect(text).toContain(`Alpha é東京  —  ${alpha.id}  —  shelf: Other shelf`);
    expect(text).not.toContain('Zulu');
    await f.host.request('deleteBook',{bookId:alpha.id});
    expect(await readFile(catalog,'utf8')).not.toContain(alpha.id);
  } finally { await f.dispose(); }
});
it('catalog follows leased title checkpoints while prose-only autosaves keep its existing inode and bytes', async () => {
  const f = await fixture();
  try {
    const metadata = await f.host.request('createBook',{title:'Old title',author:'Writer'}) as {id:string};
    const opened = await f.host.request('openBook',{bookId:metadata.id}) as Opened & {lease:string};
    const catalog = join(f.root,'_catalog.txt'), before = await stat(catalog), bytes = await readFile(catalog);
    const version = randomUUID(), checkpoint = Checkpoint.parse({
      book:{...opened.book,formatVersion:'neo-composed/v1',revision:1,version,chapters:[{id:'one',version:randomUUID(),html:'<p>Actual newly saved prose.</p>',passages:[]}]},
      reviews:{formatVersion:'neo-composed-reviews/v1',bookId:metadata.id,version,references:[],items:[]},notes:'',outline:'',
    });
    const receipt = await f.host.request('checkpoint',{bookId:metadata.id,lease:opened.lease,expected:opened.versions,checkpoint}) as {versions:Opened['versions']};
    expect(await readFile(catalog)).toEqual(bytes);
    expect((await stat(catalog)).ino).toBe(before.ino);
    const nextVersion=randomUUID(), next=Checkpoint.parse({...checkpoint,book:{...checkpoint.book,metadata:{...checkpoint.book.metadata,title:'New title'},revision:2,version:nextVersion},reviews:{...checkpoint.reviews,version:nextVersion}});
    await f.host.request('checkpoint',{bookId:metadata.id,lease:opened.lease,expected:receipt.versions,checkpoint:next});
    expect(await readFile(catalog,'utf8')).toContain(`New title  —  ${metadata.id}`);
    expect(await readFile(catalog,'utf8')).not.toContain('Old title');
  } finally { await f.dispose(); }
});
it('catalog import and initialization recover derived bytes; catalog errors never invalidate committed author data', async () => {
  const f=await fixture();
  try {
    const source=join(f.root,'Imported.txt');await writeFile(source,'Original input prose.');
    const imported=await f.host.request('importManuscript',{source}) as {id:string};
    const catalog=join(f.root,'_catalog.txt');
    expect(await readFile(catalog,'utf8')).toContain(`Imported  —  ${imported.id}`);
    await rm(catalog);await mkdir(catalog);
    const warnings:string[]=[];const stderr=vi.spyOn(process.stderr,'write').mockImplementation((value)=>{warnings.push(String(value));return true;});
    let created:{id:string};
    try { created=await f.host.request('createBook',{title:'Preserved author title',author:'Writer'}) as {id:string}; }
    finally { stderr.mockRestore(); }
    expect(JSON.parse(await readFile(join(f.root,created.id,'manuscript.json'),'utf8')).metadata.title).toBe('Preserved author title');
    expect(warnings.map(line=>JSON.parse(line))).toContainEqual({event:'catalog.failure',code:'DISK_ERROR'});
    expect(warnings.join('')).not.toContain('Preserved author title');
    await rm(catalog,{recursive:true});await f.host.initialize();
    expect(await readFile(catalog,'utf8')).toContain(`Preserved author title  —  ${created.id}`);
    expect(await readFile(source,'utf8')).toBe('Original input prose.');
  } finally { await f.dispose(); }
});
it('library operations retain settings, acquire leases, checkpoint, reopen and soft-delete', async () => {
  const f = await fixture();
  try {
    const metadata = (await f.host.request('createBook', {
      title: 'A Book',
      author: 'Author',
    })) as { id: string };
    await f.host.request('writeLibrary', {
      library: { shelves: [{ id: 'shelf', books: [metadata.id] }] },
    });
    await f.host.request('writeSettings', { settings: { theme: 'dark', zoom: 1.25 } });
    expect(await f.host.request('getSettings', {})).toEqual({ theme: 'dark', zoom: 1.25 });
    const opened = (await f.host.request('openBook', { bookId: metadata.id })) as Opened & {
      lease: string;
    };
    const version = randomUUID(),
      value = Checkpoint.parse({
        book: { ...opened.book, formatVersion: 'neo-composed/v1', revision: 1, version },
        reviews: {
          formatVersion: 'neo-composed-reviews/v1',
          bookId: metadata.id,
          version,
          references: [],
          items: [],
        },
        notes: 'Notes',
        outline: 'Outline',
      });
    await expect(
      f.host.request('checkpoint', {
        bookId: metadata.id,
        lease: randomUUID(),
        checkpoint: value,
        expected: opened.versions,
      }),
    ).rejects.toThrow('UNAUTHORIZED');
    const receipt = await f.host.request('checkpoint', {
      bookId: metadata.id,
      lease: opened.lease,
      checkpoint: value,
      expected: opened.versions,
    });
    expect(receipt).toMatchObject({ revision: 1 });
    await expect(f.host.request('deleteBook', { bookId: metadata.id })).rejects.toThrow('BUSY');
    await f.host.request('closeBook', { bookId: metadata.id, lease: opened.lease });
    const reopened = (await f.host.request('openBook', { bookId: metadata.id })) as Opened & {
      lease: string;
    };
    expect(reopened.notes).toBe('Notes');
    expect(reopened.book).toEqual(value.book);
    await f.host.request('closeBook', { bookId: metadata.id, lease: reopened.lease });
    await f.host.request('deleteBook', { bookId: metadata.id });
    expect(await f.host.request('listBooks', {})).toEqual([]);
    const trash = await readdir(join(f.root, 'Trash'));
    expect(trash).toHaveLength(1);
    expect(await readdir(join(f.root, 'Trash', trash[0]))).not.toContain('.writer.lock');
  } finally {
    await f.dispose();
  }
});
it('rejects traversal and arbitrary methods without modifying outside library', async () => {
  const f = await fixture();
  try {
    await expect(f.host.request('readFile', { path: '/etc/passwd' })).rejects.toThrow('INVALID');
    await expect(f.host.request('openBook', { bookId: '../elsewhere' })).rejects.toThrow();
    await expect(
      f.host.request('createBook', { title: 'X', author: 'A', unknown: 'field' }),
    ).rejects.toThrow();
  } finally {
    await f.dispose();
  }
});
it('imports and exports original chapter bytes, notes, outline, darlings and stickies', async () => {
  const f = await fixture();
  try {
    const source = join(f.root, 'source');
    await mkdir(join(source, 'chapters'), { recursive: true });
    const html = '\uFEFF<p class="poetry">One &amp; two<br>Three.</p>';
    const notes='\uFEFF<p>Notes.</p>';
    await writeFile(
      join(source, 'book.json'),
      JSON.stringify({ id: 'old', title: 'Imported', author: 'Author', chapterOrder: ['one'] }),
    );
    await writeFile(join(source, 'chapters/one.html'), html);
    await writeFile(join(source, 'notes.html'), notes);
    await writeFile(join(source, 'outline.html'), '<p>Outline.</p>');
    await writeFile(
      join(source, 'darlings.json'),
      JSON.stringify([{ id: 'darling', html: '<p>Saved.</p>' }]),
    );
    await writeFile(
      join(source, 'stickies.json'),
      JSON.stringify([{ id: 'sticky', text: 'Comment' }]),
    );
    const imported = (await f.host.request('importLegacy', { source })) as { id: string };
    expect(imported.id).not.toBe('old');
    expect(JSON.parse(await readFile(join(f.root,imported.id,'manuscript.json'),'utf8')).metadata.id).toBe(imported.id);
    const destination = join(f.root, 'exported');
    await f.host.request('exportLegacy', { bookId: imported.id, destination });
    expect(await readFile(join(destination, 'chapters/one.html'), 'utf8')).toBe(html);
    expect(await readFile(join(destination,'notes.html'),'utf8')).toBe(notes);
    expect(JSON.parse(await readFile(join(destination, 'stickies.json'), 'utf8'))).toEqual([
      { id: 'sticky', text: 'Comment' },
    ]);
    expect(JSON.parse(await readFile(join(destination, 'book.json'), 'utf8'))).not.toHaveProperty(
      'stickies',
    );
    await expect(
      f.host.request('exportLegacy', { bookId: imported.id, destination }),
    ).rejects.toThrow('INVALID');
  } finally {
    await f.dispose();
  }
});
it('Hunspell applies dictionary rules, persists learned words and suggests corrections', async () => {
  const f = await fixture();
  try {
    expect(
      await f.host.request('spellcheck', {
        language: 'en-US',
        words: ['writer', 'zzleafloomwordzz'],
      }),
    ).toEqual({ writer: true, zzleafloomwordzz: false });
    const suggestions = (await f.host.request('spellSuggest', {
      language: 'en-US',
      word: 'writter',
    })) as string[];
    expect(suggestions.length).toBeGreaterThan(0);
    await f.host.request('spellLearn', { language: 'en-US', word: 'zzleafloomwordzz' });
    expect((await f.host.request('readLibrary',{}) as {customWords:string[]}).customWords).toContain('zzleafloomwordzz');
    expect(await f.host.request('spellcheck',{language:'fr',words:['zzleafloomwordzz']})).toEqual({zzleafloomwordzz:true});
    await f.host.request('writeLibrary',{library:{theme:'paper'}});expect((await f.host.request('readLibrary',{}) as {customWords:string[]}).customWords).toContain('zzleafloomwordzz');
    expect(
      await f.host.request('spellcheck', { language: 'en-US', words: ['zzleafloomwordzz'] }),
    ).toEqual({ zzleafloomwordzz: true });
    const restarted = new LibraryHost(f.root);
    await restarted.initialize();
    expect(
      await restarted.request('spellcheck', { language: 'en-US', words: ['zzleafloomwordzz'] }),
    ).toEqual({ zzleafloomwordzz: true });
    expect(await restarted.request('spellcheck',{language:'de',words:['zzleafloomwordzz']})).toEqual({zzleafloomwordzz:true});
    for(const language of ['pt-BR','pt_BR'])expect(await restarted.request('spellcheck',{language,words:['coração','zzleafloomwordzz']})).toEqual({'coração':true,zzleafloomwordzz:true});
    await restarted.shutdown();
    await expect(f.host.request('spellcheck', { language: 'bad', words: [] })).rejects.toThrow(
      'INVALID',
    );
  } finally {
    await f.dispose();
  }
});
it('propagates external traceparent to host and disk spans without manuscript attributes', async () => {
  const f = await fixture();
  try {
    const trace = '00-12345678901234567890123456789012-1234567890123456-01',
      metadata = (await f.host.request(
        'createBook',
        { title: 'Private book title', author: 'Private author' },
        trace,
      )) as { id: string };
    const opened = (await f.host.request('openBook', { bookId: metadata.id })) as Opened & {
      lease: string;
    };
    const version = randomUUID(),
      value = Checkpoint.parse({
        book: { ...opened.book, formatVersion: 'neo-composed/v1', revision: 1, version },
        reviews: {
          formatVersion: 'neo-composed-reviews/v1',
          bookId: metadata.id,
          version,
          references: [],
          items: [],
        },
        notes: 'Private prose',
        outline: '',
      });
    await f.host.request(
      'checkpoint',
      { bookId: metadata.id, lease: opened.lease, checkpoint: value, expected: opened.versions },
      trace,
    );
    const diagnostics = (await f.host.request('diagnostics', {})) as {
      telemetry: {
        spans: { name: string; traceId: string; parentSpanId: string }[];
        metricExports: number;
      };
    };
    const host = diagnostics.telemetry.spans.findLast((s) => s.name === 'host.checkpoint');
    const disk = diagnostics.telemetry.spans.findLast((s) => s.name === 'documents.checkpoint');
    expect(host?.traceId).toBe('12345678901234567890123456789012');
    expect(disk?.traceId).toBe(host?.traceId);
    expect(host?.parentSpanId).toBe('1234567890123456');
    expect(JSON.stringify(diagnostics.telemetry)).not.toContain('Private');
    expect(diagnostics.telemetry.metricExports).toBeGreaterThan(0);
  } finally {
    await f.dispose();
  }
});

it('private cover worker reads saved manuscript and persists art without exposing credentials or changing the checkpoint',async()=>{
 const f=await fixture();try{
 const metadata=await f.host.request('createBook',{title:'River',author:'Fixture'}) as {id:string};
 const opened=await f.host.request('openBook',{bookId:metadata.id}) as Opened & {lease:string};
 const version=randomUUID();const checkpoint=Checkpoint.parse({book:{...opened.book,formatVersion:'neo-composed/v1',revision:1,version,chapters:[{id:randomUUID(),version,passages:[],html:'<p>A river at dusk.</p><p class="ghost">Hidden placeholder.</p>'}]},reviews:{formatVersion:'neo-composed-reviews/v1',bookId:metadata.id,version,references:[],items:[]},notes:'Preserved notes',outline:'Outline'});
 await f.host.request('checkpoint',{bookId:metadata.id,lease:opened.lease,checkpoint,expected:opened.versions});
 const phases:string[]=[];const transport:typeof fetch=async(url,init)=>{const path=new URL(String(url)).pathname;if(path.endsWith('/models'))return Response.json({data:[]});const payload=JSON.parse(String(init?.body));if(path.endsWith('/chat/completions')){expect(payload.messages[1].content).toContain('A river at dusk.');expect(payload.messages[1].content).not.toContain('Hidden placeholder.');return Response.json({choices:[{message:{content:'A river at dusk, with blue light.'}}]});}return Response.json({data:[{b64_json:Buffer.from([255,216,255,217]).toString('base64')}]});};
 const result=await f.host.paintCover({bookId:metadata.id,apiKey:'synthetic-fixture-key',jobId:randomUUID()},new CoverArtProvider(transport),phase=>phases.push(phase));
 expect(phases).toEqual(['brief','painting','saving']);expect(await readFile(join(f.root,metadata.id,result.file))).toEqual(Buffer.from([255,216,255,217]));
 const sidecar=await readFile(join(f.root,metadata.id,'art.json'),'utf8');expect(sidecar).not.toContain('synthetic-fixture-key');expect(sidecar).toContain('gpt-image-1-mini');
 expect(await readFile(join(f.root,metadata.id,'notes.html'),'utf8')).toContain('Preserved notes');
 const restarted=new LibraryHost(f.root);await restarted.initialize();try{expect(await restarted.request('readCoverArtJob',{bookId:metadata.id})).toMatchObject({status:'done',result:{file:result.file}});expect(await restarted.request('readCoverArt',{bookId:metadata.id})).toEqual(result);expect(await restarted.request('readCover',{bookId:metadata.id,mode:'painted'})).toContain('data:image/jpeg;base64,');await writeFile(join(f.root,metadata.id,'art-job.json'),JSON.stringify({bookId:metadata.id,jobId:randomUUID(),status:'painting'}));expect(await restarted.request('readCoverArtJob',{bookId:metadata.id})).toMatchObject({status:'failed',code:'INTERRUPTED'});await writeFile(join(f.root,metadata.id,result.file),'externally damaged synthetic image');await expect(restarted.request('readCoverArt',{bookId:metadata.id})).rejects.toThrow('CORRUPT');expect(await readFile(join(f.root,metadata.id,result.file),'utf8')).toBe('externally damaged synthetic image');}finally{await restarted.shutdown();}

 await expect(f.host.request('_paintCover',{bookId:metadata.id,apiKey:'synthetic-fixture-key'})).rejects.toThrow();
 }finally{await f.dispose();}
});

it('corrupt library UTF-8 and JSON never become defaults or get overwritten by preference saves',async()=>{
 const f=await fixture();try{const path=join(f.root,'library.json'),bytes=Buffer.concat([Buffer.from('{"name":"'),Buffer.from([255]),Buffer.from('"}')]);await writeFile(path,bytes);await expect(f.host.request('readLibrary',{})).rejects.toThrow('CORRUPT');await expect(f.host.request('writeLibrary',{library:{name:'Replacement'}})).rejects.toThrow('CORRUPT');expect(await readFile(path)).toEqual(bytes);await writeFile(join(f.root,'settings.json'),'broken { json');await expect(f.host.request('writeSettings',{settings:{theme:'paper'}})).rejects.toThrow('CORRUPT');expect(await readFile(join(f.root,'settings.json'),'utf8')).toBe('broken { json');}finally{await f.dispose();}
});

it('legacy import rejects malformed chapter UTF-8 before publishing a migrated folder',async()=>{
 const f=await fixture();try {
 const source=join(f.root,'source-invalid');await mkdir(join(source,'chapters'),{recursive:true});
 await writeFile(join(source,'book.json'),JSON.stringify({id:'old',title:'Original',author:'Writer',chapterOrder:['one']}));
 const bytes=Buffer.from([0x3c,0x70,0x3e,0xc3,0x28]);await writeFile(join(source,'chapters/one.html'),bytes);
 const before=await f.host.request('listBooks',{});
 await expect(f.host.request('importLegacy',{source})).rejects.toThrow('CORRUPT');
 expect(await f.host.request('listBooks',{})).toEqual(before);expect(await readFile(join(source,'chapters/one.html'))).toEqual(bytes);
 }finally{await f.dispose();}
});

it('deletion fallback retains recoverable bytes and rejects reserved or mismatched folders',async()=>{
  const f=await fixture();
  try{
    for(const name of ['Exports','Backups','Trash']){
      await mkdir(join(f.root,name),{recursive:true});await writeFile(join(f.root,name,'sentinel'),'keep');
      await expect(f.host.request('deleteBook',{bookId:name})).rejects.toThrow('INVALID');
      expect(await readFile(join(f.root,name,'sentinel'),'utf8')).toBe('keep');
    }
    const metadata=await f.host.request('createBook',{title:'Owned',author:'Fixture'}) as {id:string};
    const file=join(f.root,metadata.id,'manuscript.json');
    const bytes=await readFile(file);
    const prepared=await f.host.prepareDeleteBook({bookId:metadata.id});
    await expect(f.host.request('deleteBook',{bookId:metadata.id})).rejects.toThrow('BUSY');
    await expect(f.host.finishDeleteBook({...prepared,lease:randomUUID()})).rejects.toThrow();
    await f.host.finishDeleteBook({bookId:metadata.id,lease:prepared.lease});
    expect(await readFile(file)).toEqual(bytes);
    expect(await f.host.request('deleteBook',{bookId:metadata.id})).toEqual({deleted:true,location:'library-trash'});
    const moved=(await readdir(join(f.root,'Trash'))).find(name=>name.startsWith(metadata.id+'-'))!;
    expect(await readFile(join(f.root,'Trash',moved,'manuscript.json'))).toEqual(bytes);
    await expect(readFile(join(f.root,'Trash',moved,'.writer.lock'))).rejects.toThrow();
    const other=await f.host.request('createBook',{title:'Other',author:'Fixture'}) as {id:string};
    await writeFile(join(f.root,other.id,'manuscript.json'),bytes);
    await expect(f.host.request('deleteBook',{bookId:other.id})).rejects.toThrow('INVALID');
    expect(await readFile(join(f.root,other.id,'manuscript.json'))).toEqual(bytes);
  }finally{await f.dispose();}
});
it('legacy export replacement cover wins over the stale imported filename collision',async()=>{
 const f=await fixture();try{
 const source=join(f.root,'legacy-source');await mkdir(join(source,'chapters'),{recursive:true});
 await writeFile(join(source,'book.json'),JSON.stringify({id:'legacy',title:'Cover fixture',author:'Writer',chapterOrder:['one'],coverImage:'cover-0.png',coverMode:'image'}));
 await writeFile(join(source,'chapters/one.html'),'<p>Retained prose.</p>');await writeFile(join(source,'cover-0.png'),'old imported image');
 const imported=await f.host.request('importLegacy',{source}) as {id:string};
 const replacement=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64'),image=join(f.root,'replacement.png');await writeFile(image,replacement);
 await f.host.request('setCover',{bookId:imported.id,source:image});
 const destination=join(f.root,'export-replaced');await f.host.request('exportLegacy',{bookId:imported.id,destination});
 const metadata=JSON.parse(await readFile(join(destination,'book.json'),'utf8'));expect(metadata.coverImage).toBe('cover-0.png');expect(await readFile(join(destination,metadata.coverImage))).toEqual(replacement);
 expect(await readFile(join(destination,'chapters/one.html'),'utf8')).toBe('<p>Retained prose.</p>');
 }finally{await f.dispose();}
});
