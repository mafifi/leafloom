import { it, expect } from 'vitest';
import {Book} from '@leafloom/document-contracts';
import {createHash,randomUUID} from 'node:crypto';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderManuscript,renderChapter,renderCollection } from './manuscript-export.ts';
import { parseManuscript } from './manuscript-import.ts';
import { LibraryHost } from './library.ts';
import {systemPDFVariants,exportFonts} from './export-fonts.ts';
import {generatedCover} from './generated-cover.ts';
import {Checkpoint,type Opened} from '@leafloom/editor-contracts';
import { JSDOM } from 'jsdom';
import { chapterEditionFixture, inspectChapterEdition } from '../../../tests/neo-compat/shared/chapter-edition-io.mjs';
it('embeds an installed Other Font in PDF and safely quotes custom HTML family names',async()=>{
 if(process.platform!=='darwin')return;
 const f=await fixture();try{
 expect(await systemPDFVariants('Arial')).not.toBeNull();
 const file=join(f.root,'arial.pdf');await writeFile(file,await renderManuscript(f.opened,'pdf',{bodyFont:'Arial'}));
 const fonts=spawnSync('pdffonts',[file],{encoding:'utf8'});expect(fonts.status).toBe(0);expect(fonts.stdout).toContain('Arial');expect(fonts.stdout).not.toContain('Times-Roman');expect(fonts.stdout).not.toContain('NotoSerif');
 const text=spawnSync('pdftotext',[file,'-'],{encoding:'utf8'});expect(text.status).toBe(0);expect(text.stdout).toContain('River & Stone');expect(text.stdout).toContain('Καλημέρα');expect(text.stdout).toContain('Привет');
 expect((await exportFonts({bodyFont:"Writer's <Font>"})).css).toContain("Writer\\'s \\3c Font>");
 }finally{await f.dispose();}
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-formats-'));
  await writeFile(join(root, '.leafloom-fixture'), '');
  const host = new LibraryHost(root);
  await host.initialize();
  const metadata = (await host.request('createBook', {
    title: 'River & Stone',
    author: 'An Author',
  })) as { id: string };
  const opened = (await host.request('openBook', { bookId: metadata.id })) as Opened & {
    lease: string;
  };
  opened.book.chapters = [
    {
      id: 'chapter-one',
      html: '<p>Opening <strong>bold</strong> and <em>italic</em> words.</p><p class="poetry">Καλημέρα<br>Привет</p><p class="scene-break">***</p><p class="ghost">Hidden prose</p><p>Closing words.</p>',
    },
  ];
  opened.book.metadata.chapterTitles = { 'chapter-one': 'A Beginning' };
  return {
    host,
    opened,
    dispose: async () => {
      await host.shutdown();
      await rm(root, { recursive: true, force: true });
    },
    root,
  };
}
it('DOCX preserves bold, italic, breaks and chapter structure and imports back', async () => {
  const f = await fixture();
  try {
    const bytes = await renderManuscript(f.opened, 'docx'),
      zip = await JSZip.loadAsync(bytes),
      xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
    expect(xml).toContain('<w:br/>');
    expect(xml).toContain('River &amp; Stone');
    expect(xml).not.toContain('Hidden prose');
    const path = join(f.root, 'roundtrip.docx');
    await writeFile(path, bytes);
    const imported = await parseManuscript(path);
    expect(
      imported.chapters
        .flatMap((ch) => ch.paras)
        .map((p) => p.text ?? '')
        .join(' '),
    ).toContain('**bold**');
    expect(
      imported.chapters
        .flatMap((ch) => ch.paras)
        .map((p) => p.text ?? '')
        .join(' '),
    ).toContain('Closing words.');
    expect(
      imported.chapters
        .flatMap((ch) => ch.paras)
        .map((p) => p.text ?? '')
        .join(' '),
    ).toContain('Καλημέρα\nПривет');
  } finally {
    await f.dispose();
  }
});
it('EPUB has first stored mimetype, navigation, language and embedded cover', async () => {
  const f = await fixture();
  try {
    const bytes = await renderManuscript(f.opened, 'epub', {
      language: 'el',
      cover: { mime: 'image/png', data: Buffer.from('fixture image').toString('base64') },
    });
    expect(bytes.subarray(30, 38).toString()).toBe('mimetype');
    expect(bytes.readUInt16LE(8)).toBe(0);
    const zip = await JSZip.loadAsync(bytes);
    expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip');
    expect(await zip.file('OEBPS/content.opf')!.async('string')).toContain(
      '<dc:language>el</dc:language>',
    );
    expect(await zip.file('OEBPS/nav.xhtml')!.async('string')).toContain('River &amp; Stone');
    expect(await zip.file('OEBPS/ch1.xhtml')!.async('string')).toContain('Καλημέρα');
    expect(await zip.file('OEBPS/cover.png')!.async('string')).toBe('fixture image');
  } finally {
    await f.dispose();
  }
});
it('PDF embeds Unicode font mappings and title/chapter pages; text renderers remove hidden atoms', async () => {
  const f = await fixture();
  try {
    const bytes = await renderManuscript(f.opened, 'pdf');
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = bytes.toString('latin1');
    expect(pdf).toContain('/ToUnicode');
    expect(pdf).toContain('/FontFile2');
    expect(pdf).toContain('/Outlines');
    expect(bytes.length).toBeGreaterThan(15000);
    const extracted = spawnSync('pdftotext', ['-', '-'], { input: bytes, encoding: 'utf8' });
    if (!extracted.error) {
      expect(extracted.status).toBe(0);
      expect(extracted.stdout).toContain('Καλημέρα');
      expect(extracted.stdout).toContain('Привет');
      expect(extracted.stdout).toContain('Closing words.');
    }
    for (const format of ['txt', 'md', 'html'] as const) {
      const output = (await renderManuscript(f.opened, format)).toString();
      expect(output).toContain('Καλημέρα');
      expect(output).toContain('Closing words.');
      expect(output).not.toContain('Hidden prose');
    }
    expect((await renderManuscript(f.opened, 'md')).toString()).toContain('**bold**');
  } finally {
    await f.dispose();
  }
});

it('collection exports read actual saved books in supplied order and honor bound numbering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-collection-'));
  await writeFile(join(root, '.leafloom-fixture'), '');
  const host = new LibraryHost(root);
  await host.initialize();
  try {
    const ids: string[] = [];
    for (const title of ['First Work', 'Second Work']) {
      const meta = (await host.request('createBook', { title, author: title + ' Author' })) as {
        id: string;
      };
      const opened = (await host.request('openBook', { bookId: meta.id })) as Opened & {
        lease: string;
      };
      await host.request('closeBook', { bookId: meta.id, lease: opened.lease });
      await writeFile(
        join(root, meta.id, 'manuscript.json'),
        JSON.stringify({
          ...opened.book,
          chapters: [1, 2].map((n) => ({
            id: 'chapter-' + n,
            html: `<p>${title} saved words ${n}.</p>`,
          })),
        }),
      );
      ids.push(meta.id);
    }
    const destination = join(root, 'collection.txt');
    await host.request('exportCollection', {
      bookIds: ids.slice().reverse(),
      title: 'The Collection',
      author: 'Editor',
      bound: true,
      numbering: 'through',
      format: 'txt',
      destination,
    });
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(destination, 'utf8');
    expect(text.indexOf('Second Work')).toBeLessThan(text.indexOf('First Work'));
    expect(text).toContain('Chapter 4');
    expect(text).toContain('Second Work saved words 1.');
    await host.request('exportCollection', {
      bookIds: ids,
      title: 'Anthology',
      format: 'docx',
      destination,
    });
    const zip = await JSZip.loadAsync(await readFile(destination));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.match(/Chapter 1/g)).toHaveLength(2);
    expect(xml).not.toContain('Chapter 3');
    expect(xml.indexOf('First Work saved words')).toBeLessThan(
      xml.indexOf('Second Work saved words'),
    );
    expect(xml).toContain('w:pStyle w:val="Heading2"');
    await host.request('exportCollection', {
      bookIds: ids,
      title: 'Anthology',
      format: 'epub',
      destination,
    });
    const epub = await JSZip.loadAsync(await readFile(destination));
    const nav = await epub.file('OEBPS/nav.xhtml')!.async('string');
    expect(nav).toContain('First Work</a><ol><li>');
    expect(nav).toContain('Second Work</a><ol><li>');
  } finally {
    await host.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});

