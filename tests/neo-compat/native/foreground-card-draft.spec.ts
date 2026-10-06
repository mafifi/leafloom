import { test, expect } from '../candidate/author-fixture';
import { existingBook } from '../candidate/book-fixture';
import { persistedBook } from '../candidate/storage-probe';
const tab = async (page: import('@playwright/test').Page, name: string) => page.locator(`.tab[data-tab="${name}"]`).click();
const boardFixture = { library: { outlineView: 'cards' }, chapters: ['<p><i>Opening prose.</i></p><p class="scene-break">***</p><p><b>Second section.</b></p>'] };
// Real visibility is mandatory. This headed browser qualification does not establish packaged Tauri foreground behavior.
test('[NEO135-032-F] Foreground browser qualification: a real tab background commits the open native card draft before durability', async ({ page }) => {
  const ctx = await existingBook(page, boardFixture); await tab(page, 'outline');
  await page.locator('#outline-board .ob-cell[data-kind="section"]').first().click();
  await page.locator('#outline-board .ob-cell.open .ob-text').fill('Background durable plan');
  const foreground = await page.context().newPage();
  try {
    await foreground.goto('about:blank'); await foreground.bringToFront();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
    await expect.poll(async () => (await persistedBook(page, ctx.title)).metadata.sectionNotes?.['ch-1']?.[0]?.text).toBe('Background durable plan');
  } finally { await page.bringToFront(); await foreground.close(); }
  await ctx.driver.reopen(); await tab(page, 'outline');
  await expect(page.locator('#outline-board .ob-cell[data-kind="section"] .ob-text').first()).toHaveText('Background durable plan');
  const saved = await persistedBook(page, ctx.title);
  expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Second section\.<\/(?:b|strong)>/);
  expect(saved.chapters[0].html).not.toContain('Background durable plan');
});
