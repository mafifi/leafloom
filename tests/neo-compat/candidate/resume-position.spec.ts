import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { BookCore } from '../../../packages/editing/prosemirror-editor/src/core';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

const original = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';

test('[NEO-215-B] Leafloom: excessive saved paragraph and offset resume at the final paragraph end and subsequent writing persists', async ({ page }) => {
  const c = await existingBook(page, {
    chapters: ['<p><b>First.</b></p><p>Middle.</p><p>Final.</p>'],
    metadata: { lastPosition: { chapterId: 'ch-1', pIdx: 999, off: 999, scroll: 0 } },
  });
  await expect.poll(() => c.driver.caret()).toMatchObject({ chapter: 0, paragraph: 2, offset: 6, collapsed: true });
  await c.driver.type('X');
  await c.driver.expectParagraphs([['First.', 'Middle.', 'Final.X']]);
  await c.driver.shelf();
  await expect.poll(async () => (await persistedBook(page, c.title, c.id)).chapters[0].html).toContain('Final.X');
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>First\.<\/(?:b|strong)>/);
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['First.', 'Middle.', 'Final.X']]);
});

test('[NEO-215-B] Leafloom: saved caret beyond externally shortened prose clamps to that same paragraph end before typing and reopening', async ({ page }) => {
  const text = 'Long sentence remainder.';
  const c = await existingBook(page, { chapters: [`<p><b>First.</b></p><p>${text}</p>`] });
  await c.driver.select(0, 1, text.length);
  await c.driver.shelf();
  await expect.poll(async () => {
    const position = (await persistedBook(page, c.title, c.id)).metadata.lastPosition;
    return original ? position?.off : position?.from;
  }).toBe(text.length);
  if (original) {
    await writeFile(path.join(c.folder, 'chapters/ch-1.html'), '<p><b>First.</b></p><p>Short.</p>');
  } else {
    // Closed-file preparation through the real codec preserves passage identity and validity.
    // This core is never mounted and is not used to perform or assert author actions.
    const file = path.join(c.folder, 'manuscript.json');
    const raw = JSON.parse(await readFile(file, 'utf8'));
    const core = new BookCore(new JSDOM().window.document, raw, null, '', '');
    const passage = core.passages('ch-1')[1];
    core.selectPassage(passage.id, 0, passage.size);
    core.insert('Short.', { typography: false });
    expect(core.passages('ch-1')[1].id).toBe(passage.id);
    const checkpoint = core.checkpoint();
    expect(checkpoint.book.metadata.lastPosition).toEqual(raw.metadata.lastPosition);
    await writeFile(file, JSON.stringify(checkpoint.book));
  }
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['First.', 'Short.']]);
  await expect.poll(() => c.driver.caret()).toMatchObject({ chapter: 0, paragraph: 1, offset: 6, collapsed: true });
  await c.driver.type('X');
  await c.driver.expectParagraphs([['First.', 'Short.X']]);
  await c.driver.shelf();
  await expect.poll(async () => (await persistedBook(page, c.title, c.id)).chapters[0].html).toContain('Short.X');
  expect((await persistedBook(page, c.title, c.id)).chapters[0].html).toMatch(/<(?:b|strong)>First\.<\/(?:b|strong)>/);
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['First.', 'Short.X']]);
});

test('[NEO-215-B] Leafloom: a saved scroll-only reading place restores the actual viewport without manufacturing a paragraph caret', async ({ page }) => {
  const words = Array.from({ length:100 },(_,i)=>`Paragraph ${i} remains intact.`);
  const c=await existingBook(page,{chapters:[words.map(text=>`<p>${text}</p>`).join('')],metadata:{lastPosition:{chapterId:'ch-1',scroll:400}}});
  await expect.poll(()=>page.locator('#paper-scroll').evaluate(el=>el.scrollTop)).toBe(400);
  await c.driver.expectParagraphs([words]);
  await c.driver.shelf();
  const saved=await persistedBook(page,c.title,c.id);
  expect(saved.chapters[0].html).toContain(words[0]);
  expect(saved.chapters[0].html).toContain(words.at(-1));
});
