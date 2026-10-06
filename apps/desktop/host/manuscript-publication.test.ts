import {it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import JSZip from 'jszip';
import {JSDOM} from 'jsdom';
import type {Opened} from '@leafloom/editor-contracts';
import {LibraryHost} from './library.ts';
import {renderManuscript} from './manuscript-export.ts';
async function fixture(html:string){
 const root=await mkdtemp(join(tmpdir(),'leafloom-publication-'));await writeFile(join(root,'.leafloom-fixture'),'');
 const host=new LibraryHost(root);await host.initialize();
 const metadata=await host.request('createBook',{title:'Publication',author:'Writer'}) as {id:string};
 const opened=await host.request('openBook',{bookId:metadata.id}) as Opened;
 opened.book.chapters=[{id:'story',html}];
 return {opened,dispose:async()=>{await host.shutdown();await rm(root,{recursive:true,force:true});}};
}
const draws=(bytes:Buffer)=>Array.from(bytes.toString('latin1').matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\n\/(F\d+) ([\d.]+) Tf/g),m=>({x:Number(m[1]),y:Number(m[2]),size:Number(m[4])}));
it('[NEO135-006 export] flush geometry survives actual DOCX, HTML, EPUB and PDF publication',async()=>{
 const f=await fixture('<p>Opening.</p><p class="flush">Flush words.</p><p>Indented words.</p>');try{
 const html=new JSDOM((await renderManuscript(f.opened,'html')).toString()).window.document;
 expect(html.querySelector('section.story p.flush')?.textContent).toBe('Flush words.');expect(html.querySelector('style')!.textContent).toContain('p.flush{ text-indent:0!important}');
 const epub=await JSZip.loadAsync(await renderManuscript(f.opened,'epub'));expect(await epub.file('OEBPS/ch1.xhtml')!.async('string')).toContain('class="prose flush"');expect(await epub.file('OEBPS/style.css')!.async('string')).toContain('p.flush{ text-indent:0!important}');
 const docx=await JSZip.loadAsync(await renderManuscript(f.opened,'docx'));const xml=new JSDOM(await docx.file('word/document.xml')!.async('string'),{contentType:'text/xml'}).window.document;
 const paras=Array.from(xml.getElementsByTagName('w:p'));const flush=paras.find(p=>p.textContent==='Flush words.')!,indented=paras.find(p=>p.textContent==='Indented words.')!;
 expect(flush.getElementsByTagName('w:ind')).toHaveLength(0);expect(indented.getElementsByTagName('w:ind')[0]!.getAttribute('w:firstLine')).toBe('480');
 const body=draws(await renderManuscript(f.opened,'pdf',{dropcap:'none'})).filter(d=>d.size===13&&d.x<100);expect(body.map(d=>d.x)).toEqual([72,72,98]);
 }finally{await f.dispose();}
});
it('[NEO135-014 export] leading blank paragraphs retain spacing before the first nonempty initial in HTML EPUB DOCX and PDF',async()=>{
 const f=await fixture('<p><br></p><p> </p><p>Opening words beside the river.</p>');try{
 const html=new JSDOM((await renderManuscript(f.opened,'html')).toString()).window.document;const paras=html.querySelectorAll('section.story p');expect(paras).toHaveLength(3);expect(paras[0]!.classList.contains('first')).toBe(false);expect(paras[2]!.classList.contains('first')).toBe(true);
 const epub=await JSZip.loadAsync(await renderManuscript(f.opened,'epub'));const chapter=new JSDOM(await epub.file('OEBPS/ch1.xhtml')!.async('string')).window.document;expect(chapter.querySelectorAll('section p')).toHaveLength(3);expect(chapter.querySelector('p.first')!.textContent).toContain('Opening');
 const docx=await JSZip.loadAsync(await renderManuscript(f.opened,'docx'));const xml=new JSDOM(await docx.file('word/document.xml')!.async('string'),{contentType:'text/xml'}).window.document;const body=Array.from(xml.getElementsByTagName('w:p'));const opening=body.findIndex(p=>p.textContent==='Opening words beside the river.');expect(opening).toBeGreaterThan(2);expect(body[opening-1]!.textContent!.trim()).toBe('');expect(body[opening-2]!.getElementsByTagName('w:br')).toHaveLength(1);
 const blank=draws(await renderManuscript(f.opened,'pdf',{dropcap:'literary'})).find(d=>d.size>30)!;
 f.opened.book.chapters[0]!.html='<p>Opening words beside the river.</p>';const plain=draws(await renderManuscript(f.opened,'pdf',{dropcap:'literary'})).find(d=>d.size>30)!;
 expect(plain).toBeDefined();expect(blank.y-plain.y).toBeCloseTo(-44.2,2);
 }finally{await f.dispose();}
});
it('[NEO135-018 export] combined web and Word inline marks survive HTML EPUB Markdown DOCX and PDF including initial layout',async()=>{
 const f=await fixture('<p><b style="font-style:italic;text-decoration:underline line-through">Opening</b> <ins><del>marked</del></ins> <span style="text-decoration-line:underline line-through">Word</span> prose.</p>');try{
 const html=new JSDOM((await renderManuscript(f.opened,'html')).toString()).window.document;expect(html.querySelector('section.story strong em u s')!.textContent).toBe('Opening');expect(html.querySelectorAll('section.story u s')).toHaveLength(3);
 const epub=await JSZip.loadAsync(await renderManuscript(f.opened,'epub'));expect(await epub.file('OEBPS/ch1.xhtml')!.async('string')).toContain('<strong><em><u><s>Opening</s></u></em></strong>');
 const md=(await renderManuscript(f.opened,'md')).toString();expect(md).toContain('***<u>~~Opening~~</u>***');expect(md).toContain('<u>~~Word~~</u>');
 const docx=await JSZip.loadAsync(await renderManuscript(f.opened,'docx'));const xml=new JSDOM(await docx.file('word/document.xml')!.async('string'),{contentType:'text/xml'}).window.document;const run=Array.from(xml.getElementsByTagName('w:r')).find(r=>r.textContent==='Opening')!;for(const mark of ['w:b','w:i','w:u','w:strike'])expect(run.getElementsByTagName(mark)).toHaveLength(1);
 for(const dropcap of ['none','literary']){const pdf=await renderManuscript(f.opened,'pdf',{dropcap});const source=pdf.toString('latin1');expect(source.match(/\nS\n/g)?.length??0).toBeGreaterThanOrEqual(6);const text=spawnSync('pdftotext',['-','-'],{input:pdf,encoding:'utf8'});expect(text.status).toBe(0);expect(text.stdout.replace(/\s+/g,' ')).toContain('Opening marked Word prose.');}
 }finally{await f.dispose();}
});
