import { test, expect } from './author-fixture';
import type { Page } from '@playwright/test';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
import { focusHistoryChrome } from './history-chrome';
import { clickReferenceMenu } from '../reference/harness';
import { privateStorageRoot } from './storage-probe';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

test.beforeEach(async ({ page }) => {
  if (process.env.LEAFLOOM_PARITY_DRIVER !== 'neo-reference') {
    await writeFile(
      path.join(privateStorageRoot(page), 'settings.json'),
      JSON.stringify({ uiLanguage: 'en' }),
    );
  }
});

async function pin(page: Page) {
  if ((await page.locator('#nav-pin').getAttribute('aria-pressed')) !== 'true') {
    await page.locator('#nav-hotzone').hover();
    await page.locator('#nav-pin').click();
  }
}
async function menu(page: Page, index: number) {
  await pin(page);
  await page.locator('.nav-item').nth(index).locator('.n-row').click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
}
async function kind(page: Page, index: number, label: string) {
  await menu(page, index);
  await page.getByRole('menuitemradio', { name: label, exact: true }).click();
}
async function gapMenu(page: Page, index: number) {
  const plus = page
    .locator('#nav-list .nav-gap')
    .nth(index)
    .getByRole('button', { name: 'Add', exact: true });
  await expect
    .poll(async () => {
      const bounds = await plus.boundingBox();
      if (!bounds) return false;
      await page.mouse.move(bounds.x + bounds.width / 2 - 1, bounds.y + bounds.height / 2);
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return plus.evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        return (
          document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) ===
          button
        );
      });
    })
    .toBe(true);
  await plus.click();
}
const rich = '<p>Alpha <b>bold</b> and <i>italic</i>.</p><p>Ending.</p>';
const conversions = [
  ['copyright', 'Copyright'],
  ['dedication', 'Dedication'],
  ['epigraph', 'Epigraph'],
  ['prologue', 'Prologue'],
  ['part', 'Part'],
  ['chapter', 'Chapter'],
  ['unnumbered', 'Unnumbered Chapter'],
  ['epilogue', 'Epilogue'],
  ['acknowledgments', 'Acknowledgments'],
  ['about', 'About the Author'],
] as const;

for (const [target, label] of conversions) {
  test(`[NEO-052-A] ${target} conversion preserves existing rich prose through structural Undo and durable reopen`, async ({
    page,
  }) => {
    const initialKind = target === 'chapter' ? 'dedication' : 'chapter';
    const c = await existingBook(page, {
      chapters: ['<p>Before.</p>', rich, '<p>After.</p>'],
      metadata: {
        chapterKinds: { 'ch-2': initialKind },
        chapterTitles: { 'ch-2': 'Original title' },
      },
      notes: '<p>Private <i>notes</i>.</p>',
    });
    await kind(page, 1, label);
    await expect(page.locator('.chapter').nth(1)).toHaveClass(new RegExp('kind-' + target));
    await expect(page.locator('.chapter-body').nth(1).locator('b,strong')).toHaveText('bold');
    await expect(page.locator('.chapter-body').nth(1).locator('i,em')).toHaveText('italic');
    await focusHistoryChrome(page);
    await c.driver.undo();
    await expect(page.locator('.chapter').nth(1)).toHaveClass(new RegExp('kind-' + initialKind));
    await c.driver.expectParagraphs([
      ['Before.'],
      ['Alpha bold and italic.', 'Ending.'],
      ['After.'],
    ]);
    await kind(page, 1, label);
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title, c.id);
    expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual([
      'ch-1',
      'ch-2',
      'ch-3',
    ]);
    expect(saved.chapters[1].html).toBe(rich);
    expect(saved.metadata.chapterKinds?.['ch-2'] ?? 'chapter').toBe(target);
    expect(saved.metadata.chapterTitles['ch-2']).toBe('Original title');
    expect(saved.notes).toBe('<p>Private <i>notes</i>.</p>');
    await page.reload();
    await c.driver.selectBook(c.title);
    await expect(page.locator('.chapter').nth(1)).toHaveClass(new RegExp('kind-' + target));
    await c.driver.expectParagraphs([
      ['Before.'],
      ['Alpha bold and italic.', 'Ending.'],
      ['After.'],
    ]);
  });
}

test('[NEO-054-A] legacy first Prologue and last Epilogue migrate to modern kinds without changing rich chapter identity or order', async ({
  page,
}) => {
  const bodies = ['<p><b>Before.</b></p>', rich, '<p><i>After.</i></p>'];
  const c = await existingBook(page, {
    chapters: bodies,
    metadata: { prologue: 'ch-1', epilogue: 'ch-3' },
  });
  await expect(page.locator('.ch-num')).toHaveText(['Prologue', 'Chapter 1', 'Epilogue']);
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.metadata.chapterKinds).toMatchObject({ 'ch-1': 'prologue', 'ch-3': 'epilogue' });
  expect(saved.metadata).not.toHaveProperty('prologue');
  expect(saved.metadata).not.toHaveProperty('epilogue');
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual([
    'ch-1',
    'ch-2',
    'ch-3',
  ]);
  expect(saved.chapters.map((chapter: { html: string }) => chapter.html)).toEqual(bodies);
  await page.reload();
  await c.driver.selectBook(c.title);
  await expect(page.locator('.ch-num')).toHaveText(['Prologue', 'Chapter 1', 'Epilogue']);
});

