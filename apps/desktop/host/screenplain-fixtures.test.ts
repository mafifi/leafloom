import {it,expect} from 'vitest';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {readFountainScreenplay,type ScreenplayLineValue} from '@leafloom/document-contracts';
import type {Opened} from '@leafloom/editor-contracts';
import {readScreenplay} from './screenplay-formats.ts';
import {LibraryHost} from './library.ts';
const source=(format:'fdx'|'fountain')=>new URL(`../../../tests/reference/neo-1.3.5/scripts/fixtures/screenplain.${format}`,import.meta.url);
const plain=(line:ScreenplayLineValue)=>line.runs.map(run=>run.text).join('');
it('[NEO135-027 independent fixtures] portable Fountain and host FDX import match the pinned 67-element script',async()=>{
 const fdx=await readFile(source('fdx'),'utf8'),fountain=await readFile(source('fountain'),'utf8');
 const xml=new JSDOM(fdx,{contentType:'text/xml'}).window.document;
 const expected=Array.from(xml.querySelectorAll('FinalDraft > Content > Paragraph')).map(row=>({type:row.getAttribute('Type'),text:Array.from(row.querySelectorAll('Text')).map(text=>text.textContent).join('')}));expect(expected).toHaveLength(67);
 const types={'Scene Heading':'scene-heading',Action:'action',Character:'character',Parenthetical:'parenthetical',Dialogue:'dialogue',Transition:'transition'};
 for(const script of [readFountainScreenplay(fountain),readScreenplay(fdx,'fdx')]){expect(script.lines.map(line=>({type:line.element,text:plain(line)}))).toEqual(expected.map(row=>({type:types[row.type as keyof typeof types],text:row.text})));expect(script.lines.filter(line=>line.element==='scene-heading')).toHaveLength(7);}
 expect(readFountainScreenplay(fountain).title).toEqual({title:'No Wind',author:'Hugh Howey'});
});
it('[NEO135-027 provider fixtures] original FDX and Fountain files import, reopen and export through real library files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'leafloom-screenplain-'));await writeFile(join(root,'.leafloom-fixture'),'');const host=new LibraryHost(root);await host.initialize();
 try{for(const format of ['fdx','fountain'] as const){const input=await readFile(source(format),'utf8'),file=join(root,'screenplain.'+format);await writeFile(file,input);const expected=readScreenplay(input,format),meta=await host.request('importManuscript',{source:file}) as {id:string};const opened=await host.request('openBook',{bookId:meta.id}) as Opened&{lease:string};expect(opened.book.metadata.format).toBe('screenplay');expect(opened.book.chapters[0]!.html).toContain('data-screenplay="scene-heading"');await host.request('closeBook',{bookId:meta.id,lease:opened.lease});
 const destination=join(root,'export-'+format+'.'+format);await host.request('exportBook',{bookId:meta.id,format,destination,language:'en'});const exported=readScreenplay(await readFile(destination,'utf8'),format);expect(exported.lines).toEqual(expected.lines);expect(exported.lines).toHaveLength(67);if(format==='fountain'){expect(exported.title.title).toBe('No Wind');expect(exported.title.author).toBe('Hugh Howey');}}
 }finally{await host.shutdown();await rm(root,{recursive:true,force:true});}
});
