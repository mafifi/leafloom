import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import type { Page } from '@playwright/test';
import { SourceBook, Metadata } from '../../../packages/documents/document-contracts/src/index';
import { inspectHTML } from '../../../packages/editing/prosemirror-editor/src/fidelity';
import { entries, signature } from '../../../packages/editing/prosemirror-editor/src/identity';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook, privateStorageRoot } from './storage-probe';

const source = () => process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
const document = new JSDOM('').window.document;
/** Encode an actual remote writer's valid passage index; never mutate the mounted editor. */
function remoteIndex(
  html: string,
  previous: { id: string; path: number[]; signature: string }[] = [],
) {
  const parsed = inspectHTML(document, html);
  if (!parsed.supported) return [];
  return entries(parsed.model).map((entry) => {
    const digest = signature(entry.node),
      old = previous.find(
        (record) =>
          record.signature === digest && JSON.stringify(record.path) === JSON.stringify(entry.path),
      );
    return { id: old?.id ?? crypto.randomUUID(), path: entry.path, signature: digest };
  });
}
async function refresh(page: Page) {
  // Public lifecycle signal, followed by real application reads of externally written files.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}
async function externalChapter(folder: string, id: string, html: string) {
  if (source()) await writeFile(path.join(folder, 'chapters', id + '.html'), html);
  else {
    const file = path.join(folder, 'manuscript.json'),
      book = SourceBook.parse(JSON.parse(await readFile(file, 'utf8')));
    book.chapters = book.chapters.map((chapter) =>
      chapter.id !== id
        ? chapter
        : 'passages' in chapter
          ? { ...chapter, html, passages: remoteIndex(html, chapter.passages) }
          : { ...chapter, html },
    );
    await writeFile(file, JSON.stringify(SourceBook.parse(book)));
  }
}
async function delayedSourceWrites(page: Page) {
  if (!source()) return;
  const fixture = path.dirname(path.dirname(privateStorageRoot(page)));
  await writeFile(
    path.join(fixture, '.neo-parity-host.json'),
    JSON.stringify({ ipcDelays: { 'book:writeMeta': { before: 1000 } } }),
  );
}
async function externalAddedChapter(folder: string, id: string, html: string) {
  if (source()) {
    await writeFile(path.join(folder, 'chapters', id + '.html'), html);
    const file = path.join(folder, 'book.json'),
      metadata = Metadata.parse(JSON.parse(await readFile(file, 'utf8')));
    if (
      !Array.isArray(metadata.chapterOrder) ||
      metadata.chapterOrder.some((value) => typeof value !== 'string')
    )
      throw Error('Invalid chapter order fixture');
    metadata.chapterOrder = [...metadata.chapterOrder, id];
    await writeFile(file, JSON.stringify(metadata));
  } else {
    const file = path.join(folder, 'manuscript.json'),
      book = SourceBook.parse(JSON.parse(await readFile(file, 'utf8')));
    if (book.formatVersion === 'neo-lifecycle/v1') book.chapters.push({ id, html });
    else
      book.chapters.push({ id, html, version: crypto.randomUUID(), passages: remoteIndex(html) });
    await writeFile(file, JSON.stringify(SourceBook.parse(book)));
  }
}
test('[NEO-238-A] Leafloom: external deletion adopts disk prose and preserves the complete replaced rich chapter as a durable Darling', async ({
  page,
}) => {
  const html = '<p><b>Alpha beta gamma.</b></p><p><i>Delta epsilon.</i></p>',
    c = await existingBook(page, {
      chapters: [html, '<p>Later.</p>'],
      notes: '<p>Research stays.</p>',
    });
  await c.driver.reopen();
  await externalChapter(c.folder, 'ch-1', '<p>Alpha beta gamma.</p>');
  await refresh(page);
  await c.driver.expectParagraphs([['Alpha beta gamma.'], ['Later.']]);
  await expect(page.locator('#hint')).toContainText('Darlings');
  await expect.poll(async () => (await persistedBook(page, c.title, c.id)).darlings.length).toBe(1);
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.darlings[0]).toMatchObject({ chapterId: 'ch-1', chapterLabel: 'Chapter 1' });
  expect(saved.darlings[0].html).toMatch(/<(?:b|strong)>Alpha beta gamma\.<\/(?:b|strong)>/);
  expect(saved.darlings[0].html).toMatch(/<(?:i|em)>Delta epsilon\.<\/(?:i|em)>/);
  expect(saved.notes).toContain('Research stays.');
  await c.driver.reopen();
  await c.driver.expectParagraphs([['Alpha beta gamma.'], ['Later.']]);
  expect((await persistedBook(page, c.title, c.id)).darlings).toEqual(saved.darlings);
});
test('[NEO-239-A] Leafloom: concurrent remote and unsaved local text persist as adjacent chapters without losing either version', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p>Alpha.</p>', '<p>Later.</p>'],
    metadata: { chapterTitles: { 'ch-1': 'Opening' } },
  });
  await c.driver.reopen();
  await externalChapter(c.folder, 'ch-1', '<p><i>Gamma from another device.</i></p>');
  await c.driver.select(0, 0, 6);
  await page.keyboard.type(' Beta locally');
  await refresh(page);
  await c.driver.expectParagraphs([
    ['Alpha. Beta locally'],
    ['Gamma from another device.'],
    ['Later.'],
  ]);
  await expect(page.locator('.chapter').nth(1).locator('.ch-title')).toContainText(
    'from other device',
  );
  await expect.poll(async () => (await persistedBook(page, c.title, c.id)).chapters.length).toBe(3);
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0]).toMatchObject({ id: 'ch-1' });
  expect(saved.chapters[0].html).toContain('Beta locally');
  expect(saved.chapters[1].html).toMatch(/<(?:i|em)>Gamma from another device\.<\/(?:i|em)>/);
  expect(saved.metadata.chapterTitles[saved.chapters[1].id]).toContain('Opening from other device');
  await c.driver.reopen();
  await c.driver.expectParagraphs([
    ['Alpha. Beta locally'],
    ['Gamma from another device.'],
    ['Later.'],
  ]);
});
test('[NEO-241-A] Leafloom: concurrent local and remote chapter additions retain both ordered prose and clear stale structural Undo', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p>Original.</p>', '<p>Second.</p>'] });
  await c.driver.reopen();
  await externalAddedChapter(c.folder, 'remote-chapter', '<p><i>Remote content.</i></p>');
  await delayedSourceWrites(page);
  if ((await page.locator('#nav-pin').getAttribute('aria-pressed')) !== 'true') {
    await page.locator('#nav-hotzone').hover();
    await page.locator('#nav-pin').click();
  }
  await page.locator('#nav-add').click();
  await page.keyboard.type('Local content.');
  await refresh(page);
  await c.driver.expectParagraphs([
    ['Original.'],
    ['Second.'],
    ['Remote content.'],
    ['Local content.'],
  ]);
  await c.driver.undo();
  await expect(page.locator('.chapter')).toHaveCount(4);
  await expect(page.locator('.chapter-body').nth(2)).toHaveText('Remote content.');
  await expect.poll(async () => (await persistedBook(page, c.title, c.id)).chapters.length).toBe(4);
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id).slice(0, 3)).toEqual([
    'ch-1',
    'ch-2',
    'remote-chapter',
  ]);
  expect(saved.chapters[2].html).toMatch(/<(?:i|em)>Remote content\.<\/(?:i|em)>/);
  await c.driver.reopen();
  await expect(page.locator('.chapter')).toHaveCount(4);
  await expect(page.locator('.chapter-body').nth(2)).toHaveText('Remote content.');
});
