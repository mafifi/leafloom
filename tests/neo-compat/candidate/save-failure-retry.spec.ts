import { chmod, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook, privateStorageRoot } from './storage-probe';

test('[NEO-247-A] Leafloom: actual denied checkpoint stays Unsaved with original bytes and retries through the author Save command', async ({
  page,
}) => {
  const fixture = await existingBook(page);
  const initial = await persistedBook(page, fixture.title, fixture.id);
  const manuscript = path.join(initial.directory, 'manuscript.json');
  const before = await readFile(manuscript);
  // Remove creation permission on this private book directory. The real host
  // must fail its temporary-file write; no intercepted reply substitutes for it.
  await chmod(initial.directory, 0o555);
  try {
    await fixture.driver.select(0, 0, 11);
    await page.keyboard.type(' Retry preserves these words.');
    await expect(page.locator('.save-state')).toHaveText('Unsaved');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
    await expect(page.locator('#hint')).not.toHaveText('');
    expect(await readFile(manuscript)).toEqual(before);
    const records = (
      await readFile(path.join(privateStorageRoot(page), 'leafloom-errors.log'), 'utf8')
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(records).toContainEqual({
      source: 'host',
      code: 'UNEXPECTED_RUNTIME',
      at: expect.any(String),
    });
    expect(JSON.stringify(records)).not.toMatch(/Retry preserves|Alpha beta|manuscript|EACCES/);
    await expect(page.locator('.save-state')).toHaveText('Unsaved');
    await fixture.driver.expectParagraphs([
      ['Alpha beta. Retry preserves these words.', 'Gamma delta.'],
    ]);
  } finally {
    await chmod(initial.directory, 0o755);
  }
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await expect
    .poll(async () => (await persistedBook(page, fixture.title, fixture.id)).chapters[0].html)
    .toContain('Retry preserves these words.');
  await fixture.driver.reopen();
  await fixture.driver.expectParagraphs([
    ['Alpha beta. Retry preserves these words.', 'Gamma delta.'],
  ]);
});
