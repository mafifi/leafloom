import {test,expect} from '../candidate/author-fixture';
import {existingBook} from '../candidate/book-fixture';
import {privateStorageRoot} from '../candidate/storage-probe';
import {clickReferenceMenu} from './harness';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {editionFixture} from '../shared/document-io.mjs';
import {inspectPDFLayout} from '../shared/pdf-layout.mjs';
test('[NEO-263-B] Leafloom: real edition PDF bookmarks TOC destinations footers and poetry geometry agree with actual pages',async({page})=>{
 const {title:unused,...metadata}=editionFixture.metadata;const c=await existingBook(page,{...editionFixture,metadata});const before=await c.driver.paragraphs();const fixture=path.resolve(privateStorageRoot(page),'../..'),output=path.join(fixture,'edition-layout.pdf');await writeFile(path.join(fixture,'.neo-parity-host.json'),JSON.stringify({savePath:output}));await clickReferenceMenu(page,['File','Export','PDF (.pdf)']);await expect.poll(()=>readFile(output).then(bytes=>bytes.length,()=>0)).toBeGreaterThan(100);const bytes=await readFile(output);await test.info().attach('actual-edition.pdf',{body:bytes,contentType:'application/pdf'});const parsed=await inspectPDFLayout(bytes);await test.info().attach('actual-page-destinations-glyphs',{body:JSON.stringify(parsed,null,2),contentType:'application/json'});const retained=path.resolve('.leafloom/evidence'),name='original-edition-layout-'+Date.now();await mkdir(retained,{recursive:true});await copyFile(output,path.join(retained,name+'.pdf'));await writeFile(path.join(retained,name+'.json'),JSON.stringify(parsed,null,2));await c.driver.expectParagraphs(before);
});
