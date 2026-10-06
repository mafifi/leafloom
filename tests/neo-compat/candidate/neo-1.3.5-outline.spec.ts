import { test, expect } from './author-fixture';
import type { Page } from '@playwright/test';
import { existingBook, type BookFixture } from './book-fixture';
import { persistedBook } from './storage-probe';
const outline = async (page: Page) => page.locator('.tab[data-tab="outline"]').click();
const manuscript = async (page: Page) => page.locator('.tab[data-tab="manuscript"]').click();
const undoKey = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';
async function point(page: Page, selector: string, offset = 0) {
  await page.locator(selector).evaluate((element, offset) => {
    (element as HTMLElement).focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), range = document.createRange();
    let node: Node | null, left = offset;
    while ((node = walker.nextNode())) {
      if (left <= (node.textContent ?? '').length) { range.setStart(node, left); break; }
      left -= (node.textContent ?? '').length;
    }
    if (!node) range.setStart(element, 0);
    range.collapse(true);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  }, offset);
}
const listFixture: BookFixture = {
  library: { outlineView: 'list' },
  chapters: ['<p>Opening prose.</p><p class="scene-break" data-sec-brk="sec-one">***</p><p class="ghost" data-sec-id="sec-one">First note</p><p class="scene-break" data-sec-brk="sec-two">***</p><p class="ghost" data-sec-id="sec-two">Second note</p>', '<p><i>Ending prose.</i></p>'],
  metadata: {
    chapterNotes: { 'ch-1': 'Opening', 'ch-2': 'Ending' },
    sectionNotes: { 'ch-1': [{ id: 'sec-one', text: 'First note' }, { id: 'sec-two', text: 'Second note' }] },
  },
};
for (const offset of [0, 4]) test(`[NEO135-036] Leafloom: section Enter at ${offset} inserts a chapter after its owner and Undo returns its outline caret`, async ({ page }) => {
  const ctx = await existingBook(page, listFixture);
  await outline(page);
  const selector = '.ol-section[data-sec-id="sec-one"] .ol-text';
  await point(page, selector, offset); await page.keyboard.press('Enter');
  await expect(page.locator('.ol-chapter .ol-text')).toHaveText(['Opening', '', 'Ending']);
  await expect(page.locator('.ol-chapter .ol-text').nth(1)).toBeFocused();
  await expect(page.locator('.ol-section[data-ch-id="ch-1"] .ol-text')).toHaveText(['First note', 'Second note']);
  await page.keyboard.press(undoKey);
  await expect(page.locator('.ol-chapter')).toHaveCount(2);
  await expect(page.locator(selector)).toBeFocused();
  await ctx.driver.reopen();
  const saved = await persistedBook(page, ctx.title);
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1', 'ch-2']);
  expect(saved.chapters[1].html).toContain('<i>Ending prose.</i>');
});
test('[NEO135-023] Leafloom: Tab on a section creates the next section and persists its new note identity', async ({ page }) => {
  const ctx = await existingBook(page, listFixture);
  await outline(page); await point(page, '.ol-section[data-sec-id="sec-one"] .ol-text', 4);
  await page.keyboard.press('Tab');
  await expect(page.locator('.ol-section .ol-text')).toHaveText(['First note', '', 'Second note']);
  const focused = page.locator('.ol-section .ol-text').nth(1);
  await expect(focused).toBeFocused();
  const newId = await focused.evaluate((node) => node.parentElement!.getAttribute('data-sec-id'));
  expect(newId).toBeTruthy(); expect(newId).not.toBe('sec-one');
  await page.keyboard.type('Authored new plan');
  await ctx.driver.reopen(); await outline(page);
  await expect(page.locator(`.ol-section[data-sec-id="${newId}"] .ol-text`)).toHaveText('Authored new plan');
  const saved = await persistedBook(page, ctx.title);
  expect(saved.metadata.sectionNotes['ch-1']).toEqual([
    { id: 'sec-one', text: 'First note' }, { id: newId, text: 'Authored new plan' }, { id: 'sec-two', text: 'Second note' },
  ]);
});
test('[NEO135-036] Leafloom: Tab joins an existing written chapter with rich prose, note ownership, Undo and disk persistence', async ({ page }) => {
  const ctx = await existingBook(page, listFixture);
  await outline(page); await point(page, '.ol-chapter[data-ch-id="ch-2"] .ol-text', 6);
  await page.keyboard.press('Tab');
  await expect(page.locator('.ol-chapter')).toHaveCount(1);
  await expect(page.locator('.ol-section .ol-text')).toHaveText(['First note', 'Second note', 'Ending']);
  const sectionId = await page.locator('.ol-section').last().getAttribute('data-sec-id');
  await manuscript(page);
  await expect(page.locator('.chapter-body')).toHaveCount(1);
  await expect(page.locator(`p[data-sec-id="${sectionId}"] i`)).toHaveText('Ending prose.');
  await outline(page); await point(page, `.ol-section[data-sec-id="${sectionId}"] .ol-text`, 0);
  await page.keyboard.press(undoKey);
  await expect(page.locator('.ol-chapter')).toHaveCount(2);
  await manuscript(page); await expect(page.locator('.chapter-body').nth(1).locator('i')).toHaveText('Ending prose.');
  await outline(page); await point(page, '.ol-chapter[data-ch-id="ch-2"] .ol-text', 6); await page.keyboard.press('Tab');
  await ctx.driver.reopen();
  const saved = await persistedBook(page, ctx.title);
  expect(saved.chapters).toHaveLength(1);
  expect(saved.chapters[0].html).toContain('<i>Ending prose.</i>');
  expect(saved.metadata.chapterNotes).not.toHaveProperty('ch-2');
  expect(saved.metadata.sectionNotes['ch-1'].map((note: { text: string }) => note.text)).toEqual(['First note', 'Second note', 'Ending']);
});
for (const written of [false, true]) test(`[NEO135-021] Leafloom: Shift Tab promotion ${written ? 'retains all following notes when one is written' : 'carries following planned notes in order'}`, async ({ page }) => {
  const ctx = await existingBook(page, {
    library: { outlineView: 'list' }, chapters: [
      '<p data-sec-id="sec-one"><i>Opening prose.</i></p><p class="scene-break">***</p><p ' +
      (written ? '' : 'class="ghost" ') + 'data-sec-id="sec-two">Second content.</p>',
    ], metadata: { chapterNotes: { 'ch-1': 'Opening' }, sectionNotes: { 'ch-1': [
      { id: 'sec-one', text: 'First note' }, { id: 'sec-two', text: 'Second note' }, { id: 'sec-three', text: 'Third note' },
    ] } },
  });
  await outline(page); await point(page, '.ol-section[data-sec-id="sec-one"] .ol-text', 4); await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.ol-chapter .ol-text')).toHaveText(['Opening', 'First note']);
  await expect(page.locator('.ol-section .ol-text')).toHaveText(['Second note', 'Third note']);
  const promotedId = await page.locator('.ol-chapter').nth(1).getAttribute('data-ch-id');
  const expectedOwner = written ? 'ch-1' : promotedId;
  await expect(page.locator(`.ol-section[data-ch-id="${expectedOwner}"]`)).toHaveCount(2);
  await manuscript(page); await expect(page.locator('.chapter-body').first().locator('i')).toHaveText('Opening prose.');
  if (written) await expect(page.locator('p[data-sec-id="sec-two"]:not(.ghost)')).toHaveText('Second content.');
  await ctx.driver.reopen(); const saved = await persistedBook(page, ctx.title);
  expect(saved.metadata.sectionNotes[expectedOwner!].map((note: { id: string }) => note.id)).toEqual(['sec-two', 'sec-three']);
  expect(saved.chapters[0].html).toContain('<i>Opening prose.</i>');
});
async function dropOnChapter(page: Page, sourceSelector: string, chapterId: string) {
  const source = await page.locator(sourceSelector).boundingBox(), target = await page.locator(`#outline-board .ob-cell[data-kind="chapter"][data-ch="${chapterId}"]`).boundingBox();
  if (!source || !target) throw Error('Outline card has no pointer bounds');
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 15, source.y + source.height / 2, { steps: 5 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 }); await page.mouse.up();
}
for (const sourceKind of ['chapter', 'section'] as const) test(`[NEO135-036] Leafloom: real ${sourceKind} card drop preserves rich writing, section notes and durable order`, async ({ page }) => {
  const ctx = await existingBook(page, {
    library: { outlineView: 'cards' }, chapters: [
      '<p>Receiver prose.</p>', '<p data-sec-id="sec-two"><b>Moved rich prose.</b></p>',
    ], metadata: { chapterNotes: { 'ch-1': 'Receiver', 'ch-2': 'Sender' }, sectionNotes: { 'ch-2': [{ id: 'sec-two', text: 'Moved note' }] } },
  });
  await outline(page);
  await dropOnChapter(page, `#outline-board .ob-cell[data-kind="${sourceKind}"][data-ch="ch-2"]`, 'ch-1');
  await manuscript(page);
  await expect(page.locator('.chapter-body').first().locator('b')).toHaveText('Moved rich prose.');
  await expect(page.locator('.chapter-body')).toHaveCount(sourceKind === 'chapter' ? 1 : 2);
  await ctx.driver.undo();
  await expect(page.locator('.chapter-body')).toHaveCount(2);
  await expect(page.locator('.chapter-body').first().locator('b')).toHaveCount(0);
  await expect(page.locator('.chapter-body').nth(1).locator('b')).toHaveText('Moved rich prose.');
  await outline(page);
  await dropOnChapter(page, `#outline-board .ob-cell[data-kind="${sourceKind}"][data-ch="ch-2"]`, 'ch-1');
  await ctx.driver.reopen(); const saved = await persistedBook(page, ctx.title);
  expect(saved.chapters[0].html).toContain('<b>Moved rich prose.</b>');
  expect(saved.metadata.sectionNotes['ch-1'].some((note: { id: string }) => note.id === 'sec-two')).toBe(true);
  if (sourceKind === 'chapter') expect(saved.chapters).toHaveLength(1);
  else expect(saved.chapters[1].html).not.toContain('Moved rich prose.');
});

