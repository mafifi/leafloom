import type { Page } from '@playwright/test';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
import { clickReferenceMenu } from '../reference/harness';
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

// Chromium's trusted keyboard delivery lets one physical key carry another
// layout's character without changing the operator's system keyboard layout.
async function layoutKey(page: Page, key: string, code: string, virtualKey: number, shift = false) {
  const input = await page.context().newCDPSession(page);
  try {
    for (const type of ['keyDown', 'keyUp'])
      await input.send('Input.dispatchKeyEvent', {
        type,
        key,
        code,
        windowsVirtualKeyCode: virtualKey,
        nativeVirtualKeyCode: virtualKey,
        modifiers: shift ? 8 : 0,
      });
  } finally {
    await input.detach();
  }
}
async function motion(page: Page) {
  await expect(page.locator('body')).toHaveClass(/vim-nav/);
}
async function writing(page: Page) {
  await expect(page.locator('body')).not.toHaveClass(/vim-nav/);
}

for (const layout of [
  { name: 'Russian', right: 'д', insert: 'ш', text: 'Ж' },
  { name: 'Greek', right: 'λ', insert: 'ι', text: 'Ω' },
])
  test(`[NEO135-008-A] ${layout.name} physical motions and native inserted characters preserve rich author history and save`, async ({
    page,
  }) => {
    const c = await existingBook(page, {
      chapters: ['<p><b>Alpha beta.</b></p>'],
      library: { vimKeys: true },
    });
    await motion(page);
    await c.driver.select(0, 0, 0);
    await layoutKey(page, layout.right, 'KeyL', 76);
    await expect.poll(() => c.driver.caret()).toMatchObject({ offset: 1, collapsed: true });
    await layoutKey(page, layout.insert, 'KeyI', 73);
    await writing(page);
    await page.keyboard.type(layout.text);
    await c.driver.expectParagraphs([[`A${layout.text}lpha beta.`]]);
    await page.keyboard.press('Escape');
    await motion(page);
    expect(await c.driver.caret()).toMatchObject({ offset: 2, collapsed: true });
    await c.driver.undo();
    await c.driver.expectParagraphs([['Alpha beta.']]);
    await c.driver.redo();
    await c.driver.expectParagraphs([[`A${layout.text}lpha beta.`]]);
    await c.driver.shelf();
    expect((await persistedBook(page, c.title, c.id)).chapters[0].html).toBe(
      `<p><b>A${layout.text}lpha beta.</b></p>`,
    );
    await page.reload();
    await c.driver.selectBook(c.title);
    await motion(page);
    await c.driver.expectParagraphs([[`A${layout.text}lpha beta.`]]);
  });