it('email draft snapshots render actual saved manuscript to an owned PDF without launching mail', async () => {
  const f = await fixture();
  const host = new LibraryHost(f.root);
  await host.initialize();
  try {
    await writeFile(
      join(f.root, f.opened.book.metadata.id, 'manuscript.json'),
      JSON.stringify(f.opened.book),
    );
    const reply = (await host.request('renderEmailDraft', {
      bookId: f.opened.book.metadata.id,
      to: 'writer@example.test',
      subject: 'A draft " & Καλημέρα',
      body: 'Notes for myself.',
      method: 'gmail',
    })) as { file: string; to: string; method: string };
    expect(reply.file.startsWith(join(f.root, 'Exports') + '/')).toBe(true);
    expect(reply.to).toBe('writer@example.test');
    const { readFile } = await import('node:fs/promises');
    expect((await readFile(reply.file)).subarray(0, 4).toString()).toBe('%PDF');
    const content = spawnSync('pdftotext', [reply.file, '-'], { encoding: 'utf8' });
    expect(content.status).toBe(0);
    expect(content.stdout.replace(/\s+/g,' ')).toContain('Opening bold and italic words.');
    expect(content.stdout).toContain('Καλημέρα');
    await expect(
      host.request('renderEmailDraft', {
        bookId: f.opened.book.metadata.id,
        to: 'bad\nrecipient',
        subject: '',
        body: '',
        method: 'gmail',
      }),
    ).rejects.toThrow();
  } finally {
    await host.shutdown();
    await f.dispose();
  }
});

it('exports custom cover images but excludes generated shelf paintings from EPUB', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-cover-export-'));
  await writeFile(join(root, '.leafloom-fixture'), '');
  const host = new LibraryHost(root); await host.initialize();
  try {
    const meta = await host.request('createBook', {title:'Painted Book'}) as {id:string;title:string;author:string};
    await host.request('writeBookMeta', {bookId:meta.id,metadata:{...meta,coverMode:'painted',coverArt:{status:'done',file:'art-1.jpg'}}});
    await writeFile(join(root,meta.id,'art-1.jpg'),Buffer.from([0xff,0xd8,0xff,0xd9]));
    expect(await host.request('readCover',{bookId:meta.id})).toMatch(/^data:image\/jpeg/);
    const destination = join(root,'book.epub');
    await host.request('exportBook',{bookId:meta.id,destination,format:'epub'});
    const {readFile} = await import('node:fs/promises');
    expect((await JSZip.loadAsync(await readFile(destination))).file('OEBPS/cover.jpg')).toBeNull();
    const custom = join(root,'custom.png');
    await writeFile(custom,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQAAAAABJRU5ErkJggg==','base64'));
    await host.request('setCover',{bookId:meta.id,source:custom});
    await host.request('exportBook',{bookId:meta.id,destination,format:'epub'});
    expect((await JSZip.loadAsync(await readFile(destination))).file('OEBPS/cover.png')).not.toBeNull();
  } finally { await host.shutdown();await rm(root,{recursive:true,force:true}); }
});
it('Markdown retains literal title syntax and spaced bold/italic boundaries', async () => {
  const f = await fixture();
  try {
    f.opened.book.metadata.title = 'Wool *Omnibus* [Book]';
    f.opened.book.chapters[0].html = '<p>Before<strong> bold </strong><em>italic </em>after *literal*.</p>';
    const markdown = (await renderManuscript(f.opened,'md')).toString();
    expect(markdown).toContain('# Wool \\*Omnibus\\* \\[Book\\]');
    expect(markdown).toContain('Before **bold** *italic* after \\*literal\\*.');
  } finally {await f.dispose();}
});

it('email fingerprint guards the saved snapshot before creating a PDF draft',async()=>{
 const f=await fixture();try{
 const source=join(f.root,f.opened.book.metadata.id,'manuscript.json');
 await writeFile(source,JSON.stringify(f.opened.book));
 const {fingerprint}=await f.host.request('manuscriptFingerprint',{bookId:f.opened.book.metadata.id}) as {fingerprint:string};
 const changed={...f.opened.book,metadata:{...f.opened.book.metadata,title:'Changed saved title'}};
 await writeFile(source,JSON.stringify(changed));
 const request={bookId:f.opened.book.metadata.id,to:'writer@example.test',subject:'Draft',body:'Original provenance',method:'gmail' as const,expectedFingerprint:fingerprint};
 await expect(f.host.request('renderEmailDraft',request)).rejects.toMatchObject({code:'EXTERNAL_CHANGE'});
 expect(await readdir(join(f.root,'Exports')).catch(()=>[])).toEqual([]);
 const current=await f.host.request('manuscriptFingerprint',{bookId:request.bookId}) as {fingerprint:string};
 const reply=await f.host.request('renderEmailDraft',{...request,expectedFingerprint:current.fingerprint}) as {file:string};
 const text=spawnSync('pdftotext',[reply.file,'-'],{encoding:'utf8'});expect(text.status).toBe(0);expect(text.stdout).toContain('Changed saved title');
 expect(await readFile(source,'utf8')).toBe(JSON.stringify(changed));
 }finally{await f.dispose();}
});

