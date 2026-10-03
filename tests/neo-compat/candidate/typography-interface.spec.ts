import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook, privateStorageRoot } from './storage-probe';
import { clickReferenceMenu } from '../reference/harness';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

for (const scenario of [
  { dictionary: 'fr', interface: 'fr-CA', expected: 'Oui ; non\u202f: quoi ! pourquoi ?' },
  {
    dictionary: 'fr-CA',
    interface: 'en',
    expected: 'Oui\u202f; non\u202f: quoi\u202f! pourquoi\u202f?',
  },
] as const) {
  test(`[NEO-115-A] Leafloom: French dictionary ${scenario.dictionary} under actual ${scenario.interface} interface applies Quebec spacing only from the interface catalog`, async ({
    page,
  }) => {
    const reference = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
    if (!reference) {
      await writeFile(
        path.join(privateStorageRoot(page), 'settings.json'),
        JSON.stringify({ uiLanguage: scenario.interface }),
      );
    }
    const c = await existingBook(page, {
      chapters: ['<p><br></p>'],
      library: { spellLanguage: scenario.dictionary },
    });
    if (reference && scenario.interface === 'fr-CA') {
      await clickReferenceMenu(page, ['View', 'Language', 'Français (Canada)']);
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CA');
      await c.driver.selectBook(c.title);
      await expect(page.locator('.chapter-body').first()).toBeVisible();
    } else if (reference) {
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    } else {
      await expect(page.locator('#view-menu')).toHaveText(
        scenario.interface === 'fr-CA' ? 'Présentation' : 'View',
      );
    }
    await c.driver.select(0, 0, 0);
    await page.keyboard.type('Oui ; non : quoi ! pourquoi ?');
    await c.driver.expectParagraphs([[scenario.expected]]);
    await c.driver.shelf();
    expect((await persistedBook(page, c.title, c.id)).chapters[0].html).toContain(
      scenario.expected,
    );
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs([[scenario.expected]]);
  });
}
