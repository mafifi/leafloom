import { test, expect } from './author-fixture';
import { dictionaryFlags } from './spelling-observation';
import { existingBook } from './book-fixture';
import { persistedBook, persistedLibrary, privateStorageRoot } from './storage-probe';
import { clickReferenceMenu } from '../reference/harness';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

for (const explicit of [false, true]) {
  test(`[NEO-301-A] Leafloom: Romanian interface ${explicit ? 'preserves explicit English spelling' : 'supplies an unpersisted default spelling language'} for manuscript typography`, async ({
    page,
  }) => {
    const reference = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
    if (!reference)
      await writeFile(
        path.join(privateStorageRoot(page), 'settings.json'),
        JSON.stringify({ uiLanguage: 'ro' }),
      );
    const c = await existingBook(page, {
      chapters: ['<p><br></p>'],
      library: explicit ? { spellLanguage: 'en-US' } : {},
    });
    if (reference) {
      await clickReferenceMenu(page, ['View', 'Language', 'Română']);
      await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
      await c.driver.selectBook(c.title);
    }
    await c.driver.select(0, 0, 0);
    await page.keyboard.type('"Salut"');
    const quotes = explicit ? '“Salut”' : '„Salut”';
    await c.driver.expectParagraphs([[quotes]]);
    await page.keyboard.type(' școală qzxvplmno');
    const text = quotes + ' școală qzxvplmno';
    await c.driver.expectParagraphs([[text]]);
    if (reference) await clickReferenceMenu(page, ['Editare', 'Verificare ortografică']);
    else {
      await page.locator('#format-menu').click();
      await page
        .getByRole('menuitem', { name: 'Verificare ortografică activată', exact: true })
        .click();
    }
    const flagged = async () =>
      reference
        ? page.evaluate(() => {
            const registry = (CSS as unknown as { highlights?: Map<string, Set<Range>> })
              .highlights;
            return [...(registry?.get('neo-spell') ?? [])].map((range) => range.toString());
          })
        : dictionaryFlags(page);
    await expect.poll(flagged).toContain('qzxvplmno');
    if (explicit) await expect.poll(flagged).toContain('școală');
    else expect(await flagged()).not.toContain('școală');
    await c.driver.shelf();
    expect((await persistedBook(page, c.title, c.id)).chapters[0].html).toContain(text);
    const library = await persistedLibrary(page);
    if (explicit) expect(library.spellLanguage).toBe('en-US');
    else expect(library).not.toHaveProperty('spellLanguage');
    if (reference) await clickReferenceMenu(page, ['Vizualizare', 'Limbă', 'English']);
    else {
      await writeFile(
        path.join(privateStorageRoot(page), 'settings.json'),
        JSON.stringify({ uiLanguage: 'en' }),
      );
      await page.reload();
    }
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs([[text]]);
    if (explicit) expect((await persistedLibrary(page)).spellLanguage).toBe('en-US');
    else expect(await persistedLibrary(page)).not.toHaveProperty('spellLanguage');
  });
}
