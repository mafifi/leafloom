import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
for (const key of ['Enter', 'Shift+Enter'])
  test(`[NEO135-026-B] ${key} splits rich script dialogue semantically with native Undo and durable reopen`, async ({
    page,
  }) => {
    const c = await existingBook(page, {
      metadata: { format: 'screenplay' },
      chapters: [
        '<p class="sp-heading">INT. ROOM - DAY</p><p class="sp-dialogue"><i>Hello world.</i></p>',
      ],
    });
    await c.driver.select(0, 1, 6);
    await page.keyboard.press(key);
    await c.driver.expectParagraphs([['INT. ROOM - DAY', 'Hello ', 'world.']]);
    await expect(page.locator('.chapter-body p').nth(2)).toHaveClass(/sp-dialogue/);
    await expect(page.locator('.chapter-body p').nth(2).locator('i')).toHaveText('world.');
    await expect(page.locator('.chapter-body br')).toHaveCount(0);
    await page.keyboard.press(mod + '+z');
    await c.driver.expectParagraphs([['INT. ROOM - DAY', 'Hello world.']]);
    await page.keyboard.press(mod + '+Shift+z');
    await c.driver.expectParagraphs([['INT. ROOM - DAY', 'Hello ', 'world.']]);
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title, c.id);
    expect(saved.chapters[0].html).toContain('<i>world.</i>');
    expect(saved.chapters[0].html).not.toContain('<br');
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs([['INT. ROOM - DAY', 'Hello ', 'world.']]);
  });
