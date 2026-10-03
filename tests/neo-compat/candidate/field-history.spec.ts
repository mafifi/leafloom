import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
for (const field of ['book title', 'chapter heading'] as const) {
  test(`[NEO-093-A] Leafloom: ${field} native typing Undo and Redo preserve prior manuscript writing before metadata commit`, async ({
    page,
  }) => {
    const c = await existingBook(page, {
      chapters: ['<p>Alpha.</p>', '<p>Later.</p>'],
      metadata: { chapterTitles: { 'ch-1': 'Opening', 'ch-2': 'Later' } },
    });
    await c.driver.select(0, 0, 6);
    await page.keyboard.type(' Added.');
    await c.driver.expectParagraphs([['Alpha. Added.'], ['Later.']]);
    const target = page.locator(field === 'book title' ? '#tp-title' : '.ch-title').first();
    const original = field === 'book title' ? c.title : 'Opening';
    await target.click();
    await target.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = getSelection();
      if (!selection) throw new Error('Missing native field selection');
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.type('X');
    await expect(target).toHaveText(original + 'X');
    await page.keyboard.press(mod + '+z');
    await expect(target).toHaveText(original);
    await c.driver.expectParagraphs([['Alpha. Added.'], ['Later.']]);
    await page.keyboard.press(mod + '+Shift+z');
    await expect(target).toHaveText(original + 'X');
    await c.driver.expectParagraphs([['Alpha. Added.'], ['Later.']]);
    await target.press('Enter');
    await c.driver.shelf();
    const savedTitle = field === 'book title' ? c.title + 'X' : c.title;
    const saved = await persistedBook(page, savedTitle, c.id);
    expect(saved.metadata.title).toBe(savedTitle);
    expect(saved.metadata.chapterTitles['ch-1']).toBe(
      field === 'chapter heading' ? 'OpeningX' : 'Opening',
    );
    expect(saved.chapters[0].html).toContain('Alpha. Added.');
    await c.driver.selectBook(savedTitle);
    await c.driver.expectParagraphs([['Alpha. Added.'], ['Later.']]);
    await expect(
      page.locator(field === 'book title' ? '#tp-title' : '.ch-title').first(),
    ).toHaveText(original + 'X');
  });
}
