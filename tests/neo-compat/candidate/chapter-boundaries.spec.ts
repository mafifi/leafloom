import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

test('[NEO-076-A] Leafloom: empty first chapter Backspace focuses surviving story start and author Undo restores original order', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p></p>', '<p>Beta.</p>'] });
  await c.driver.select(0, 0, 0);
  await page.keyboard.press('Backspace');
  await c.driver.expectParagraphs([['Beta.']]);
  expect(await c.driver.caret()).toMatchObject({ chapter: 0, paragraph: 0, offset: 0 });
  await c.driver.undo();
  await c.driver.expectParagraphs([[''], ['Beta.']]);
  expect(await c.driver.caret()).toMatchObject({ chapter: 0, paragraph: 0, offset: 0 });
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1', 'ch-2']);
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([[''], ['Beta.']]);
});

test('[NEO-076-B] Leafloom: empty last chapter Backspace focuses previous story end and persists surviving chapter identity', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p><b>Alpha.</b></p>', '<p></p>'] });
  await c.driver.select(1, 0, 0);
  await page.keyboard.press('Backspace');
  await c.driver.expectParagraphs([['Alpha.']]);
  expect(await c.driver.caret()).toMatchObject({ chapter: 0, paragraph: 0, offset: 6 });
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1']);
  expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Alpha\.<\/(?:b|strong)>/);
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alpha.']]);
});

test('[NEO-077-A] Leafloom: chapter-start Backspace migrates inline flag, Darling and section owner without merging paragraph prose', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: [
      '<p><b>Alpha.</b></p>',
      '<p><i>beta.</i></p><p data-sec-id="section-two">Gamma <span class="ph-mark" data-sid="merge-note" contenteditable="false">⚑</span>.</p>',
    ],
    metadata: {
      chapterTitles: { 'ch-1': 'First', 'ch-2': 'Second' },
      chapterNotes: { 'ch-2': 'Chapter note' },
      sectionNotes: { 'ch-2': [{ id: 'section-two', text: 'Outline beat' }] },
    },
    stickies: [{ id: 'merge-note', chapterId: 'ch-2', text: 'Keep this note', resolved: false }],
    darlings: [
      {
        id: 'merge-darling',
        chapterId: 'ch-2',
        chapterLabel: 'Chapter 2',
        text: 'Gone.',
        html: '<i>Gone.</i>',
        date: '2026-10-01T10:00:00Z',
        anchorPrefix: 'beta.',
        anchorSuffix: '',
      },
    ],
  });
  await c.driver.select(1, 0, 0);
  await page.keyboard.press('Backspace');
  await c.driver.expectParagraphs([['Alpha.', 'beta.', 'Gamma ⚑.']]);
  expect(await c.driver.caret()).toMatchObject({ chapter: 0, paragraph: 1, offset: 0 });
  await expect(page.locator('.chapter-body [data-sid="merge-note"]')).toHaveCount(1);
  await c.driver.undo();
  await c.driver.expectParagraphs([['Alpha.'], ['beta.', 'Gamma ⚑.']]);
  await expect(page.locator('.chapter-body [data-sid="merge-note"]')).toHaveCount(1);
  await c.driver.shelf();
  const restored = await persistedBook(page, c.title, c.id);
  expect(restored.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1', 'ch-2']);
  expect(restored.metadata.chapterTitles).toEqual({ 'ch-1': 'First', 'ch-2': 'Second' });
  expect(restored.metadata.chapterNotes['ch-2']).toBe('Chapter note');
  expect(restored.metadata.sectionNotes['ch-2']).toEqual([
    { id: 'section-two', text: 'Outline beat' },
  ]);
  expect(restored.stickies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'merge-note', chapterId: 'ch-2', text: 'Keep this note' }),
    ]),
  );
  expect(restored.darlings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'merge-darling',
        chapterId: 'ch-2',
        chapterLabel: 'Chapter 2',
        text: 'Gone.',
        html: '<i>Gone.</i>',
        date: '2026-10-01T10:00:00Z',
        anchorPrefix: 'beta.',
        anchorSuffix: '',
      }),
    ]),
  );
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alpha.'], ['beta.', 'Gamma ⚑.']]);
  await c.driver.select(1, 0, 0);
  await page.keyboard.press('Backspace');
  await c.driver.expectParagraphs([['Alpha.', 'beta.', 'Gamma ⚑.']]);
  await c.driver.shelf();
  const merged = await persistedBook(page, c.title, c.id);
  expect(merged.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1']);
  expect(merged.stickies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'merge-note', chapterId: 'ch-1', text: 'Keep this note' }),
    ]),
  );
  expect(merged.darlings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'merge-darling', chapterId: 'ch-1', html: '<i>Gone.</i>' }),
    ]),
  );
  expect(merged.metadata.sectionNotes['ch-1']).toEqual([
    { id: 'section-two', text: 'Outline beat' },
  ]);
  expect(merged.metadata.sectionNotes['ch-2']).toBeUndefined();
  expect(merged.metadata.chapterTitles['ch-2']).toBeUndefined();
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alpha.', 'beta.', 'Gamma ⚑.']]);
  await expect(page.locator('.chapter-body p').nth(0).locator('b,strong')).toHaveText('Alpha.');
  await expect(page.locator('.chapter-body p').nth(1).locator('i,em')).toHaveText('beta.');
});

