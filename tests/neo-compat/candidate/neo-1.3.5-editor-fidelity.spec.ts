import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

// Geometry and native ranges are observed; all edits below come from author input.
test('[NEO135-007-A] Escape cancels an actual tab-name prompt and retains the open book and manuscript author caret', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p><b>Alpha beta.</b></p>'] });
  await c.driver.select(0, 0, 4);
  await page.locator('.tab[data-tab="notes"]').dblclick();
  const input = page.locator('.modal-backdrop input');
  await expect(input).toBeFocused();
  await input.fill('Discard this name');
  await input.press('Escape');
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await expect(page.locator('#editor-view')).toBeVisible();
  await page.locator('.tab[data-tab="manuscript"]').click();
  await expect
    .poll(() => c.driver.caret())
    .toMatchObject({ chapter: 0, offset: 4, collapsed: true });
  await page.keyboard.type('X');
  await c.driver.expectParagraphs([['AlphXa beta.']]);
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.metadata.tabNames.notes).toBe('Notes');
  expect(saved.chapters[0].html).toBe('<p><b>AlphXa beta.</b></p>');
});

test('[NEO135-009-B] Native single-word paragraphs count individually in book chapter and durable metadata', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p><b>One</b></p>', '<p><i>Later</i></p>'] });
  await c.driver.select(0, 0, 3);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Two');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Three');
  await c.driver.expectParagraphs([['One', 'Two', 'Three'], ['Later']]);
  await expect(page.locator('#word-counter')).toHaveText('4 words');
  await page.locator('#word-counter').click();
  await expect(page.locator('#word-counter')).toHaveText('ch. 1: 3 words');
  await c.driver.shelf();
  expect((await persistedBook(page, c.title, c.id)).metadata.wordCount).toBe(4);
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['One', 'Two', 'Three'], ['Later']]);
});

test('[NEO135-010-A] Native word double-click keeps one selected count after deferred counters and preserves rich replacement history', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p><b>Alpha</b> <i>Beta</i> gamma.</p>'] });
  await page.locator('.chapter-body i').dblclick();
  expect((await page.evaluate(() => getSelection()?.toString()))?.trim()).toBe('Beta');
  await expect(page.locator('#word-counter')).toHaveText('1 selected');
  // A following native selection event must not let the deferred chapter count
  // overwrite the result of the second click.
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('#word-counter')).toHaveText('1 selected');
  await page.locator('.chapter-body i').dblclick();
  await page.keyboard.type('X');
  await expect(page.locator('#word-counter')).toHaveText('3 words');
  await c.driver.undo();
  await c.driver.expectParagraphs([['Alpha Beta gamma.']]);
  await c.driver.redo();
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toContain('<i>X');
  expect(saved.chapters[0].html).not.toMatch(/selected|selection/);
});

test('[NEO135-012-A] Native double Enter in justified rich prose centers the scene break and Undo restores both rich neighbors', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p style="text-align:justify"><b>Alpha</b> <i>beta gamma.</i></p>'],
  });
  await c.driver.select(0, 0, 6);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await c.driver.expectParagraphs([['Alpha ', '***', 'beta gamma.']]);
  const scene = page.locator('.chapter-body p.scene-break');
  await expect.poll(() => scene.evaluate((p) => getComputedStyle(p).textAlign)).toBe('center');
  expect(await scene.getAttribute('style')).toBeNull();
  await expect(page.locator('.chapter-body b')).toHaveText('Alpha');
  await expect(page.locator('.chapter-body i')).toHaveText('beta gamma.');
  await c.driver.undo();
  await c.driver.expectParagraphs([['Alpha beta gamma.']]);
  await c.driver.redo();
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toContain('<p class="scene-break">***</p>');
  await c.driver.selectBook(c.title);
  await expect.poll(() => scene.evaluate((p) => getComputedStyle(p).textAlign)).toBe('center');
});

test('[NEO135-015-A] Backspace below the leading blank removes only that line and retains chapter identity rich prose and Undo', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p><b>Previous chapter.</b></p>', '<p><br></p><p><i>Next chapter.</i></p>'],
  });
  await c.driver.select(1, 1, 0);
  await page.keyboard.press('Backspace');
  await c.driver.expectParagraphs([['Previous chapter.'], ['Next chapter.']]);
  expect(await c.driver.caret()).toMatchObject({ chapter: 1, paragraph: 0, offset: 0 });
  await expect(page.locator('.chapter-body').nth(1).locator('i')).toHaveText('Next chapter.');
  await c.driver.undo();
  await c.driver.expectParagraphs([['Previous chapter.'], ['', 'Next chapter.']]);
  await c.driver.redo();
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1', 'ch-2']);
  expect(saved.chapters.map((chapter: { html: string }) => chapter.html)).toEqual([
    '<p><b>Previous chapter.</b></p>',
    '<p><i>Next chapter.</i></p>',
  ]);
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Previous chapter.'], ['Next chapter.']]);
});

