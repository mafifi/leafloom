import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

test('[NEO-040-B] Leafloom: native clearing of a restored Part sheet commits empty prose before Done closes its writer lease', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const events: unknown[] = [];
    Object.assign(window, { __pageEmptyEvents: events });
    window.addEventListener('pagehide', () => {
      sessionStorage.setItem('__pageEmptyPreviousEvents', JSON.stringify(events));
    });
    const capture = (kind: string, event?: Event) => {
      const body = document.querySelector('.ps-body');
      const selection = getSelection();
      const key = event instanceof KeyboardEvent ? event.key : null;
      const input = event instanceof InputEvent ? event.inputType : null;
      events.push({
        kind,
        key,
        input,
        prevented: event?.defaultPrevented,
        trusted: event?.isTrusted,
        body: body?.innerHTML,
        selected: selection?.toString(),
        anchor: selection?.anchorOffset,
        focus: selection?.focusOffset,
        anchorName: selection?.anchorNode?.nodeName,
        focusName: selection?.focusNode?.nodeName,
        time: performance.now(),
      });
    };
    for (const name of ['keydown', 'beforeinput', 'input', 'selectionchange', 'click']) {
      for (const phase of [true, false])
        document.addEventListener(
          name,
          (event) => {
            if (
              (event.target instanceof Element && event.target.closest('.page-sheet')) ||
              name === 'selectionchange'
            )
              capture(name + (phase ? '.capture' : '.bubble'), event);
          },
          phase,
        );
    }
  });
  try {
    const c = await existingBook(page);
    await c.driver.shelf();
    await page.locator('.shelf-label').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Bind shelf', exact: true }).click();
    await expect(page.locator('.shelf')).toHaveClass(/bound/);
    await page.locator('.shelf').hover();
    await page.locator('.part-seam').first().click();
    await expect(page.locator('.ps-label')).toHaveText('Part I');
    await expect(page.locator('.ps-body')).toBeFocused();
    await page.keyboard.type('Movement title.');
    await page.locator('.ps-done').click();
    await expect(page.locator('.page-sheet')).toBeHidden();
    const partId = await page.locator('.page-tile.kind-part').getAttribute('data-book-id');
    expect(partId).toBeTruthy();
    if (!partId) throw new Error('Part tile is missing its persisted book identity');
    await page.reload();
    await expect(page.locator('.page-tile.kind-part')).toHaveText('Part I');
    await page.locator('.page-tile.kind-part').click();
    await expect(page.locator('.ps-body')).toHaveText('Movement title.');
    await page.locator('.ps-body').fill('');
    await page.locator('.ps-done').click();
    await expect(page.locator('.page-sheet')).toBeHidden();
    await page.reload();
    await expect(page.locator('.page-tile.kind-part')).toHaveText('Part I');
    await page.locator(`.page-tile.kind-part[data-book-id="${partId}"]`).click();
    await expect(page.locator('.ps-body')).toHaveText('');
    await page.locator('.ps-done').click();
    await expect(page.locator('.page-sheet')).toBeHidden();
    expect(
      (await persistedBook(page, 'Part — Fixture books', partId)).chapters[0].html,
    ).not.toContain('Movement title.');
  } finally {
    await test.info().attach('native-page-empty-events', {
      body: JSON.stringify(
        await page.evaluate(() => ({
          previous: JSON.parse(sessionStorage.getItem('__pageEmptyPreviousEvents') ?? '[]'),
          current: Reflect.get(window, '__pageEmptyEvents'),
        })),
        null,
        2,
      ),
      contentType: 'application/json',
    });
  }
});
