import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook, persistedLibrary } from './storage-probe';
const tab = async (page: import('@playwright/test').Page, name: string) =>
  page.locator(`.tab[data-tab="${name}"]`).click();
async function openAside(page: import('@playwright/test').Page) {
  await page.locator('#side-hotzone').hover();
  await expect(page.locator('#side-pane')).toHaveClass(/open/);
  if ((await page.locator('#side-pin').getAttribute('aria-pressed')) !== 'true')
    await page.locator('#side-pin').click();
}
async function dragBefore(
  page: import('@playwright/test').Page,
  source: import('@playwright/test').Locator,
  receiver: import('@playwright/test').Locator,
) {
  const a = await source.boundingBox(),
    b = await receiver.boundingBox();
  if (!a || !b) throw Error('Real scene/card drag has no pointer bounds');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 15, a.y + a.height / 2, { steps: 5 });
  await page.mouse.move(b.x + b.width * 0.15, b.y + b.height / 2, { steps: 20 });
  await page.mouse.up();
}
const boardFixture = {
  library: { outlineView: 'cards' },
  chapters: [
    '<p><i>Opening prose.</i></p><p class="scene-break">***</p><p><b>Second section.</b></p>',
  ],
};
test('[NEO135-032-B] Real cards project actual sections and note editing retains the first line, rich writing and durable ownership', async ({
  page,
}) => {
  const ctx = await existingBook(page, boardFixture);
  await tab(page, 'outline');
  const card = page.locator(
    '#outline-board .ob-cell[data-kind="section"][data-ch="ch-1"][data-seg="1"]',
  );
  await expect(card.locator('.ob-text')).toHaveText('“Second section.”');
  await card.click();
  await expect(card).toHaveClass(/open/);
  await expect(card.locator('.ob-from')).toHaveText('“Second section.”');
  await card.locator('.ob-text').fill('Authored outline note');
  await page.keyboard.press('Enter');
  await expect(card).not.toHaveClass(/open/);
  await expect(card.locator('.ob-text')).toHaveText('Authored outline note');
  const id = await card.getAttribute('data-sec');
  expect(id).toBeTruthy();
  await tab(page, 'manuscript');
  await expect(page.locator(`p[data-sec-id="${id}"] b,p[data-sec-id="${id}"] strong`)).toHaveText(
    'Second section.',
  );
  await ctx.driver.reopen();
  const saved = await persistedBook(page, ctx.title);
  expect(saved.metadata.sectionNotes['ch-1']).toEqual([{ id, text: 'Authored outline note' }]);
  expect(saved.chapters[0].html).toContain('Second section.');
  expect(saved.chapters[0].html).not.toContain('Authored outline note');
  await tab(page, 'outline');
  await expect(page.locator(`.ob-cell[data-sec="${id}"] .ob-text`)).toHaveText(
    'Authored outline note',
  );
});
test('[NEO135-034-A] Card Enter, Tab and Shift Tab commit notes and visit the next existing card with the first prose visible', async ({
  page,
}) => {
  const ctx = await existingBook(page, boardFixture);
  await tab(page, 'outline');
  const chapter = page.locator('#outline-board .ob-cell[data-kind="chapter"]'),
    section = page.locator('#outline-board .ob-cell[data-kind="section"]');
  await chapter.focus();
  await page.keyboard.press('Enter');
  await expect(chapter.locator('.ob-from')).toHaveText('“Opening prose.”');
  await chapter.locator('.ob-text').fill('Opening plan');
  await page.keyboard.press('Tab');
  await expect(section).toHaveClass(/open/);
  await expect(section.locator('.ob-text')).toBeFocused();
  await expect(section.locator('.ob-from')).toHaveText('“Second section.”');
  await section.locator('.ob-text').fill('Second plan');
  await page.keyboard.press('Shift+Tab');
  await expect(chapter).toHaveClass(/open/);
  await expect(chapter.locator('.ob-text')).toHaveText('Opening plan');
  await page.keyboard.press('Enter');
  await expect(chapter).toBeFocused();
  await ctx.driver.reopen();
  const saved = await persistedBook(page, ctx.title);
  expect(saved.metadata.chapterNotes['ch-1']).toBe('Opening plan');
  expect(saved.metadata.sectionNotes['ch-1'][0].text).toBe('Second plan');
  expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Second section\.<\/(?:b|strong)>/);
});
for (const insertion of ['seam', 'alt', 'tool'] as const)
  test(`[NEO135-034-B] ${insertion} insertion puts a planned card between the chapter opening and following real section`, async ({
    page,
  }) => {
    const ctx = await existingBook(page, boardFixture);
    await tab(page, 'outline');
    const chapter = page.locator('#outline-board .ob-cell[data-kind="chapter"]');
    if (insertion === 'seam') {
      await chapter.hover();
      await chapter.getByRole('button', { name: 'New card after this one', exact: true }).click();
    } else if (insertion === 'alt') {
      await chapter.focus();
      await page.keyboard.press('Alt+Enter');
    } else {
      await chapter.click();
      await chapter.getByRole('button', { name: 'New card', exact: true }).click();
    }
    const fresh = page.locator('#outline-board .ob-cell[data-new="1"]');
    await expect(fresh.locator('.ob-text')).toBeFocused();
    await fresh.locator('.ob-text').fill('A planned bridge');
    await page.keyboard.press('Enter');
    await expect(page.locator('#outline-board .ob-cell[data-kind="section"]')).toHaveCount(2);
    await tab(page, 'manuscript');
    await ctx.driver.expectParagraphs([
      ['Opening prose.', '***', 'A planned bridge', '***', 'Second section.'],
    ]);
    await expect(page.locator('p.ghost')).toHaveText('A planned bridge');
    const id = await page.locator('p.ghost').getAttribute('data-sec-id');
    await ctx.driver.reopen();
    const saved = await persistedBook(page, ctx.title);
    expect(saved.metadata.sectionNotes['ch-1']).toEqual([{ id, text: 'A planned bridge' }]);
    expect(saved.chapters[0].html).toMatch(/<(?:i|em)>Opening prose\.<\/(?:i|em)>/);
    expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Second section\.<\/(?:b|strong)>/);
  });
