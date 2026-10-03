import { expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createReferenceDirectory, launchReference, removeReferenceDirectory } from '../reference/harness';
export type Engine = 'original' | 'prosemirror';
export type Fixture = { chapters?: string[]; kinds?: Record<string,string>; library?: Record<string,unknown>; metadata?: Record<string,unknown>; stickies?: unknown[]; darlings?: unknown[] };
export async function openEditingFixture(engine: Engine, fixture: Fixture = {}) {
 const directory=await createReferenceDirectory(),library=path.join(directory,'Documents','NEO Library'),bookdir=path.join(library,'book-editing');
 await mkdir(path.join(bookdir,'chapters'),{recursive:true});
 const chapters=fixture.chapters??['<p>Alpha beta.</p><p>Gamma delta.</p>'],chapterOrder=chapters.map((_,i)=>`ch-${i+1}`);
 await writeFile(path.join(library,'library.json'),JSON.stringify({firstRunDone:true,authorName:'Parity Writer',authors:[{id:'author-one',name:'Parity Writer'}],currentAuthorId:'author-one',shelves:[{id:'shelf-one',name:'Editing',authorId:'author-one',bookIds:['book-editing']}],writingStyle:'pantser',fonts:{body:'Georgia',dropcap:'none'},pageTheme:'paper',...fixture.library}));
 await writeFile(path.join(bookdir,'book.json'),JSON.stringify({id:'book-editing',title:'Editing fixture',author:'Parity Writer',chapterOrder,chapterKinds:fixture.kinds??{},chapterTitles:{},chapterNotes:{},sectionNotes:{},tabNames:{notes:'Notes',outline:'Outline'},created:new Date().toISOString(),modified:new Date().toISOString(),...fixture.metadata}));
 for(let i=0;i<chapters.length;i++)await writeFile(path.join(bookdir,'chapters',`${chapterOrder[i]}.html`),chapters[i]);
 for(const [name,value]of Object.entries({stickies:fixture.stickies??[],darlings:fixture.darlings??[]}))await writeFile(path.join(bookdir,`${name}.json`),JSON.stringify(value));
 await writeFile(path.join(bookdir,'notes.html'),'');const app=await launchReference(directory,engine==='original'?undefined:'prosemirror'),page=await app.firstWindow();
 await expect(page.locator('#firstrun')).toBeHidden();await page.locator('#bookshelf-view .book').first().click();await expect(page.locator('.chapter-body').first()).toBeVisible();
 if(engine==='prosemirror')await expect(page.locator('.chapter-body').first()).toHaveClass(/ProseMirror/);
 return{app,page,directory,bookdir,close:async()=>{await app.close();await removeReferenceDirectory(directory);}};
}
export async function selectText(page:Page,chapter:number,paragraph:number,from:number,to=from,endParagraph=paragraph){await page.evaluate(({chapter,paragraph,from,to,endParagraph})=>{
 const body=document.querySelectorAll<HTMLElement>('.chapter-body')[chapter],ps=body.querySelectorAll('p');body.focus({preventScroll:true});
 const point=(p:Element,offset:number):[Node,number]=>{const w=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n:Node|null,left=offset;while((n=w.nextNode())){if(left<=(n.textContent??'').length)return[n,left];left-=(n.textContent??'').length;}if(offset===0)return[p,0];throw Error(`Offset ${offset} exceeds ${p.textContent}`);};
 const r=document.createRange();r.setStart(...point(ps[paragraph],from));r.setEnd(...point(ps[endParagraph],to));const s=window.getSelection()!;s.removeAllRanges();s.addRange(r);
 },{chapter,paragraph,from,to,endParagraph});await page.waitForTimeout(40);}
export const paragraphs=(page:Page)=>page.locator('.chapter-body').evaluateAll(bs=>bs.map(b=>[...b.querySelectorAll('p')].map(p=>({text:(p.textContent??'').replace(/\u00a0/g,' '),poetry:p.classList.contains('poetry'),scene:p.classList.contains('scene-break'),html:p.innerHTML}))));
export async function texts(page:Page){return(await paragraphs(page)).map(ch=>ch.map(p=>p.text));}
export async function assertTexts(page:Page,wanted:string[][]){await expect.poll(()=>texts(page)).toEqual(wanted);}
export async function caretState(page:Page){return page.evaluate(()=>{const s=window.getSelection();if(!s?.rangeCount)return null;const r=s.getRangeAt(0),n=r.startContainer.nodeType===Node.TEXT_NODE?r.startContainer.parentElement:r.startContainer as Element,p=n?.closest('p'),b=n?.closest('.chapter-body');if(!p||!b)return null;const pre=document.createRange();pre.selectNodeContents(p);pre.setEnd(r.startContainer,r.startOffset);return{chapter:[...document.querySelectorAll('.chapter-body')].indexOf(b),paragraph:[...b.querySelectorAll('p')].indexOf(p),offset:pre.toString().length,collapsed:s.isCollapsed};});}
export async function menu(app:ElectronApplication,labels:string[]){await app.evaluate(({Menu,BrowserWindow},labels)=>{let items=Menu.getApplicationMenu()!.items,item;for(const label of labels){item=items.find(x=>x.label.replace(/&/g,'').split('\t')[0]===label.split('\t')[0]);if(!item)throw Error(`Native menu missing ${label}`);items=item.submenu?.items??[];}const win=BrowserWindow.getAllWindows()[0];win.focus();win.webContents.focus();const role=item!.role;const commands:Record<string,string>={undo:'undo',redo:'redo',cut:'cut',copy:'copy',paste:'paste',pasteandmatchstyle:'pasteAndMatchStyle',selectall:'selectAll'};const command=role?commands[role.toLowerCase()]:undefined;if(command){(win.webContents as any)[command]();}else item!.click(item!,win,{} as any);},labels);}
export async function clipboard(app:ElectronApplication,text:string,html?:string){await app.evaluate(async({app,clipboard,ClipboardItem,BrowserWindow},d)=>{
 app.focus({steal:true});BrowserWindow.getAllWindows()[0].focus();
 if(typeof ClipboardItem==='function'){
  await clipboard.write([new ClipboardItem({'text/plain':d.text,...(d.html?{'text/html':d.html}:{})})]);
  if(d.html){const items=await clipboard.read();const rich=items.find(item=>item.types.includes('text/html'));if(!rich||!(await(await rich.getType('text/html')).text()).includes(d.html))throw Error('Native clipboard HTML mismatch');}
 }else{
  const legacy=clipboard as unknown as{write(data:{text:string;html?:string}):void;readHTML():string};
  legacy.write({text:d.text,...(d.html?{html:d.html}:{})});
  if(d.html&&!legacy.readHTML().includes(d.html))throw Error('Native legacy clipboard HTML mismatch');
 }
 if(await clipboard.readText()!==d.text)throw Error('Native clipboard text mismatch');
 },{text,html});}
// Electron native input, rather than a synthetic DOM KeyboardEvent or direct editor command.
export async function nativeChord(app:ElectronApplication,keyCode:string,modifiers:string[]){await app.evaluate(({BrowserWindow},d)=>{const wc=BrowserWindow.getAllWindows()[0].webContents;wc.sendInputEvent({type:'keyDown',keyCode:d.keyCode,modifiers:d.modifiers as any});wc.sendInputEvent({type:'keyUp',keyCode:d.keyCode,modifiers:d.modifiers as any});},{keyCode,modifiers});}
