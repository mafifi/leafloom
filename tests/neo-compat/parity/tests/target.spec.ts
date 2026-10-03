import { test,expect,type ElectronApplication } from '@playwright/test';
import { createReferenceDirectory,launchReference,removeReferenceDirectory } from '../reference/harness';
test('[PM-FOUNDATION] author input is owned by a visible real ProseMirror view and survives restart',async()=>{
 const directory=await createReferenceDirectory();let app:ElectronApplication|undefined;
 try{
  app=await launchReference(directory,'prosemirror');const page=await app.firstWindow();
  await page.locator('#fr-name').fill('Writer');await page.locator('.fr-choice[data-style="pantser"]').click();await page.locator('#fr-done').click();
  await page.locator('.new-book').first().click();await page.locator('#tp-title').click();await page.keyboard.type('Native proof');await page.keyboard.press('Enter');
  const body=page.locator('.chapter-body').first();await expect(body).toBeVisible();await expect(body).toHaveClass(/ProseMirror/);
  await body.click();await page.keyboard.type('The actual editor records this sentence.');await expect(body).toContainText('The actual editor records this sentence.');
  const evidence=await page.evaluate(()=>{const engine=(window as any).neoProseMirror;return engine?.diagnostics();});
  expect(evidence?.views).toBeGreaterThan(0);expect(evidence?.transactions).toBeGreaterThan(0);expect(evidence?.documents.some((s:string)=>s.includes('The actual editor'))).toBe(true);
  await page.locator('#back-to-shelf').click();await app.close();app=undefined;
  app=await launchReference(directory,'prosemirror');const reopened=await app.firstWindow();await reopened.locator('#bookshelf-view .book').first().click();
  await expect(reopened.locator('.chapter-body').first()).toHaveClass(/ProseMirror/);await expect(reopened.locator('.chapter-body').first()).toContainText('The actual editor records this sentence.');
 }finally{await app?.close();await removeReferenceDirectory(directory);}
});

test('[NEO-092-A] native typing undo and redo restores the ProseMirror paragraph and caret',async()=>{
 const directory=await createReferenceDirectory();let app:ElectronApplication|undefined;
 try{
  app=await launchReference(directory,'prosemirror');const page=await app.firstWindow();
  await page.locator('#fr-name').fill('Writer');await page.locator('.fr-choice[data-style="pantser"]').click();await page.locator('#fr-done').click();
  await page.locator('.new-book').first().click();await page.locator('#tp-title').click();await page.keyboard.type('History proof');await page.keyboard.press('Enter');
  const body=page.locator('.chapter-body').first();await expect(body).toHaveClass(/ProseMirror/);await body.click();await page.keyboard.type('History survives.');
  await expect(body).toHaveText('History survives.');await page.keyboard.press('ControlOrMeta+z');await expect(body).toHaveText('');
  await page.keyboard.press('ControlOrMeta+Shift+z');await expect(body).toHaveText('History survives.');
  await app.evaluate(({Menu,BrowserWindow})=>{const edit=Menu.getApplicationMenu()!.items.find(i=>i.label==='Edit')!;const item=edit.submenu!.items.find(i=>i.label==='Undo')!;item.click(item,BrowserWindow.getAllWindows()[0],{} as Electron.KeyboardEvent);});await expect(body).toHaveText('');
  await page.keyboard.press('ControlOrMeta+Shift+z');await expect(body).toHaveText('History survives.');
  await page.keyboard.type(' Again.');await expect(body).toHaveText('History survives. Again.');
 }finally{await app?.close();await removeReferenceDirectory(directory);}
});