test('[NEO135-034-C] Alt Enter on an empty new card creates the next chapter and board-end plus creates another chapter', async ({
  page,
}) => {
  const ctx = await existingBook(page, boardFixture);
  await tab(page, 'outline');
  await page.locator('#outline-board .ob-cell[data-kind="chapter"]').focus();
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.press('Alt+Enter');
  await expect(page.locator('#outline-board .ob-cell[data-kind="chapter"]')).toHaveCount(2);
  await expect(page.locator('.ob-cell.open .ob-text')).toBeFocused();
  await page.locator('.ob-cell.open .ob-text').fill('New chapter plan');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '+ Chapter', exact: true }).click();
  await expect(page.locator('#outline-board .ob-cell[data-kind="chapter"]')).toHaveCount(3);
  await page.locator('.ob-cell.open .ob-text').fill('Last plan');
  await page.keyboard.press('Enter');
  await ctx.driver.reopen();
  const saved = await persistedBook(page, ctx.title);
  expect(saved.chapters).toHaveLength(3);
  expect(saved.metadata.chapterNotes[saved.chapters[1].id]).toBe('New chapter plan');
  expect(saved.metadata.chapterNotes[saved.chapters[2].id]).toBe('Last plan');
  expect(saved.chapters[0].html).toContain('Second section.');
});
test('[NEO135-032-C] Walking notes follow real writing over a ghost and dismiss durably without becoming author prose', async ({
  page,
}) => {
  const ctx = await existingBook(page, {
    chapters: ['<p class="ghost" data-sec-id="planned">Planned words</p>'],
    metadata: { sectionNotes: { 'ch-1': [{ id: 'planned', text: 'Planned words' }] } },
  });
  await page.locator('p.ghost').click();
  await page.keyboard.type('Authored writing.');
  await expect(page.locator('.walk-note .wn-text')).toHaveText('Planned words');
  await expect(page.locator('.chapter-body')).toHaveText('Authored writing.');
  // Source placeWalkNote (app.js:8961): one note line immediately below the
  // author's paragraph, with reserved room rather than an overlay on prose.
  await expect
    .poll(() =>
      page.locator('p[data-walk]').evaluate((paragraph) => {
        const note = paragraph.closest('.chapter')!.querySelector<HTMLElement>('.walk-note')!;
        return (
          Math.round(
            (note.getBoundingClientRect().top - paragraph.getBoundingClientRect().bottom) * 10,
          ) / 10
        );
      }),
    )
    .toBeGreaterThanOrEqual(2);
  const placement = await page.locator('p[data-walk]').evaluate((paragraph) => {
    const note = paragraph.closest('.chapter')!.querySelector<HTMLElement>('.walk-note')!;
    return {
      gap: note.getBoundingClientRect().top - paragraph.getBoundingClientRect().bottom,
      room: parseFloat(getComputedStyle(paragraph).marginBottom),
      height: note.offsetHeight,
    };
  });
  expect(placement.gap).toBeLessThanOrEqual(4);
  expect(placement.room).toBeGreaterThanOrEqual(placement.height + 7);

  await page.locator('.walk-note .wn-dismiss').click();
  await expect(page.locator('.walk-note')).toHaveCount(0);
  await ctx.driver.reopen();
  await page.locator('p[data-sec-id="planned"]').click();
  await expect(page.locator('.walk-note')).toHaveCount(0);
  const saved = await persistedBook(page, ctx.title);
  expect(saved.metadata.sectionNotes['ch-1'][0]).toMatchObject({
    id: 'planned',
    text: 'Planned words',
    dismissed: true,
  });
  expect(saved.chapters[0].html).toContain('Authored writing.');
  expect(saved.chapters[0].html).not.toMatch(/walk-note|data-walk|Dismiss|Planned words/);
});
test('[NEO135-032-D] Loose cards stay in the aside, card size and view persist, and all Outline surfaces hide on other tabs', async ({
  page,
}) => {
  const ctx = await existingBook(page, {
    ...boardFixture,
    metadata: { looseCards: [{ id: 'loose-one', text: 'Loose thought' }] },
  });
  await tab(page, 'outline');
  await openAside(page);
  await expect(page.locator('#loose-list .ob-text')).toHaveText('Loose thought');
  await page.locator('#loose-list .ob-cell').click();
  await page.locator('#loose-list .ob-text').fill('Revised loose thought');
  await page.keyboard.press('Enter');
  await page.locator('#zoom-out').click();
  await expect.poll(async () => (await persistedLibrary(page)).cardZoom).toBe(0.85);
  await page.locator('#outline-views button[data-view="list"]').click();
  await expect(page.locator('#outline-board')).toBeHidden();
  await expect(page.locator('#outline-list')).toBeVisible();
  await expect(page.locator('#loose-list')).toBeVisible();
  await ctx.driver.reopen();
  await tab(page, 'outline');
  await expect(page.locator('#outline-list')).toBeVisible();
  await expect(page.locator('#loose-list .ob-text')).toHaveText('Revised loose thought');
  expect((await persistedLibrary(page)).cardZoom).toBe(0.85);
  expect((await persistedLibrary(page)).outlineView).toBe('list');
  await page.locator('#outline-views button[data-view="cards"]').click();
  await expect
    .poll(() =>
      page
        .locator('#outline-board')
        .evaluate((element) => getComputedStyle(element).getPropertyValue('--cz').trim()),
    )
    .toBe('0.85');
  for (const name of ['notes', 'darlings']) {
    await tab(page, name);
    await expect(page.locator('#outline-board')).toBeHidden();
    await expect(page.locator('#outline-views')).toBeHidden();
    await expect(page.locator('#outline-board-hint')).toBeHidden();
    await expect(page.locator('#loose-list')).toBeHidden();
  }
});
test('[NEO135-033-A] Scene cards edit actual headings and owned notes while retaining cast, action and durable rich writing', async ({
  page,
}) => {
  const ctx = await existingBook(page, {
    metadata: { format: 'screenplay' },
    chapters: [
      '<p class="sp-heading">INT. ROOM - DAY</p><p class="sp-action"><i>First action.</i></p><p class="sp-character">ADA (V.O.)</p><p class="sp-dialogue">Hello.</p><p class="sp-heading">EXT. ROAD - NIGHT</p><p class="sp-action">Second action.</p>',
    ],
  });
  await tab(page, 'outline');
  await expect(page.locator('#outline-board')).toHaveClass(/script-board/);
  await expect(page.locator('#outline-views')).toBeHidden();
  const scene = page.locator('#outline-board .ob-cell[data-kind="scene"]').first();
  await expect(scene.locator('.ob-slug')).toHaveText('INT. ROOM - DAY');
  await expect(scene.locator('.ob-foot')).toHaveText('ADA');
  await scene.click();
  await expect(scene.locator('.ob-from')).toHaveText('“First action.”');
  await scene.locator('.ob-slug').fill('INT. HALL - DAY');
  await scene.locator('.ob-text').fill('Scene intention');
  await page.keyboard.press('Enter');
  await tab(page, 'manuscript');
  await expect(page.locator('.chapter-body p.sp-heading').first()).toHaveText('INT. HALL - DAY');
  await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText('First action.');
  await ctx.driver.reopen();
  const saved = await persistedBook(page, ctx.title);
  expect(saved.chapters[0].html).toContain('INT. HALL - DAY');
  expect(Object.values(saved.metadata.sceneNotes)).toContain('Scene intention');
  await tab(page, 'outline');
  await expect(
    page.locator('#outline-board .ob-cell[data-kind="scene"]').first().locator('.ob-text'),
  ).toHaveText('Scene intention');
});

