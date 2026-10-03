import { expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { libraryPath } from './library-helpers';
import { chapterPath, meta, metaPath, type BookMeta } from './books-helpers';
export { fixture, host, chapterPath, meta, metaPath, navigation } from './books-helpers';
export const readChapter = (dir:string,id:string,ch='one')=>readFile(chapterPath(dir,id,ch),'utf8');
export const json = async(dir:string,id:string,name:string)=>JSON.parse(await readFile(path.join(libraryPath(dir),id,name+'.json'),'utf8'));
export const events = async(dir:string):Promise<{kind:string;channel?:string;args?:unknown[]}[]>=>{const rows:{type:string;payload:{channel?:string;args?:unknown[]}}[]=JSON.parse(await readFile(path.join(dir,'intercepted-effects.json'),'utf8'));return rows.map(e=>({kind:e.type,...e.payload}));};
export async function external(dir:string,id:string,ch:string,html:string){await writeFile(chapterPath(dir,id,ch),html);}
export async function changeMeta(dir:string,id:string,edit:(m:BookMeta)=>void){const m=await meta(dir,id);edit(m);await writeFile(metaPath(dir,id),JSON.stringify(m));}
// Dispatch the same public lifecycle events NEO listens to; no app state or refresh function is called.
export async function refresh(page:Page,event:'focus'|'visibilitychange'='focus'){await page.evaluate(event=>{(event==='focus'?window:document).dispatchEvent(new Event(event));},event);}
export async function blur(page:Page){await page.evaluate(()=>window.dispatchEvent(new Event('blur')));}
export async function caret(page:Page,ch:string,p=0,off=0){await page.evaluate(({ch,p,off})=>{const body=document.querySelector<HTMLElement>(`.chapter[data-id="${ch}"] .chapter-body`)!;body.focus();const paragraph=body.querySelectorAll('p')[p];const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);const text=walker.nextNode()!;const range=document.createRange();range.setStart(text,Math.min(off,text.textContent!.length));range.collapse(true);const selection=getSelection()!;selection.removeAllRanges();selection.addRange(range);},{ch,p,off});}
export async function spot(page:Page){return page.evaluate(()=>{const sel=getSelection()!;const node=sel.anchorNode;const el=node?.nodeType===1?node as Element:node?.parentElement;const body=el?.closest('.chapter-body');const p=el?.closest('p');return{ch:body?.closest<HTMLElement>('.chapter')?.dataset.id,p:p&&body?[...body.querySelectorAll('p')].indexOf(p):-1,off:sel.anchorOffset};});}
export async function readStarted(dir:string,ch:string){await expect.poll(async()=> (await events(dir)).filter(e=>e.kind==='ipc-start'&&e.channel==='chapter:read'&&e.args?.[1]===ch).length).toBeGreaterThan(0);}
export async function diskContains(dir:string,id:string,text:string,ch='one'){await expect.poll(()=>readChapter(dir,id,ch)).toContain(text);}
