import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedLibrary } from './storage-probe';
import { clickReferenceMenu } from '../reference/harness';
import type { Page } from '@playwright/test';
async function toggle(page: Page) {
  if (process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference') await clickReferenceMenu(page, ['View', 'Brighter Interface']);
  else { await page.locator('#view-menu').click(); await page.getByRole('menuitemradio', { name: 'Brighter Interface', exact: true }).click(); }
}
const tab = async (page: Page, name: string) => page.locator(`.tab[data-tab="${name}"]`).click();
test('[NEO135-037-A] View brightness changes only its current tab group and both choices survive shelf and restart', async ({ page }) => {
  const ctx = await existingBook(page, { library: { uiBright: false }, chapters: ['<p><i>Writing stays.</i></p>'] });
  const body = page.locator('body');
  await expect(body).not.toHaveClass(/\bbright\b/);
  await tab(page, 'outline'); await expect(body).toHaveClass(/\bbright\b/);
  await toggle(page); await expect(body).not.toHaveClass(/\bbright\b/);
  for (const name of ['notes', 'darlings']) { await tab(page, name); await expect(body).not.toHaveClass(/\bbright\b/); }
  await tab(page, 'manuscript'); await toggle(page); await expect(body).toHaveClass(/\bbright\b/);
  await tab(page, 'outline'); await expect(body).not.toHaveClass(/\bbright\b/);
  await ctx.driver.shelf(); await expect(body).toHaveClass(/\bbright\b/);
  await expect.poll(async () => { const prefs = await persistedLibrary(page); return [prefs.uiBright, prefs.uiBrightAside]; }).toEqual([true, false]);
  await ctx.driver.restart(); await expect(body).toHaveClass(/\bbright\b/);
  for (const name of ['outline', 'notes', 'darlings']) { await tab(page, name); await expect(body).not.toHaveClass(/\bbright\b/); }
  await tab(page, 'manuscript'); await expect(body).toHaveClass(/\bbright\b/);
  await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText('Writing stays.');
});