test('[NEO135-033-B] Real scene-card and loose-card drops reorder rich scenes and create a note-owned scene with Undo and disk persistence', async ({
  page,
}) => {
  const ctx = await existingBook(page, {
    metadata: { format: 'screenplay', looseCards: [{ id: 'loose-scene', text: 'New scene idea' }] },
    chapters: [
      '<p class="sp-heading">INT. ROOM - DAY</p><p class="sp-action"><i>First action.</i></p><p class="sp-heading">EXT. ROAD - NIGHT</p><p class="sp-action"><b>Second action.</b></p>',
    ],
  });
  await tab(page, 'outline');
  const first = page
      .locator('.ob-cell[data-kind="scene"]')
      .filter({ has: page.locator('.ob-slug', { hasText: 'INT. ROOM - DAY' }) }),
    second = page
      .locator('.ob-cell[data-kind="scene"]')
      .filter({ has: page.locator('.ob-slug', { hasText: 'EXT. ROAD - NIGHT' }) });
  await dragBefore(page, second, first);
  await expect(page.locator('#outline-board .ob-slug')).toHaveText([
    'EXT. ROAD - NIGHT',
    'INT. ROOM - DAY',
  ]);
  await tab(page, 'manuscript');
  await ctx.driver.expectParagraphs([
    ['EXT. ROAD - NIGHT', 'Second action.', 'INT. ROOM - DAY', 'First action.'],
  ]);
  await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText('Second action.');
  await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText('First action.');
  await ctx.driver.undo();
  await ctx.driver.expectParagraphs([
    ['INT. ROOM - DAY', 'First action.', 'EXT. ROAD - NIGHT', 'Second action.'],
  ]);
  await tab(page, 'outline');
  await openAside(page);
  await dragBefore(page, page.locator('#loose-list .ob-cell[data-loose="loose-scene"]'), second);
  await expect(page.locator('#outline-board .ob-cell[data-kind="scene"]')).toHaveCount(3);
  await expect(
    page.locator('#outline-board .ob-cell[data-kind="scene"]').nth(1).locator('.ob-text'),
  ).toHaveText('New scene idea');
  await expect(page.locator('#loose-list .ob-cell')).toHaveCount(0);
  await ctx.driver.reopen();
  const saved = await persistedBook(page, ctx.title);
  expect(saved.metadata.looseCards).toEqual([]);
  expect(Object.values(saved.metadata.sceneNotes)).toContain('New scene idea');
  expect(saved.chapters[0].html).toContain('data-scene-id');
  expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Second action\.<\/(?:b|strong)>/);
  expect(saved.chapters[0].html).toMatch(/<(?:i|em)>First action\.<\/(?:i|em)>/);
});