it('saved UI locale translates generated output labels independently of manuscript language and custom titles',async()=>{
 const f=await fixture();try{
 const metadata={...f.opened.book.metadata,chapterKinds:{contents:'contents',part:'part',one:'chapter',two:'chapter',about:'about'},chapterTitles:{one:'Dawn',two:'Dusk'}};
 const book=Book.parse({formatVersion:'neo-lifecycle/v1',revision:0,metadata,chapters:[{id:'contents',html:''},{id:'part',html:'<p>First Light</p>'},{id:'one',html:'<p>Opening prose.</p>'},{id:'two',html:'<p>Closing prose.</p>'},{id:'about',html:'<p>A biography.</p>'}],darlings:[]});
 await f.host.request('closeBook',{bookId:metadata.id,lease:(f.opened as Opened&{lease:string}).lease});
 await writeFile(join(f.root,metadata.id,'manuscript.json'),JSON.stringify(book));
 await f.host.request('setLanguage',{language:'fr'});
 const destination=join(f.root,'locale.epub');
 await f.host.request('exportBook',{bookId:metadata.id,format:'epub',destination,language:'el'});
 const zip=await JSZip.loadAsync(await readFile(destination)),nav=await zip.file('OEBPS/nav.xhtml')!.async('string'),opf=await zip.file('OEBPS/content.opf')!.async('string');
 expect(nav).toContain('Sommaire');expect(nav).toContain('Page de titre');expect(nav).toContain('Partie I: First Light');expect(nav).toContain('Chapitre 1 — Dawn');expect(nav).toContain('Chapitre 2 — Dusk');expect(nav).toContain('À propos de l’auteur');expect(nav).toContain('epub:type="landmarks"');expect(nav).toContain('href="ch3.xhtml">Début');
 expect(opf).toContain('<dc:language>el</dc:language>');expect(opf).toContain('<guide>');expect(opf).toContain('Table des matières');
 const part=await zip.file('OEBPS/ch2.xhtml')!.async('string');expect(part).toContain('<span class="part-label">Partie I</span>');expect(part).toContain('<span class="part-title">First Light</span>');
 const html=await f.host.request('renderPreview',{bookId:metadata.id}) as string;expect(html).toContain('Chapitre 2 — Dusk');expect(html).toContain('Sommaire');
 const collection=join(f.root,'locale-collection.txt');
 const request={bookIds:[metadata.id],title:'Collection',author:'Editor',bound:true,format:'txt' as const,destination:collection};
 await f.host.request('exportCollection',request);expect(await readFile(collection,'utf8')).toContain('Chapitre 1 — Dawn');
 await f.host.request('writeLibrary',{library:{exportCustomChapterTitles:true}});
 await f.host.request('exportCollection',request);const custom=await readFile(collection,'utf8');expect(custom).toContain('Dawn');expect(custom).not.toContain('Chapitre 1');

 }finally{await f.dispose();}
});

it('chapter exports preserve only the selected story across six actual formats and refuse parts/empty sections',async()=>{
 const f=await fixture();try{
 f.opened.book.chapters.push({id:'second',version:'00000000-0000-4000-8000-000000000000',passages:[],html:'<p>Other chapter must stay private.</p>'});
 for(const format of ['txt','md','html','docx','epub','pdf'] as const){const bytes=await renderChapter(f.opened,'chapter-one',format);let text:string;if(format==='docx'||format==='epub'){const zip=await JSZip.loadAsync(bytes);text=(await Promise.all(Object.values(zip.files).filter(file=>!file.dir&&/\.(xml|xhtml)$/.test(file.name)).map(file=>file.async('string')))).join('\n');}else if(format==='pdf'){text=spawnSync('pdftotext',['-','-'],{input:bytes,encoding:'utf8'}).stdout;}else{text=bytes.toString();}expect(text).toContain('Opening');expect(text).not.toContain('Other chapter must stay private.');expect(text).not.toContain('Hidden prose');}
 f.opened.book.metadata.chapterKinds={'chapter-one':'part'};await expect(renderChapter(f.opened,'chapter-one','txt')).rejects.toThrow('INVALID');
 await expect(renderChapter(f.opened,'missing','txt')).rejects.toThrow('INVALID');
 }finally{await f.dispose();}
});

it('whole manuscript exports retain original parts, front matter, explicit contents and custom-title numbering',async()=>{
 const f=await fixture();try{const base={version:'00000000-0000-4000-8000-000000000000',passages:[]};f.opened.book.chapters=[{...base,id:'dedication',html:'<p>For the reader.</p>'},{...base,id:'contents',html:''},{...base,id:'part',html:'<p>First Light</p><p>A verse for morning.</p>'},{...base,id:'one',html:'<p>Opening chapter.</p>'},{...base,id:'two',html:'<p>Closing chapter.</p>'},{...base,id:'about',html:'<p>A writer biography.</p>'}];f.opened.book.metadata.chapterKinds={dedication:'dedication',contents:'contents',part:'part',one:'chapter',two:'chapter',about:'about'};f.opened.book.metadata.chapterTitles={one:'Dawn',two:'Dusk'};
 const text=(await renderManuscript(f.opened,'txt')).toString();expect(text).toContain('Part I: First Light');expect(text).toContain('Chapter 1 — Dawn');expect(text).toContain('Chapter 2 — Dusk');expect(text).toContain('Contents');expect(text).toContain('A writer biography.');expect(text).not.toContain('Chapter 3');
 const custom=(await renderManuscript(f.opened,'txt',{customChapterTitles:true})).toString();expect(custom).toContain('Dawn');expect(custom).not.toContain('Chapter 1');
 const zip=await JSZip.loadAsync(await renderManuscript(f.opened,'epub'));const nav=await zip.file('OEBPS/nav.xhtml')!.async('string');expect(nav).toContain('Part I: First Light');expect(nav).not.toContain('For the reader.');expect(nav).toContain('Chapter 2 — Dusk');
 }finally{await f.dispose();}
});

it('source chapter editions retain named and blank unnumbered Contents links without inventing body headings', async () => {
  const f = await fixture();
  try {
    f.opened.book = Book.parse({
      formatVersion: 'neo-lifecycle/v1', revision: 0,
      metadata: { ...f.opened.book.metadata, ...chapterEditionFixture.metadata, restartNumbering: true },
      chapters: chapterEditionFixture.chapters.map((html, index) => ({
        id: `ch-${index + 1}`, html: index === 4 ? html.replace('Alpha ', 'Edited Alpha ') : html,
      })), darlings: [],
    });
    const before = JSON.stringify(f.opened.book);
    const bytes = await renderManuscript(f.opened, 'html');
    expect(inspectChapterEdition('html', bytes, 'before').toc).toContain(chapterEditionFixture.metadata.title);
    const document = new JSDOM(bytes.toString()).window.document;
    expect(document.querySelector('#ch-8 > h3')?.textContent).toBe('Interlude');
    expect(document.querySelector('#ch-9 > h1,#ch-9 > h2,#ch-9 > h3')).toBeNull();
    expect(JSON.stringify(f.opened.book)).toBe(before);
  } finally { await f.dispose(); }
});

it('source chapter editions omit printed Contents from Markdown before and after Part restructuring', async () => {
  const f = await fixture();
  try {
    const chapters = chapterEditionFixture.chapters.map((html, index) => ({
      id: `ch-${index + 1}`, html: index === 4 ? html.replace('Alpha ', 'Edited Alpha ') : html,
    }));
    f.opened.book = Book.parse({
      formatVersion: 'neo-lifecycle/v1', revision: 0,
      metadata: { ...f.opened.book.metadata, ...chapterEditionFixture.metadata, restartNumbering: true },
      chapters, darlings: [],
    });
    for (const stage of ['before', 'after'] as const) {
      if (stage === 'after') {
        f.opened.book.chapters = [chapters[0]!, chapters[1]!, chapters[2]!, chapters[5]!, chapters[4]!,
          { id: 'new-part', html: '<p><br></p>' }, ...chapters.slice(6)];
        f.opened.book.metadata.chapterKinds = { ...chapterEditionFixture.metadata.chapterKinds, 'new-part': 'part' };
      }
      const before = JSON.stringify(f.opened.book);
      inspectChapterEdition('md', await renderManuscript(f.opened, 'md'), stage);
      expect(JSON.stringify(f.opened.book)).toBe(before);
    }
  } finally { await f.dispose(); }
});

