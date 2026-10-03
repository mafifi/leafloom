import { expect, type Page, type ElectronApplication } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { book, option, libraryPath, nativeMenu, readLibrary } from './library-helpers';
import JSZip from 'jszip';
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
export interface BookMeta { id: string; title: string; author: string; subtitle?: string; chapterOrder: string[]; chapterKinds?: Record<string,string>; chapterTitles?: Record<string,string>; chapterNotes?: Record<string,string>; prologue?: string; epilogue?: string; restartNumbering?: boolean; kind?: string; coverSeed?: string; coverImage?: string; coverMode?: string; coverArt?: {status:string;file?:string;at?:string}; wordCount?: number; [key:string]:unknown; }
export const metaPath = (directory:string,id:string) => path.join(libraryPath(directory),id,'book.json');
export const meta = async(directory:string,id:string):Promise<BookMeta>=>JSON.parse(await readFile(metaPath(directory,id),'utf8'));
export const chapterPath = (directory:string,id:string,ch:string) => path.join(libraryPath(directory),id,'chapters',ch+'.html');
export interface Entry {id:string;kind?:string;html?:string;title?:string;note?:string;}
export async function fixture(page:Page,directory:string,entries:Entry[],extra:Partial<BookMeta>={}) {
 const made=await book(page,'Structure Fixture');const data=await meta(directory,made.bookId);
 data.chapterOrder=entries.map(e=>e.id);data.chapterKinds=Object.fromEntries(entries.filter(e=>e.kind&&e.kind!=='chapter').map(e=>[e.id,e.kind!]));
 data.chapterTitles=Object.fromEntries(entries.filter(e=>e.title).map(e=>[e.id,e.title!]));data.chapterNotes=Object.fromEntries(entries.filter(e=>e.note).map(e=>[e.id,e.note!]));
 Object.assign(data,extra);
 for(const entry of entries)await writeFile(chapterPath(directory,data.id,entry.id),entry.html??'<p><br></p>');
 await writeFile(metaPath(directory,data.id),JSON.stringify(data));await page.reload();await page.locator(`[data-book-id="${data.id}"]`).click();await expect(page.locator('#editor-view')).toBeVisible();return data.id;
}
export async function navigation(page:Page){await page.mouse.move(1,200);await page.locator('#nav-pin').click();await expect(page.locator('#nav-pane')).toHaveAttribute('data-pinned','1');}
export async function chapterChoice(page:Page,id:string,label:string){await page.locator(`.nav-item[data-id="${id}"] .n-row`).click({button:'right'});await page.locator('.pop-menu button').filter({hasText:new RegExp('^'+label+'$')}).click();}
export async function bind(page:Page){await page.locator('.shelf-label').first().click({button:'right'});await option(page,'Bind into one book');await expect(page.locator('.bound-cover')).toHaveCount(1);}
export async function bound(page:Page,directory:string){const ids:string[]=[];for(let n=1;n<=3;n++){
 const made=await book(page,'Story '+n);const m=await meta(directory,made.bookId);m.chapterOrder=['body-'+n+'a','body-'+n+'b'];await writeFile(metaPath(directory,m.id),JSON.stringify(m));
 await writeFile(chapterPath(directory,m.id,m.chapterOrder[0]),`<p>Unique opening for story ${n}.</p>`);await writeFile(chapterPath(directory,m.id,m.chapterOrder[1]),`<p>Unique ending for story ${n}.</p>`);ids.push(m.id);
 }await page.reload();await bind(page);return ids;}
export async function shelfOption(page:Page,label:string){await page.locator('.shelf-label').first().click({button:'right'});await option(page,label);}
export async function closeSheet(page:Page){await page.locator('.page-sheet .ps-done').click();await expect(page.locator('.page-sheet')).toHaveCount(0);}
export async function addPage(page:Page,kind:string,text?:string){await page.locator(`.ghost-page[aria-label="${kind}"]`).click();if(['Prologue','Epilogue'].includes(kind)){
 await expect(page.locator('.chapter-body').first()).toBeVisible();if(text)await page.locator('.chapter-body').first().pressSequentially(text);await page.locator('#back-to-shelf').click();
 }else{await expect(page.locator('.page-sheet')).toBeVisible();if(text){await page.locator('.ps-body').click();await page.keyboard.type(text);}await closeSheet(page);}}
