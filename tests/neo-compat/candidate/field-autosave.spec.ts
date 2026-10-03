import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
import type { Locator } from '@playwright/test';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
async function append(target: Locator) {
  await target.click();
  await target.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = getSelection();
    if (!selection) throw new Error('Missing native metadata field selection');
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await target.press('X');
}
for (const field of [
  { key: 'title', selector: '#tp-title', clause: '047' },
  { key: 'subtitle', selector: '#tp-subtitle', clause: '047' },
  { key: 'author', selector: '#tp-author', clause: '048' },
] as const) {
  test(`[NEO-${field.clause}-A] Leafloom: focused ${field.key} typing and native Undo Redo autosave actual metadata without blur or Enter`, async ({
    page,
  }) => {
    const c = await existingBook(page, {
      chapters: ['<p>Alpha.</p>', '<p>Later.</p>'],
      metadata: {
        subtitle: 'Subheading',
        author: 'Saved writer',
        chapterTitles: { 'ch-1': 'Opening' },
      },
    });
    await c.driver.select(0, 0, 6);
    await page.keyboard.type(' Added.');
    const target = page.locator(field.selector),
      original =
        field.key === 'title' ? c.title : field.key === 'subtitle' ? 'Subheading' : 'Saved writer';
    await append(target);
    await expect(target).toHaveText(original + 'X');
    const savedField = async (value: string) => {
      try {
        return (await persistedBook(page, field.key === 'title' ? value : c.title, c.id)).metadata[
          field.key
        ];
      } catch {
        return null;
      }
    };
    await expect.poll(() => savedField(original + 'X')).toBe(original + 'X');
    await expect(target).toBeFocused();
    await c.driver.expectParagraphs([['Alpha. Added.'], ['Later.']]);
    await page.keyboard.press(mod + '+z');
    await expect(target).toHaveText(original);
    await expect.poll(() => savedField(original)).toBe(original);
    await expect(target).toBeFocused();
    await c.driver.expectParagraphs([['Alpha. Added.'], ['Later.']]);
    await page.keyboard.press(mod + '+Shift+z');
    await expect(target).toHaveText(original + 'X');
    await expect.poll(() => savedField(original + 'X')).toBe(original + 'X');
    await expect(target).toBeFocused();
    await c.driver.expectParagraphs([['Alpha. Added.'], ['Later.']]);
    await c.driver.shelf();
    await c.driver.selectBook(field.key === 'title' ? original + 'X' : c.title);
    await expect(page.locator(field.selector)).toHaveText(original + 'X');
    await c.driver.expectParagraphs([['Alpha. Added.'], ['Later.']]);
  });
}

test('[NEO-051-A] Leafloom: a real metadata checkpoint retains the uncommitted focused chapter heading until author blur', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p>Alpha.</p>', '<p>Later.</p>'],
    metadata: { chapterTitles: { 'ch-1': 'Opening', 'ch-2': 'Later' } },
  });
  await append(page.locator('#tp-title'));
  const heading = page.locator('.ch-title').first();
  await append(heading);
  await expect(heading).toHaveText('OpeningX');
  await expect
    .poll(async () => {
      try {
        return (await persistedBook(page, c.title + 'X', c.id)).metadata.title;
      } catch {
        return null;
      }
    })
    .toBe(c.title + 'X');
  await expect(heading).toBeFocused();
  expect((await persistedBook(page, c.title + 'X', c.id)).metadata.chapterTitles['ch-1']).toBe(
    'Opening',
  );
  await heading.press('Enter');
  await expect
    .poll(
      async () => (await persistedBook(page, c.title + 'X', c.id)).metadata.chapterTitles['ch-1'],
    )
    .toBe('OpeningX');
  await c.driver.shelf();
  await c.driver.selectBook(c.title + 'X');
  await expect(page.locator('.ch-title').first()).toHaveText('OpeningX');
});
