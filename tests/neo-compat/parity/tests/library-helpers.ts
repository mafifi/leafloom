import { expect, type Page, type ElectronApplication } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const libraryPath = (directory: string) => path.join(directory, 'Documents', 'NEO Library');
export interface LibrarySnapshot { authors: { id: string; name: string }[]; currentAuthorId: string; penNames: string[]; writingStyle: string; fonts: { body: string; dropcap: string }; shelves: { id: string; name: string; bookIds: string[]; authorId?: string }[]; }
export const readLibrary = async (directory: string): Promise<LibrarySnapshot> => JSON.parse(await readFile(path.join(libraryPath(directory), 'library.json'), 'utf8'));
export async function onboard(page: Page, { name = 'Library Writer', pen = '', style = 'pantser' }: { name?: string; pen?: string; style?: string } = {}) {
  await expect(page.locator('#firstrun')).toBeVisible();
  await page.locator('#fr-name').fill(name); await page.locator('#fr-pen').fill(pen);
  await page.locator(`.fr-choice[data-style="${style}"]`).click();
  await page.locator('#fr-done').click(); await expect(page.locator('#firstrun')).toBeHidden();
}
export async function book(page: Page, title: string, shelf = 0) {
  await page.locator('.shelf').nth(shelf).locator('.new-book').click();
  await expect(page.locator('#tp-title')).toBeVisible();
  await page.locator('#tp-title').fill(title); await page.locator('#tp-title').press('Enter');
  await expect(page.locator('.chapter-body').first()).toBeVisible();
  if (await page.evaluate(() => 'neoProseMirror' in window)) await expect(page.locator('.chapter-body.ProseMirror').first()).toBeVisible();
  const id = await page.locator('.chapter').first().getAttribute('data-id');
  await page.locator('#back-to-shelf').click(); await expect(page.locator('#bookshelf-view')).toBeVisible();
  const tile = page.locator('.book').and(page.getByRole('button', { name: new RegExp('^' + title + ',') })).first(); await expect(tile).toBeVisible();
  return { chapterId: id!, bookId: (await tile.getAttribute('data-book-id'))! };
}
export async function shelf(page: Page, name: string) {
  await page.locator('#add-shelf-btn').click();
  const label = page.locator('.shelf-label').last(); await label.fill(name); await label.press('Enter');
  await expect(label).toHaveText(name);
}
export async function option(page: Page, text: string) {
  await page.locator('.modal-backdrop:not([hidden]) .fr-choice').filter({ has: page.locator('strong', { hasText: text }) }).click();
}
export async function authorMenu(page: Page, text: string) { await page.locator('#author-chip').click(); await option(page, text); }
export async function input(page: Page, value: string) { await page.locator('.modal-backdrop:not([hidden]) input').fill(value); await page.locator('.modal-backdrop:not([hidden]) .m-ok').click(); }
export async function nativeMenu(app: ElectronApplication, label: string) {
  await app.evaluate(({ Menu }, label) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => { for (const item of items) { if (item.label.replace(/&/g, '').replace(/…$/, '') === label.replace(/…$/, '')) return item; const nested = item.submenu && find(item.submenu.items); if (nested) return nested; } };
    const item = find(Menu.getApplicationMenu()!.items); if (!item) throw new Error('Menu item missing: ' + label); item.click();
  }, label);
}
