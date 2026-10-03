import { cp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { SourceBook } from '../../../packages/documents/document-contracts/src/index';
import { inspectHTML } from '../../../packages/editing/prosemirror-editor/src/fidelity';
import { entries, signature } from '../../../packages/editing/prosemirror-editor/src/identity';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

const original = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
const base = '<p><b>Alpha beta.</b></p><p><i>Gamma delta.</i></p>';
async function bytes(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(folder: string) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name);
      if (item.isDirectory()) await visit(file);
      else if (item.isFile()) result[path.relative(directory, file)] = (await readFile(file)).toString('base64');
    }
  }
  await visit(directory);
  return result;
}
async function externalChapter(folder: string, html: string) {
  if (original) { await writeFile(path.join(folder, 'chapters/ch-1.html'), html); return; }
  const file = path.join(folder, 'manuscript.json');
  const book = SourceBook.parse(JSON.parse(await readFile(file, 'utf8')));
  const parsed = inspectHTML(new JSDOM('').window.document, html);
  if (!parsed.supported) throw Error('Unsupported remote fixture HTML');
  book.chapters = book.chapters.map(chapter => {
    if (chapter.id !== 'ch-1') return chapter;
    if (!('passages' in chapter)) return { ...chapter, html };
    const passages = entries(parsed.model).map(entry => {
      const digest = signature(entry.node);
      const prior = chapter.passages.find(row => row.signature === digest && JSON.stringify(row.path) === JSON.stringify(entry.path));
      return { id: prior?.id ?? crypto.randomUUID(), path: entry.path, signature: digest };
    });
    return { ...chapter, html, passages };
  });
  await writeFile(file, JSON.stringify(SourceBook.parse(book)));
}

test('[NEO-245-A] Leafloom: a whole book folder replacement and subsequent external edit retain rich companions identity and new author writing', async ({ page }) => {
  const c = await existingBook(page, {
    chapters: [base], notes: '<p><b>Retained research.</b></p>',
    darlings: [{ id: 'retained-darling', html: '<p><i>Old darling.</i></p>', text: 'Old darling.', chapterId: 'ch-1', chapterLabel: 'Chapter 1', date: '2026-10-02T10:00:00Z' }],
  });
  await c.driver.reopen();
  const companions = await persistedBook(page, c.title, c.id);
  const outline = await readFile(path.join(c.folder, 'outline.html'), 'utf8');
  const parent = path.dirname(c.folder), staging = path.join(parent, '.incoming-' + c.id), aside = path.join(parent, '.preserved-' + c.id);
  await cp(c.folder, staging, { recursive: true });
  await rm(path.join(staging, '.writer.lock'), { force: true });
  await externalChapter(staging, base + '<p><b>Remote incoming.</b></p>');
  await rename(c.folder, aside);
  const protectedBytes = await bytes(aside);
  await rename(staging, c.folder);
  // Original NEO refreshes on focus/visibility/periodic cadence, not fs.watch.
  // This is its public lifecycle event, never a private refresh/lease command.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await c.driver.expectParagraphs([['Alpha beta.', 'Gamma delta.', 'Remote incoming.']]);
  await c.driver.select(0, 2, 'Remote incoming.'.length);
  await c.driver.type(' X');
  await c.driver.expectParagraphs([['Alpha beta.', 'Gamma delta.', 'Remote incoming. X']]);
  await c.driver.shelf();
  let saved = await persistedBook(page, c.title, c.id);
  expect(saved.metadata.id).toBe(c.id);
  expect(saved.chapters[0].id).toBe('ch-1');
  expect(saved.chapters[0].html).toBe(base + '<p><b>Remote incoming. X</b></p>');
  expect(saved.notes).toBe(companions.notes);
  expect(saved.darlings).toEqual(companions.darlings);
  expect(saved.stickies).toEqual(companions.stickies);
  expect(await readFile(path.join(c.folder, 'outline.html'), 'utf8')).toBe(outline);
  expect(await bytes(aside)).toEqual(protectedBytes);
  await c.driver.selectBook(c.title);
  await externalChapter(c.folder, saved.chapters[0].html + '<p><i>Later remote.</i></p>');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await c.driver.expectParagraphs([['Alpha beta.', 'Gamma delta.', 'Remote incoming. X', 'Later remote.']]);
  await c.driver.select(0, 3, 'Later remote.'.length);
  await c.driver.type(' Y');
  await c.driver.shelf();
  saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toBe(base + '<p><b>Remote incoming. X</b></p><p><i>Later remote. Y</i></p>');
  expect(saved.metadata.id).toBe(c.id);
  expect(saved.notes).toBe(companions.notes);
  expect(saved.darlings).toEqual(companions.darlings);
  expect(saved.stickies).toEqual(companions.stickies);
  expect(await readFile(path.join(c.folder, 'outline.html'), 'utf8')).toBe(outline);
  expect(await bytes(aside)).toEqual(protectedBytes);
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alpha beta.', 'Gamma delta.', 'Remote incoming. X', 'Later remote. Y']]);
  await expect(page.locator('.chapter-body p').first().locator('b,strong')).toHaveText('Alpha beta.');
  await expect(page.locator('.chapter-body p').nth(1).locator('i,em')).toHaveText('Gamma delta.');
  await expect(page.locator('.chapter-body p').last().locator('i,em')).toHaveText('Later remote. Y');
});
