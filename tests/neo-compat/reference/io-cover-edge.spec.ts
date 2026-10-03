import {test,expect} from '../candidate/author-fixture';
import {existingBook} from '../candidate/book-fixture';
import {privateStorageRoot,persistedBook} from '../candidate/storage-probe';
import {clickReferenceMenu} from './harness';
import {readFile,writeFile,mkdir,chmod,readdir} from 'node:fs/promises';
import path from 'node:path';
import {editionFixture,sha256} from '../shared/document-io.mjs';
import {coverPNG,inspectCoverEPUB} from '../shared/io-cover-edge.mjs';
import type {Page} from '@playwright/test';
const fixtureRoot=(page:Page)=>path.resolve(privateStorageRoot(page),'../..');
async function host(page:Page,value:Record<string,unknown>){await writeFile(path.join(fixtureRoot(page),'.neo-parity-host.json'),JSON.stringify(value));}
async function exportEPUB(page:Page,name:string){const file=path.join(fixtureRoot(page),name+'.epub');await host(page,{savePath:file});await clickReferenceMenu(page,['File','Export','EPUB (.epub)']);await expect.poll(()=>readFile(file).then(bytes=>bytes.length,()=>0)).toBeGreaterThan(30);const bytes=await readFile(file);await test.info().attach(name+'.epub',{body:bytes,contentType:'application/epub+zip'});return bytes;}
test('[NEO-262-B] Leafloom: picked custom cover bytes and durable UUID survive actual EPUB export repeat and book reopen',async({page})=>{
 const {title:unusedTitle,...metadata}=editionFixture.metadata;const c=await existingBook(page,{...editionFixture,metadata});await c.driver.shelf();const image=path.join(fixtureRoot(page),'picked-cover.png');await writeFile(image,coverPNG);await host(page,{openPaths:[image]});await page.locator(`.book[data-book-id="${c.id}"]`).click({button:'right'});await page.getByRole('button',{name:/Set cover art/}).click();await expect.poll(async()=>typeof(await persistedBook(page,c.title,c.id)).metadata.coverImage).toBe('string');await c.driver.selectBook(c.title);
 const first=await inspectCoverEPUB(await exportEPUB(page,'picked-edition'));await c.driver.shelf();const book=await persistedBook(page,c.title,c.id),uuid=book.metadata.uuid;expect(uuid).toEqual(expect.any(String));expect(first.identifier).toBe('urn:uuid:'+uuid);expect(sha256(await readFile(image))).toBe(sha256(coverPNG));await c.driver.selectBook(c.title);const second=await inspectCoverEPUB(await exportEPUB(page,'picked-edition-repeat'));expect(second.identifier).toBe(first.identifier);expect(second.image.sha256).toBe(first.image.sha256);await c.driver.shelf();expect((await persistedBook(page,c.title,c.id)).metadata.uuid).toBe(uuid);await page.reload();await c.driver.selectBook(c.title);const third=await inspectCoverEPUB(await exportEPUB(page,'picked-edition-reopened'));expect(third.identifier).toBe(first.identifier);await test.info().attach('custom-cover-identity',{body:JSON.stringify({first,second,third},null,2),contentType:'application/json'});
});
test('[NEO-265-A] Leafloom: actual denied export write preserves existing destination bytes and durable manuscript',async({page})=>{
 const c=await existingBook(page);const warm=path.join(fixtureRoot(page),'warm.txt');await host(page,{savePath:warm});await clickReferenceMenu(page,['File','Export','Plain Text (.txt)']);await expect.poll(()=>readFile(warm).then(bytes=>bytes.length,()=>0)).toBeGreaterThan(30);await c.driver.shelf();const before=await persistedBook(page,c.title,c.id);await c.driver.selectBook(c.title);const live=await c.driver.paragraphs();const directory=path.join(fixtureRoot(page),'Read-only-export');await mkdir(directory);const destination=path.join(directory,'preserved.txt'),sentinel=Buffer.from('Original destination must remain exact.');await writeFile(destination,sentinel);await chmod(destination,0o444);await chmod(directory,0o555);
 try{await host(page,{savePath:destination});await clickReferenceMenu(page,['File','Export','Plain Text (.txt)']);await expect(page.locator('#hint')).toContainText('Couldn’t export');expect(await readFile(destination)).toEqual(sentinel);expect(await readdir(directory)).toEqual(['preserved.txt']);await c.driver.expectParagraphs(live);await c.driver.shelf();const after=await persistedBook(page,c.title,c.id);expect(after.chapters).toEqual(before.chapters);expect(after.metadata.title).toBe(before.metadata.title);expect(after.metadata.author).toBe(before.metadata.author);}finally{await chmod(directory,0o755);await chmod(destination,0o644);}
});

test('[NEO-025-A] Leafloom: real custom cover Set Replace Remove menus follow durable image bytes and preserve author prose',async({page})=>{
 const c=await existingBook(page);await c.driver.shelf();
 const initial=await persistedBook(page,c.title,c.id);
 const first=path.join(fixtureRoot(page),'first.png'),second=path.join(fixtureRoot(page),'second.png');
 const replacement=await readFile(path.resolve('apps/desktop/src-tauri/icons/Leafloom.iconset/icon_16x16.png'));
 await writeFile(first,coverPNG);await writeFile(second,replacement);
 const menu=()=>page.locator(`.book[data-book-id="${c.id}"]`).click({button:'right'});
 await menu();await expect(page.getByRole('button',{name:/Set cover art/})).toBeVisible();await expect(page.getByRole('button',{name:/Remove cover art/})).toHaveCount(0);
 await host(page,{openPaths:[first]});await page.getByRole('button',{name:/Set cover art/}).click();
 await expect.poll(async()=>{const saved=await persistedBook(page,c.title,c.id);return saved.metadata.coverImage?sha256(await readFile(path.join(c.folder,saved.metadata.coverImage))):null;}).toBe(sha256(coverPNG));
 await menu();await expect(page.getByRole('button',{name:/Replace cover art/})).toBeVisible();await expect(page.getByRole('button',{name:/Remove cover art/})).toBeVisible();await expect(page.getByRole('button',{name:/Set cover art/})).toHaveCount(0);
 await host(page,{openPaths:[second]});await page.getByRole('button',{name:/Replace cover art/}).click();
 await expect.poll(async()=>{const saved=await persistedBook(page,c.title,c.id);return sha256(await readFile(path.join(c.folder,saved.metadata.coverImage)));}).toBe(sha256(replacement));
 await menu();await page.getByRole('button',{name:/Remove cover art/}).click();await expect.poll(async()=>(await persistedBook(page,c.title,c.id)).metadata.coverImage).toBeNull();
 await menu();await expect(page.getByRole('button',{name:/Set cover art/})).toBeVisible();await expect(page.getByRole('button',{name:/Replace cover art|Remove cover art/})).toHaveCount(0);await page.keyboard.press('Escape');
 const after=await persistedBook(page,c.title,c.id);expect(after.chapters).toEqual(initial.chapters);expect(after.metadata.title).toBe(initial.metadata.title);expect(after.metadata.author).toBe(initial.metadata.author);
 await page.reload();await expect(page.locator('#bookshelf-view')).toBeVisible();await menu();await expect(page.getByRole('button',{name:/Set cover art/})).toBeVisible();await expect(page.getByRole('button',{name:/Remove cover art/})).toHaveCount(0);
});
