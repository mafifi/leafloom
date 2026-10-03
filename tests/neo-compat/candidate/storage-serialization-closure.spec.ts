import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook, privateStorageRoot } from './storage-probe';
const source = () => process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
test('[NEO-232-A] later writing survives an older completed durable write whose reply arrives late', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p><b>Initial.</b></p><p><i>Companion.</i></p>'],
    notes: '<p>Research stays.</p>',
  });
  let release = () => {},
    completed = false;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fixture = path.resolve(privateStorageRoot(page), '../..');
  if (source())
    await writeFile(
      path.join(fixture, '.neo-parity-host.json'),
      JSON.stringify({ ipcLog: true, ipcDelays: { 'chapter:write': { after: 1000 } } }),
    );
  else
    await page.route('**/__leafloom/host', async (route) => {
      const payload = route.request().postDataJSON();
      if (payload.method !== 'checkpoint' || completed) return route.continue();
      completed = true;
      const response = await route.fetch();
      await delayed;
      await route.fulfill({ response });
    });
  try {
    await c.driver.select(0, 0, 8);
    await page.keyboard.type(' Older');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect
      .poll(async () => (await persistedBook(page, c.title, c.id)).chapters[0].html)
      .toContain('Older');
    if (source())
      await writeFile(
        path.join(fixture, '.neo-parity-host.json'),
        JSON.stringify({ ipcLog: true }),
      );
    else expect(completed).toBe(true);
    await page.keyboard.type(' Newest');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    release();
    await expect
      .poll(async () => (await persistedBook(page, c.title, c.id)).chapters[0].html)
      .toContain('Older Newest');
    if (source())
      await expect
        .poll(async () => {
          const entries = JSON.parse(
            await readFile(path.join(fixture, 'intercepted-effects.json'), 'utf8'),
          );
          return entries.filter(
            (e: { type: string; payload?: { channel?: string } }) =>
              e.type === 'ipc-complete' && e.payload?.channel === 'chapter:write',
          ).length;
        })
        .toBeGreaterThanOrEqual(2);
    await c.driver.reopen();
    await c.driver.expectParagraphs([['Initial. Older Newest', 'Companion.']]);
    await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText(
      'Initial. Older Newest',
    );
    await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText('Companion.');
    const actual = await persistedBook(page, c.title, c.id);
    expect(actual.chapters).toHaveLength(1);
    expect(actual.notes).toBe('<p>Research stays.</p>');
    expect(actual.darlings).toEqual([]);
  } finally {
    release();
  }
});
