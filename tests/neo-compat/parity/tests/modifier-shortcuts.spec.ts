import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {openEditingFixture,selectText,type Engine} from './editing-helpers';
for(const engine of (['original','prosemirror'] as Engine[]).filter(e=>!process.env.NEO_MODIFIER_SHORTCUTS_ENGINE||e===process.env.NEO_MODIFIER_SHORTCUTS_ENGINE))test.describe(engine,()=>{
 test('[NEO-212-D] modified Enter toggles real fullscreen source splits and creates scene candidate preserves prose disk and typing history',async()=>{
  const c=await openEditingFixture(engine,{chapters:['<p>Original prose.</p>']});try{
   await c.app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});const win=BrowserWindow.getAllWindows()[0];win.focus();win.webContents.focus();});
   await expect.poll(()=>c.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused())).toBe(true);
   await selectText(c.page,0,0,'Original prose.'.length);const key=process.platform==='darwin'?'Meta+Enter':'Control+Enter';
   await c.page.keyboard.press(key);await expect.poll(()=>c.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
   await expect(c.page.locator('.chapter-body p')).toHaveCount(engine==='original'?2:1);
   await c.page.keyboard.press(key);await expect.poll(()=>c.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);
   await expect(c.page.locator('#editor-view')).toBeVisible();await expect(c.page.locator('.chapter-body p')).toHaveCount(engine==='original'?3:1);
   await expect(c.page.locator('.chapter-body .scene-break')).toHaveCount(engine==='original'?1:0);
   if(engine==='original')await expect(c.page.locator('.chapter-body p')).toHaveText(['Original prose.','***','']);
   else{await expect(c.page.locator('.chapter-body')).toHaveText('Original prose.');await c.page.keyboard.type('X');await expect(c.page.locator('.chapter-body')).toHaveText('Original prose.X');await c.page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');await expect(c.page.locator('.chapter-body')).toHaveText('Original prose.');await c.page.keyboard.press(process.platform==='darwin'?'Meta+Shift+z':'Control+Shift+z');await expect(c.page.locator('.chapter-body')).toHaveText('Original prose.X');}
   await c.page.locator('#back-to-shelf').click();const saved=()=>readFile(path.join(c.bookdir,'chapters/ch-1.html'),'utf8');
   if(engine==='original')await expect.poll(saved).toContain('***');else await expect.poll(saved).toBe('<p>Original prose.X</p>');
  }finally{await c.close();}
 });
});