test('[NEO-055-A] unnumbered custom then empty title remains outside the numbered count through reopen', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p>Before.</p>', rich, '<p>After.</p>'],
    metadata: { chapterKinds: { 'ch-2': 'unnumbered' }, chapterTitles: { 'ch-2': 'Interlude' } },
  });
  const heading = page.locator('.chapter-head').nth(1);
  await expect(heading.locator('.ch-title')).toHaveText('Interlude');
  await expect(heading.locator('.ch-num')).toBeHidden();
  await expect(page.locator('.chapter-head').nth(2).locator('.ch-num')).toHaveText('Chapter 2');
  await heading.locator('.ch-title').fill('');
  await heading.locator('.ch-title').press('Tab');
  await expect(heading.locator('.ch-title')).toHaveText('');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.metadata.chapterTitles['ch-2']).toBe('');
  expect(saved.metadata.chapterKinds['ch-2']).toBe('unnumbered');
  expect(saved.chapters[1].html).toBe(rich);
  await page.reload();
  await c.driver.selectBook(c.title);
  await expect(page.locator('.chapter-head').nth(1).locator('.ch-title')).toHaveText('');
  await expect(page.locator('.chapter-head').nth(1).locator('.ch-num')).toBeHidden();
  await expect(page.locator('.chapter-head').nth(2).locator('.ch-num')).toHaveText('Chapter 2');
});

test('[NEO-058-A] ordinary Add inserts a focused numbered story before Epilogue and all back matter retaining rich neighbours', async ({
  page,
}) => {
  const bodies = [rich, '<p><i>Closing.</i></p>', '<p>Thanks.</p>', '<p>About.</p>'];
  const c = await existingBook(page, {
    chapters: bodies,
    metadata: { chapterKinds: { 'ch-2': 'epilogue', 'ch-3': 'acknowledgments', 'ch-4': 'about' } },
  });
  await pin(page);
  await page.locator('#nav-add').click();
  await c.driver.expectParagraphs([
    ['Alpha bold and italic.', 'Ending.'],
    [''],
    ['Closing.'],
    ['Thanks.'],
    ['About.'],
  ]);
  expect(await c.driver.caret()).toMatchObject({
    chapter: 1,
    paragraph: 0,
    offset: 0,
    collapsed: true,
  });
  await page.keyboard.type('New story.');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  const originalIds = ['ch-1', 'ch-2', 'ch-3', 'ch-4'];
  expect(
    saved.chapters
      .map((chapter: { id: string }) => chapter.id)
      .filter((id: string) => originalIds.includes(id)),
  ).toEqual(originalIds);
  expect(
    saved.chapters
      .filter((chapter: { id: string }) => originalIds.includes(chapter.id))
      .map((chapter: { html: string }) => chapter.html),
  ).toEqual(bodies);
  const inserted = saved.chapters[1];
  expect(inserted.html).toBe('<p>New story.</p>');
  expect(saved.metadata.chapterKinds?.[inserted.id] ?? 'chapter').toBe('chapter');
  await page.reload();
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([
    ['Alpha bold and italic.', 'Ending.'],
    ['New story.'],
    ['Closing.'],
    ['Thanks.'],
    ['About.'],
  ]);
});

for (const locale of ['en', 'fr'] as const) {
  test(`[NEO-057-A] ${locale} copyright starter is localized and repeated kind switches never replace authored legal prose`, async ({
    page,
  }) => {
    const reference = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
    if (!reference)
      await writeFile(
        path.join(privateStorageRoot(page), 'settings.json'),
        JSON.stringify({ uiLanguage: locale }),
      );
    const c = await existingBook(page, {
      chapters: ['<p>Before.</p>', '<p><br></p>', '<p><b>Existing legal text.</b></p>'],
    });
    if (reference && locale === 'fr') {
      await clickReferenceMenu(page, ['View', 'Language', 'Français']);
      await c.driver.selectBook(c.title);
    }
    await kind(page, 1, 'Copyright');
    const rights = locale === 'fr' ? 'Tous droits réservés.' : 'All rights reserved.';
    const notice =
      locale === 'fr'
        ? `© Fixture Writer, ${new Date().getFullYear()}`
        : `Copyright © ${new Date().getFullYear()} Fixture Writer`;
    await expect(page.locator('.chapter-body').nth(1).locator('p')).toHaveText([notice, rights]);
    await kind(page, 1, locale === 'fr' ? 'Chapitre' : 'Chapter');
    await kind(page, 1, 'Copyright');
    await expect(page.locator('.chapter-body').nth(1).locator('p')).toHaveText([notice, rights]);
    await kind(page, 2, 'Copyright');
    await expect(page.locator('.chapter-body').nth(2).locator('b,strong')).toHaveText(
      'Existing legal text.',
    );
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title, c.id);
    expect(saved.chapters[1].html).toBe(`<p>${notice}</p><p>${rights}</p>`);
    expect(saved.chapters[2].html).toBe('<p><b>Existing legal text.</b></p>');
    await page.reload();
    await c.driver.selectBook(c.title);
    await expect(page.locator('.chapter-body').nth(1).locator('p')).toHaveText([notice, rights]);
    await expect(page.locator('.chapter-body').nth(2).locator('b,strong')).toHaveText(
      'Existing legal text.',
    );
  });
}
async function dragChapter(page: Page, from: number, to: number) {
  const source = await page.locator('#nav-list .n-row').nth(from).boundingBox();
  const target = await page.locator('#nav-list .nav-item').nth(to).boundingBox();
  if (!source || !target) throw Error('Missing actual chapter drag rows');
  await page.mouse.move(source.x + 30, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 42, source.y + source.height / 2 + 5, { steps: 3 });
  const landing = target.y + target.height * (to > from ? 0.8 : 0.2);
  await page.mouse.move(target.x + 30, landing, { steps: 12 });
  await page.mouse.move(target.x + 31, landing);
  await expect(page.locator('.nav-drop-ind')).toBeVisible();
  await page.mouse.up();
}

