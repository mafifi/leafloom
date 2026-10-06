import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
import { writingDay } from '../../../packages/authoring/src/progress';

test('[NEO135-002-B] Cutting below the day baseline resets today and counts new writing in full after reopen', async ({ page }) => {
  const day = writingDay(new Date(), 0);
  const text = 'One two three four five';
  const c = await existingBook(page, {
    chapters: [`<p>${text}</p>`],
    metadata: { dailyCounts: { [day]: { start: 5, end: 5 } }, wordCount: 5 },
    library: { dayEndsAt: 0 },
  });
  await expect(page.locator('#goal-counter')).toHaveText('0 today');
  await c.driver.select(0, 0, 0, text.length);
  await page.keyboard.press('Backspace');
  await expect(page.locator('#goal-counter')).toHaveText('0 today');
  await c.driver.type('One two');
  await expect(page.locator('#goal-counter')).toHaveText('2 today');
  await c.driver.reopen();
  await expect(page.locator('#goal-counter')).toHaveText('2 today');
  await c.driver.expectParagraphs([['One two']]);
  expect((await persistedBook(page, c.title)).metadata.dailyCounts).toEqual({
    [day]: { start: 0, end: 2 },
  });
});
