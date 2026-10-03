import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

test('[NEO-093-A] Leafloom: typing Undo retains the scene and outside-editor Undo restores the rich paragraph and author caret', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p>Alpha <i>beta.</i></p><p><b>Gamma.</b></p>'],
  });
  await c.driver.select(0, 0, 6);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await c.driver.expectParagraphs([['Alpha ', '***', 'beta.', 'Gamma.']]);
  await page.keyboard.type('X');
  await c.driver.expectParagraphs([['Alpha ', '***', 'Xbeta.', 'Gamma.']]);
  await c.driver.undo();
  await c.driver.expectParagraphs([['Alpha ', '***', 'beta.', 'Gamma.']]);
  await expect(page.locator('.chapter-body p.scene-break')).toHaveCount(1);
  await expect(page.locator('.chapter-body p').nth(2).locator('i,em')).toHaveText('beta.');
  // Quiet chrome deliberately returns mouse clicks to the page. Reach the
  // counter through the shipped keyboard regions and ordinary Tab traversal.
  for (let region = 0; region < 3; region++) await page.keyboard.press('F6');
  for (let step = 0; step < 20; step++) {
    if (
      await page.locator('#word-counter').evaluate((element) => element === document.activeElement)
    )
      break;
    await page.keyboard.press('Tab');
  }
  await expect(page.locator('#word-counter')).toBeFocused();
  await c.driver.undo();
  await c.driver.expectParagraphs([['Alpha beta.', 'Gamma.']]);
  await expect(page.locator('.chapter-body .scene-break')).toHaveCount(0);
  await expect(page.locator('.chapter-body p').first().locator('i,em')).toHaveText('beta.');
  await expect(page.locator('.chapter-body p').nth(1).locator('b,strong')).toHaveText('Gamma.');
  await expect.poll(() => c.driver.caret()).toMatchObject({ chapter: 0, paragraph: 0, offset: 6 });
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toMatch(/<(?:i|em)>beta\.<\/(?:i|em)>/);
  expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Gamma\.<\/(?:b|strong)>/);
  expect(saved.chapters[0].html).not.toContain('***');
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alpha beta.', 'Gamma.']]);
});