test('[NEO135-021-B] Native Shift Tab promotion Undo restores rich writing, original note ownership and outline focus before durable promotion', async ({ page }) => {
  const ctx = await existingBook(page, { library: { outlineView: 'list' }, chapters: ['<p data-sec-id="a"><b>Written stays.</b></p><p class="scene-break" data-sec-brk="b">***</p><p class="ghost" data-sec-id="b">Second plan</p>'], metadata: { sectionNotes: { 'ch-1': [{ id: 'a', text: 'First plan' }, { id: 'b', text: 'Second plan' }, { id: 'c', text: 'Third plan' }] } } });
  await outline(page); await point(page, '.ol-section[data-sec-id="a"] .ol-text', 4); await page.keyboard.press('Shift+Tab');
  const promoted = await page.locator('.ol-chapter').nth(1).getAttribute('data-ch-id');
  await expect(page.locator(`.ol-section[data-ch-id="${promoted}"] .ol-text`)).toHaveText(['Second plan', 'Third plan']);
  await page.keyboard.press(undoKey); await expect(page.locator('.ol-chapter')).toHaveCount(1);
  await expect(page.locator('.ol-section[data-sec-id="a"] .ol-text')).toBeFocused();
  await expect(page.locator('.ol-section[data-ch-id="ch-1"] .ol-text')).toHaveText(['First plan', 'Second plan', 'Third plan']);
  await manuscript(page); await expect(page.locator('p[data-sec-id="a"] b,p[data-sec-id="a"] strong')).toHaveText('Written stays.');
  await outline(page); await point(page, '.ol-section[data-sec-id="a"] .ol-text', 4); await page.keyboard.press('Shift+Tab');
  const durableOwner = await page.locator('.ol-chapter').nth(1).getAttribute('data-ch-id');
  await ctx.driver.reopen(); const saved = await persistedBook(page, ctx.title);
  expect(saved.metadata.chapterNotes[durableOwner!]).toBe('First plan'); expect(saved.metadata.sectionNotes[durableOwner!].map((note: { id: string }) => note.id)).toEqual(['b', 'c']);
  expect(saved.metadata.sectionNotes['ch-1']).toEqual([]); expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Written stays\.<\/(?:b|strong)>/);
});
