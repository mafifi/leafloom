import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
import { focusHistoryChrome } from './history-chrome';

async function gapMenu(page: import('@playwright/test').Page, at: number) {
  const plus = page
    .locator('#nav-list .nav-gap')
    .nth(at)
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

const entryKinds = [
  ['copyright', 'Copyright'],
  ['dedication', 'Dedication'],
  ['epigraph', 'Epigraph'],
  ['contents', 'Contents'],
  ['prologue', 'Prologue'],
  ['part', 'Part'],
  ['chapter', 'Chapter'],
  ['unnumbered', 'Unnumbered Chapter'],
  ['epilogue', 'Epilogue'],
  ['acknowledgments', 'Acknowledgments'],
  ['about', 'About the Author'],
] as const;
for (const [kind, label] of entryKinds)
  test(`[NEO-059-A] Leafloom: mixed-book insertion menu creates ${kind} between stable entries`, async ({
    page,
  }) => {
    const original = [
      '<p>For a friend.</p>',
      '<p>Alpha <b>bold</b>.</p>',
      '<p>The crossing.</p>',
      '<p>Omega <i>italic</i>.</p>',
      '<p>Thanks to everyone.</p>',
    ];
    const c = await existingBook(page, {
      chapters: original,
      metadata: {
        chapterKinds: { 'ch-1': 'dedication', 'ch-3': 'part', 'ch-5': 'acknowledgments' },
      },
    });
    await page.locator('#nav-hotzone').hover();
    await page.locator('#nav-pin').click();
    await gapMenu(page, 2);
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(
      entryKinds.map(([, name]) => name),
    );
    await page.getByRole('menu').getByRole('menuitem', { name: label, exact: true }).click();
    await expect(page.locator('.chapter')).toHaveCount(6);
    await expect(page.locator('.chapter').nth(2)).toHaveClass(new RegExp(`kind-${kind}`));
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title);
    expect(saved.metadata.chapterKinds?.[saved.chapters[2].id] ?? 'chapter').toBe(kind);
    expect(
      saved.chapters
        .filter((_: unknown, index: number) => index !== 2)
        .map((row: { id: string }) => row.id),
    ).toEqual(['ch-1', 'ch-2', 'ch-3', 'ch-4', 'ch-5']);
    expect(
      saved.chapters
        .filter((_: unknown, index: number) => index !== 2)
        .map((row: { html: string }) => row.html),
    ).toEqual(original);
  });
test('[NEO-059-B] Leafloom: zero-story sole and ending gaps create Dedication then a focused story', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: [] });
  await page.locator('#nav-hotzone').hover();
  await page.locator('#nav-pin').click();
  await expect(page.locator('.nav-gap')).toHaveCount(1);
  await gapMenu(page, 0);
  await page.getByRole('menu').getByRole('menuitem', { name: 'Dedication', exact: true }).click();
  await page.keyboard.type('For a friend.');
  await expect(page.locator('.chapter-body').first()).toHaveText('For a friend.');
  await gapMenu(page, 1);
  await page.getByRole('menu').getByRole('menuitem', { name: 'Chapter', exact: true }).click();
  await page.keyboard.type('The beginning.');
  await c.driver.expectParagraphs([['For a friend.'], ['The beginning.']]);
  await expect
    .poll(() => c.driver.caret())
    .toMatchObject({ chapter: 1, paragraph: 0, offset: 14, collapsed: true });
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title);
  expect(
    saved.chapters.map((row: { id: string }) => saved.metadata.chapterKinds?.[row.id] ?? 'chapter'),
  ).toEqual(['dedication', 'chapter']);
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['For a friend.'], ['The beginning.']]);
});

// Catches missing insertion gestures, wrong insertion index and split history
// actions that leave an empty chapter after Undo of a newly inserted page.
for (const [kind, label, at] of [
  ['part', 'Part', 1],
  ['copyright', 'Copyright', 0],
] as const) {
  test(`[NEO-059-A] Leafloom: gap inserts ${kind} at its position with one Undo and durable rich neighbours`, async ({
    page,
  }) => {
    const fixture = await existingBook(page, {
      chapters: ['<p>First <b>rich</b> story.</p>', '<p>Second <i>rich</i> story.</p>'],
    });
    await page.locator('#nav-hotzone').hover();
    await page.locator('#nav-pin').click();
    await expect(page.locator('#nav-list .nav-gap')).toHaveCount(3);
    await gapMenu(page, at);
    await page.getByRole('menu').getByRole('menuitem', { name: label, exact: true }).click();
    await expect(page.locator('.chapter')).toHaveCount(3);
    const inserted = page.locator('.chapter').nth(at);
    await expect(inserted).toHaveClass(new RegExp(`kind-${kind}`));
    const body = inserted.locator('.chapter-body');
    if (kind === 'copyright') {
      await expect(body).toContainText('Copyright © 2026 Fixture Writer');
      await expect(body).toContainText('All rights reserved.');
    } else {
      await page.keyboard.type('The crossing');
      await expect(body).toHaveText('The crossing');
    }
    await fixture.driver.shelf();
    const saved = await persistedBook(page, fixture.title);
    expect(saved.chapters).toHaveLength(3);
    expect(saved.metadata.chapterKinds?.[saved.chapters[at].id]).toBe(kind);
    expect(
      saved.chapters
        .filter((_: unknown, i: number) => i !== at)
        .map((c: { html: string }) => c.html),
    ).toEqual(['<p>First <b>rich</b> story.</p>', '<p>Second <i>rich</i> story.</p>']);
    await fixture.driver.selectBook(fixture.title);
    await expect(page.locator('.chapter').nth(at)).toHaveClass(new RegExp(`kind-${kind}`));
  });
}
for (const label of ['Copyright', 'Part'])
  test(`[NEO-059-A] Leafloom: gap ${label} insertion disappears entirely with immediate structural Undo`, async ({
    page,
  }) => {
    const fixture = await existingBook(page, {
      chapters: ['<p>First <b>rich</b> story.</p>', '<p>Second story.</p>'],
    });
    await page.locator('#nav-hotzone').hover();
    await page.locator('#nav-pin').click();
    await gapMenu(page, 0);
    await page.getByRole('menu').getByRole('menuitem', { name: label, exact: true }).click();
    await expect(page.locator('.chapter')).toHaveCount(3);
    await focusHistoryChrome(page);
    await fixture.driver.undo();
    await expect(page.locator('.chapter')).toHaveCount(2);
    await fixture.driver.shelf();
    const saved = await persistedBook(page, fixture.title);
    expect(saved.chapters.map((c: { id: string }) => c.id)).toEqual(['ch-1', 'ch-2']);
    expect(saved.chapters[0].html).toBe('<p>First <b>rich</b> story.</p>');
    expect(Object.values(saved.metadata.chapterKinds ?? {})).not.toContain(label.toLowerCase());
  });
