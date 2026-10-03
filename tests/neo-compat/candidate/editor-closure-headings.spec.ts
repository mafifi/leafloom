import { test, expect } from './author-fixture';
import type { Page } from '@playwright/test';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

async function pinNavigation(page: Page) {
  if ((await page.locator('#nav-pin').getAttribute('aria-pressed')) !== 'true') {
    await page.locator('#nav-hotzone').hover();
    await page.locator('#nav-pin').click();
  }
}
async function gapMenu(page: Page, index: number) {
  const plus = page
    .locator('#nav-list .nav-gap')
    .nth(index)
    .getByRole('button', { name: 'Add', exact: true });
  await expect
    .poll(async () => {
      const bounds = await plus.boundingBox();
      if (!bounds) return false;
      await page.mouse.move(bounds.x + bounds.width / 2 - 1, bounds.y + bounds.height / 2);
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return plus.evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        return (
          button ===
          document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        );
      });
    })
    .toBe(true);
  await plus.click();
}

test('[NEO-051-B] Leafloom: blank chapter heading commits on blur and returns its default numbered label without touching rich prose', async ({
  page,
}) => {
  const original = '<p><b>Alpha.</b> <i>Tail.</i></p>';
  const c = await existingBook(page, {
    chapters: [original, '<p>Later.</p>'],
    metadata: { chapterTitles: { 'ch-1': 'Opening', 'ch-2': 'Later' } },
  });
  const heading = page.locator('.ch-title').first();
  await heading.fill('');
  await heading.press('Tab');
  await expect(heading).not.toBeFocused();
  await expect(heading).toHaveText('');
  await expect(page.locator('.chapter-head').first()).not.toHaveClass(/has-title/);
  await expect(page.locator('.chapter-head').first().locator('.ch-num')).toHaveText('Chapter 1');
  await c.driver.expectParagraphs([['Alpha. Tail.'], ['Later.']]);
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.metadata.chapterTitles['ch-1']).toBe('');
  expect(saved.chapters[0].html).toBe(original);
  await page.reload();
  await c.driver.selectBook(c.title);
  await expect(page.locator('.ch-title').first()).toHaveText('');
  await expect(page.locator('.chapter-head').first().locator('.ch-num')).toHaveText('Chapter 1');
  await c.driver.expectParagraphs([['Alpha. Tail.'], ['Later.']]);
});

test('[NEO-051-B] Leafloom: chapter-heading ShiftEnter prepends a focused italic verse before existing rich paragraphs and preserves it through reopen', async ({
  page,
}) => {
  const original = '<p>Alpha <b>bold</b> and <i>italic</i>.</p><p>Ending.</p>';
  const c = await existingBook(page, {
    chapters: [original, '<p>Later.</p>'],
    metadata: { chapterTitles: { 'ch-1': 'Opening' } },
  });
  await page.locator('.ch-title').first().click();
  await page.keyboard.press('Shift+Enter');
  await c.driver.expectParagraphs([['', 'Alpha bold and italic.', 'Ending.'], ['Later.']]);
  await expect(page.locator('.chapter-body').first().locator('p').first()).toHaveClass(/poetry/);
  expect(await c.driver.caret()).toMatchObject({
    chapter: 0,
    paragraph: 0,
    offset: 0,
    collapsed: true,
  });
  await page.keyboard.type('Opening verse.');
  await expect(
    page.locator('.chapter-body').first().locator('p').first().locator('i,em'),
  ).toHaveText('Opening verse.');
  await expect(
    page.locator('.chapter-body').first().locator('p').nth(1).locator('b,strong'),
  ).toHaveText('bold');
  await expect(
    page.locator('.chapter-body').first().locator('p').nth(1).locator('i,em'),
  ).toHaveText('italic');
  expect(await c.driver.caret()).toMatchObject({
    chapter: 0,
    paragraph: 0,
    offset: 14,
    collapsed: true,
  });
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.metadata.chapterTitles['ch-1']).toBe('Opening');
  expect(saved.chapters[0].html).toContain(original);
  expect(saved.chapters[0].html).toMatch(
    /<p[^>]*class="poetry"[^>]*><(?:i|em)>Opening verse\.<\/(?:i|em)><\/p>/,
  );
  await page.reload();
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([
    ['Opening verse.', 'Alpha bold and italic.', 'Ending.'],
    ['Later.'],
  ]);
  await expect(
    page.locator('.chapter-body').first().locator('p').first().locator('i,em'),
  ).toHaveText('Opening verse.');
});

test('[NEO-050-B] Leafloom: sole story heading returns after gap Prologue insertion and after Part replaces the removed Prologue', async ({
  page,
}) => {
  const original = '<p>Alpha <b>bold</b> and <i>italic</i>.</p>';
  const c = await existingBook(page, { chapters: [original] });
  await expect(page.locator('.chapter-head').first()).toBeHidden();
  await pinNavigation(page);
  await gapMenu(page, 0);
  await page.getByRole('menu').getByRole('menuitem', { name: 'Prologue', exact: true }).click();
  await expect(page.locator('.chapter-head').nth(0)).toBeVisible();
  await expect(page.locator('.chapter-head').nth(0)).toContainText('Prologue');
  await expect(page.locator('.chapter-head').nth(1)).toBeVisible();
  await expect(page.locator('.chapter-head').nth(1)).toContainText('Chapter 1');
  await page.locator('.nav-item').first().locator('.n-row').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.chapter')).toHaveCount(1);
  await expect(page.locator('.chapter-head').first()).toBeHidden();
  await gapMenu(page, 0);
  await page.getByRole('menu').getByRole('menuitem', { name: 'Part', exact: true }).click();
  await expect(page.locator('.chapter-head').nth(0)).toBeVisible();
  await expect(page.locator('.chapter-head').nth(0)).toContainText('Part I');
  await expect(page.locator('.chapter-head').nth(1)).toBeVisible();
  await expect(page.locator('.chapter-head').nth(1)).toContainText('Chapter 1');
  await c.driver.expectParagraphs([[''], ['Alpha bold and italic.']]);
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters).toHaveLength(2);
  expect(saved.metadata.chapterKinds[saved.chapters[0].id]).toBe('part');
  expect(saved.chapters[1]).toMatchObject({ id: 'ch-1', html: original });
  await page.reload();
  await c.driver.selectBook(c.title);
  await expect(page.locator('.chapter-head').nth(0)).toContainText('Part I');
  await expect(page.locator('.chapter-head').nth(1)).toBeVisible();
  await expect(page.locator('.chapter-head').nth(1)).toContainText('Chapter 1');
  await c.driver.expectParagraphs([[''], ['Alpha bold and italic.']]);
});