test('[NEO135-016-A] Trusted IME-marked Shift Enter makes a flush paragraph after one composed character with shared Undo and save', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p><b>Alpha.</b></p>'] });
  await c.driver.select(0, 0, 6);
  const input = await page.context().newCDPSession(page);
  try {
    await input.send('Input.imeSetComposition', { text: '日', selectionStart: 1, selectionEnd: 1 });
    await input.send('Input.insertText', { text: '日本' });
    // GNOME/IBus can mark a non-composing Enter with229. It is still Enter.
    await input.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 229,
      nativeVirtualKeyCode: 229,
      modifiers: 8,
    });
    await input.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 229,
      nativeVirtualKeyCode: 229,
      modifiers: 8,
    });
  } finally {
    await input.detach();
  }
  await c.driver.expectParagraphs([['Alpha.日本', '']]);
  await expect(page.locator('.chapter-body p').nth(1)).toHaveClass(/flush/);
  await page.keyboard.type('続く');
  await c.driver.expectParagraphs([['Alpha.日本', '続く']]);
  await c.driver.undo();
  // handleFlush's mid/end path uses native insertParagraph and leaves its
  // following writing in the same engine undo run; it takes no structure snapshot.
  await c.driver.expectParagraphs([['Alpha.日本']]);
  await c.driver.undo();
  await c.driver.expectParagraphs([['Alpha.']]);
  await c.driver.redo();
  await c.driver.redo();
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toContain('<b>Alpha.日本</b>');
  expect(saved.chapters[0].html).toContain('class="flush"');
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alpha.日本', '続く']]);
});

for (const place of ['above', 'below', 'margin'] as const)
  test(`[NEO135-016-B] Trusted blank page ${place} click places the native caret without rewriting rich prose`, async ({
    page,
  }) => {
    const c = await existingBook(page, { chapters: ['<p><b>Alpha beta.</b></p>'] });
    await c.driver.select(0, 0, 2, 7);
    const paragraph = page.locator('.chapter-body p');
    await paragraph.scrollIntoViewIfNeeded();
    const box = await paragraph.boundingBox();
    if (!box) throw Error('Missing rendered paragraph geometry');
    const chapter = await page.locator('.chapter').last().boundingBox();
    if (!chapter) throw Error('Missing chapter page');
    const x = place === 'margin' ? box.x - 25 : box.x + box.width / 2;
    const y =
      place === 'above'
        ? box.y - 12
        : place === 'below'
          ? box.y + box.height + 60
          : box.y + box.height / 2;
    await page.mouse.click(x, y);
    await expect
      .poll(() => c.driver.caret())
      .toMatchObject({ chapter: 0, offset: place === 'below' ? 11 : 0, collapsed: true });
    await c.driver.expectParagraphs([['Alpha beta.']]);
    await page.keyboard.type('X');
    await c.driver.expectParagraphs([[place === 'below' ? 'Alpha beta.X' : 'XAlpha beta.']]);
    await c.driver.shelf();
    expect((await persistedBook(page, c.title, c.id)).chapters[0].html).toContain('<b>');
  });

for (const [width, pageWidth] of [
  [1100, 680],
  [1600, 704],
  [2000, 760],
] as const)
  test(`[NEO135-022-A] Desktop${width} uses responsive page${pageWidth} with matching scroll and wake zones`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const c = await existingBook(page, { chapters: ['<p><i>Responsive author prose.</i></p>'] });
    const actual = await page.evaluate(() => {
      const bounds = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect();
      const page = bounds('#paper'),
        scroll = bounds('#paper-scroll'),
        wake = bounds('#nav-hotzone');
      return {
        page: page.width,
        scroll: scroll.width,
        center: page.left + page.width / 2,
        wake: wake.width,
      };
    });
    expect(actual.page).toBeCloseTo(pageWidth, 0);
    expect(actual.scroll).toBeCloseTo(pageWidth + 80, 0);
    expect(actual.center).toBeCloseTo(width / 2, 0);
    expect(actual.wake).toBeCloseTo(
      Math.max(18, Math.min(96, (width - actual.scroll) / 2 - 24)),
      0,
    );
    await c.driver.select(0, 0, 6);
    await page.keyboard.type('X');
    await c.driver.shelf();
    expect((await persistedBook(page, c.title, c.id)).chapters[0].html).toBe(
      '<p><i>ResponXsive author prose.</i></p>',
    );
  });

test('[NEO135-016-C] Trusted composition-carried native line-break input uses flush semantics without splitting the composed word', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p><b>Alpha.</b></p>'] });
  await c.driver.select(0, 0, 6);
  await page.evaluate(() => {
    const events: { trusted: boolean; composing: boolean; type: string }[] = [];
    Object.assign(window, { fidelityLineBreakEvents: events });
    document.addEventListener(
      'beforeinput',
      (event) => {
        const input = event as InputEvent;
        if (input.inputType === 'insertLineBreak')
          events.push({
            trusted: input.isTrusted,
            composing: input.isComposing,
            type: input.inputType,
          });
      },
      true,
    );
  });
  const input = await page.context().newCDPSession(page);
  try {
    await input.send('Input.imeSetComposition', {
      text: '日本',
      selectionStart: 2,
      selectionEnd: 2,
    });
    // The browser editing command models the line-break input carried past
    // keydown by an input method, while preserving Chromium's trusted events.
    await input.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      modifiers: 8,
      commands: ['insertLineBreak'],
    });
    await input.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      modifiers: 8,
    });
  } finally {
    await input.detach();
  }
  const events = await page.evaluate(() => Reflect.get(window, 'fidelityLineBreakEvents'));
  await test.info().attach('trusted-composition-line-break', {
    body: JSON.stringify(events),
    contentType: 'application/json',
  });
  expect(events).toContainEqual(
    expect.objectContaining({ trusted: true, type: 'insertLineBreak' }),
  );
  await c.driver.expectParagraphs([['Alpha.日本', '']]);
  await expect(page.locator('.chapter-body p').nth(1)).toHaveClass(/flush/);
  await page.keyboard.type('続く');
  await c.driver.expectParagraphs([['Alpha.日本', '続く']]);
  await c.driver.shelf();
  expect((await persistedBook(page, c.title, c.id)).chapters[0].html).toContain('Alpha.日本');
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alpha.日本', '続く']]);
});
