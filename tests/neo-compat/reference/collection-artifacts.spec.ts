import {test,expect} from '../candidate/author-fixture';
import {existingBook} from '../candidate/book-fixture';
import {persistedBook,persistedLibrary,privateStorageRoot} from '../candidate/storage-probe';
import {inspectCollection} from '../native/collection-output.mjs';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const passages=['First opening.','First ending.','Second opening.','Second ending.'];
for(const bound of [false,true])for(const [format,label] of [['epub','EPUB'],['docx','Word (.docx)'],['pdf','PDF']] as const)test(`[${bound?'NEO-045-A':'NEO-046-A'}] Leafloom: actual ${format} ${bound?'bound collection':'anthology'} retains chosen title and constituent order`,async({page})=>{
 const c=await existingBook(page,{chapters:['<p>First opening.</p><p>First ending.</p>']});await c.driver.shelf();await c.driver.newBook();await c.driver.title('Second constituent');await c.driver.type('Second opening.');await page.keyboard.press('Enter');await c.driver.type('Second ending.');await c.driver.shelf();
 const before=(await persistedLibrary(page)).shelves[0],ids=before.bookIds,books=await Promise.all(ids.map(async (id:string)=>persistedBook(page,JSON.parse(await readFile(path.join(privateStorageRoot(page),id,'book.json'),'utf8')).title,id)));
 if(bound){await page.locator('.shelf-label').first().click({button:'right'});await page.locator('.modal:visible .fr-choice').filter({hasText:'Bind into one book'}).click();await expect(page.locator('.shelf').first()).toHaveClass(/bound/);await page.locator('.bound-cover').click({button:'right'});await page.locator('.modal:visible .fr-choice').filter({hasText:'Export the book…'}).click();}
 else{await page.locator('.shelf-label').first().click({button:'right'});await page.locator('.modal:visible .fr-choice').filter({hasText:'Export shelf as anthology…'}).click();await page.locator('.modal:visible input').fill('Collected é東京');await page.locator('.modal:visible input').press('Enter');}
 const title=bound?'Fixture books':'Collected é東京',root=path.resolve(privateStorageRoot(page),'../..'),output=path.join(root,'collection.'+format);await writeFile(path.join(root,'.neo-parity-host.json'),JSON.stringify({savePath:output}));await page.locator('.modal:visible .fr-choice').filter({has:page.locator('strong',{hasText:new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})}).click();
 await expect.poll(()=>readFile(output).then(b=>b.length,()=>0),{timeout:30000}).toBeGreaterThan(30);const bytes=await readFile(output),artifact=await inspectCollection(format,bytes,{title,passages});
 for(let i=0;i<ids.length;i++){const after=await persistedBook(page,books[i].metadata.title,ids[i]);expect(after.metadata.title).toBe(books[i].metadata.title);expect(after.chapters).toEqual(books[i].chapters);}
 const retained=path.resolve('.leafloom/evidence/source-collection-'+test.info().testId);await mkdir(retained,{recursive:true});await copyFile(output,path.join(retained,'collection.'+format));const parser=await readFile('tests/neo-compat/native/collection-output.mjs');await test.info().attach('actual-collection-artifact',{body:JSON.stringify({...artifact,artifactFile:path.join(retained,'collection.'+format),parserSha256:createHash('sha256').update(parser).digest('hex')}),contentType:'application/json'});
});
