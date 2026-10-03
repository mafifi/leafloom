import { chmod, readFile, rename, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook, privateStorageRoot } from './storage-probe';
const source = () => process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
for (const failure of ['unreadable', 'missing'] as const) {
  test(`[NEO-236-A] ${failure} incoming manuscript never clears rich writing and restoration resumes durable saves`, async ({
    page,
  }) => {
    const c = await existingBook(page, {
      chapters: [
        '<p><b>Original words.</b></p><p><i>Second paragraph.</i></p>',
        '<p>Other chapter.</p>',
      ],
      notes: '<p>Research preserved.</p>',
    });
    await c.driver.select(0, 0, 15);
    const before = await c.driver.paragraphs();
    const file = source()
      ? path.join(c.folder, 'chapters', 'ch-1.html')
      : path.join(c.folder, 'manuscript.json');
    const original = await readFile(file),
      held = file + '.private-test-held';
    const fixture = path.resolve(privateStorageRoot(page), '../..');
    if (source())
      await writeFile(
        path.join(fixture, '.neo-parity-host.json'),
        JSON.stringify({ ipcLog: true }),
      );
    if (failure === 'unreadable') {
      await chmod(file, 0);
      await utimes(file, new Date(), new Date());
    } else await rename(file, held);
    try {
      await expect(readFile(file)).rejects.toThrow();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      if (source())
        await expect
          .poll(async () => {
            const entries = JSON.parse(
              await readFile(path.join(fixture, 'intercepted-effects.json'), 'utf8'),
            );
            return entries.filter(
              (e: { type: string; payload?: { channel?: string } }) =>
                e.type === 'ipc-complete' && e.payload?.channel === 'chapter:read',
            ).length;
          })
          .toBeGreaterThan(0);
      else await expect(page.locator('.external-change')).toBeVisible();
      await c.driver.expectParagraphs(before);
      await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText(
        'Original words.',
      );
      await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText(
        'Second paragraph.',
      );
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await c.driver.expectParagraphs(before);
    } finally {
      if (failure === 'unreadable') await chmod(file, 0o644);
      else await rename(held, file);
    }
    expect(await readFile(file)).toEqual(original);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await c.driver.select(0, 0, 15);
    await page.keyboard.type(' Recovery.');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect
      .poll(async () => (await persistedBook(page, c.title, c.id)).chapters[0].html)
      .toContain('Recovery.');
    await c.driver.reopen();
    await c.driver.expectParagraphs([
      ['Original words. Recovery.', 'Second paragraph.'],
      ['Other chapter.'],
    ]);
    const actual = await persistedBook(page, c.title, c.id);
    expect(actual.notes).toBe('<p>Research preserved.</p>');
    expect(actual.darlings).toEqual([]);
    expect(actual.chapters).toHaveLength(2);
  });
}