it('source chapter editions keep solo unnumbered body heading blank and add Contents only when explicitly requested', async () => {
  const f = await fixture();
  try {
    f.opened.book = Book.parse({
      formatVersion: 'neo-lifecycle/v1', revision: 0,
      metadata: { ...f.opened.book.metadata, chapterKinds: { solo: 'unnumbered' }, chapterTitles: { solo: '' } },
      chapters: [{ id: 'solo', html: '<p>Only <b>authored</b> story.</p>' }], darlings: [],
    });
    let document = new JSDOM((await renderManuscript(f.opened, 'html')).toString()).window.document;
    expect(document.querySelector('.contents')).toBeNull();
    expect(document.querySelector('#solo > h1,#solo > h2,#solo > h3')).toBeNull();
    f.opened.book.chapters.unshift({ id: 'toc', html: '<p>Never export this stale Contents body.</p>' });
    f.opened.book.metadata.chapterKinds = { toc: 'contents', solo: 'unnumbered' };
    document = new JSDOM((await renderManuscript(f.opened, 'html')).toString()).window.document;
    expect([...document.querySelectorAll('.contents a')].map(a => [a.getAttribute('href'), a.textContent])).toEqual([
      ['#solo', f.opened.book.metadata.title],
    ]);
    expect(document.querySelector('#solo > h1,#solo > h2,#solo > h3')).toBeNull();
    expect(document.body.textContent).not.toContain('Never export this stale Contents body.');
  } finally { await f.dispose(); }
});

it('chosen writing fonts embed exact HTML bytes and PDF/DOCX family while EPUB retains reader serif fonts',async()=>{
 const f=await fixture();try{
 f.opened.book.metadata.title='River Καλημέρα Привет';
 const options={bodyFont:'Gelasio',dropcap:'fantasy'};const html=(await renderManuscript(f.opened,'html',options)).toString();expect(html).toContain("font-family:'Gelasio'");expect(html).toContain(process.platform==='darwin'||process.platform==='win32'?"font-family:'Apple Chancery'":"font-family:'TeX Gyre Chorus'");const bytes=await readFile(new URL('../public/fonts/gelasio-latin-400-normal.ttf',import.meta.url));expect(html).toContain(bytes.toString('base64'));
 const zip=await JSZip.loadAsync(await renderManuscript(f.opened,'epub',options));const epubCSS=await zip.file('OEBPS/style.css')!.async('string');expect(epubCSS).toContain('font-family:serif');expect(epubCSS).not.toContain(bytes.toString('base64'));expect(epubCSS).not.toContain('@font-face');
 const pdf=await renderManuscript(f.opened,'pdf',options);expect(pdf.toString('latin1')).toContain('Gelasio');const text=spawnSync('pdftotext',['-','-'],{input:pdf,encoding:'utf8'}).stdout;expect(text.match(/Καλημέρα/g)).toHaveLength(2);expect(text.match(/Привет/g)).toHaveLength(2);
 const docx=await JSZip.loadAsync(await renderManuscript(f.opened,'docx',options));expect(await docx.file('word/styles.xml')!.async('string')).toContain('w:ascii="Gelasio"');
 }finally{await f.dispose();}
});

it.skipIf(process.platform!=='darwin')('macOS source menu fonts select actual system PDF subfonts without bundling system font files',async()=>{
 const f=await fixture();try{for(const [bodyFont,expected]of [['Georgia','Georgia'],['Palatino','Palatino'],['Baskerville','Baskerville'],['Hoefler Text','HoeflerText'],['Iowan Old Style','IowanOldStyle']]){const pdf=await renderManuscript(f.opened,'pdf',{bodyFont});expect(pdf.toString('latin1')).toContain(expected);const text=spawnSync('pdftotext',['-','-'],{input:pdf,encoding:'utf8'}).stdout;expect(text).toContain('Opening');}}finally{await f.dispose();}
});

it('PDF draws source two-line initial glyphs with matching fonts and preserves searchable words and rich runs',async()=>{
 const f=await fixture();try{
 const prose='Opening bold rich words walk beside the river. The manuscript has enough prose to fill several lines beneath the two-line initial. Every word remains intact when copied or searched in the actual exported PDF.';
 f.opened.book.chapters[0].html='<p>'+prose.replace('bold','<strong>bold</strong>').replace('rich','<em>rich</em>')+'</p><p class="scene-break">***</p><p>Later prose stays ordinary.</p>';
 const operators=(bytes:Buffer)=>Array.from(bytes.toString('latin1').matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\n\/(F\d+) ([\d.]+) Tf/g),match=>({x:Number(match[1]),y:Number(match[2]),font:match[3],size:Number(match[4])}));
 for(const [dropcap,expected] of process.platform==='darwin'?[['literary','Didot'],['fantasy','Apple-Chancery'],['scifi','Futura']] as const:[['literary','Bodoni'],['fantasy','Chorus'],['scifi','Jost']] as const){
  const bytes=await renderManuscript(f.opened,'pdf',{dropcap}),draws=operators(bytes),cap=draws.find(draw=>draw.size>30)!;
  expect(cap).toBeDefined();expect(draws.filter(draw=>draw.size>30)).toHaveLength(1);expect(bytes.toString('latin1')).toContain(expected);
  const body=draws.slice(draws.indexOf(cap)+1).filter(draw=>draw.size===13),first=body[0]!,baselines=[...new Set(body.map(draw=>draw.y))];
  expect(first.x).toBeGreaterThan(cap.x+15);expect(baselines[0]!-baselines[1]!).toBeCloseTo(22.1,3);
  const second=body.find(draw=>Math.abs(draw.y-baselines[1]!)<.001)!,third=body.find(draw=>Math.abs(draw.y-baselines[2]!)<.001)!;
  expect(second.x).toBeCloseTo(first.x,3);expect(third.x).toBeCloseTo(72,3);expect(baselines[1]!-baselines[2]!).toBeCloseTo(22.1,3);
  const file=join(f.root,dropcap+'.pdf');await writeFile(file,bytes);const extracted=spawnSync('pdftotext',[file,'-'],{encoding:'utf8'});expect(extracted.status).toBe(0);expect(extracted.stdout.replace(/\s+/g,' ')).toContain(prose);expect(extracted.stdout).toContain('Opening');expect(bytes.toString('latin1')).toContain('/ActualText');
  const bbox=spawnSync('pdftotext',['-bbox',file,'-'],{encoding:'utf8'});expect(bbox.status).toBe(0);const opening=bbox.stdout.match(/<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>Opening<\/word>/);expect(opening).not.toBeNull();expect(Number(opening![2])).toBeLessThan(200);
  expect(bytes.toString('latin1')).toContain('Bold');expect(bytes.toString('latin1')).toContain('Italic');
 }
 const plain=await renderManuscript(f.opened,'pdf',{dropcap:'none'});expect(operators(plain).some(draw=>draw.size>30)).toBe(false);
 f.opened.book.chapters[0].html='<p>— Speech opens the chapter.</p><p>Ordinary prose answers.</p>';const dialogue=await renderManuscript(f.opened,'pdf');expect(operators(dialogue).some(draw=>draw.size>30)).toBe(false);
 f.opened.book.chapters[0].html='<p class="poetry">Poetry begins without an initial.</p><p>Opening prose follows the verse.</p>';const poetry=operators(await renderManuscript(f.opened,'pdf'));const capIndex=poetry.findIndex(draw=>draw.size>30);expect(capIndex).toBeGreaterThan(0);expect(poetry[capIndex-1]!.size).toBe(13);
 }finally{await f.dispose();}
});

