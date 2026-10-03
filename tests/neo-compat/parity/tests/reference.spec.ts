import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createReferenceDirectory, launchReference, removeReferenceDirectory } from '../reference/harness';

test('original NEO: first run, author identity, native book typing, disk save and restart', async () => {
  const directory = await createReferenceDirectory();
  let app: ElectronApplication | undefined;
  try {
    app = await launchReference(directory);
    const page = await app.firstWindow();
    await expect(page.locator('#firstrun')).toBeVisible();
    await page.locator('#fr-name').fill('Reference Writer');
    await page.locator('#fr-pen').fill('Private Pen');
    await page.locator('.fr-choice[data-style="pantser"]').click();
    await page.locator('#fr-done').click();
    await expect(page.locator('#firstrun')).toBeHidden();
    await expect(page.locator('#author-chip')).toContainText('Reference Writer');
    await page.locator('.new-book').first().click();
    await expect(page.locator('#tp-title')).toBeVisible();
    await page.locator('#tp-title').click(); await page.keyboard.type('Reference Manuscript'); await page.keyboard.press('Enter');
    const body = page.locator('.chapter-body').first();
    await expect(body).toBeVisible();
    expect(await body.getAttribute('contenteditable')).toBe('true');
    await body.click();
    await page.keyboard.type('The reference manuscript survives a restart.');
    await expect(body).toContainText('The reference manuscript survives a restart.');
    const library = path.join(directory, 'Documents', 'NEO Library');
    await expect.poll(async () => {
      const folders = (await readdir(library, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name !== 'Backups');
      for (const folder of folders) {
        const chapters = path.join(library, folder.name, 'chapters');
        try { for (const name of await readdir(chapters)) {
          if (name.endsWith('.html') && (await readFile(path.join(chapters, name), 'utf8')).includes('The reference manuscript survives a restart.')) return true;
        } } catch { /* another private library directory */ }
      }
      return false;
    }).toBe(true);
    await app.close(); app = undefined;
    app = await launchReference(directory);
    const reopened = await app.firstWindow();
    await expect(reopened.locator('#firstrun')).toBeHidden();
    await reopened.locator('#bookshelf-view .book').first().click();
    await expect(reopened.locator('.chapter-body').first()).toContainText('The reference manuscript survives a restart.');
    const settings = JSON.parse(await readFile(path.join(directory, 'userData', 'settings.json'), 'utf8'));
    expect(settings.uiLanguage).toBe('en');
    const hashes = JSON.parse(await readFile(path.join(directory, 'source-hashes.json'), 'utf8'));
    expect(hashes['app.js']).toHaveLength(64);
    expect(hashes['main.js']).toHaveLength(64);
  } finally { await app?.close(); await removeReferenceDirectory(directory); }
});


async function freshBook(page: Page) {
  await expect(page.locator('#firstrun')).toBeVisible();
  await page.locator('#fr-name').fill('Reference Writer');
  await page.locator('.fr-choice[data-style="pantser"]').click();
  await page.locator('#fr-done').click();
  await page.locator('.new-book').first().click();
    await expect(page.locator('#tp-title')).toBeVisible();
    await page.locator('#tp-title').click(); await page.keyboard.type('Reference Manuscript'); await page.keyboard.press('Enter');
  await expect(page.locator('.chapter-body').first()).toBeVisible();
  await page.locator('.chapter-body').first().click();
}
async function caret(page: Page, chapter: number, paragraph: number, offset: number) {
  await page.evaluate(({ chapter, paragraph, offset }) => {
    const body = document.querySelectorAll<HTMLElement>('.chapter-body')[chapter];
    const p = body.querySelectorAll('p')[paragraph]; body.focus();
    const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n: Node | null; let left = offset;
    const range = document.createRange();
    while ((n = walk.nextNode())) { if (left <= n.textContent!.length) { range.setStart(n, left); break; } left -= n.textContent!.length; }
    if (!n) range.setStart(p, 0); range.collapse(true); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  }, { chapter, paragraph, offset });
}
const prose = (page: Page) => page.locator('.chapter-body').evaluateAll(bodies => bodies.map(body => [...body.querySelectorAll('p')].map(p => ({ text: p.textContent, poetry: p.classList.contains('poetry'), scene: p.classList.contains('scene-break') }))));

test('original NEO: double Enter undo rejoins, triple Enter splits and chapter Backspace preserves paragraphs', async () => {
  const directory = await createReferenceDirectory(); let app: ElectronApplication | undefined;
  try {
    app = await launchReference(directory); const page = await app.firstWindow(); await freshBook(page);
    await page.keyboard.type('Alpha omega'); await caret(page, 0, 0, 5);
    await page.keyboard.press('Enter');
    expect((await prose(page))[0].map(p => p.text)).toEqual(['Alpha', ' omega']);
    await page.keyboard.press('Enter');
    expect((await prose(page))[0].map(p => p.text)).toEqual(['Alpha', '***', ' omega']);
    await page.keyboard.press('Meta+z');
    expect((await prose(page))[0].map(p => p.text)).toEqual(['Alpha omega']);
    await caret(page, 0, 0, 5); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await expect(page.locator('.chapter-body')).toHaveCount(2);
    expect((await prose(page)).map(ch => ch.map(p => p.text))).toEqual([['Alpha'], [' omega']]);
    await caret(page, 1, 0, 0); await page.keyboard.press('Backspace');
    await expect(page.locator('.chapter-body')).toHaveCount(1);
    expect((await prose(page))[0].map(p => p.text)).toEqual(['Alpha', ' omega']);
    await page.keyboard.press('Meta+z'); await expect(page.locator('.chapter-body')).toHaveCount(2);
  } finally { await app?.close(); await removeReferenceDirectory(directory); }
});

test('original NEO: Shift Enter makes italic poetry, Backspace returns to prose before merging', async () => {
  const directory = await createReferenceDirectory(); let app: ElectronApplication | undefined;
  try {
    app = await launchReference(directory); const page = await app.firstWindow(); await freshBook(page);
    await page.keyboard.type('Alpha omega'); await caret(page, 0, 0, 5); await page.keyboard.press('Shift+Enter');
    expect((await prose(page))[0]).toEqual([{ text: 'Alpha', poetry: false, scene: false }, { text: ' omega', poetry: true, scene: false }]);
    await expect(page.locator('.chapter-body p.poetry i')).toContainText(' omega');
    await page.keyboard.press('Backspace');
    expect((await prose(page))[0].map(p => ({ text: p.text, poetry: p.poetry }))).toEqual([{ text: 'Alpha', poetry: false }, { text: ' omega', poetry: false }]);
    await page.keyboard.press('Backspace');
    expect((await prose(page))[0].map(p => p.text?.replace(/\u00a0/g, ' '))).toEqual(['Alpha omega']);
  } finally { await app?.close(); await removeReferenceDirectory(directory); }
});
