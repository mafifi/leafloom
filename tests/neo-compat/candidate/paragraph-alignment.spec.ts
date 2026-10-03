import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
import { clickReferenceMenu } from '../reference/harness';
import type { Page } from '@playwright/test';

async function align(page: Page, label: string) {
  if (process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference') {
    await clickReferenceMenu(page, ['Format', 'Align Paragraph', label]);
  } else {
    await page.locator('#format-menu').click();
    await page.getByRole('menuitem', { name: label, exact: true }).click();
  }
}

test('[NEO-208-A] Leafloom: selected paragraph alignment preserves poetry marks and flags, skips scenes and persists each source choice', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: [
      '<p><b>Alpha.</b></p><p class="scene-break extra">***</p><p class="poetry"><i>Verse.</i></p><p>Tail <span class="ph-mark" data-sid="align-note" contenteditable="false">⚑</span> text.</p>',
      '<p>Untouched.</p>',
    ],
    stickies: [{ id: 'align-note', chapterId: 'ch-1', text: 'Keep this note', resolved: false }],
  });
  for (const [label, value] of [
    ['Center', 'center'],
    ['Right', 'right'],
    ['Justify', 'justify'],
    ['Left', ''],
  ] as const) {
    await c.driver.select(0, 0, 1, 12, 3);
    await align(page, label);
    expect(
      await page
        .locator('.chapter-body')
        .first()
        .locator('p')
        .evaluateAll((ps) => ps.map((p) => p.style.textAlign)),
    ).toEqual([value, '', value, value]);
    await expect(page.locator('.chapter-body').nth(1).locator('p')).not.toHaveAttribute(
      'style',
      /text-align/,
    );
    await expect(
      page.locator('.chapter-body').first().locator('p.poetry i, p.poetry em'),
    ).toHaveText('Verse.');
    await expect(page.locator('.chapter-body [data-sid="align-note"]')).toHaveCount(1);
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title, c.id);
    expect(saved.stickies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'align-note', text: 'Keep this note', chapterId: 'ch-1' }),
      ]),
    );
    const styled = saved.chapters[0].html;
    expect(styled).toContain('data-sid="align-note"');
    expect(styled).toMatch(/<(?:b|strong)>Alpha\.<\/(?:b|strong)>/);
    if (value) expect(styled.match(new RegExp('text-align:\\s*' + value, 'g'))).toHaveLength(3);
    else expect(styled).not.toContain('text-align');
    await c.driver.selectBook(c.title);
    expect(
      await page
        .locator('.chapter-body')
        .first()
        .locator('p')
        .evaluateAll((ps) => ps.map((p) => p.style.textAlign)),
    ).toEqual([value, '', value, value]);
  }
});
