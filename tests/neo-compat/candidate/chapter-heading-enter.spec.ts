import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

test('[NEO-051-A] Leafloom: ordinary chapter-heading Enter commits by blur without moving selection into rich manuscript prose', async ({ page }) => {
  const html = '<p><b>Alpha.</b> <i>Rich tail.</i></p>';
  const c = await existingBook(page, {
    chapters: [html, '<p>Later.</p>'],
    metadata: { chapterTitles: { 'ch-1': 'Opening', 'ch-2': 'Later' } },
  });
  await c.driver.select(0, 0, 3);
  expect(await c.driver.caret()).toMatchObject({ chapter: 0, paragraph: 0, offset: 3 });
  const heading = page.locator('.ch-title').first();
  await heading.click();
  await heading.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = getSelection();
    if (!selection) throw new Error('Missing native heading selection');
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.type('X');
  await expect(heading).toHaveText('OpeningX');
  await heading.press('Enter');
  await expect(heading).not.toBeFocused();
  const observed = await heading.evaluate((element) => {
    const selection = getSelection();
    return {
      manuscriptFocused: Boolean(document.activeElement?.closest('.chapter-body')),
      headingSelection: Boolean(selection?.anchorNode && element.contains(selection.anchorNode)),
      offset: selection?.anchorOffset,
    };
  });
  expect(observed).toEqual({ manuscriptFocused: false, headingSelection: true, offset: 8 });
  await c.driver.expectParagraphs([['Alpha. Rich tail.'], ['Later.']]);
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.metadata.chapterTitles['ch-1']).toBe('OpeningX');
  expect(saved.chapters[0].html).toBe(html);
  expect(saved.chapters[1].html).toBe('<p>Later.</p>');
  await page.reload();
  await c.driver.selectBook(c.title);
  await expect(page.locator('.ch-title').first()).toHaveText('OpeningX');
  await c.driver.expectParagraphs([['Alpha. Rich tail.'], ['Later.']]);
});
