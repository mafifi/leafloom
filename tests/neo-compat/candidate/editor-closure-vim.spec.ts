import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

// Catches focus/reveal work scrolling the author caret away from the midpoint
// after the half-page command has completed its mounted-view selection.
for (const direction of ['down', 'up'] as const) {
  test(`[NEO-225-A] Leafloom: settled Vim half-page ${direction} leaves a collapsed native caret within forty pixels of the actual viewport midpoint`, async ({
    page,
  }) => {
    const lines = Array.from({ length: 60 }, (_, index) => `Line ${index} carries words.`);
    const html = [
      lines.map((line) => `<p><b>${line}</b></p>`).join(''),
      lines.map((line) => `<p><i>${line}</i></p>`).join(''),
    ];
    const c = await existingBook(page, { chapters: html, library: { vimKeys: true } });
    const destination = direction === 'down' ? 1 : 0;
    await c.driver.select(direction === 'down' ? 0 : 1, direction === 'down' ? 59 : 0, 0);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveClass(/vim-nav/);
    await page.evaluate(
      ({ destination, direction }) => {
        const scroller = document.querySelector<HTMLElement>('#paper-scroll');
        const paragraph = document
          .querySelectorAll('.chapter-body')
          [destination]?.querySelectorAll('p')[direction === 'down' ? 3 : 56];
        if (!scroller || !paragraph) throw Error('Missing actual manuscript geometry');
        const viewport = scroller.getBoundingClientRect(),
          target = paragraph.getBoundingClientRect();
        const position = scroller.scrollTop + target.top - viewport.top + target.height / 2;
        scroller.scrollTop = direction === 'down' ? position - scroller.clientHeight : position;
      },
      { destination, direction },
    );
    await page.keyboard.press(direction === 'down' ? 'Control+d' : 'Control+u');
    // Await rendering, not a fabricated selection or scroll postcondition.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const observed = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('#paper-scroll'),
        selection = getSelection();
      if (!scroller || !selection?.rangeCount || !selection.isCollapsed)
        throw Error('Missing collapsed native caret');
      const rect = selection.getRangeAt(0).getBoundingClientRect(),
        viewport = scroller.getBoundingClientRect();
      if (!rect.height) throw Error('Native caret has no rendered line geometry');
      return {
        collapsed: selection.isCollapsed,
        distance: Math.abs(rect.top + rect.height / 2 - viewport.top - viewport.height / 2),
      };
    });
    expect(observed.collapsed).toBe(true);
    expect(observed.distance).toBeLessThan(40);
    const caret = await c.driver.caret();
    expect(caret).toMatchObject({ chapter: destination, collapsed: true });
    if (!caret) throw Error('Missing author caret after Vim command');
    const expected = [lines.slice(), lines.slice()];
    const before = expected[destination][caret.paragraph];
    expected[destination][caret.paragraph] =
      before.slice(0, caret.offset) + 'X' + before.slice(caret.offset);
    await page.keyboard.press('i');
    await page.keyboard.type('X');
    await c.driver.expectParagraphs(expected);
    await c.driver.undo();
    await c.driver.expectParagraphs([lines, lines]);
    await c.driver.redo();
    await c.driver.expectParagraphs(expected);
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title, c.id);
    expect(saved.chapters.map((chapter: { id: string }) => chapter.id)).toEqual(['ch-1', 'ch-2']);
    expect(saved.chapters.map((chapter: { html: string }) => chapter.html)).toEqual(
      expected.map((chapter, index) =>
        chapter
          .map((line) => `<p><${index ? 'i' : 'b'}>${line}</${index ? 'i' : 'b'}></p>`)
          .join(''),
      ),
    );
    await page.reload();
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs(expected);
  });
}
