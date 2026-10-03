import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
import { focusHistoryChrome } from './history-chrome';

async function drag(
  page: import('@playwright/test').Page,
  from: number,
  to: number,
  cancel = false,
) {
  const rows = page.locator('#nav-list .n-row');
  const source = await rows.nth(from).boundingBox(),
    target = await page.locator('#nav-list .nav-item').nth(to).boundingBox();
  if (!source || !target) throw Error('Missing mounted chapter drag rows');
  await page.mouse.move(source.x + 30, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 42, source.y + source.height / 2 + 5, { steps: 3 });
  const landing = target.y + target.height * (to > from ? 0.8 : 0.2);
  await page.mouse.move(target.x + 30, landing, { steps: 12 });
  await page.mouse.move(target.x + 31, landing);
  await expect(page.locator('.nav-drop-ind')).toBeVisible();
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}
for (const [from, to, want] of [
  [3, 1, ['ch-1', 'ch-4', 'ch-2', 'ch-3', 'ch-5']],
  [1, 3, ['ch-1', 'ch-3', 'ch-4', 'ch-2', 'ch-5']],
] as const) {
  test(`[NEO-061-A] Leafloom: actual chapter drag ${from} to ${to} preserves rich prose, identities and companions through Undo and reopen`, async ({
    page,
  }) => {
    const c = await existingBook(page, {
      chapters: [
        '<p>For a friend.</p>',
        '<p>Alpha <b>bold</b>.</p>',
        '<p>Part crossing.</p>',
        '<p><span class="ph-mark" data-sid="flag" contenteditable="false">⚑</span> Omega <i>italic</i>.</p>',
        '<p>Thanks to everyone.</p>',
      ],
      metadata: {
        chapterKinds: { 'ch-1': 'dedication', 'ch-3': 'part', 'ch-5': 'acknowledgments' },
        chapterNotes: { 'ch-4': 'Omega arc' },
      },
      stickies: [{ id: 'flag', chapterId: 'ch-4', text: 'Check arc', resolved: false }],
      darlings: [
        {
          id: 'saved',
          chapterId: 'ch-4',
          html: '<p>Saved <i>line</i>.</p>',
          text: 'Saved line.',
          date: '2026-10-02T10:00:00Z',
        },
      ],
    });
    await page.locator('#nav-hotzone').hover();
    await page.locator('#nav-pin').click();
    await drag(page, from, to);
    await expect
      .poll(() =>
        page
          .locator('#nav-list .nav-item')
          .evaluateAll((rows) =>
            rows.map((row) => (row as HTMLElement).dataset.chid ?? (row as HTMLElement).dataset.id),
          ),
      )
      .toEqual(want);
    await expect(page.locator('.nav-drop-ind')).toHaveCount(0);
    await focusHistoryChrome(page);
    await c.driver.undo();
    await expect
      .poll(() =>
        page
          .locator('#nav-list .nav-item')
          .evaluateAll((rows) =>
            rows.map((row) => (row as HTMLElement).dataset.chid ?? (row as HTMLElement).dataset.id),
          ),
      )
      .toEqual(['ch-1', 'ch-2', 'ch-3', 'ch-4', 'ch-5']);
    await drag(page, from, to);
    await drag(page, 1, 0, true);
    await expect
      .poll(() =>
        page
          .locator('#nav-list .nav-item')
          .evaluateAll((rows) =>
            rows.map((row) => (row as HTMLElement).dataset.chid ?? (row as HTMLElement).dataset.id),
          ),
      )
      .toEqual(want);
    await expect(page.locator('.nav-item.dragging')).toHaveCount(0);
    await page.locator('.tab[data-tab="outline"]').click();
    await expect
      .poll(() =>
        page
          .locator('.ol-chapter')
          .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.chId)),
      )
      .toEqual(want.filter((id) => id === 'ch-2' || id === 'ch-4'));
    await page.locator('.tab[data-tab="manuscript"]').click();
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title);
    expect(saved.chapters.map((row: { id: string }) => row.id)).toEqual(want);
    expect(saved.chapters.find((row: { id: string }) => row.id === 'ch-2')!.html).toBe(
      '<p>Alpha <b>bold</b>.</p>',
    );
    expect(saved.chapters.find((row: { id: string }) => row.id === 'ch-4')!.html).toContain(
      '<i>italic</i>',
    );
    expect(saved.metadata.chapterNotes['ch-4']).toBe('Omega arc');
    expect(saved.stickies[0]).toMatchObject({ id: 'flag', chapterId: 'ch-4', text: 'Check arc' });
    expect(saved.darlings[0]).toMatchObject({
      id: 'saved',
      chapterId: 'ch-4',
      html: '<p>Saved <i>line</i>.</p>',
    });
    await c.driver.selectBook(c.title);
    await expect
      .poll(() =>
        page
          .locator('#nav-list .nav-item')
          .evaluateAll((rows) =>
            rows.map((row) => (row as HTMLElement).dataset.chid ?? (row as HTMLElement).dataset.id),
          ),
      )
      .toEqual(want);
  });
}
test('[NEO-061-B] Leafloom: dragging titled chapters preserves the selected rich prose and Outline order', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p>Alpha <b>selected</b> prose.</p>', '<p>Omega <i>ending</i>.</p>'],
    metadata: {
      chapterTitles: { 'ch-1': 'Beginning', 'ch-2': 'Ending' },
      chapterNotes: { 'ch-1': 'Beginning arc', 'ch-2': 'Ending arc' },
    },
  });
  await c.driver.select(0, 0, 6, 14);
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('selected');
  await page.locator('#nav-hotzone').hover();
  await page.locator('#nav-pin').click();
  await drag(page, 1, 0);
  await page.locator('.tab[data-tab="outline"]').click();
  await expect(page.locator('.ol-chapter .ol-text')).toHaveText(['Ending arc', 'Beginning arc']);
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title);
  expect(saved.chapters.map((row: { id: string }) => row.id)).toEqual(['ch-2', 'ch-1']);
  expect(saved.chapters.map((row: { html: string }) => row.html)).toEqual([
    '<p>Omega <i>ending</i>.</p>',
    '<p>Alpha <b>selected</b> prose.</p>',
  ]);
  await c.driver.selectBook(c.title);
  await page.locator('.tab[data-tab="outline"]').click();
  await expect(page.locator('.ol-chapter .ol-text')).toHaveText(['Ending arc', 'Beginning arc']);
});
