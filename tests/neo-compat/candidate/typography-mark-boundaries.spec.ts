import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

for (const scenario of [
  { clause: '109', prefix: '-', key: '-', text: '--tail', bold: '--' },
  { clause: '110', prefix: '..', key: '.', text: '...tail', bold: '...' },
  { clause: '111', prefix: 'word', key: '\"', text: 'word“tail', bold: 'word“' },
] as const) {
  test(`[NEO-${scenario.clause}-A] Leafloom: typography at the start of an italic run respects its native text-node boundary after ${JSON.stringify(scenario.prefix)}`, async ({
    page,
  }) => {
    const c = await existingBook(page, {
      chapters: [`<p><b>${scenario.prefix}</b><i>tail</i></p>`],
      library: { spellLanguage: 'en' },
    });
    await c.driver.select(0, 0, scenario.prefix.length);
    await page
      .locator('.chapter-body p')
      .first()
      .evaluate((paragraph) => {
        const italic = paragraph.querySelector('i,em');
        const text = italic?.firstChild;
        if (!text || text.nodeType !== Node.TEXT_NODE)
          throw new Error('Missing italic native text endpoint');
        const range = document.createRange();
        range.setStart(text, 0);
        range.collapse(true);
        const selection = getSelection();
        if (!selection) throw new Error('Missing native selection');
        selection.removeAllRanges();
        selection.addRange(range);
      });
    await page.keyboard.press(scenario.key);
    const paragraph = page.locator('.chapter-body p').first();
    await test.info().attach('native-mark-boundary-result', {
      body: await paragraph.innerHTML(),
      contentType: 'text/html',
    });
    await c.driver.expectParagraphs([[scenario.text]]);
    await expect(paragraph.locator('b,strong')).toHaveText(scenario.bold);
    await expect(paragraph.locator('i,em')).toHaveText('tail');
    expect(await c.driver.caret()).toMatchObject({ offset: scenario.prefix.length + 1 });
    await c.driver.undo();
    await c.driver.expectParagraphs([[scenario.prefix + 'tail']]);
    await expect(paragraph.locator('b,strong')).toHaveText(scenario.prefix);
    await expect(paragraph.locator('i,em')).toHaveText('tail');
    await c.driver.redo();
    await c.driver.expectParagraphs([[scenario.text]]);
    await expect(paragraph.locator('i,em')).toHaveText('tail');
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title, c.id);
    expect(saved.chapters[0].html).toMatch(
      new RegExp(
        '<(?:b|strong)>' + scenario.bold.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</(?:b|strong)>',
      ),
    );
    expect(saved.chapters[0].html).toContain('tail');
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs([[scenario.text]]);
    await expect(page.locator('.chapter-body p i,.chapter-body p em')).toHaveText('tail');
  });
}