it('rejects compressed DOCX XML expansion without creating a book or disabling the host', async()=> {
  const f=await fixture();
  try {
    const before=await f.host.request('listBooks',{});
    const zip=new JSZip();
    zip.file('word/document.xml','<w:document>'+ ' '.repeat(20_000_001)+'</w:document>');
    const source=join(f.root,'expanded.docx');
    await writeFile(source,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
    expect((await readFile(source)).byteLength).toBeLessThan(100_000);
    await expect(f.host.request('importManuscript',{source})).rejects.toThrow('INVALID');
    expect(await f.host.request('listBooks',{})).toEqual(before);
    expect(await f.host.request('getSettings',{})).toBeDefined();
  }finally {await f.host.shutdown();await rm(f.root,{recursive:true,force:true});}
});

it('HTML enlarges only opening prose while EPUB resets opening indents at scene breaks and dialogue keeps its indent',async()=>{
 const f=await fixture();try {
 f.opened.book.chapters[0].html='<p class="poetry">Opening verse</p><p>Opening prose.</p><p class="scene-break">***</p><p>After scene.</p><p class="scene-break">***</p><p>— Dialogue.</p>';
 const html=(await renderManuscript(f.opened,'html',{dropcap:'fantasy'})).toString();
 expect(html).toContain('class="prose first" style="text-align:left">Opening prose.');
 expect(html).toContain('class="prose" style="text-align:left">After scene.');
 expect(html).toContain('class="prose dialogue" style="text-align:left">— Dialogue.');
 expect(html).toContain('p.first:not(.dialogue)::first-letter');
 const zip=await JSZip.loadAsync(await renderManuscript(f.opened,'epub'));
 const chapter=await zip.file('OEBPS/ch1.xhtml')!.async('string');
 expect(chapter).toContain('class="prose first">After scene.');
 expect(chapter).toContain('class="prose first dialogue">— Dialogue.');
 }finally{await f.dispose();}
});

it('rejects malformed UTF-8 imports without replacing source bytes',async()=>{
 const f=await fixture();try {
 const source=join(f.root,'malformed.txt'),bytes=Buffer.from([0x41,0xc3,0x28]);await writeFile(source,bytes);
 const before=await f.host.request('listBooks',{});
 await expect(f.host.request('importManuscript',{source})).rejects.toThrow('INVALID');
 expect(await readFile(source)).toEqual(bytes);expect(await f.host.request('listBooks',{})).toEqual(before);
 }finally{await f.dispose();}
});

it('fingerprints saved source text independently of formatting, covers and fonts, while prose and title edits change it',async()=>{
 const f=await fixture();try {
 const folder=join(f.root,f.opened.book.metadata.id),manuscript=join(folder,'manuscript.json');
 const book=JSON.parse(await readFile(manuscript,'utf8'));
 book.chapters=[{id:'one',html:'<p>A <b>bold</b></p><p>B<br>C &amp; D&nbsp;<span class="ph-mark">FLAG</span><span class="darling-anchor">ANCHOR</span></p><p class="ghost">GHOST</p>'},{id:'two',html:'<p>Second.</p>'}];
 await writeFile(manuscript,JSON.stringify(book));
 const reply=await f.host.request('manuscriptFingerprint',{bookId:book.metadata.id}) as {fingerprint:string};
 expect(reply.fingerprint).toBe(createHash('sha256').update(book.metadata.title+'\nA boldBC & D\u00a0\nSecond.').digest('hex'));
 book.chapters[0].html=book.chapters[0].html.replace('<b>bold</b>','<em>bold</em>');book.metadata.coverMode='abstract';
 await writeFile(manuscript,JSON.stringify(book));await f.host.request('writeLibrary',{library:{fonts:{body:'Jost',dropcap:'fantasy'}}});
 expect(await f.host.request('manuscriptFingerprint',{bookId:book.metadata.id})).toEqual(reply);
 book.chapters[0].html=book.chapters[0].html.replace('bold','edited');await writeFile(manuscript,JSON.stringify(book));
 const prose=await f.host.request('manuscriptFingerprint',{bookId:book.metadata.id});expect(prose).not.toEqual(reply);
 book.metadata.title+=' revised';await writeFile(manuscript,JSON.stringify(book));expect(await f.host.request('manuscriptFingerprint',{bookId:book.metadata.id})).not.toEqual(prose);
 }finally{await f.dispose();}
});

it('PDF carries tagged reading structure, locale paper size and actual Contents target page numbers',async()=>{
 const f=await fixture();try {
 f.opened.book=Book.parse({...f.opened.book,chapters:[{id:'toc',html:'<p>Contents</p>'},{id:'first',html:'<p>FIRST SENTINEL</p>'+Array.from({length:100},()=>'<p>'+ 'Long manuscript words '.repeat(15)+'</p>').join('')},{id:'last',html:'<p>LAST SENTINEL</p>'}],metadata:{...f.opened.book.metadata,chapterKinds:{toc:'contents',first:'chapter',last:'chapter'},chapterTitles:{first:'Arrival',last:'Departure'}}});
 const file=join(f.root,'tagged.pdf');await writeFile(file,await renderManuscript(f.opened,'pdf',{paperCountry:'US',language:'en-US'}));
 const info=spawnSync('pdfinfo',[file],{encoding:'utf8'});expect(info.status).toBe(0);expect(info.stdout).toMatch(/Tagged:\s+yes/);expect(info.stdout).toMatch(/Page size:\s+612 x 792 pts/);
 const extracted=spawnSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});expect(extracted.status).toBe(0);const pages=extracted.stdout.split('\f');const first=pages.findIndex(page=>page.replace(/\s+/g,' ').includes('FIRST SENTINEL'))+1,last=pages.findIndex(page=>page.replace(/\s+/g,' ').includes('LAST SENTINEL'))+1;
 expect(first).toBeGreaterThan(2);expect(last).toBeGreaterThan(first);
 expect(pages[1]).toMatch(new RegExp('Chapter 1 — Arrival\\s+'+first));expect(pages[1]).toMatch(new RegExp('Chapter 2 — Departure\\s+'+last));
 const bytes=await readFile(file);expect(bytes.toString('latin1')).toContain('/StructTreeRoot');expect(bytes.toString('latin1')).toContain('/S /TOCI');expect(bytes.toString('latin1')).toContain('/S /Reference');
 const a4=join(f.root,'a4.pdf');await writeFile(a4,await renderManuscript(f.opened,'pdf',{paperCountry:'GB'}));expect(spawnSync('pdfinfo',[a4],{encoding:'utf8'}).stdout).toMatch(/Page size:\s+595\.28 x 841\.89 pts/);
 }finally{await f.dispose();}
});

