import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

// Catches a break gesture being grouped with later typing, or immediate Undo
// restoring paragraphs without their rich content, identity or native caret.
for (const presses of [2, 3] as const) {
  test(`[NEO-093-A] Leafloom: immediate Undo after ${presses === 2 ? 'double' : 'triple'} Enter restores the rich paragraph before any typing`, async ({
    page,
  }) => {
    const original = ['<p>Alpha <i>beta.</i></p><p><b>Gamma.</b></p>', '<p>Later.</p>'];
    const c = await existingBook(page, {
      chapters: original,
      metadata: {
        chapterTitles: { 'ch-1': 'Opening', 'ch-2': 'Later' },
        chapterNotes: { 'ch-1': 'Keep this note' },
      },
    });
    await c.driver.select(0, 0, 6);
    for (let index = 0; index < presses; index++) await page.keyboard.press('Enter');
    await c.driver.expectParagraphs(
      presses === 2
        ? [['Alpha ', '***', 'beta.', 'Gamma.'], ['Later.']]
        : [['Alpha '], ['beta.', 'Gamma.'], ['Later.']],
    );
    await c.driver.undo();
    if (presses === 3) {
      await c.driver.expectParagraphs([['Alpha ', '***', 'beta.', 'Gamma.'], ['Later.']]);
      await expect(
        page.locator('.chapter-body').first().locator('p').nth(2).locator('i,em'),
      ).toHaveText('beta.');
      expect(await c.driver.caret()).toMatchObject({
        chapter: 0,
        paragraph: 2,
        offset: 0,
        collapsed: true,
      });
      await c.driver.undo();
    }
    await c.driver.expectParagraphs([['Alpha beta.', 'Gamma.'], ['Later.']]);
    await expect(page.locator('.chapter-body .scene-break')).toHaveCount(0);
    await expect(page.locator('.chapter-body').first().locator('i,em')).toHaveText('beta.');
    await expect(page.locator('.chapter-body').first().locator('b,strong')).toHaveText('Gamma.');
    expect(await c.driver.caret()).toMatchObject({
      chapter: 0,
      paragraph: 0,
      offset: 6,
      collapsed: true,
    });
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title, c.id);
    expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1', 'ch-2']);
    expect(saved.chapters.map((chapter: { html: string }) => chapter.html)).toEqual(original);
    expect(saved.metadata.chapterTitles).toEqual({ 'ch-1': 'Opening', 'ch-2': 'Later' });
    expect(saved.metadata.chapterNotes).toEqual({ 'ch-1': 'Keep this note' });
    await page.reload();
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs([['Alpha beta.', 'Gamma.'], ['Later.']]);
  });
}
