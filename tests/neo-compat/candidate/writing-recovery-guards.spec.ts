import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

test('[NEO-142-A] Leafloom: deleting a long rich chapter truncates only the Darling summary and restores its complete paragraphs through durable reopen', async ({
  page,
}) => {
  const long = 'Long prose. '.repeat(210);
  const html = `<p><i>${long}</i></p><p>Final line.</p>`;
  const c = await existingBook(page, { chapters: ['<p>Anchor.</p>', html] });
  if ((await page.locator('#nav-pin').getAttribute('aria-pressed')) !== 'true') {
    await page.locator('#nav-hotzone').hover();
    await page.locator('#nav-pin').click();
  }
  await page.locator('.nav-item').nth(1).locator('.n-row').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await c.driver.expectParagraphs([['Anchor.']]);
  await page.locator('.tab[data-tab="darlings"]').click();
  await expect(page.locator('.darling')).toHaveCount(1);
  await expect(page.locator('.darling')).toContainText('Final line.');
  await c.driver.shelf();
  const archived = await persistedBook(page, c.title, c.id);
  expect(archived.darlings).toHaveLength(1);
  expect(typeof archived.darlings[0].text).toBe('string');
  expect(archived.darlings[0].text.length).toBe(2000);
  expect(archived.darlings[0].html).toBe(html);
  await c.driver.selectBook(c.title);
  await page.locator('.tab[data-tab="darlings"]').click();
  await page.locator('.darling').getByRole('button', { name: 'Restore', exact: true }).click();
  await c.driver.expectParagraphs([['Anchor.', long, 'Final line.']]);
  await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText(long);
  await page.locator('.tab[data-tab="darlings"]').click();
  await expect(page.locator('.darling')).toHaveCount(0);
  await c.driver.shelf();
  const restored = await persistedBook(page, c.title, c.id);
  expect(restored.darlings).toHaveLength(0);
  expect(restored.chapters[0].html).toBe('<p>Anchor.</p>' + html);
  await page.reload();
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Anchor.', long, 'Final line.']]);
  await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText(long);
});

test('[NEO-072-A] Leafloom: native Enter on a scene marker leaves rich paragraphs and chapter order unchanged through reopen', async ({
  page,
}) => {
  const html = '<p><b>Alpha.</b></p><p class="scene-break">***</p><p><i>Gamma.</i></p>';
  const c = await existingBook(page, { chapters: [html, '<p>Later.</p>'] });
  await c.driver.select(0, 1, 1);
  await page.keyboard.press('Enter');
  await c.driver.expectParagraphs([['Alpha.', '***', 'Gamma.'], ['Later.']]);
  await expect(page.locator('.chapter-body .scene-break')).toHaveCount(1);
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toBe(html);
  expect(saved.chapters[1].html).toBe('<p>Later.</p>');
  expect(saved.chapters).toHaveLength(2);
  await page.reload();
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['Alpha.', '***', 'Gamma.'], ['Later.']]);
});

test('[NEO-073-A] Leafloom: three native Enters on a dedication create ordinary paragraphs without scenes or story chapters', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p>For you.</p>', '<p><b>Story.</b></p>'],
    metadata: { chapterKinds: { 'ch-1': 'dedication' } },
  });
  await c.driver.select(0, 0, 8);
  for (let index = 0; index < 3; index++) await page.keyboard.press('Enter');
  await page.keyboard.type('Zeta.');
  await c.driver.expectParagraphs([['For you.', '', '', 'Zeta.'], ['Story.']]);
  await expect(page.locator('.chapter-body .scene-break')).toHaveCount(0);
  expect(await c.driver.caret()).toMatchObject({ chapter: 0, paragraph: 3, offset: 5 });
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters).toHaveLength(2);
  expect(saved.metadata.chapterKinds['ch-1']).toBe('dedication');
  expect(saved.chapters[1].html).toBe('<p><b>Story.</b></p>');
  await page.reload();
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['For you.', '', '', 'Zeta.'], ['Story.']]);
  await expect(page.locator('.chapter-body .scene-break')).toHaveCount(0);
});
