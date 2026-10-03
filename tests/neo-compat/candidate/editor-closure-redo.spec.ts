import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

// Deliberate unified-history enhancement; excluded from the original source
// configuration, which has no explicit structural Redo stack.
for (const presses of [2, 3] as const) {
  test(`[NEO-097-A] Leafloom enhancement: immediate structural Undo Redo replays ${presses === 2 ? 'scene' : 'chapter'} creation with its rich tail`, async ({
    page,
  }) => {
    const c = await existingBook(page, {
      chapters: ['<p>Alpha <i>beta.</i></p><p><b>Gamma.</b></p>', '<p>Later.</p>'],
    });
    await c.driver.select(0, 0, 6);
    for (let index = 0; index < presses; index++) await page.keyboard.press('Enter');
    const expected =
      presses === 2
        ? [['Alpha ', '***', 'beta.', 'Gamma.'], ['Later.']]
        : [['Alpha '], ['beta.', 'Gamma.'], ['Later.']];
    await c.driver.expectParagraphs(expected);
    await c.driver.undo();
    await c.driver.redo();
    await c.driver.expectParagraphs(expected);
    const tail = page.locator('.chapter-body').nth(presses === 2 ? 0 : 1);
    await expect(tail.locator('i,em')).toHaveText('beta.');
    await expect(tail.locator('b,strong')).toHaveText('Gamma.');
    expect(await c.driver.caret()).toMatchObject({
      chapter: presses === 2 ? 0 : 1,
      paragraph: presses === 2 ? 2 : 0,
      offset: 0,
      collapsed: true,
    });
    await c.driver.shelf();
    expect((await persistedBook(page, c.title, c.id)).chapters).toHaveLength(presses === 2 ? 2 : 3);
    await page.reload();
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs(expected);
  });
}