test('[NEO-050-A] typing does not expose a sole story heading and removing or reordering its second story restores the same heading rule', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: [rich, '<p>Second.</p>'] });
  await pin(page);
  await expect(page.locator('.chapter-head').first()).toBeVisible();
  await dragChapter(page, 1, 0);
  await expect(page.locator('.ch-num')).toHaveText(['Chapter 1', 'Chapter 2']);
  await menu(page, 0);
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.chapter')).toHaveCount(1);
  await expect(page.locator('.chapter-head').first()).toBeHidden();
  await c.driver.select(0, 1, 7);
  await page.keyboard.type(' More.');
  await expect(page.locator('.chapter-head').first()).toBeHidden();
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1']);
  expect(saved.chapters[0].html).toBe(
    '<p>Alpha <b>bold</b> and <i>italic</i>.</p><p>Ending. More.</p>',
  );
  await page.reload();
  await c.driver.selectBook(c.title);
  await expect(page.locator('.chapter-head').first()).toBeHidden();
  await c.driver.expectParagraphs([['Alpha bold and italic.', 'Ending. More.']]);
});

test('[NEO-053-A] per-Part chapter resets survive actual Part reorder and deletion while generated Contents follows the same rich story order', async ({
  page,
}) => {
  const bodies = [
    '<p><br></p>',
    '<p>First part.</p>',
    rich,
    '<p>Second part.</p>',
    '<p><i>Last story.</i></p>',
  ];
  const c = await existingBook(page, {
    chapters: bodies,
    metadata: {
      chapterKinds: { 'ch-1': 'contents', 'ch-2': 'part', 'ch-4': 'part' },
      chapterTitles: { 'ch-3': 'Opening', 'ch-5': 'Closing' },
    },
  });
  await expect(page.locator('.ch-num')).toHaveText([
    'Contents',
    'Part I',
    'Chapter 1',
    'Part II',
    'Chapter 2',
  ]);
  await menu(page, 1);
  await page
    .getByRole('menu')
    .getByText('Restart Chapter Numbers at Each Part', { exact: true })
    .click();
  await expect(page.locator('.ch-num')).toHaveText([
    'Contents',
    'Part I',
    'Chapter 1',
    'Part II',
    'Chapter 1',
  ]);
  await expect(page.locator('.toc-list')).toContainText('Opening');
  await expect(page.locator('.toc-list')).toContainText('Closing');
  await gapMenu(page, 3);
  await page.getByRole('menu').getByRole('menuitem', { name: 'Part', exact: true }).click();
  await expect(page.locator('.ch-num')).toHaveText([
    'Contents',
    'Part I',
    'Chapter 1',
    'Part II',
    'Part III',
    'Chapter 1',
  ]);
  await menu(page, 3);
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.ch-num')).toHaveText([
    'Contents',
    'Part I',
    'Chapter 1',
    'Part II',
    'Chapter 1',
  ]);
  await dragChapter(page, 3, 2);
  await expect(page.locator('.ch-num')).toHaveText([
    'Contents',
    'Part I',
    'Part II',
    'Chapter 1',
    'Chapter 2',
  ]);
  await menu(page, 1);
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.ch-num')).toHaveText([
    'Contents',
    'Part I',
    'Chapter 1',
    'Chapter 2',
  ]);
  await expect(page.locator('.toc-list')).toContainText('Part I');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.metadata.restartNumbering).toBe(true);
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual([
    'ch-1',
    'ch-4',
    'ch-3',
    'ch-5',
  ]);
  expect(saved.chapters[2].html).toBe(rich);
  expect(saved.chapters[3].html).toBe(bodies[4]);
  await page.reload();
  await c.driver.selectBook(c.title);
  await expect(page.locator('.ch-num')).toHaveText([
    'Contents',
    'Part I',
    'Chapter 1',
    'Chapter 2',
  ]);
  await expect(page.locator('.toc-list')).toContainText('Opening');
  await expect(page.locator('.toc-list')).toContainText('Closing');
});