test('[NEO135-008-B] Actual keyboard reference includes Vim motions and repeat search only when enabled', async ({
  page,
}) => {
  await existingBook(page, { library: { vimKeys: false } });
  await page.keyboard.press(`${mod}+/`);
  const dialog = page.getByRole('dialog', { name: /Keyboard shortcuts/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText('Vim keys');
  await page.keyboard.press('Escape');
  if (process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference')
    await clickReferenceMenu(page, ['View', 'Vim Keys']);
  else {
    await page.locator('#format-menu').click();
    await page.getByRole('menuitem', { name: 'Vim mode', exact: true }).click();
  }
  await page.keyboard.press(`${mod}+/`);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Vim keys');
  await expect(dialog.locator('kbd').filter({ hasText: /^n N$/ })).toHaveCount(1);
  await expect(dialog).toContainText('Next or previous match');
  await page.keyboard.press('Escape');
});

for (const visit of [false, true])
  test(`[NEO135-028-A] Find Escape restores ${visit ? 'last visited match' : 'original caret'} and accepts native writing`, async ({
    page,
  }) => {
    const c = await existingBook(page, { chapters: ['<p><i>Alpha beta Alpha.</i></p>'] });
    await c.driver.select(0, 0, 6);
    await page.keyboard.press(`${mod}+f`);
    await expect(page.locator('#search-input')).toBeFocused();
    await page.locator('#search-input').fill(visit ? 'Alpha' : 'Missing');
    await expect(page.locator('#search-count')).toHaveText(visit ? '2 found' : 'none');
    if (visit) {
      await page.locator('#search-input').press('Enter');
      await expect(page.locator('#search-count')).toHaveText('1 of 2');
    }
    await page.locator('#search-input').press('Escape');
    await expect(page.locator('#searchbar')).toBeHidden();
    await expect
      .poll(() => c.driver.caret())
      .toMatchObject({ chapter: 0, paragraph: 0, offset: visit ? 0 : 6, collapsed: true });
    await page.keyboard.type('X');
    const text = visit ? 'XAlpha beta Alpha.' : 'Alpha Xbeta Alpha.';
    await c.driver.expectParagraphs([[text]]);
    await c.driver.undo();
    await c.driver.expectParagraphs([['Alpha beta Alpha.']]);
    await c.driver.redo();
    await c.driver.shelf();
    expect((await persistedBook(page, c.title, c.id)).chapters[0].html).toBe(
      `<p><i>${text}</i></p>`,
    );
  });

test('[NEO135-028-B] Slash Find returns to motion and n N wrap counted matches across rich chapters without author history loss', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p><b>Alpha beta Alpha.</b></p>', '<p><i>Alpha gamma.</i></p>'],
    library: { vimKeys: true },
  });
  await c.driver.select(0, 0, 0);
  await motion(page);
  await page.keyboard.press('/');
  await expect(page.locator('#search-input')).toBeFocused();
  await page.locator('#search-input').fill('Alpha');
  await expect(page.locator('#search-count')).toHaveText('3 found');
  await page.locator('#search-input').press('Enter');
  await expect(page.locator('#search-count')).toHaveText('1 of 3');
  await page.locator('#search-input').press('Escape');
  await motion(page);
  await expect
    .poll(() => c.driver.caret())
    .toMatchObject({ chapter: 0, offset: 0, collapsed: true });
  for (const [key, chapter, offset] of [
    ['n', 0, 11],
    ['n', 1, 0],
    ['n', 0, 0],
    ['Shift+n', 1, 0],
  ] as const) {
    await page.keyboard.press(key);
    await expect.poll(() => c.driver.caret()).toMatchObject({ chapter, offset, collapsed: true });
  }
  await page.keyboard.press('2');
  await page.keyboard.press('n');
  await expect.poll(() => c.driver.caret()).toMatchObject({ chapter: 0, offset: 11 });
  // Separate chapter editors cannot retain one visual anchor: crossing the
  // boundary lands at a collapsed match, as the reference editable check does.
  await page.keyboard.press('v');
  await page.keyboard.press('n');
  await expect.poll(() => c.driver.caret()).toMatchObject({ chapter: 1, offset: 0, collapsed: true });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+n');
  await expect.poll(() => c.driver.caret()).toMatchObject({ chapter: 0, offset: 11, collapsed: true });
  await page.keyboard.press('i');
  await page.keyboard.type('X');
  await c.driver.expectParagraphs([['Alpha beta XAlpha.'], ['Alpha gamma.']]);
  await c.driver.undo();
  await c.driver.expectParagraphs([['Alpha beta Alpha.'], ['Alpha gamma.']]);
  await c.driver.redo();
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters.map((chapter: { html: string }) => chapter.html)).toEqual([
    '<p><b>Alpha beta XAlpha.</b></p>',
    '<p><i>Alpha gamma.</i></p>',
  ]);
  await page.reload();
  await c.driver.selectBook(c.title);
  await motion(page);
  await c.driver.expectParagraphs([['Alpha beta XAlpha.'], ['Alpha gamma.']]);
});

test('[NEO135-029-A] Book and author tabs rest in motion while click and repeated Escape preserve the native caret', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p><b>Alpha beta.</b></p>'],
    notes: '<p><i>Notes.</i></p>',
    library: { vimKeys: true },
  });
  await motion(page);
  await c.driver.select(0, 0, 2);
  await page.keyboard.press('i');
  await writing(page);
  await c.driver.select(0, 0, 4);
  await writing(page);
  await page.keyboard.type('X');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await motion(page);
  expect(await c.driver.caret()).toMatchObject({ offset: 5, collapsed: true });
  await page.locator('.tab[data-tab="notes"]').click();
  await motion(page);
  await page.keyboard.press('i');
  await writing(page);
  await page.locator('.tab[data-tab="manuscript"]').click();
  await motion(page);
  await c.driver.undo();
  await c.driver.expectParagraphs([['Alpha beta.']]);
  await c.driver.redo();
  await c.driver.expectParagraphs([['AlphXa beta.']]);
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toBe('<p><b>AlphXa beta.</b></p>');
  expect(saved.notes).toBe('<p><i>Notes.</i></p>');
});

