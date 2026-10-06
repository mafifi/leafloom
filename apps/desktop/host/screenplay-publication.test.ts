import {it,expect} from 'vitest';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {create} from 'fontkit';
import {JSDOM} from 'jsdom';
import {screenplayPaginate,screenplayLength,migrateManuscript,type ScreenplayMeasuredItem} from '@leafloom/document-contracts';
import type {Opened} from '@leafloom/editor-contracts';
import {LibraryHost} from './library.ts';
import {renderManuscript} from './manuscript-export.ts';
import {readScreenplay,writeScreenplay} from './screenplay-formats.ts';
import {screenplayPublication} from './screenplay-pdf.ts';
it('[NEO135-030] screenplay PDF retains writing in supported CJK locales',async()=>{
 const pdf=await screenplayPublication({title:{title:'Night Window',author:'Ada'},lines:[{element:'action',runs:[{text:'夜の窓。 中国的夜晚。 중국의 밤。',marks:[]}]}]},'pdf','ja');const text=spawnSync('pdftotext',['-','-'],{input:pdf,encoding:'utf8'});expect(text.status).toBe(0);expect(text.stdout).toContain('夜の窓。');expect(text.stdout).toContain('中国的夜晚。');expect(text.stdout).toContain('중국의 밤。');
});
it('[NEO135-030] Fountain writes indented multiline title fields',()=>{
 const script={title:{title:'Night\nWindow',author:'Ada\nWriter',credit:'A script by Ada',draft:'First\nOctober',contact:'Ada Writer\nwriter@example.test'},lines:[{element:'action' as const,runs:[{text:'Rain falls.',marks:[]}]}]};
 const fountain=writeScreenplay(script,'fountain');expect(fountain).toContain('Title:\n    Night\n    Window');expect(readScreenplay(fountain,'fountain')).toEqual(script);
});
it('[NEO135-030] FDX retains arbitrary authored credit text',async()=>{
 const script={title:{title:'Night\nWindow',author:'Ada\nWriter',credit:'A script by Ada',draft:'First\nOctober',contact:'Ada Writer\nwriter@example.test'},lines:[{element:'action' as const,runs:[{text:'Rain falls.',marks:[]}]}]};
 const bytes=writeScreenplay(script,'fdx'),fdx=new JSDOM(bytes,{contentType:'text/xml'}).window.document;expect(Array.from(fdx.querySelectorAll('TitlePage Paragraph')).map(row=>row.textContent).filter(Boolean)).toEqual(['Night\nWindow','A script by Ada','Ada\nWriter','First','October','Ada Writer','writer@example.test']);expect(fdx.querySelector('FinalDraft > Content')!.textContent).toBe('Rain falls.');
 expect(Array.from(fdx.querySelectorAll('TitlePage Paragraph')).slice(0,18).every(row=>!row.textContent)).toBe(true);
 const source=await readFile(new URL('../../../tests/reference/neo-1.3.5/app.js',import.meta.url),'utf8'),oracle=runInNewContext(source.slice(source.indexOf('const SP_FDX_TYPES ='),source.indexOf('// …and back out:'))+';spFromFdx') as (xml:string)=>{title:{author:string;credit?:string}};
 // Source's unmarked centered rows cannot distinguish a custom credit from an author.
 expect(oracle(bytes).title.author).toBe('A script by Ada');expect(oracle(bytes).title.credit).toBeUndefined();
});
it('[NEO135-030] PDF font transport retains immutable Courier Prime names, glyphs, metrics and license',async()=>{
 const receipt=JSON.parse(await readFile(new URL('../public/fonts/provenance-courier-prime-pdf.json',import.meta.url),'utf8')) as {faces:{source:string;sourceSha256:string;pdfFile:string;pdfSha256:string}[]};expect(receipt.faces).toHaveLength(8);
 for(const face of receipt.faces){const source=await readFile(new URL('../../../tests/reference/neo-1.3.5/fonts/'+face.source,import.meta.url)),pdf=await readFile(new URL('../public/fonts/'+face.pdfFile,import.meta.url));expect(createHash('sha256').update(source).digest('hex')).toBe(face.sourceSha256);expect(createHash('sha256').update(pdf).digest('hex')).toBe(face.pdfSha256);const original=create(source),decoded=create(pdf);if('fonts' in original||'fonts' in decoded)throw Error('Expected single face');expect(decoded.postscriptName).toBe(original.postscriptName);expect(decoded.characterSet).toEqual(original.characterSet);for(const text of ['Night Window','ADA'," (CONT'D)",'Āda'])expect(decoded.layout(text).advanceWidth).toBe(original.layout(text).advanceWidth);}
 expect(await readFile(new URL('../public/fonts/LICENSE-courier-prime.txt',import.meta.url),'utf8')).toBe(await readFile(new URL('../../../tests/reference/neo-1.3.5/fonts/LICENSE-courier-prime.txt',import.meta.url),'utf8'));
});
it('[NEO135-026] portable screenplay pagination matches immutable 54-line oracle for keeps, overflow and eighths',async()=>{
 const source=await readFile(new URL('../../../tests/reference/neo-1.3.5/app.js',import.meta.url),'utf8');
 const oracle=runInNewContext(source.slice(source.indexOf('function spPaginate('),source.indexOf('// a length in eighths'))+';spPaginate',{SP_LINES_PER_PAGE:54,SP_BEFORE:{heading:2,action:1,character:1,paren:0,dialogue:0,transition:1,shot:1}}) as (items:unknown[])=>unknown;
 for(const items of [[],[{type:'action',lines:51},{type:'scene-heading',lines:1},{type:'action',lines:2}],[{type:'action',lines:50},{type:'character',lines:1},{type:'parenthetical',lines:1},{type:'dialogue',lines:3}],[{type:'action',lines:120},{type:'dialogue',lines:1}]] as ScreenplayMeasuredItem[][]){
  expect(screenplayPaginate(items)).toEqual(oracle(items.map(i=>({...i,type:i.type==='scene-heading'?'heading':i.type==='parenthetical'?'paren':i.type}))));
 }
 expect(screenplayLength({pages:2,used:27})).toEqual({eighths:12,text:'1 4/8',minutes:2});
});
it('[NEO135-030] actual screenplay PDF and print HTML retain title metadata and Letter screenplay geometry',async()=>{
 const root=await mkdtemp(join(tmpdir(),'leafloom-screenprint-'));await writeFile(join(root,'.leafloom-fixture'),'');const host=new LibraryHost(root);
 try{await host.initialize();const meta=await host.request('createBook',{title:'Night Window',author:'Ada Writer'}) as {id:string};
 const opened=await host.request('openBook',{bookId:meta.id}) as Opened;opened.book.metadata.format='screenplay';opened.book.metadata.screenplayTitle={credit:'Story by',draft:'Old draft',contact:'Old contact'};opened.book.metadata.credit='Screenplay by';opened.book.metadata.draft='6 October 2026';
 opened.book.chapters=[{id:'script',html:'<p class="sp-heading">INT. ROOM - NIGHT</p><p>Ada watches the window.</p><p class="sp-character">ADA</p><p class="sp-paren">(quietly)</p><p class="sp-dialogue"><i>Stay here.</i></p>'+Array.from({length:30},(_,i)=>`<p>Action ${i}.</p>`).join('')}];
 const bytes=await renderManuscript(opened,'pdf',{paperCountry:'GB',scriptContact:'Ada Writer\nwriter@example.test'}),extract=spawnSync('pdftotext',['-bbox','-','-'],{input:bytes,encoding:'utf8'});expect(extract.status).toBe(0);
 const xml=new JSDOM(extract.stdout,{contentType:'text/xml'}).window.document;const pages=Array.from(xml.getElementsByTagName('page'));expect(pages).toHaveLength(3);expect(pages[0]!.getAttribute('width')).toBe('612.000000');expect(pages[0]!.getAttribute('height')).toBe('792.000000');
 expect(pages[0]!.textContent).toContain('Screenplay');expect(pages[0]!.textContent).toContain('writer@example.test');expect(pages[0]!.textContent).toContain('2026');
 const words=Array.from(pages[1]!.getElementsByTagName('word'));for(const [text,x] of [['INT.',108],['ADA',266.4],['(quietly)',223.2],['Stay',180]] as const){const word=words.find(w=>w.textContent===text);expect(word, text).toBeDefined();expect(Number(word!.getAttribute('xMin'))).toBeCloseTo(x,1);}
 const ordinate=(text:string)=>Number(words.find(word=>word.textContent===text)!.getAttribute('yMin'));expect(ordinate('ADA')-ordinate('Ada')).toBeCloseTo(24,1);expect(ordinate('(quietly)')-ordinate('ADA')).toBeCloseTo(12,1);expect(ordinate('Stay')-ordinate('(quietly)')).toBeCloseTo(12,1);
 expect(pages[2]!.textContent).toContain('2.');expect(bytes.toString('latin1')).toContain('CourierPrime');
 const html=new JSDOM((await renderManuscript(opened,'html',{scriptContact:'Ada Writer\nwriter@example.test'})).toString()).window.document;expect(html.querySelectorAll('.page')).toHaveLength(3);expect(html.querySelector('.tp-contact')!.textContent).toContain('writer@example.test');expect(html.querySelector('style')!.textContent).toContain('size:8.5in 11in');
 for(const format of ['fountain','fdx'] as const){const script=readScreenplay((await renderManuscript(opened,format,{scriptContact:'Ada Writer\nwriter@example.test'})).toString(),format);expect(script.title).toEqual({title:'Night Window',author:'Ada Writer',credit:'Screenplay by',draft:'6 October 2026',contact:'Ada Writer\nwriter@example.test'});}
 opened.book=migrateManuscript(opened.book);delete opened.book.metadata.format;opened.book.chapters[0]!.html='<p class="sp-action">'+Array.from({length:120},(_,index)=>`Row ${index}`).join('<br>')+'</p>';
 const overflow=await renderManuscript(opened,'pdf');const extracted=spawnSync('pdftotext',['-','-'],{input:overflow,encoding:'utf8'});expect(extracted.status).toBe(0);expect(extracted.stdout).toContain('Row 119');expect(extracted.stdout.split('\f').filter(Boolean)).toHaveLength(4);
 const print=new JSDOM((await renderManuscript(opened,'html')).toString()).window.document;expect(print.querySelectorAll('.page')).toHaveLength(4);expect(print.querySelector('.page:last-child')!.textContent).toContain('Row 119');
 }finally{await host.shutdown();await rm(root,{recursive:true,force:true});}
});
