import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

test('[NEO-079-A] Leafloom: ShiftTab removes zero one or two preceding em spaces and Tab inserts two without losing rich neighbours', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: [
      '<p><b>Alpha</b><i>tail.</i></p><p><b>Alpha\u2003</b><i>tail.</i></p><p><b>Alpha\u2003\u2003</b><i>tail.</i></p>',
    ],
  });
  for (const [paragraph, spaces] of [
    [0, 0],
    [1, 1],
    [2, 2],
  ] as const) {
    await c.driver.select(0, paragraph, 5 + spaces, 5 + spaces);
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.chapter-body p').nth(paragraph)).toHaveText('Alphatail.');
    await expect(page.locator('.chapter-body p').nth(paragraph).locator('b,strong')).toHaveText(
      'Alpha',
    );
    await expect(page.locator('.chapter-body p').nth(paragraph).locator('i,em')).toHaveText(
      'tail.',
    );
  }
  await c.driver.select(0, 2, 5, 5);
  await page.keyboard.press('Tab');
  await c.driver.expectParagraphs([['Alphatail.', 'Alphatail.', 'Alpha\u2003\u2003tail.']]);
  await expect(page.locator('.chapter-body p').nth(2).locator('i,em')).toHaveText('tail.');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toMatch(
    /<(?:b|strong)>Alpha<\/(?:b|strong)><(?:i|em)>tail\.<\/(?:i|em)>/,
  );
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alphatail.', 'Alphatail.', 'Alpha\u2003\u2003tail.']]);
});
