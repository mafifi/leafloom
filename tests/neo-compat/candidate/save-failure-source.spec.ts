import { chmod, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook, privateStorageRoot } from './storage-probe';

test('[NEO-247-A] Leafloom: actual denied prose write logs failure and retains original bytes and local writing until a successful background retry', async ({
  page,
}) => {
  const fixture = await existingBook(page);
  const reference = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
  const before = await persistedBook(page, fixture.title, fixture.id);
  const directory = reference ? path.join(before.directory, 'chapters') : before.directory;
  const file = reference
    ? path.join(directory, 'ch-1.html')
    : path.join(directory, 'manuscript.json');
  const original = await readFile(file);
  const log = path.join(
    privateStorageRoot(page),
    reference ? 'neo-errors.log' : 'leafloom-errors.log',
  );
  await chmod(directory, 0o555);
  await chmod(file, 0o444);
  try {
    await fixture.driver.select(0, 0, 11);
    await page.keyboard.type(' Failed writing remains.');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(() => readFile(log, 'utf8').catch(() => '')).not.toBe('');
    expect(await readFile(file)).toEqual(original);
    await fixture.driver.expectParagraphs([
      ['Alpha beta. Failed writing remains.', 'Gamma delta.'],
    ]);
    if (reference) await expect(page.locator('#hint')).toContainText('details were logged');
    else await expect(page.locator('.save-state')).toHaveText('Unsaved');
  } finally {
    await chmod(file, 0o644);
    await chmod(directory, 0o755);
  }
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect
    .poll(async () => (await persistedBook(page, fixture.title, fixture.id)).chapters[0].html)
    .toContain('Failed writing remains.');
  await fixture.driver.reopen();
  await fixture.driver.expectParagraphs([['Alpha beta. Failed writing remains.', 'Gamma delta.']]);
});
