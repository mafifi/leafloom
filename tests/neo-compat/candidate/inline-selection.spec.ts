import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('[NEO-066-A] Leafloom: native Unicode range replacement crosses bold and italic runs without damaging unselected rich text', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p><b>A😀 </b><i>café Ω</i></p>'] });
  await c.driver.select(0, 0, 1, 7);
  await page.keyboard.insertText('é東京');
  await c.driver.expectParagraphs([['Aé東京é Ω']]);
  const paragraph = page.locator('.chapter-body p').first();
  await test.info().attach('native-replacement-mark-ownership', {
    body: await paragraph.innerHTML(),
    contentType: 'text/html',
  });
  await expect(paragraph.locator('b,strong')).toHaveText('Aé東京');
  await expect(paragraph.locator('i,em').last()).toContainText('é Ω');
  await c.driver.undo();
  await c.driver.expectParagraphs([['A😀 café Ω']]);
  await expect(paragraph.locator('b,strong')).toHaveText('A😀 ');
  await expect(paragraph.locator('i,em')).toHaveText('café Ω');
  await c.driver.redo();
  await c.driver.expectParagraphs([['Aé東京é Ω']]);
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toContain('東京');
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Aé東京é Ω']]);
});

test('[NEO-066-A] Leafloom: native mixed-range emphasis keeps selected Unicode, inline flag identity and unselected neighboring runs', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: [
      '<p><b>Alpha</b> <i>café Ω</i> <span class="ph-mark" data-sid="format-note" contenteditable="false">⚑</span> tail.</p>',
    ],
    stickies: [
      { id: 'format-note', chapterId: 'ch-1', text: 'Formatting keeps me', resolved: false },
    ],
  });
  await c.driver.select(0, 0, 2, 18);
  await page.keyboard.press(mod + '+b');
  await test.info().attach('native-mixed-format-bold', {
    body: await page.locator('.chapter-body p').first().innerHTML(),
    contentType: 'text/html',
  });
  await c.driver.expectParagraphs([['Alpha café Ω ⚑ tail.']]);
  await expect(page.locator('.chapter-body p b, .chapter-body p strong')).toHaveText('Al');
  await expect(page.locator('.chapter-body [data-sid="format-note"]')).toHaveCount(1);
  await expect(page.locator('.chapter-body p i, .chapter-body p em')).toContainText('café Ω');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toContain('data-sid="format-note"');
  expect(saved.chapters[0].html).toContain('café Ω');
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alpha café Ω ⚑ tail.']]);
  await expect(page.locator('.chapter-body [data-sid="format-note"]')).toHaveCount(1);
});
