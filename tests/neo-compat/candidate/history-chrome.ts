import { expect, type Page } from '@playwright/test';
/** Reach the shipped footer by author keys, avoiding the source's separate native prose history. */
export async function focusHistoryChrome(page: Page) {
  for (let region = 0; region < 4; region++) {
    if (
      await page
        .locator('#bottombar')
        .evaluate((element) => element.contains(document.activeElement))
    )
      break;
    await page.keyboard.press('F6');
  }
  for (let step = 0; step < 20; step++) {
    if (
      await page.locator('#word-counter').evaluate((element) => element === document.activeElement)
    )
      break;
    await page.keyboard.press('Tab');
  }
  await expect(page.locator('#word-counter')).toBeFocused();
}
