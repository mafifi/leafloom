import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
for (const [label, cluster] of [['combining accent', 'e\u0301'], ['family ZWJ', '👨‍👩‍👧‍👦']] as const) {
  test(`[NEO-228-B] Leafloom: Vim x removes one ${label} grapheme and Undo Redo preserve rich prose and saved bytes`, async ({ page }) => {
    const c = await existingBook(page, { chapters: [`<p><b>${cluster}</b><i>tail.</i></p>`], library: { vimKeys: true } });
    await c.driver.select(0, 0, 0);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveClass(/vim-nav/);
    await page.keyboard.press('l');
    await expect.poll(() => c.driver.caret()).toMatchObject({ offset: cluster.length });
    await page.keyboard.press('h');
    await expect.poll(() => c.driver.caret()).toMatchObject({ offset: 0 });
    await page.keyboard.press('x');
    await c.driver.expectParagraphs([['tail.']]);
    await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText('tail.');
    await c.driver.undo();
    await c.driver.expectParagraphs([[cluster + 'tail.']]);
    await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText(cluster);
    await c.driver.redo();
    await c.driver.expectParagraphs([['tail.']]);
    await c.driver.shelf();
    await expect.poll(async () => (await persistedBook(page,c.title,c.id)).chapters[0].html).toMatch(/<(?:i|em)>tail\.<\/(?:i|em)>/);
    expect((await persistedBook(page,c.title,c.id)).chapters[0].html).not.toContain(cluster);
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs([['tail.']]);
  });
}