it('front pages retain source attribution typography and copyright placement in actual PDF and EPUB output',async()=>{
 const f=await fixture();try{
 f.opened.book=Book.parse({...f.opened.book,chapters:[{id:'rights',html:'<p>Copyright sentinel</p>'},{id:'quote',html:'<p>Quoted <em>upright</em> words.</p><p>— Attribution sentinel</p>'},{id:'story',html:'<p>Body sentinel</p>'}],metadata:{...f.opened.book.metadata,chapterKinds:{rights:'copyright',quote:'epigraph',story:'chapter'},chapterTitles:{}}});
 const file=join(f.root,'front-pages.pdf');await writeFile(file,await renderManuscript(f.opened,'pdf',{paperCountry:'GB'}));
 const bbox=spawnSync('pdftotext',['-bbox',file,'-'],{encoding:'utf8'});expect(bbox.status).toBe(0);const match=bbox.stdout.match(/<word xMin="[^"]+" yMin="([^"]+)"[^>]*>Copyright<\/word>/);expect(match).not.toBeNull();expect(Number(match![1])).toBeGreaterThan(650);
 const pages=spawnSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'}).stdout.split('\f');expect(pages[1]).not.toMatch(/\n\s+2\s*$/);expect(pages[3]).toMatch(/\n\s+4\s*$/);
 const html=(await renderManuscript(f.opened,'html')).toString();expect(html).toContain('class="prose attr"');expect(html).toContain('justify-content:flex-end');
 const zip=await JSZip.loadAsync(await renderManuscript(f.opened,'epub'));const quote=await zip.file('OEBPS/ch2.xhtml')!.async('string');expect(quote).toContain('<section class="epigraph" epub:type="epigraph">');expect(quote).toMatch(/class="prose attr(?: dialogue)?"/);expect(await zip.file('OEBPS/style.css')!.async('string')).toContain('.dedication em,.epigraph em,.part p em{font-style:normal}');
 }finally{await f.dispose();}
});

it('multi-title printed collections insert Contents listing titles and retain selected writing fonts',async()=>{
 const f=await fixture();try{
 const books=['First Work','Second Work'].map((title,index)=>({...f.opened,book:Book.parse({...f.opened.book,metadata:{...f.opened.book.metadata,id:'book-'+index,title,chapterTitles:{},chapterKinds:{}},chapters:[{id:'one',html:'<p>'+title+' FIRST SENTINEL</p>'},{id:'two',html:'<p>'+title+' LAST SENTINEL</p>'}]})}));
 const pdf=await renderCollection(books,'pdf',{title:'Bound Collection',author:'Editor',bound:true,bodyFont:'Gelasio'});expect(pdf.toString('latin1')).toContain('Gelasio');
 const file=join(f.root,'bound.pdf');await writeFile(file,pdf);const pages=spawnSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'}).stdout.split('\f');expect(pages[1]).toContain('Contents');expect(pages[1]).toContain('First Work');expect(pages[1]).toContain('Second Work');expect(pages[1]).not.toContain('Chapter 1');
 const html=(await renderCollection(books,'html',{title:'Bound Collection',author:'Editor',bound:true,bodyFont:'Gelasio'})).toString();expect(html).toContain('id="collection-contents"');expect(html).toContain('href="#collection-1"');expect(html).toContain("font-family:'Gelasio'");
 }finally{await f.dispose();}
});

it('eligible generated covers render in real EPUB/PDF/HTML while saved custom covers take precedence and chapter exports omit seeds',async()=>{
 const f=await fixture();try{
 const seed=await readFile(new URL('../src-tauri/icons/Leafloom.iconset/icon_16x16.png',import.meta.url)),url='data:image/png;base64,'+seed.toString('base64'),id=f.opened.book.metadata.id;
 expect(generatedCover(url)?.mime).toBe('image/png');
 const epub=join(f.root,'seed.epub');await f.host.request('exportBook',{bookId:id,format:'epub',destination:epub,generatedCover:url});const zip=await JSZip.loadAsync(await readFile(epub));expect(await zip.file('OEBPS/cover.png')!.async('nodebuffer')).toEqual(seed);
 const preview=await f.host.request('renderPreview',{bookId:id,generatedCover:url}) as string;expect(preview).toContain('class="cover-page"');expect(preview).toContain(url);
 const pdf=join(f.root,'seed.pdf');await f.host.request('exportBook',{bookId:id,format:'pdf',destination:pdf,generatedCover:url});const images=spawnSync('pdfimages',['-list',pdf],{encoding:'utf8'});expect(images.status).toBe(0);expect(images.stdout).toMatch(/\b16\s+16\s+/);
 const custom=await readFile(new URL('../src-tauri/icons/Leafloom.iconset/icon_32x32.png',import.meta.url)),source=join(f.root,'custom.png');await writeFile(source,custom);await f.host.request('setCover',{bookId:id,source});await f.host.request('exportBook',{bookId:id,format:'epub',destination:epub,generatedCover:url});expect(await (await JSZip.loadAsync(await readFile(epub))).file('OEBPS/cover.png')!.async('nodebuffer')).toEqual(custom);
 await f.host.request('removeCover',{bookId:id});const before=await readFile(epub);
 await expect(f.host.request('exportChapter',{bookId:id,chapterId:'chapter-one',format:'epub',destination:epub,generatedCover:url})).rejects.toThrow('Unrecognized key');expect(await readFile(epub)).toEqual(before);
 await expect(f.host.request('exportBook',{bookId:id,format:'epub',destination:epub,generatedCover:'data:image/png;base64,AAAA'})).rejects.toThrow('INVALID');expect(await readFile(epub)).toEqual(before);
 const invalid=Buffer.from(seed);invalid.writeUInt32BE(100000,16);expect(()=>generatedCover('data:image/png;base64,'+invalid.toString('base64'))).toThrow('INVALID');
 expect(()=>generatedCover('data:image/jpeg;base64,/9j/2Q==')).toThrow('INVALID');
 }finally{await f.dispose();}
});


it('missing saved writing font uses the source Georgia PDF fallback without changing preferences',async()=>{
 if(process.platform!=='darwin')return;
 const f=await fixture();try{
  const bodyFont='Leafloom Missing Fixture Family 79';
  await f.host.request('writeLibrary',{library:{fonts:{body:bodyFont}}});
  const file=join(f.root,'missing-font.pdf');await writeFile(file,await renderManuscript(f.opened,'pdf',{bodyFont,dropcap:'none'}));
  const fonts=spawnSync('pdffonts',[file],{encoding:'utf8'});expect(fonts.status).toBe(0);expect(fonts.stdout).toContain('Georgia');
  expect((await f.host.request('readLibrary',{})) as object).toMatchObject({fonts:{body:bodyFont}});
 }finally{await f.dispose();}
});

it.runIf(Boolean(process.env.LEAFLOOM_IMAGE_DECODER))('saved WebP covers export as decoded PDF images while EPUB retains the exact source bytes',async()=>{
 const f=await fixture();try{
  const bytes=Buffer.from('UklGRi4AAABXRUJQVlA4TCEAAAAvAUAAEB8w/wKCIv9HExAU+T+agKDouuUCeGfCOkT0PwIA','base64'),source=join(f.root,'custom.webp');await writeFile(source,bytes);
  const bookId=f.opened.book.metadata.id;await f.host.request('setCover',{bookId,source});
  const destination=join(f.root,'custom.pdf');await f.host.request('exportBook',{bookId,format:'pdf',destination});
  const pdf=await readFile(destination);expect(pdf.toString('latin1')).toContain('/Subtype /Image');expect(pdf.toString('latin1')).toContain('/Width 2');expect(pdf.toString('latin1')).toContain('/Height 2');expect(pdf.toString('latin1')).toContain('/SMask');
  expect(spawnSync('pdftoppm',['-f','1','-singlefile','-scale-to','32',destination,join(f.root,'raster')],{encoding:'utf8'}).status).toBe(0);
  const epub=join(f.root,'custom.epub');await f.host.request('exportBook',{bookId,format:'epub',destination:epub});const zip=await JSZip.loadAsync(await readFile(epub));expect(await zip.file('OEBPS/cover.webp')!.async('nodebuffer')).toEqual(bytes);
  expect(await readFile(source)).toEqual(bytes);expect(JSON.parse(await readFile(join(f.root,bookId,'cover.json'),'utf8')).data).toBe(bytes.toString('base64'));
 }finally{await f.dispose();}
});
it('rejects oversized custom cover canvases before replacing saved cover or export bytes',async()=>{
 const f=await fixture();try{
  const bookId=f.opened.book.metadata.id,source=join(f.root,'bounded-cover.png');
  const valid=await readFile(new URL('../src-tauri/icons/Leafloom.iconset/icon_32x32.png',import.meta.url));
  await writeFile(source,valid);await f.host.request('setCover',{bookId,source});
  const stored=join(f.root,bookId,'cover.json'),before=await readFile(stored),oversized=Buffer.from(valid);oversized.writeUInt32BE(100_000,16);
  await writeFile(source,oversized);await expect(f.host.request('setCover',{bookId,source})).rejects.toThrow('INVALID');expect(await readFile(stored)).toEqual(before);
  // An externally edited saved cover receives the same preflight at output.
  await writeFile(stored,JSON.stringify({mime:'image/png',data:oversized.toString('base64')}));
  const destination=join(f.root,'existing-export.pdf');await writeFile(destination,'retained prior export');
  await expect(f.host.request('exportBook',{bookId,format:'pdf',destination})).rejects.toThrow('INVALID');expect(await readFile(destination,'utf8')).toBe('retained prior export');
 }finally{await f.dispose();}
});
it('new manuscript import applies only source dialogue dashes using global writing language', async () => {
  const f=await fixture();
  try {
    const file=join(f.root,'dialogue.txt');
    await writeFile(file,'- Hello - she said. "Straight" ... !\n\n-123\n\n---\n\n**bold** -\n');
    await f.host.request('writeLibrary',{library:{spellLanguage:'es'}});
    const imported=await f.host.request('importManuscript',{source:file}) as {id:string};
    const opened=await f.host.request('openBook',{bookId:imported.id}) as Opened & {lease:string};
    const html=opened.book.chapters.map(ch=>ch.html).join('');
    expect(html).toContain('—Hello — she said. "Straight" ... !');
    expect(html).toContain('-123'); expect(html).toContain('<p class="scene-break">***</p>'); expect(html).toContain('<b>bold</b> —');
    await f.host.request('closeBook',{bookId:imported.id,lease:opened.lease});
    const reopened=await f.host.request('openBook',{bookId:imported.id}) as Opened;
    expect(reopened.book.chapters.map(ch=>ch.html).join('')).toBe(html);
    await f.host.request('writeLibrary',{library:{}});
    await f.host.request('setLanguage',{language:'pt'});
    const localeImported=await f.host.request('importManuscript',{source:file}) as {id:string};
    const localeOpened=await f.host.request('openBook',{bookId:localeImported.id}) as Opened;
    expect(localeOpened.book.chapters.map(ch=>ch.html).join('')).toContain('— Hello — she said.');
  } finally {await f.dispose();}
});
it('PDF uses bundled supported CJK glyphs with bold and oblique emphasis, preserving selected Latin fonts',async()=>{
 const f=await fixture();try{
 f.opened.book.metadata.title='Tokyo 東京';f.opened.book.chapters[0]!.html='<p>Latin café 東京. <i>日本語</i> <b>太字</b> <b><i>強調</i></b>.</p>';
 const bytes=await renderManuscript(f.opened,'pdf',{bodyFont:'Georgia',dropcap:'none'}),file=join(f.root,'cjk.pdf');await writeFile(file,bytes);
 const fonts=spawnSync('pdffonts',[file],{encoding:'utf8'});expect(fonts.status).toBe(0);expect(fonts.stdout).toContain('NotoSerifCJKjp-Regular');expect(fonts.stdout).toContain('NotoSerifCJKjp-Bold');expect(fonts.stdout).toMatch(/Georgia|NotoSerif-Regular/);
 const text=spawnSync('pdftotext',[file,'-'],{encoding:'utf8'});expect(text.status).toBe(0);for(const value of ['Tokyo','東京','日本語','太字','強調','café'])expect(text.stdout).toContain(value);
 // Actual PDFKit oblique matrices paint the CJK italic/bold-italic runs.
 expect(bytes.toString('latin1').match(/1 0 -0\.25 1 /g)?.length).toBeGreaterThanOrEqual(2);
 const {pdfGlyphFace,pdfGlyphRuns}=await import('./pdf-glyphs.ts');
 for(const weight of ['Regular','Bold']){
 const face=pdfGlyphFace('Proof',await readFile(new URL('./fonts/NotoSerifCJKjp-'+weight+'.otf',import.meta.url)));
 for(const char of '東京日本語太字強調')expect(face.supports(char.codePointAt(0)!)).toBe(true);
 expect(pdfGlyphRuns('東京',[face])[0]?.face).toBe(face);
 }
 // An unsupported glyph cannot silently paint .notdef or replace old output.
 const meta=await f.host.request('createBook',{title:'Unsupported',author:'Fixture'}) as {id:string};
 const opened=await f.host.request('openBook',{bookId:meta.id}) as Opened & {lease:string};
 const version=randomUUID(),checkpoint=Checkpoint.parse({
 book:{...opened.book,formatVersion:'neo-composed/v1',revision:1,version,chapters:[{id:'missing',html:'<p>\u{10FFFF}</p>',version,passages:[]}]},
 reviews:{formatVersion:'neo-composed-reviews/v1',bookId:meta.id,version,references:[],items:[]},notes:'',outline:''});
 await f.host.request('checkpoint',{bookId:meta.id,lease:opened.lease,checkpoint,expected:opened.versions});
 const old=join(f.root,'existing.pdf');await writeFile(old,'prior export');
 await expect(f.host.request('exportBook',{bookId:meta.id,format:'pdf',destination:old})).rejects.toThrow('PDF_GLYPH_UNAVAILABLE');
 expect(await readFile(old,'utf8')).toBe('prior export');
 }finally{await f.dispose();}
});

it('EPUB preserves a lease-owned durable UUID across repeat exports and reopen in OPF and NCX',async()=>{
 const f=await fixture();try{
 const opened=f.opened as Opened&{lease:string},bookId=opened.book.metadata.id,uuid=randomUUID(),version=randomUUID();
 const checkpoint=Checkpoint.parse({book:{...opened.book,formatVersion:'neo-composed/v1',revision:1,version,metadata:{...opened.book.metadata,uuid},chapters:opened.book.chapters.map(ch=>({...ch,version,passages:[]}))},reviews:{formatVersion:'neo-composed-reviews/v1',bookId,version,references:[],items:[]},notes:'',outline:''});
 await f.host.request('checkpoint',{bookId,lease:opened.lease,checkpoint,expected:opened.versions});
 for(let index=0;index<3;index++){
 const destination=join(f.root,'uuid-'+index+'.epub');
 await f.host.request('exportBook',{bookId,format:'epub',destination});
 const zip=await JSZip.loadAsync(await readFile(destination)),opf=await zip.file('OEBPS/content.opf')!.async('string'),ncx=await zip.file('OEBPS/toc.ncx')!.async('string');
 expect(opf).toContain('<dc:identifier id="bookid">urn:uuid:'+uuid+'</dc:identifier>');
 expect(ncx).toContain('content="urn:uuid:'+uuid+'"');
 expect(JSON.parse(await readFile(join(f.root,bookId,'manuscript.json'),'utf8')).metadata.uuid).toBe(uuid);
 if(index===1){await f.host.request('closeBook',{bookId,lease:opened.lease});await f.host.request('openBook',{bookId});}
 }
 }finally{await f.dispose();}
});

it('collection EPUB retains supplied shelf UUID while unbound editions get source transient identities',async()=>{
 const f=await fixture();try{
 const uuid=randomUUID(),base={bookIds:[f.opened.book.metadata.id],title:'Collected',author:'Editor',format:'epub' as const,bound:true,uuid};
 const identifiers:string[]=[];
 for(let index=0;index<2;index++){
 const destination=join(f.root,'bound-'+index+'.epub');await f.host.request('exportCollection',{...base,destination,title:index?'Renamed Collection':'Collected'});
 const zip=await JSZip.loadAsync(await readFile(destination)),opf=await zip.file('OEBPS/content.opf')!.async('string');
 const identifier=opf.match(/<dc:identifier id="bookid">([^<]+)<\/dc:identifier>/)![1]!;identifiers.push(identifier);
 expect(identifier).toBe('urn:uuid:'+uuid);
 expect(await zip.file('OEBPS/toc.ncx')!.async('string')).toContain('content="'+identifier+'"');
 }
 expect(identifiers[0]).toBe(identifiers[1]);
 const transient:string[]=[];
 for(let index=0;index<2;index++){
 const destination=join(f.root,'anthology-'+index+'.epub');const {uuid:_uuid,...payload}=base;
 await f.host.request('exportCollection',{...payload,bound:false,destination});
 const zip=await JSZip.loadAsync(await readFile(destination)),opf=await zip.file('OEBPS/content.opf')!.async('string');transient.push(opf.match(/<dc:identifier id="bookid">([^<]+)<\/dc:identifier>/)![1]!);
 }
 expect(transient[0]).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);expect(transient[0]).not.toBe(transient[1]);
 await expect(f.host.request('exportCollection',{...base,uuid:'not-a-uuid',destination:join(f.root,'invalid.epub')})).rejects.toThrow();
 }finally{await f.dispose();}
});
it('real PDF Contents labels and physical page counts link to actual named chapter destinations',async()=>{
 const f=await fixture();try{
 f.opened.book.chapters=[{id:'contents',html:'<p></p>'},{id:'first-story',html:'<p>First destination prose.</p>'},{id:'second-story',html:'<p>Second destination prose.</p>'}];
 f.opened.book.metadata.chapterKinds={contents:'contents'};f.opened.book.metadata.chapterTitles={'first-story':'First','second-story':'Second'};
 const bytes=await renderManuscript(f.opened,'pdf'),{getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true}),pdf=await task.promise;
 try{
 const toc=await pdf.getPage(2),links=(await toc.getAnnotations()).filter(link=>link.subtype==='Link');
 expect(links.length).toBeGreaterThanOrEqual(4);
 const targets=new Set<string>(),tocText=(await toc.getTextContent()).items.filter(item=>'str'in item).map(item=>item.str);
 for(const link of links){
 if(typeof link.dest!=='string')throw Error('Contents requires a real named destination');
 targets.add(link.dest);const destination=await pdf.getDestination(link.dest);expect(destination).not.toBeNull();
 const index=await pdf.getPageIndex(destination![0]),page=await pdf.getPage(index+1),text=(await page.getTextContent()).items.filter(item=>'str'in item).map(item=>item.str).join('').replace(/\s/g,'');
 expect(text).toContain(link.dest==='first-story'?'Firstdestinationprose.':'Seconddestinationprose.');
 expect(tocText).toContain(String(index+1));
 expect(link.rect.every((value:number)=>Number.isFinite(value))).toBe(true);
 }
 expect([...targets].sort()).toEqual(['first-story','second-story']);
 }finally{await task.destroy();}
 }finally{await f.dispose();}
});

