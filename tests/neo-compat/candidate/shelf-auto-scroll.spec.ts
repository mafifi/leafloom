import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedLibrary } from './storage-probe';

test('[NEO-010-B] Leafloom: holding a real cover drag at the bottom edge scrolls to the last shelf and preserves book identity and prose', async ({
  page,
}) => {
  const c = await existingBook(page);
  await c.driver.shelf();
  for (let i = 2; i <= 13; i++) {
    await page.locator('#add-shelf-btn').click();
    const label = page.locator('.shelf-label').last();
    await label.fill('Destination ' + i);
    await label.press('Enter');
    await expect
      .poll(async () => (await persistedLibrary(page)).shelves.at(-1).name)
      .toBe('Destination ' + i);
  }
  const scroll = page.locator('#bookshelf-view');
  await scroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  const cover = page.locator(`[data-book-id="${c.id}"]`);
  const box = await cover.boundingBox();
  if (!box) throw Error('Missing actual cover drag origin');
  const height = await page.evaluate(() => innerHeight);
  await page.mouse.move(box.x + 30, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 42, box.y + 52, { steps: 3 });
  await page.mouse.move(box.x + 42, height - 8, { steps: 20 });
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(50);
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeLessThan(2);
  const destination = page.locator('.shelf').last();
  const target = await destination.locator('.shelf-books').boundingBox();
  if (!target) throw Error('Missing last shelf drop target');
  await page.mouse.move(target.x + 25, target.y + 45, { steps: 10 });
  await page.mouse.move(target.x + 26, target.y + 45);
  await expect(destination.locator('.drop-indicator')).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(async () => (await persistedLibrary(page)).shelves.at(-1).bookIds)
    .toEqual([c.id]);
  await page.reload();
  await expect(page.locator('.shelf').last().locator(`[data-book-id="${c.id}"]`)).toBeVisible();
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alpha beta.', 'Gamma delta.']]);
});