test('[NEO-078-A] Leafloom: nonempty dedication blocks chapter-start Backspace from swallowing front page or marked story', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p>For everyone.</p>', '<p><i>Beta.</i></p>'],
    metadata: { chapterKinds: { 'ch-1': 'dedication' } },
  });
  await c.driver.select(1, 0, 0);
  await page.keyboard.press('Backspace');
  await c.driver.expectParagraphs([['For everyone.'], ['Beta.']]);
  expect(await c.driver.caret()).toMatchObject({ chapter: 1, paragraph: 0, offset: 0 });
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1', 'ch-2']);
  expect(saved.metadata.chapterKinds['ch-1']).toBe('dedication');
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['For everyone.'], ['Beta.']]);
});

test('[NEO-078-B] Leafloom: an empty dedication before story dissolves on native Backspace and Undo restores its kind and order', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p></p>', '<p><i>Beta.</i></p>'],
    metadata: { chapterKinds: { 'ch-1': 'dedication' }, chapterTitles: { 'ch-1': 'For friends' } },
  });
  await c.driver.select(1, 0, 0);
  await page.keyboard.press('Backspace');
  await c.driver.expectParagraphs([['Beta.']]);
  expect(await c.driver.caret()).toMatchObject({ chapter: 0, paragraph: 0, offset: 0 });
  await c.driver.undo();
  await c.driver.expectParagraphs([[''], ['Beta.']]);
  await c.driver.shelf();
  const restored = await persistedBook(page, c.title, c.id);
  expect(restored.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1', 'ch-2']);
  expect(restored.metadata.chapterKinds['ch-1']).toBe('dedication');
  expect(restored.metadata.chapterTitles['ch-1']).toBe('For friends');
  await c.driver.selectBook(c.title);
  await c.driver.select(1, 0, 0);
  await page.keyboard.press('Backspace');
  await c.driver.expectParagraphs([['Beta.']]);
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-2']);
  expect(saved.metadata.chapterKinds['ch-1']).toBeUndefined();
  // Original deleteChapterQuiet leaves an unreachable title; the production
  // transaction removes metadata belonging to the deleted chapter identity.
  if (process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference')
    expect(saved.metadata.chapterTitles['ch-1']).toBe('For friends');
  else expect(saved.metadata.chapterTitles['ch-1']).toBeUndefined();
  expect(saved.chapters[0].html).toMatch(/<(?:i|em)>Beta\.<\/(?:i|em)>/);
});

test('[NEO-078-C] Leafloom: an empty generated Contents page remains protected from chapter-start Backspace', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p></p>', '<p><i>Beta.</i></p>'],
    metadata: { chapterKinds: { 'ch-1': 'contents' } },
  });
  await c.driver.select(1, 0, 0);
  await page.keyboard.press('Backspace');
  expect(await c.driver.caret()).toMatchObject({ chapter: 1, paragraph: 0, offset: 0 });
  await expect(page.locator('.chapter-body').nth(1)).toHaveText('Beta.');
  await expect(page.locator('.chapter-body').nth(1).locator('i,em')).toHaveText('Beta.');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1', 'ch-2']);
  expect(saved.metadata.chapterKinds['ch-1']).toBe('contents');
  await c.driver.selectBook(c.title);
  await expect(page.locator('.chapter-body').nth(1)).toHaveText('Beta.');
});
