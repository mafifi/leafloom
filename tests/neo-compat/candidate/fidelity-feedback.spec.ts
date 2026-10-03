import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

test('[NEO-246-A] Leafloom: unsupported chapter explains protection while neighbouring writing and exact bytes survive reopen', async ({
  page,
}) => {
  const protectedHTML = '<p style="color:rebeccapurple">Protected <b>author</b> text.</p>';
  const c = await existingBook(page, {
    chapters: [protectedHTML, '<p>Editable <i>neighbour</i>.</p>'],
  });
  const chapter = page.locator('.chapter').first();
  await expect(chapter.getByRole('note')).toContainText('preserve');
  await expect(chapter.getByRole('note')).toContainText('export');
  await expect(chapter.locator('.chapter-body [contenteditable="true"]')).toHaveCount(0);
  await c.driver.select(1, 0, 19);
  await page.keyboard.type(' Continued.');
  await expect(page.locator('.chapter-body').nth(1)).toContainText(
    'Editable neighbour. Continued.',
  );
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title);
  expect(saved.chapters[0].html).toBe(protectedHTML);
  expect(saved.chapters[1].html).toContain('<i>neighbour</i>');
  await c.driver.selectBook(c.title);
  await expect(page.locator('.chapter').first().getByRole('note')).toBeVisible();
  await expect(page.locator('.chapter-body').nth(1)).toContainText(' Continued.');
});