test('[NEO135-029-B] Windows Ctrl Page Down Up navigate real chapter caret and retain shared rich writing Undo Redo', async ({
  page,
}) => {
  // Platform is an initial environment fixture, before either application starts.
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' }),
  );
  const c = await existingBook(page, { chapters: ['<p><b>Alpha.</b></p>', '<p><i>Beta.</i></p>'] });
  await c.driver.select(0, 0, 0);
  await page.keyboard.type('X');
  await page.keyboard.press('Control+PageDown');
  await expect.poll(() => c.driver.caret()).toMatchObject({ chapter: 1, paragraph: 0, offset: 0 });
  await page.keyboard.type('Y');
  await c.driver.expectParagraphs([['XAlpha.'], ['YBeta.']]);
  await page.keyboard.press('Control+PageUp');
  await expect.poll(() => c.driver.caret()).toMatchObject({ chapter: 0, offset: 0 });
  await page.keyboard.press('Control+z');
  await c.driver.expectParagraphs([['XAlpha.'], ['Beta.']]);
  await page.keyboard.press('Control+z');
  await c.driver.expectParagraphs([['Alpha.'], ['Beta.']]);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await c.driver.expectParagraphs([['XAlpha.'], ['YBeta.']]);
  await c.driver.shelf();
  expect(
    (await persistedBook(page, c.title, c.id)).chapters.map(
      (chapter: { html: string }) => chapter.html,
    ),
  ).toEqual(['<p><b>XAlpha.</b></p>', '<p><i>YBeta.</i></p>']);
  await page.reload();
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['XAlpha.'], ['YBeta.']]);
});

test('[NEO135-008-C] Shifted physical digits dead keys and reverse visual Escape move without inserting text', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p><b>Alpha beta.</b></p>'],
    library: { vimKeys: true },
  });
  await c.driver.select(0, 0, 0);
  await motion(page);
  await layoutKey(page, '€', 'Digit4', 52, true);
  await expect.poll(() => c.driver.caret()).toMatchObject({ offset: 11, collapsed: true });
  await layoutKey(page, 'Dead', 'KeyH', 72);
  await expect.poll(() => c.driver.caret()).toMatchObject({ offset: 10, collapsed: true });
  await page.keyboard.press('v');
  await page.keyboard.press('h');
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('a');
  await page.keyboard.press('Escape');
  await motion(page);
  await expect.poll(() => c.driver.caret()).toMatchObject({ offset: 10, collapsed: true });
  await c.driver.expectParagraphs([['Alpha beta.']]);
  await c.driver.shelf();
  expect((await persistedBook(page, c.title, c.id)).chapters[0].html).toBe(
    '<p><b>Alpha beta.</b></p>',
  );
});

test('[NEO135-028-C] Vim repeats Notes matches with visual selection and wrap while manuscript and persisted rich Notes stay intact', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p>Alpha manuscript.</p>'],
    notes: '<p><i>Alpha beta Alpha.</i></p>',
    library: { vimKeys: true },
  });
  await page.locator('.tab[data-tab="notes"]').click();
  await motion(page);
  await page.keyboard.press('/');
  await expect(page.locator('#search-input')).toBeFocused();
  await page.locator('#search-input').fill('Alpha');
  await expect(page.locator('#search-count')).toHaveText('2 found');
  await page.locator('#search-input').press('Enter');
  await expect(page.locator('#search-count')).toHaveText('1 of 2');
  await page.locator('#search-input').press('Escape');
  await motion(page);
  await page.keyboard.press('v');
  await page.keyboard.press('n');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('Alpha beta ');
  await page.keyboard.press('Escape');
  await motion(page);
  await page.keyboard.press('n');
  await expect
    .poll(() =>
      page.evaluate(() => ({
        text: getSelection()?.focusNode?.textContent,
        offset: getSelection()?.focusOffset,
        collapsed: getSelection()?.isCollapsed,
      })),
    )
    .toEqual({ text: 'Alpha beta Alpha.', offset: 0, collapsed: true });
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.notes).toBe('<p><i>Alpha beta Alpha.</i></p>');
  expect(saved.chapters[0].html).toBe('<p>Alpha manuscript.</p>');
});