test('[NEO135-033-C] Scene card eighths follow actual measured screenplay lines across a page break and reopen without saved layout', async ({
  page,
}) => {
  const firstScene =
    '<p class="sp-heading">INT. ROOM - DAY</p>' +
    Array.from({ length: 10 }, (_, n) => `<p class="sp-action">Action ${n}.</p>`).join('');
  const ctx = await existingBook(page, {
    metadata: { format: 'screenplay' },
    chapters: [
      firstScene +
        '<p class="sp-heading">EXT. ROAD - NIGHT</p><p class="sp-action"><i>Last action.</i></p>',
    ],
  });
  await tab(page, 'outline');
  await expect(page.locator('#outline-board .ob-cell[data-kind="scene"] .ob-words')).toHaveText([
    '3/8',
    '1/8',
  ]);
  await tab(page, 'manuscript');
  await ctx.driver.select(0, 10, 'Action 9.'.length);
  for (let n = 0; n < 20; n++) {
    await ctx.driver.key('Enter');
    await ctx.driver.type('Added action.');
  }
  await tab(page, 'outline');
  await expect(page.locator('#outline-board .ob-cell[data-kind="scene"] .ob-words')).toHaveText([
    '1 1/8',
    '1/8',
  ]);
  await ctx.driver.reopen();
  await tab(page, 'outline');
  await expect(page.locator('#outline-board .ob-cell[data-kind="scene"] .ob-words')).toHaveText([
    '1 1/8',
    '1/8',
  ]);
  const saved = await persistedBook(page, ctx.title);
  expect((saved.chapters[0].html.match(/Added action\./g) ?? []).length).toBe(20);
  expect(saved.chapters[0].html).toMatch(/<(?:i|em)>Last action\.<\/(?:i|em)>/);
  expect(saved.chapters[0].html).not.toMatch(/data-pg|data-fill|--fill|sp-measure|sp-continue/);
});
test('[NEO135-032-G] Real board pinch and zoom-control wheel share accumulated card steps and persist without changing manuscript zoom', async ({
  page,
}) => {
  const ctx = await existingBook(page, {
    ...boardFixture,
    library: { outlineView: 'cards', pageZoom: 1 },
  });
  await tab(page, 'outline');
  await page.locator('#outline-board').hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 25);
  await page.keyboard.up('Control');
  await page.locator('#zoom-control').hover();
  await page.mouse.wheel(0, 15);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect((await persistedLibrary(page)).cardZoom ?? 1).toBe(1);
  await page.mouse.wheel(0, 1);
  await expect.poll(async () => (await persistedLibrary(page)).cardZoom).toBe(0.85);
  await page.locator('#outline-board').hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -41);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await persistedLibrary(page)).cardZoom).toBe(1);
  await page.locator('#zoom-control').hover();
  await page.mouse.wheel(0, -41);
  await expect.poll(async () => (await persistedLibrary(page)).cardZoom).toBe(1.15);
  expect((await persistedLibrary(page)).pageZoom).toBe(1);
  await ctx.driver.reopen();
  await tab(page, 'outline');
  await expect
    .poll(() =>
      page
        .locator('#outline-board')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--cz').trim()),
    )
    .toBe('1.15');
  const saved = await persistedBook(page, ctx.title);
  expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Second section\.<\/(?:b|strong)>/);
});

