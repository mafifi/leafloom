import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';

test('idle document polling preserves the author menu through a real host round trip', async ({ page }) => {
  const fixture = await existingBook(page);
  await fixture.driver.shelf();
  await page.locator('#author-chip').click();
  await expect(page.getByRole('menu')).toBeVisible();
  const polling = await page.waitForRequest(request =>
    request.url().endsWith('/__leafloom/host') &&
    request.method() === 'POST' &&
    request.postDataJSON()?.method === 'consumeDocumentChanges',
  );
  const response = await polling.response();
  expect(response?.ok()).toBe(true);
  await response!.finished();
  await expect(page.getByRole('menu')).toBeVisible({ timeout: 2_000 });
  await page.getByRole('menuitem', { name: 'New author…', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('textbox')).toBeFocused();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
});
