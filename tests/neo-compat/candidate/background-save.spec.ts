import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

test('[NEO-231-A] Leafloom: window blur flushes the last native typing before its pending autosave debounce and preserves reopen', async ({ page }) => {
  const c = await existingBook(page);
  await c.driver.select(0, 0, 11);
  await page.keyboard.type(' Blur-only words.');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(async () => (await persistedBook(page, c.title, c.id)).chapters[0].html, {
    timeout: 400, intervals: [10, 20, 40],
    message: 'Blur flush completes before the 500ms Leafloom / 800ms NEO deferred save',
  }).toContain('Blur-only words.');
  await c.driver.reopen();
  await c.driver.expectParagraphs([['Alpha beta. Blur-only words.', 'Gamma delta.']]);
});
