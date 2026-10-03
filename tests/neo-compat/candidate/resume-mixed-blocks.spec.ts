import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
import type { Page } from '@playwright/test';

const original = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
const rich = '<h2>Heading</h2><p><b>Alpha.</b></p><pre><code>Code</code></pre><p><i>Gamma.</i></p>';
async function preserve(page: Page) {
  await expect(page.locator('.chapter-body h2')).toHaveText('Heading');
  await expect(page.locator('.chapter-body pre code')).toHaveText('Code');
  await expect(page.locator('.chapter-body p').first().locator('b,strong')).toHaveText('Alpha.');
  await expect(page.locator('.chapter-body p').last().locator('i,em')).toHaveText('Gamma.X');
}
for (const mode of ['reopen', 'remote'] as const) {
  test(`[NEO-${mode === 'reopen' ? '215-B' : '244-A'}] Leafloom: legacy paragraph index excludes heading and code blocks during ${mode} and preserves rich prose through new typing and durable reopen`, async ({
    page,
  }) => {
    const c = await existingBook(page, {
      chapters: [rich],
      metadata: {
        lastPosition: {
          chapterId: 'ch-1',
          pIdx: mode === 'reopen' ? 1 : 0,
          off: mode === 'reopen' ? 999 : 1,
          scroll: 0,
          at: Date.now() - 600000,
        },
      },
    });
    if (mode === 'remote') {
      await c.driver.select(0, 0, 1);
      const file = path.join(c.folder, original ? 'book.json' : 'manuscript.json');
      const raw = JSON.parse(await readFile(file, 'utf8'));
      const metadata = original ? raw : raw.metadata;
      metadata.lastPosition = { chapterId: 'ch-1', pIdx: 1, off: 999, scroll: 0, at: Date.now() };
      metadata.subtitle = 'Mixed block remote marker';
      await writeFile(file, JSON.stringify(raw));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.locator('#tp-subtitle')).toHaveText('Mixed block remote marker');
    }
    await expect
      .poll(() => c.driver.caret())
      .toMatchObject({ paragraph: 1, offset: 6, collapsed: true });
    await c.driver.type('X');
    await c.driver.expectParagraphs([['Alpha.', 'Gamma.X']]);
    await preserve(page);
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title, c.id);
    expect(saved.chapters[0].html).toBe(rich.replace('Gamma.', 'Gamma.X'));
    expect(saved.metadata.lastPosition.pIdx).toBe(1);
    expect(saved.metadata.id).toBe(c.id);
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs([['Alpha.', 'Gamma.X']]);
    await preserve(page);
  });
}
