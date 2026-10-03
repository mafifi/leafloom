import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedLibrary, privateStorageRoot } from './storage-probe';

test('[NEO-245-B] Leafloom: focus refresh adopts an external shelf rename and preserves exact nonzero scroll and shelf identity', async ({ page }) => {
  const c = await existingBook(page);
  await c.driver.shelf();
  for (let i = 2; i <= 10; i++) {
    await page.locator('#add-shelf-btn').click();
    const label = page.locator('.shelf-label').last();
    await expect(label).toBeFocused();
    await label.fill('Shelf ' + i);
    await label.press('Enter');
    await expect(label).not.toBeFocused();
    await expect.poll(async () => (await persistedLibrary(page)).shelves.at(-1).name).toBe('Shelf ' + i);
  }
  const shelf = page.locator('#bookshelf-view');
  await shelf.evaluate(el => { el.scrollTop = el.scrollHeight; });
  const scroll = await shelf.evaluate(el => el.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  const file = path.join(privateStorageRoot(page), 'library.json');
  const library = JSON.parse(await readFile(file, 'utf8'));
  const id = library.shelves.at(-1).id;
  library.shelves.at(-1).name = 'Remote final shelf é東京';
  await writeFile(file, JSON.stringify(library));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.shelf-label').last()).toHaveText('Remote final shelf é東京');
  expect(await shelf.evaluate(el => el.scrollTop)).toBe(scroll);
  expect((await persistedLibrary(page)).shelves.at(-1).id).toBe(id);
  await page.reload();
  await expect(page.locator('.shelf-label').last()).toHaveText('Remote final shelf é東京');
  expect((await persistedLibrary(page)).shelves.at(-1).id).toBe(id);
});
