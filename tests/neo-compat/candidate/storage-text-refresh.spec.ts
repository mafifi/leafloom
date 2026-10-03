import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { SourceBook } from '../../../packages/documents/document-contracts/src/index';
import { inspectHTML } from '../../../packages/editing/prosemirror-editor/src/fidelity';
import { entries, signature } from '../../../packages/editing/prosemirror-editor/src/identity';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
const source = () => process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
test('[NEO-237-A] direct external rich text adoption preserves mixed blocks distant caret nonzero scroll and one notice through writing and reopen', async ({
  page,
}) => {
  const original = '<h2>Heading</h2><p><b>Alpha.</b></p><pre>Code</pre><p><i>Gamma.</i></p>',
    incoming = original.replace('Alpha.', 'Remote arrival.'),
    later = Array.from(
      { length: 100 },
      (_, i) => `<p>Later paragraph ${i} with retained prose.</p>`,
    ).join('');
  const c = await existingBook(page, {
    chapters: [original, later],
    notes: '<p><b>Research stays.</b></p>',
    library: { hintShown: true },
  });
  await c.driver.reopen();
  await c.driver.select(0, 1, 6);
  await page.locator('#paper-scroll').evaluate((el) => {
    el.scrollTop = 500;
  });
  const caret = await c.driver.caret(),
    scroll = await page.locator('#paper-scroll').evaluate((el) => el.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await page.evaluate(() => {
    const hints: string[] = [];
    const el = document.body;
    const observer = new MutationObserver((records) => {
      const changed = records.some((record) => {
        const target =
          record.target instanceof Element ? record.target : record.target.parentElement;
        return (
          Boolean(target?.closest('#hint')) ||
          Array.from(record.addedNodes).some(
            (node) =>
              node instanceof Element && (node.id === 'hint' || node.querySelector('#hint')),
          )
        );
      });
      const text = document.querySelector('#hint')?.textContent ?? '';
      if (changed && text.includes('Updated from your other device')) hints.push(text);
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    Object.assign(window, { readOnlyAdoptionNotices: hints });
  });
  if (source()) await writeFile(path.join(c.folder, 'chapters/ch-1.html'), incoming);
  else {
    const file = path.join(c.folder, 'manuscript.json'),
      book = SourceBook.parse(JSON.parse(await readFile(file, 'utf8'))),
      chapter = book.chapters[0];
    chapter.html = incoming;
    if ('passages' in chapter) {
      const previous = chapter.passages,
        parsed = inspectHTML(new JSDOM('').window.document, incoming);
      if (!parsed.supported) throw Error('Unsupported remote mixed fixture');
      chapter.passages = entries(parsed.model).map((entry) => {
        const digest = signature(entry.node),
          old = previous.find(
            (row) =>
              row.signature === digest && JSON.stringify(row.path) === JSON.stringify(entry.path),
          );
        return { id: old?.id ?? crypto.randomUUID(), path: entry.path, signature: digest };
      });
    }
    await writeFile(file, JSON.stringify(SourceBook.parse(book)));
  }
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.chapter-body').first()).toContainText('Remote arrival.');
  await expect.poll(() => c.driver.caret()).toEqual(caret);
  await expect
    .poll(() => page.locator('#paper-scroll').evaluate((el) => el.scrollTop))
    .toBe(scroll);
  await expect(page.locator('#hint')).toContainText('Updated from your other device');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { readOnlyAdoptionNotices: string[] }).readOnlyAdoptionNotices
            .length,
      ),
    )
    .toBe(1);
  expect(await c.driver.caret()).toEqual(caret);
  await page.keyboard.insertText('X');
  await c.driver.expectParagraphs([
    ['Remote arrival.', 'Gamma.X'],
    Array.from({ length: 100 }, (_, i) => `Later paragraph ${i} with retained prose.`),
  ]);
  await c.driver.undo();
  await c.driver.expectParagraphs([
    ['Remote arrival.', 'Gamma.'],
    Array.from({ length: 100 }, (_, i) => `Later paragraph ${i} with retained prose.`),
  ]);
  await c.driver.redo();
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  const savedIds = saved.chapters.map((chapter: unknown) => {
    if (
      typeof chapter !== 'object' ||
      chapter === null ||
      !('id' in chapter) ||
      typeof chapter.id !== 'string'
    )
      throw Error('Invalid observed chapter');
    return chapter.id;
  });
  expect(savedIds).toEqual(['ch-1', 'ch-2']);
  expect(saved.chapters[0].html).toBe(incoming.replace('Gamma.', 'Gamma.X'));
  expect(saved.chapters[1].html).toBe(later);
  expect(saved.notes).toBe('<p><b>Research stays.</b></p>');
  expect(saved.darlings).toEqual([]);
  expect(await readFile(path.join(c.folder, 'outline.html'), 'utf8')).toBe('');
  await c.driver.selectBook(c.title);
  await expect(page.locator('.chapter-body h2')).toHaveText('Heading');
  await expect(page.locator('.chapter-body pre')).toHaveText('Code');
  await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText('Remote arrival.');
  await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText('Gamma.X');
});
