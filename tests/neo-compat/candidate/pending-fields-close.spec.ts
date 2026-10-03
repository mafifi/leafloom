import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

for (const field of ['notes', 'outline', 'sticky'] as const) {
  test(`[NEO-231-A] Leafloom: immediate shelf switch flushes focused ${field} into its original book and leaves the next book untouched`, async ({
    page,
  }) => {
    const fixture = await existingBook(page, {
      chapters: [
        '<p>Alpha<span class="ph-mark" data-sid="pending-note" contenteditable="false">⚑</span> beta.</p>',
      ],
      stickies: [{ id: 'pending-note', chapterId: 'ch-1', text: 'Saved note', resolved: false }],
      metadata: { chapterNotes: { 'ch-1': 'Saved outline' } },
    });
    const reference = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
    const tail = `Immediate ${field} tail`;
    if (field === 'notes') {
      await page.locator('.tab[data-tab="notes"]').click();
      const editable = page.locator(reference ? '#aux-editor' : '#aux-editor .ProseMirror');
      await editable.click();
      await page.keyboard.type(tail);
    } else if (field === 'outline') {
      await page.locator('.tab[data-tab="outline"]').click();
      await page.locator('.ol-chapter[data-ch-id="ch-1"] .ol-text').fill(tail);
    } else {
      if (!(await page.locator('#side-pane').evaluate((el) => el.classList.contains('open'))))
        await page.locator('#side-hotzone').hover();
      await page.locator('.sticky textarea').fill(tail);
    }
    // No pause for the autosave debounce and no explicit field commit.
    await fixture.driver.shelf();
    const saved = await persistedBook(page, fixture.title, fixture.id);
    if (field === 'notes') expect(saved.notes).toContain(tail);
    else if (field === 'outline') expect(saved.metadata.chapterNotes['ch-1']).toBe(tail);
    else expect(saved.stickies[0].text).toBe(tail);
    await fixture.driver.newBook();
    await fixture.driver.title(`Other ${field} ${fixture.id}`);
    await page.keyboard.type('Other book remains separate.');
    await fixture.driver.shelf();
    const other = await persistedBook(page, `Other ${field} ${fixture.id}`);
    expect(JSON.stringify(other)).not.toContain(tail);
    await fixture.driver.selectBook(fixture.title);
    if (field === 'notes') {
      await page.locator('.tab[data-tab="notes"]').click();
      await expect(page.locator('#aux-editor')).toContainText(tail);
    } else if (field === 'outline') {
      await page.locator('.tab[data-tab="outline"]').click();
      await expect(page.locator('.ol-chapter[data-ch-id="ch-1"] .ol-text')).toHaveText(tail);
    } else {
      if (!(await page.locator('#side-pane').evaluate((el) => el.classList.contains('open'))))
        await page.locator('#side-hotzone').hover();
      await expect(page.locator('.sticky textarea')).toHaveValue(tail);
    }
  });
}
