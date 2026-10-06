import type {Locator, Page} from '@playwright/test';
/** Dictionary ranges remain whole words when capital-slip decorations overlap them. */
export async function dictionaryFlags(page: Page, root: Locator = page.locator('body')) {
  if (process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference')
    return page.evaluate(() => Array.from(CSS.highlights.get('neo-spell') || [])
      .map(range => range.toString()).filter(text => !/^\p{L}\p{M}*$/u.test(text)));
  return root.locator('[data-spelling-id]').evaluateAll(elements => {
    const words = new Map<string, string>();
    for (const element of elements) {
      const id = element.getAttribute('data-spelling-id')!;
      words.set(id, (words.get(id) ?? '') + element.textContent);
    }
    return [...words.values()];
  });
}
/** Click the dictionary part of an underline, preserving the capital-letter menu's priority. */
export async function dictionaryWord(page: Page, word: string): Promise<Locator> {
  const id = await page.locator('[data-spelling-id]').evaluateAll((elements, word) => {
    const words = new Map<string, string>();
    for (const element of elements) {
      const id = element.getAttribute('data-spelling-id')!;
      words.set(id, (words.get(id) ?? '') + element.textContent);
    }
    return [...words].find(([, text]) => text === word)?.[0];
  }, word);
  if (!id) throw Error('Actual dictionary underline missing: ' + word);
  return page.locator(`[data-spelling-id=${JSON.stringify(id)}]:not([data-capitalization-id])`).first();
}