it('Markdown quotes poetry while retaining nested marks, line breaks and ordinary prose boundaries', async () => {
  const f = await fixture();
  try {
    f.opened.book.chapters[0].html = '<p>Ordinary <strong>bold</strong>.</p><p class="poetry"><strong><em>  Verse </em></strong>line.<br>Second line.</p><p class="scene-break">***</p><p>Afterwards.</p>';
    const destination = join(f.root, 'poetry.md');
    await writeFile(destination, await renderManuscript(f.opened, 'md'));
    const artifact = await readFile(destination, 'utf8');
    expect(artifact).toContain('\n\nOrdinary **bold**.\n\n');
    expect(artifact).toContain('\n\n>   ***Verse*** line.  \nSecond line.\n\n');
    expect(artifact).toContain('\n\n***\n\nAfterwards.');
    expect(artifact).not.toMatch(/^>.*Ordinary/m);
    expect(artifact).not.toMatch(/^>.*Afterwards/m);
  } finally { await f.dispose(); }
});

it('Markdown edition italicizes escaped subtitle and translated byline without empty front headings', async () => {
  const f = await fixture();
  try {
    f.opened.book.metadata.subtitle = 'A *Small* [Edition]';
    f.opened.book.metadata.author = 'An *Author*';
    f.opened.book.metadata.chapterKinds = {front: 'copyright', part: 'part', story: 'chapter', back: 'about'};
    f.opened.book.chapters = [
      {id:'front',html:'<p>Rights.</p>'},
      {id:'part',html:'<p>Movement One</p><p>Part verse.</p>'},
      {id:'story',html:'<p>Story.</p>'},
      {id:'back',html:'<p>Biography.</p>'},
    ];
    const destination = join(f.root, 'edition.md');
    await writeFile(destination, await renderManuscript(f.opened, 'md'));
    const artifact = await readFile(destination, 'utf8');
    expect(artifact).toContain('*A \\*Small\\* \\[Edition\\]*');
    expect(artifact).toContain('**by An \\*Author\\***');
    expect(artifact).not.toMatch(/^##\s*$/m);
    expect(artifact.match(/^## Part I: Movement One$/gm)).toHaveLength(1);
    expect(artifact).toContain('## About the Author');
    expect(artifact.indexOf('Rights.')).toBeLessThan(artifact.indexOf('Movement One'));
    expect(artifact.indexOf('Story.')).toBeLessThan(artifact.indexOf('Biography.'));
  } finally { await f.dispose(); }
});