test('[NEO135-034-D] Card Tab skips a full-line Part heading in both directions while retaining committed notes and rich writing', async ({
  page,
}) => {
  const ctx = await existingBook(page, {
    library: { outlineView: 'cards' },
    chapters: ['<p><i>First story.</i></p>', '<p>Journey</p>', '<p><b>Next story.</b></p>'],
    metadata: { chapterKinds: { 'ch-2': 'part' } },
  });
  await tab(page, 'outline');
  const first = page.locator('.ob-cell[data-kind="chapter"][data-ch="ch-1"]'),
    next = page.locator('.ob-cell[data-kind="chapter"][data-ch="ch-3"]'),
    part = page.locator('#outline-board .ob-part');
  await expect(part).toContainText('Journey');
  const a = await first.boundingBox(),
    p = await part.boundingBox(),
    b = await next.boundingBox();
  if (!a || !p || !b) throw Error('Part/card geometry missing');
  expect(p.y).toBeGreaterThan(a.y);
  expect(b.y).toBeGreaterThan(p.y);
  await first.click();
  await first.locator('.ob-text').fill('First plan');
  await page.keyboard.press('Tab');
  await expect(next.locator('.ob-text')).toBeFocused();
  await next.locator('.ob-text').fill('Next plan');
  await page.keyboard.press('Shift+Tab');
  await expect(first.locator('.ob-text')).toBeFocused();
  await expect(first.locator('.ob-text')).toHaveText('First plan');
  await page.keyboard.press('Enter');
  await ctx.driver.reopen();
  const saved = await persistedBook(page, ctx.title);
  expect(saved.metadata.chapterNotes).toMatchObject({ 'ch-1': 'First plan', 'ch-3': 'Next plan' });
  expect(saved.chapters[0].html).toMatch(/<(?:i|em)>First story\.<\/(?:i|em)>/);
  expect(saved.chapters[2].html).toMatch(/<(?:b|strong)>Next story\.<\/(?:b|strong)>/);
});
test('[NEO135-032-H] Go to a planned section selects its complete ghost for native replacement and preserves note ownership through Undo and reopen', async ({
  page,
}) => {
  const ctx = await existingBook(page, {
    library: { outlineView: 'cards' },
    chapters: [
      '<p><i>Opening prose.</i></p><p class="scene-break" data-sec-brk="planned">***</p><p class="ghost" data-sec-id="planned">Planned words</p>',
    ],
    metadata: { sectionNotes: { 'ch-1': [{ id: 'planned', text: 'Planned words' }] } },
  });
  await tab(page, 'outline');
  await page.locator('.ob-cell[data-sec="planned"]').click();
  await page
    .locator('.ob-cell.open')
    .getByRole('button', { name: 'Go to the page', exact: true })
    .click();
  await expect(page.locator('.chapter-body')).toBeVisible();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('Planned words');
  await page.keyboard.type('Written words.');
  await expect(page.locator('p[data-sec-id="planned"]')).toHaveText('Written words.');
  await expect(page.locator('p[data-sec-id="planned"]')).not.toHaveClass(/ghost/);
  await ctx.driver.undo();
  await expect(page.locator('p.ghost[data-sec-id="planned"]')).toHaveText('Planned words');
  await ctx.driver.redo();
  await expect(page.locator('p[data-sec-id="planned"]')).toHaveText('Written words.');
  await ctx.driver.reopen();
  const saved = await persistedBook(page, ctx.title);
  expect(saved.metadata.sectionNotes['ch-1']).toEqual([{ id: 'planned', text: 'Planned words' }]);
  expect(saved.chapters[0].html).toContain('data-sec-id="planned"');
  expect(saved.chapters[0].html).not.toContain('Planned words');
  expect(saved.chapters[0].html).toMatch(/<(?:i|em)>Opening prose\.<\/(?:i|em)>/);
});