export async function shelfMetas(directory:string){const lib=await readLibrary(directory);return Promise.all(lib.shelves[0].bookIds.map(id=>meta(directory,id)));}
export async function host(directory:string,value:Record<string,unknown>){await writeFile(path.join(directory,'.neo-parity-host.json'),JSON.stringify(value));}
export async function pickImage(page:Page,directory:string,id:string){const image=path.join(directory,'custom-cover.png');await writeFile(image,png);await host(directory,{openPaths:[image]});await page.locator(`[data-book-id="${id}"]`).click({button:'right'});await option(page,'Set cover art');await expect.poll(async()=>(await meta(directory,id)).coverImage).toMatch(/^cover-\d+\.png$/);return image;}
export async function paste(page:Page,selector:string,text:string,html=''){await page.locator(selector).focus();await page.evaluate(({selector,text,html})=>{const el=document.querySelector(selector)!;const dt=new DataTransfer();dt.setData('text/plain',text);if(html)dt.setData('text/html',html);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));},{selector,text,html});}
export async function exportFile(page:Page,directory:string,app:ElectronApplication,format:'docx'|'epub'|'pdf'|'txt'|'md'|'html',action:()=>Promise<void>,name='export') {
 const file=path.join(directory,name+'.'+format);await host(directory,{savePath:file});await action();await expect.poll(async()=>{try{return(await readFile(file)).length;}catch{return 0;}},{timeout:20_000}).toBeGreaterThan(30);return file;
}
export async function exportText(file:string){if(file.endsWith('.docx')){const zip=await JSZip.loadAsync(await readFile(file));return(await zip.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g,' ');}if(file.endsWith('.epub')){const zip=await JSZip.loadAsync(await readFile(file));let text='';for(const name of Object.keys(zip.files))if(/\.(xhtml|html)$/.test(name))text+=await zip.file(name)!.async('string');return text.replace(/<[^>]+>/g,' ');}return readFile(file,'utf8');}
export async function configurePaint(page:Page,app:ElectronApplication,key='sk-fixture-never-network-0000000000',automatic=true){await nativeMenu(app,'Cover Art');await page.locator('#ca-key').fill(key);await page.locator('#ca-auto').setChecked(automatic);
 // Native synchronous encryption can wait for Keychain permission on macOS.
 // Bound the driver and retain a failed proof rather than substituting encryption.
 const save=page.locator('.modal-backdrop:not([hidden]) .m-ok').click();let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([save,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native cover key save did not finish within 15s; Keychain permission or availability needs inspection. No encryption override was applied.')),15_000);})]);}
 catch(error){app.process().kill('SIGKILL');await save.catch(()=>{});throw error;}finally{clearTimeout(timer);}
 await expect(page.locator('#ca-key')).toHaveCount(0);}
export const paintResponses = (delayMs=0) => [
 {match:'/models',body:{data:[]}},
 {match:'/chat/completions',delayMs,body:{choices:[{message:{content:'A quiet lighthouse above a stormy sea, without any lettering.'}}]}},
 {match:'/images/generations',body:{data:[{b64_json:png.toString('base64')}]}}
];
export interface HttpCall {url:string;method:string;payload?:{model?:string;messages?:{role:string;content:string}[];prompt?:string};}
export async function httpCalls(directory:string):Promise<HttpCall[]>{try{const effects:{type:string;payload:HttpCall}[]=JSON.parse(await readFile(path.join(directory,'intercepted-effects.json'),'utf8'));return effects.filter(e=>e.type==='http-request').map(e=>e.payload);}catch{return [];}}
export async function manualPaint(page:Page,id:string){await page.locator(`[data-book-id="${id}"] .b-refresh`).click();await option(page,'Paint a cover from the text');}
