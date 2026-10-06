import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { privateStorageRoot, persistedBook, persistedLibrary } from './storage-probe';

for (const fault of ['complete temporary copy', 'missing library and spare copies']) {
  test(`[NEO135-013-C] Startup recovers the shelf after ${fault} and retains author chapters and notes`, async ({ page }) => {
    const c = await existingBook(page, {
      chapters: ['<p><b>Retained</b> author prose.</p>'],
      notes: '<p>Retained research note.</p>',
      library: { pageTheme: 'night', scriptContact: 'Retained contact' },
    });
    await c.driver.shelf();
    const file = path.join(privateStorageRoot(page), 'library.json');
    const original = await readFile(file, 'utf8');
    if (fault === 'complete temporary copy') {
      await writeFile(file + '.tmp', original);
      await writeFile(file, '{interrupted library');
    } else {
      for (const suffix of ['', '.tmp', '.bak']) await rm(file + suffix, { force: true });
    }
    await page.reload();
    await expect(page.locator('#firstrun')).toBeHidden();
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs([['Retained author prose.']]);
    await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText('Retained');
    const book = await persistedBook(page, c.title);
    expect(book.metadata.id).toBe(c.id);
    expect(book.notes).toBe('<p>Retained research note.</p>');
    const library = await persistedLibrary(page);
    expect(library.shelves.flatMap((s: { bookIds: string[] }) => s.bookIds)).toContain(c.id);
    if (fault === 'complete temporary copy') {
      expect(library.pageTheme).toBe('night');
      expect(library.scriptContact).toBe('Retained contact');
    }
  });
}
