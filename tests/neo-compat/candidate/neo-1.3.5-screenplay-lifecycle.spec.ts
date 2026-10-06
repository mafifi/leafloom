import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook, persistedLibrary } from './storage-probe';
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
test('[NEO135-026-A] The real shelf New Script menu creates a script on its title page for a plotter and reopens the same authored file and card', async ({
  page,
}) => {
  const seed = await existingBook(page, {
    library: { writingStyle: 'plotter', tabDefaults: { notes: 'Research', outline: 'Plan' } },
    chapters: ['<p>Existing writing.</p>'],
  });
  await seed.driver.shelf();
  await page.locator('.new-book').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New Script', exact: true }).click();
  await expect(page.locator('#editor-view')).toBeVisible();
  await expect(page.locator('.tab[data-tab="manuscript"]')).toHaveClass(/active/);
  await expect(page.locator('#tp-title')).toBeFocused();
  await expect(page.locator('#tp-credit')).toHaveText('Written by');
  await expect(page.locator('.chapter-body')).toHaveCount(1);
  await expect(page.locator('.chapter-body')).toHaveText('');
  const title = 'New Script ' + test.info().testId.slice(-8);
  await page.keyboard.press(mod + '+a');
  await page.keyboard.type(title);
  await page.keyboard.press('Enter');
  await seed.driver.select(0, 0, 0);
  await page.keyboard.type('INT. ROOM - DAY');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Author action.');
  await seed.driver.shelf();
  const saved = await persistedBook(page, title);
  expect(saved.metadata).toMatchObject({
    format: 'screenplay',
    credit: 'Written by',
    author: 'Fixture Writer',
    tabNames: { notes: 'Research', outline: 'Outline' },
  });
  expect(saved.chapters).toHaveLength(1);
  expect(saved.chapters[0].html).toContain('Author action.');
  expect(saved.metadata.format).toBe('screenplay');
  const library = await persistedLibrary(page);
  expect(library.shelves[0].bookIds).toContain(saved.metadata.id);
  const tile = page.locator(`.book.script-tile[data-book-id="${saved.metadata.id}"]`);
  await expect(tile.locator('.st-title')).toHaveText(title);
  await expect(tile.locator('.st-author')).toHaveText('Fixture Writer');
  await expect(tile.locator('.st-brad')).toHaveCount(2);
  await tile.click();
  await seed.driver.expectParagraphs([['INT. ROOM - DAY', 'Author action.']]);
  await seed.driver.shelf();
  expect((await persistedBook(page, title)).metadata.id).toBe(saved.metadata.id);
});
test('[NEO135-026-E] Native scene navigation drag preserves rich scene identity and notes through Undo reopen and keyboard menu navigation', async ({
  page,
}) => {
  const c = await existingBook(page, {
    metadata: {
      format: 'screenplay',
      sceneNotes: { 'scene-one': 'First intention', 'scene-two': 'Second intention' },
    },
    chapters: [
      '<p class="sp-heading" data-scene-id="scene-one">INT. ROOM - DAY</p><p class="sp-action"><i>First action.</i></p><p class="sp-heading" data-scene-id="scene-two">EXT. ROAD - NIGHT</p><p class="sp-action"><b>Second action.</b></p>',
    ],
  });
  await c.driver.shelf();
  const before = await persistedBook(page, c.title, c.id);
  await c.driver.selectBook(c.title);
  await page.locator('#nav-hotzone').hover();
  const first = page.locator('#nav-list .sp-scene').filter({ hasText: 'INT. ROOM - DAY' }),
    second = page.locator('#nav-list .sp-scene').filter({ hasText: 'EXT. ROAD - NIGHT' });
  await second.dragTo(first, { targetPosition: { x: 20, y: 2 } });
  await c.driver.expectParagraphs([
    ['EXT. ROAD - NIGHT', 'Second action.', 'INT. ROOM - DAY', 'First action.'],
  ]);
  await c.driver.select(0, 0, 0);
  await page.keyboard.press(mod + '+z');
  await c.driver.expectParagraphs([
    ['INT. ROOM - DAY', 'First action.', 'EXT. ROAD - NIGHT', 'Second action.'],
  ]);
  await page.keyboard.press(mod + '+Shift+z');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.metadata.sceneNotes).toEqual(before.metadata.sceneNotes);
  expect(saved.chapters[0].html).toContain('<i>First action.</i>');
  expect(saved.chapters[0].html).toContain('<b>Second action.</b>');
  expect(saved.chapters[0].html).toContain('data-scene-id="scene-one"');
  expect(saved.chapters[0].html).toContain('data-scene-id="scene-two"');
  await c.driver.selectBook(c.title);
  await page.locator('.tab[data-tab="outline"]').click();
  const card = page.locator('.ob-cell[data-kind="scene"]').filter({ hasText: 'INT. ROOM - DAY' });
  await card.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Go to the page', exact: true }).click();
  await expect
    .poll(() => c.driver.caret())
    .toMatchObject({ chapter: 0, paragraph: 2, offset: 15, collapsed: true });
  await page.keyboard.type('X');
  await c.driver.expectParagraphs([
    ['EXT. ROAD - NIGHT', 'Second action.', 'INT. ROOM - DAYX', 'First action.'],
  ]);
});
test('[NEO135-027-F] Trusted clipboard copy from real Notes pastes multiline Fountain roles and emphasis into a script with durable author Undo', async ({
  page,
}) => {
  const notes =
    '<p>INT. ROOM - DAY</p><p></p><p>She waits - or listens.</p><p></p><p>KIM</p><p>(quietly)</p><p>**Hello.**</p>';
  const c = await existingBook(page, {
    metadata: { format: 'screenplay' },
    chapters: ['<p></p>'],
    notes,
  });
  await page.locator('.tab[data-tab="notes"]').click();
  await page.locator('#aux-editor .ProseMirror, #aux-editor[contenteditable="true"]').click();
  await page.keyboard.press(mod + '+a');
  await page.keyboard.press(mod + '+c');
  await page.locator('.tab[data-tab="manuscript"]').click();
  await c.driver.select(0, 0, 0);
  await page.keyboard.press(mod + '+v');
  await c.driver.expectParagraphs([
    ['INT. ROOM - DAY', 'She waits - or listens.', 'KIM', '(quietly)', 'Hello.'],
  ]);
  for (const [index, role] of [
    [0, 'heading'],
    [2, 'character'],
    [3, 'paren'],
    [4, 'dialogue'],
  ] as const)
    await expect(page.locator('.chapter-body p').nth(index)).toHaveClass(new RegExp('sp-' + role));
  await expect(page.locator('.chapter-body p').nth(4).locator('b,strong')).toHaveText('Hello.');
  await page.keyboard.press(mod + '+z');
  await c.driver.expectParagraphs([['']]);
  await page.keyboard.press(mod + '+Shift+z');
  await c.driver.expectParagraphs([
    ['INT. ROOM - DAY', 'She waits - or listens.', 'KIM', '(quietly)', 'Hello.'],
  ]);
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Hello\.<\/(?:b|strong)>/);
  expect(saved.chapters[0].html).toContain('She waits - or listens.');
  expect(saved.notes).toBe(notes);
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([
    ['INT. ROOM - DAY', 'She waits - or listens.', 'KIM', '(quietly)', 'Hello.'],
  ]);
});
