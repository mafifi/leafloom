import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

function observedChapters(value: unknown): { id: string; html: string }[] {
  if (!Array.isArray(value)) throw Error('Expected persisted chapter array');
  return value.map((chapter: unknown) => {
    if (
      typeof chapter !== 'object' ||
      chapter === null ||
      !('id' in chapter) ||
      typeof chapter.id !== 'string' ||
      !('html' in chapter) ||
      typeof chapter.html !== 'string'
    )
      throw Error('Expected persisted chapter identity and HTML');
    return { id: chapter.id, html: chapter.html };
  });
}

for (const direction of ['down', 'up'] as const) {
  test(`[NEO-225-A] Leafloom: Vim half-page ${direction} follows the manuscript midpoint into another chapter with rich typing history and durable reopen`, async ({
    page,
  }) => {
    const texts = Array.from({ length: 60 }, (_, index) => `Line ${index} carries words.`);
    const chapters = [
      texts.map((text) => `<p><b>${text}</b></p>`).join(''),
      texts.map((text) => `<p><i>${text}</i></p>`).join(''),
    ];
    const c = await existingBook(page, { chapters, library: { vimKeys: true } });
    const startChapter = direction === 'down' ? 0 : 1;
    const destination = direction === 'down' ? 1 : 0;
    await c.driver.select(startChapter, direction === 'down' ? 59 : 0, 0);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveClass(/vim-nav/);
    const targetParagraph = direction === 'down' ? 3 : 56;
    await page.evaluate(
      ({ destination, targetParagraph, direction }) => {
        const scroller = document.querySelector<HTMLElement>('#paper-scroll')!;
        const paragraph = document
          .querySelectorAll('.chapter-body')
          [destination].querySelectorAll('p')[targetParagraph];
        const scrollBox = scroller.getBoundingClientRect(),
          box = paragraph.getBoundingClientRect();
        const target = scroller.scrollTop + box.top - scrollBox.top + box.height / 2;
        scroller.scrollTop = direction === 'down' ? target - scroller.clientHeight : target;
      },
      { destination, targetParagraph, direction },
    );
    await page.keyboard.press(direction === 'down' ? 'Control+d' : 'Control+u');
    const caret = await c.driver.caret();
    expect(caret).toMatchObject({ chapter: destination, collapsed: true });
    expect(caret!.paragraph).toBeGreaterThanOrEqual(0);
    const expected = [texts.slice(), texts.slice()];
    const before = expected[destination][caret!.paragraph];
    expected[destination][caret!.paragraph] =
      before.slice(0, caret!.offset) + 'X' + before.slice(caret!.offset);
    await page.keyboard.press('i');
    await page.keyboard.type('X');
    await c.driver.expectParagraphs(expected);
    await c.driver.undo();
    await c.driver.expectParagraphs([texts, texts]);
    await c.driver.redo();
    await c.driver.expectParagraphs(expected);
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title, c.id);
    const observed = observedChapters(saved.chapters);
    expect(observed.map((chapter) => chapter.id)).toEqual(['ch-1', 'ch-2']);
    const expectedHtml = expected.map((lines, index) =>
      lines.map((text) => `<p><${index ? 'i' : 'b'}>${text}</${index ? 'i' : 'b'}></p>`).join(''),
    );
    expect(observed.map((chapter) => chapter.html)).toEqual(expectedHtml);
    await page.reload();
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs(expected);
    expect(
      await page
        .locator('.chapter-body')
        .nth(destination)
        .locator(destination ? 'i' : 'b')
        .count(),
    ).toBe(60);
  });
}

test('[NEO-225-A] Leafloom: Vim half-page shortcuts leave Notes scroll caret and rich writing unchanged', async ({
  page,
}) => {
  const notes = Array.from(
    { length: 90 },
    (_, index) => `<p><i>Note ${index} remains.</i></p>`,
  ).join('');
  const c = await existingBook(page, {
    chapters: ['<p>Manuscript stays.</p>'],
    notes,
    library: { vimKeys: true },
  });
  await page.locator('.tab[data-tab="notes"]').click();
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('#aux-editor')!;
    (root.querySelector<HTMLElement>('[contenteditable="true"]') ?? root).focus();
    const text = root.querySelector('p')!.firstChild!.firstChild!;
    getSelection()!.setBaseAndExtent(text, 3, text, 3);
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveClass(/vim-nav/);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#paper-scroll')!.scrollTop = 200;
  });
  const before = await page.evaluate(() => ({
    scroll: document.querySelector<HTMLElement>('#paper-scroll')!.scrollTop,
    text: getSelection()!.anchorNode!.textContent,
    offset: getSelection()!.anchorOffset,
  }));
  for (const key of ['Control+d', 'Control+u']) {
    await page.keyboard.press(key);
    expect(
      await page.evaluate(() => ({
        scroll: document.querySelector<HTMLElement>('#paper-scroll')!.scrollTop,
        text: getSelection()!.anchorNode!.textContent,
        offset: getSelection()!.anchorOffset,
      })),
    ).toEqual(before);
  }
  await c.driver.shelf();
  expect((await persistedBook(page, c.title, c.id)).notes).toBe(notes);
  await page.reload();
  await c.driver.selectBook(c.title);
  await page.locator('.tab[data-tab="notes"]').click();
  expect(await page.locator('#aux-editor p').allTextContents()).toEqual(
    Array.from({ length: 90 }, (_, index) => `Note ${index} remains.`),
  );
});
