import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { openEditingFixture, selectText, menu, assertTexts, type Engine } from './editing-helpers';

// Read-only artifact parsing: persistence and editor commands remain the real app's.
async function savedParagraphs(page:Page,bookdir:string){
 const html=await readFile(path.join(bookdir,'chapters','ch-1.html'),'utf8');
 return page.evaluate(html=>[...new DOMParser().parseFromString(html,'text/html').querySelectorAll('p')].map(p=>(p.textContent??'').replace(/\u00a0/g,' ')),html);
}
async function reopen(page:Page){
 await page.locator('#back-to-shelf').click();
 await expect(page.locator('#bookshelf-view')).toBeVisible();
 await page.locator('#bookshelf-view .book').first().click();
 await expect(page.locator('.chapter-body').first()).toBeVisible();
}
for(const engine of (['original','prosemirror']as Engine[]).filter(e=>!process.env.NEO_ADAPTER_REGRESSIONS_ENGINE||process.env.NEO_ADAPTER_REGRESSIONS_ENGINE===e))test.describe(engine,()=>{
 test('[NEO-092-B] paragraph alignment preserves preceding typed prose undo and redo',async()=>{
  const c=await openEditingFixture(engine,{chapters:['<p>Original.</p>']});
  try{
   await selectText(c.page,0,0,9);await c.page.keyboard.press('x');
   await assertTexts(c.page,[['Original.x']]);
   await menu(c.app,['Format','Align Paragraph','Center']);
   await expect(c.page.locator('.chapter-body p').first()).toHaveCSS('text-align','center');
   await menu(c.app,['Edit','Undo']);await assertTexts(c.page,[['Original.']]);
   await expect(c.page.locator('.chapter-body p').first()).toHaveCSS('text-align','center');
   await menu(c.app,['Edit','Redo']);await assertTexts(c.page,[['Original.x']]);
   await expect(c.page.locator('.chapter-body p').first()).toHaveCSS('text-align','center');
   await reopen(c.page);await assertTexts(c.page,[['Original.x']]);
   expect(await savedParagraphs(c.page,c.bookdir)).toEqual(['Original.x']);
  }finally{await c.close();}
 });
 const unicodeCases=[
  {name:'emoji',glyph:'😺'},
  {name:'combining',glyph:'e\u0301'},
  {name:'ZWJ',glyph:'👩‍💻'},
 ]as const;
 for(const example of unicodeCases)test(`[NEO-228-B] Vim x deletes ${example.name} grapheme with undo redo and saved prose`,async()=>{
  const original=example.glyph+' intact words.',deleted=' intact words.';
  const c=await openEditingFixture(engine,{chapters:[`<p>${original}</p>`]});
  try{
   await menu(c.app,['View','Vim Keys']);await expect(c.page.locator('#hint')).toContainText('Vim keys on');
   await selectText(c.page,0,0,0);await c.page.keyboard.press('Escape');await c.page.keyboard.press('x');
   await assertTexts(c.page,[[deleted]]);
   await menu(c.app,['Edit','Undo']);await assertTexts(c.page,[[original]]);
   await menu(c.app,['Edit','Redo']);await assertTexts(c.page,[[deleted]]);
   await reopen(c.page);await assertTexts(c.page,[[deleted]]);
   expect(await savedParagraphs(c.page,c.bookdir)).toEqual([deleted]);
   expect(await readFile(path.join(c.bookdir,'chapters','ch-1.html'),'utf8')).not.toContain('\uFFFD');
  }finally{await c.close();}
 });
 test('[NEO-246-B] structural HTML whitespace creates no extra paragraphs and preserves inline author spacing',async({},testInfo)=>{
  const first='  Alpha  beta. ',second='Verse  words.';
  const c=await openEditingFixture(engine,{chapters:[`\n  <p>${first}</p>\n\t<p class="poetry"><i>${second}</i></p>\n`]});
  try{
   const initialGeometry=await c.page.locator('.chapter-body').first().evaluate(body=>{
    const rect=(el:Element)=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,width:r.width};};
    const style=getComputedStyle(body);
    return{body:rect(body),whiteSpace:style.whiteSpace,font:style.font,lineHeight:style.lineHeight,children:[...body.childNodes].map(n=>({type:n.nodeType,text:n.textContent,tag:n instanceof Element?n.tagName:null})),paragraphs:[...body.querySelectorAll('p')].map(p=>({text:p.textContent,rect:rect(p),marginTop:getComputedStyle(p).marginTop,marginBottom:getComputedStyle(p).marginBottom}))};
   });
   await testInfo.attach('initial-whitespace-geometry',{body:JSON.stringify(initialGeometry,null,2),contentType:'application/json'});
   await assertTexts(c.page,[[first,second]]);await expect(c.page.locator('.chapter-body > p')).toHaveCount(2);
   const rects=await c.page.locator('.chapter-body > p').evaluateAll(ps=>ps.map(p=>{const r=p.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height};}));
   expect(rects.every(r=>r.height>0)).toBe(true);expect(rects[1].top).toBeGreaterThanOrEqual(rects[0].bottom);
   // Captured from unchanged NEO at this fixture's default 17px type/1.75 line height.
   expect(rects.map(r=>r.height)).toEqual([29.75,29.75]);
   expect(rects[1].top-rects[0].bottom).toBeCloseTo(15.3,1);
   await expect(c.page.locator('.chapter-body > p').nth(1)).toHaveClass(/poetry/);
   await expect(c.page.locator('.chapter-body > p').nth(1).locator('i, em')).toHaveText(second);
   await selectText(c.page,0,1,second.length);await c.page.keyboard.type(' Added.');
   await assertTexts(c.page,[[first,second+' Added.']]);
   await reopen(c.page);await assertTexts(c.page,[[first,second+' Added.']]);
   await expect(c.page.locator('.chapter-body > p')).toHaveCount(2);
   expect(await savedParagraphs(c.page,c.bookdir)).toEqual([first,second+' Added.']);
  }finally{await c.close();}
 });
});