test('[NEO135-027-B] Character hint dismisses on Escape renews after native typing and accepts on Right with rich history', async ({
  page,
}) => {
  const c = await existingBook(page, {
    metadata: { format: 'screenplay' },
    chapters: [
      '<p class="sp-heading">INT. ROOM - DAY</p><p class="sp-character">KIM</p><p class="sp-dialogue">Hello.</p><p class="sp-character"><b>K</b></p>',
    ],
  });
  await c.driver.select(0, 3, 1);
  const target = page.locator('.chapter-body p').nth(3);
  await expect(target).toHaveAttribute('data-ghost', 'IM');
  await page.keyboard.press('Escape');
  await expect(target).not.toHaveAttribute('data-ghost');
  await expect(page.locator('#editor-view')).toBeVisible();
  await page.keyboard.type('I');
  await expect(target).toHaveAttribute('data-ghost', 'M');
  await page.keyboard.press('ArrowRight');
  await expect(target).toHaveText('KIM');
  await expect(target.locator('b')).toHaveText('KIM');
  await page.keyboard.press(mod + '+z');
  await expect(target).toHaveText('K');
  await page.keyboard.press(mod + '+Shift+z');
  await expect(target).toHaveText('KIM');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toContain('<b>KIM</b>');
  expect(saved.chapters[0].html).not.toContain('data-ghost');
});
test('[NEO135-027-C] Heading Tab completes known location separator and time before semantic Enter', async ({
  page,
}) => {
  const c = await existingBook(page, {
    metadata: { format: 'screenplay' },
    chapters: ['<p class="sp-heading">INT. KITCHEN - NIGHT</p><p class="sp-action">INT</p>'],
  });
  await c.driver.select(0, 1, 3);
  await page.keyboard.press('Tab');
  await page.keyboard.type('KIT');
  const target = page.locator('.chapter-body p').nth(1);
  await expect(target).toHaveAttribute('data-ghost', 'CHEN');
  await page.keyboard.press('Tab');
  await expect(target).toHaveText('INT. KITCHEN');
  await page.keyboard.press('Tab');
  await page.keyboard.type('N');
  await expect(target).toHaveAttribute('data-ghost', 'IGHT');
  await page.keyboard.press('Enter');
  await c.driver.expectParagraphs([['INT. KITCHEN - NIGHT', 'INT. KITCHEN - NIGHT', '']]);
  expect(await page.locator('.chapter-body p').nth(2).evaluate(element => ['heading', 'character', 'paren', 'dialogue', 'transition', 'shot'].find(role => element.classList.contains('sp-' + role)) ?? 'action')).toBe('action');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).not.toContain('data-ghost');
  expect(saved.chapters[0].html).toContain('INT. KITCHEN - NIGHT');
});
test('[NEO135-033-B] CONT D follows repeated speech after action and disappears when the intervening action becomes a transition without saving presentation marks', async ({
  page,
}) => {
  const c = await existingBook(page, {
    metadata: { format: 'screenplay' },
    chapters: [
      '<p class="sp-heading">INT. ROOM - DAY</p><p class="sp-character">KIM</p><p class="sp-dialogue"><i>Hello.</i></p><p class="sp-action">Walk.</p><p class="sp-character">KIM</p><p class="sp-dialogue">Again.</p>',
    ],
  });
  const speaker = page.locator('.chapter-body p').nth(4);
  await expect(speaker).toHaveAttribute('data-contd', '');
  await expect(speaker).toHaveText('KIM');
  await c.driver.select(0, 3, 5);
  await page.keyboard.press(mod + '+6');
  await expect(speaker).not.toHaveAttribute('data-contd');
  await page.keyboard.press(mod + '+z');
  await expect(speaker).toHaveAttribute('data-contd', '');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).not.toContain('data-contd');
  expect(saved.chapters[0].html).toContain('<i>Hello.</i>');
  await c.driver.selectBook(c.title);
  await expect(page.locator('.chapter-body p').nth(4)).toHaveAttribute('data-contd', '');
});
test('[NEO135-030-B] Native opening parenthesis after dialogue becomes a parenthetical and Enter resumes dialogue through Undo Redo save and reopen', async ({
  page,
}) => {
  // Source scriptInput admits a parenthetical on the action line after a speech;
  // spEnter closes its punctuation and SP_AFTER returns the next line to dialogue.
  const c = await existingBook(page, {
    metadata: { format: 'screenplay' },
    chapters: [
      '<p class="sp-heading">INT. ROOM - DAY</p><p class="sp-character">KIM</p><p class="sp-dialogue"><i>Hello.</i></p><p class="sp-action"></p>',
    ],
  });
  await c.driver.select(0, 3, 0);
  await page.keyboard.type('(quietly');
  const parenthetical = page.locator('.chapter-body p').nth(3);
  await expect(parenthetical).toHaveClass(/sp-paren/);
  await expect(parenthetical).toHaveText('(quietly');
  await page.keyboard.press('Enter');
  await c.driver.expectParagraphs([['INT. ROOM - DAY', 'KIM', 'Hello.', '(quietly)', '']]);
  await expect(page.locator('.chapter-body p').nth(4)).toHaveClass(/sp-dialogue/);
  await expect.poll(() => c.driver.caret()).toMatchObject({
    chapter: 0, paragraph: 4, offset: 0, collapsed: true,
  });
  await page.keyboard.press(mod + '+z');
  await c.driver.expectParagraphs([['INT. ROOM - DAY', 'KIM', 'Hello.', '(quietly']]);
  await expect(parenthetical).toHaveClass(/sp-paren/);
  await page.keyboard.press(mod + '+Shift+z');
  await c.driver.expectParagraphs([['INT. ROOM - DAY', 'KIM', 'Hello.', '(quietly)', '']]);
  await expect(page.locator('.chapter-body p').nth(4)).toHaveClass(/sp-dialogue/);
  await page.keyboard.type('Again.');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toContain('<i>Hello.</i>');
  expect(saved.chapters[0].html).toContain('(quietly)');
  expect(saved.chapters[0].html).not.toMatch(/data-(?:ghost|contd|pg|fill)/);
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['INT. ROOM - DAY', 'KIM', 'Hello.', '(quietly)', 'Again.']]);
  await expect(page.locator('.chapter-body p').nth(3)).toHaveClass(/sp-paren/);
  await expect(page.locator('.chapter-body p').nth(4)).toHaveClass(/sp-dialogue/);
  await expect(page.locator('.chapter-body p').nth(2).locator('i')).toHaveText('Hello.');
});