test('[NEO135-032-I] Chapter cards wrap across rows on one shared mat and Parts begin a full new line', async ({
  page,
}) => {
  const first =
    '<p><i>Opening prose.</i></p>' +
    Array.from(
      { length: 8 },
      (_, index) => '<p class="scene-break">***</p><p><b>Section ' + index + '.</b></p>',
    ).join('');
  const c = await existingBook(page, {
    library: { outlineView: 'cards' },
    chapters: [first, '<p>Journey</p>', '<p><u>Next chapter.</u></p>'],
    metadata: { chapterKinds: { 'ch-2': 'part' } },
  });
  await tab(page, 'outline');
  const cells = page.locator('#outline-board .ob-cell[data-ch="ch-1"]');
  await expect(cells).toHaveCount(9);
  await cells.first().click();
  await cells.first().locator('.ob-text').fill('Opening intention');
  await page.keyboard.press('Enter');
  const mat = await cells.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        background: style.backgroundColor,
        first: element.classList.contains('first'),
        last: element.classList.contains('last'),
        left: style.borderTopLeftRadius,
        right: style.borderTopRightRadius,
      };
    }),
  );
  expect(new Set(mat.map((cell) => Math.round(cell.y))).size).toBeGreaterThan(1);
  expect(new Set(mat.map((cell) => cell.background)).size).toBe(1);
  expect(mat[0]!.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(mat.filter((cell) => cell.first)).toHaveLength(1);
  expect(mat.filter((cell) => cell.last)).toHaveLength(1);
  expect(mat[0]!.left).toBe('10px');
  expect(mat.at(-1)!.right).toBe('10px');
  for (const cell of mat.slice(1, -1)) {
    expect(cell.left).toBe('0px');
    expect(cell.right).toBe('0px');
  }
  for (let index = 1; index < mat.length; index++)
    if (Math.abs(mat[index]!.y - mat[index - 1]!.y) < 1)
      expect(mat[index]!.x - (mat[index - 1]!.x + mat[index - 1]!.width)).toBeCloseTo(0, 0);
  const board = await page.locator('#outline-board').boundingBox(),
    part = await page.locator('#outline-board .ob-part').boundingBox(),
    next = await page.locator('.ob-cell[data-ch="ch-3"]').boundingBox();
  if (!board || !part || !next) throw Error('Shared mat/Part geometry missing');
  expect(part.width).toBeCloseTo(board.width, 0);
  expect(part.y).toBeGreaterThan(Math.max(...mat.map((cell) => cell.y + cell.height)) - 1);
  expect(next.y).toBeGreaterThan(part.y + part.height - 1);
  await c.driver.reopen();
  const saved = await persistedBook(page, c.title);
  expect(saved.metadata.chapterNotes['ch-1']).toBe('Opening intention');
  expect(saved.chapters[0].html).toMatch(/<(?:i|em)>Opening prose\.<\/(?:i|em)>/);
  expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Section 7\.<\/(?:b|strong)>/);
  expect(saved.chapters[2].html).toContain('<u>Next chapter.</u>');
});
test('[NEO135-032-J] Editing an existing middle ghost synchronizes in place with rich neighbours, Undo and durable ownership', async ({
  page,
}) => {
  const c = await existingBook(page, {
    library: { outlineView: 'cards' },
    chapters: [
      '<p><i>Opening prose.</i></p><p class="scene-break" data-sec-brk="planned">***</p><p class="ghost" data-sec-id="planned">Old plan</p><p class="scene-break" data-sec-brk="written">***</p><p data-sec-id="written"><b>Written ending.</b></p>',
    ],
    metadata: {
      sectionNotes: {
        'ch-1': [
          { id: 'written', text: 'Written intention' },
          { id: 'planned', text: 'Old plan' },
        ],
      },
    },
  });
  const pids = await page
    .locator('.chapter-body p')
    .evaluateAll((paragraphs) => paragraphs.map((p) => p.getAttribute('data-pid')));
  await tab(page, 'outline');
  const card = page.locator('.ob-cell[data-sec="planned"]');
  await card.click();
  await card.locator('.ob-text').fill('Revised plan');
  await page.keyboard.press('Enter');
  await tab(page, 'manuscript');
  await c.driver.expectParagraphs([
    ['Opening prose.', '***', 'Revised plan', '***', 'Written ending.'],
  ]);
  await expect(page.locator('p.ghost[data-sec-id="planned"]')).toHaveText('Revised plan');
  expect(
    await page
      .locator('.chapter-body p')
      .evaluateAll((paragraphs) => paragraphs.map((p) => p.getAttribute('data-pid'))),
  ).toEqual(pids);
  await c.driver.undo();
  await c.driver.expectParagraphs([
    ['Opening prose.', '***', 'Old plan', '***', 'Written ending.'],
  ]);
  await c.driver.redo();
  await c.driver.expectParagraphs([
    ['Opening prose.', '***', 'Revised plan', '***', 'Written ending.'],
  ]);
  await c.driver.reopen();
  const saved = await persistedBook(page, c.title);
  expect(
    saved.metadata.sectionNotes['ch-1'].find((note: { id: string }) => note.id === 'planned').text,
  ).toBe('Revised plan');
  expect(saved.chapters[0].html.indexOf('Revised plan')).toBeLessThan(
    saved.chapters[0].html.indexOf('Written ending.'),
  );
  expect(saved.chapters[0].html).toMatch(/<(?:i|em)>Opening prose\.<\/(?:i|em)>/);
  expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Written ending\.<\/(?:b|strong)>/);
  await c.driver.expectParagraphs([
    ['Opening prose.', '***', 'Revised plan', '***', 'Written ending.'],
  ]);
});
