import { test, expect } from './author-fixture';
import { dictionaryFlags, dictionaryWord } from './spelling-observation';
import { existingBook } from './book-fixture';
import { persistedBook, persistedLibrary, privateStorageRoot } from './storage-probe';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const flagSelector = '[data-annotation-kind="spelling"]';
const languages = [
  ['en-US', 'hello'],
  ['en-GB', 'colour'],
  ['en-AU', 'colour'],
  ['en-CA', 'colour'],
  ['fr', 'bonjour'],
  ['de', 'Haus'],
  ['es', 'hola'],
  ['el', 'κόσμος'],
  ['nl', 'huis'],
  ['pl', 'dom'],
  ['pt', 'não'],
  ['ro', 'școală'],
  ['ru', 'текст'],
] as const;
async function flags(page: Page, chapter?: number) {
  const root =
    chapter === undefined
      ? page.locator('#paper-scroll')
      : page.locator('.chapter-body').nth(chapter);
  return dictionaryFlags(page, root);
}
async function toggle(page: Page, enabled: boolean) {
  await page.locator('#format-menu').click();
  await page
    .getByRole('menuitem', { name: enabled ? 'Spellcheck on' : 'Spellcheck off', exact: true })
    .click();
}
async function language(page: Page, code: string) {
  await page.locator('#format-menu').click();
  await page.getByRole('menuitem', { name: 'Language: ' + code, exact: true }).click();
}
function observeChecks(page: Page) {
  const calls: { words: string[]; language: string; at: number }[] = [];
  page.on('request', (request) => {
    if (!request.url().endsWith('/__leafloom/host') || request.method() !== 'POST') return;
    const body: unknown = request.postDataJSON();
    if (
      !body ||
      typeof body !== 'object' ||
      !('method' in body) ||
      body.method !== 'spellcheck' ||
      !('payload' in body)
    )
      return;
    const payload = body.payload;
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('words' in payload) ||
      !Array.isArray(payload.words) ||
      !('language' in payload) ||
      typeof payload.language !== 'string'
    )
      return;
    const words = payload.words.filter((word): word is string => typeof word === 'string');
    if (words.length !== payload.words.length) throw Error('Invalid production spellcheck payload');
    calls.push({ words, language: payload.language, at: Date.now() });
  });
  return calls;
}
async function rightClickFlag(page: Page, word: string) {
  await (await dictionaryWord(page, word)).click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
}

test('[NEO-169-A] Leafloom: spellcheck starts off and native typing remains unflagged beyond the scan debounce', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p>tekst</p>'] });
  const calls = observeChecks(page);
  await c.driver.select(0, 0, 5);
  await page.keyboard.type(' qzxvplmno');
  await page.waitForTimeout(750); // The clause observes the complete real 600ms debounce window.
  expect(await flags(page)).toEqual([]);
  await expect(page.locator(flagSelector)).toHaveCount(0);
  expect(calls).toEqual([]);
  await expect(page.locator('.ProseMirror').first()).toHaveAttribute('spellcheck', 'false');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await toggle(page, true);
  await expect.poll(() => flags(page)).toEqual(['tekst', 'qzxvplmno']);
});

test('[NEO-170-A] Leafloom: deliberate Format pass toggles highlights and dismisses spelling suggestions on off', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p>tekst</p>'] });
  await c.driver.select(0, 0, 5);
  await toggle(page, true);
  await expect.poll(() => flags(page)).toEqual(['tekst']);
  await rightClickFlag(page, 'tekst');
  await page.keyboard.press('Escape');
  await toggle(page, false);
  await expect.poll(() => flags(page)).toEqual([]);
  await expect(page.locator(flagSelector)).toHaveCount(0);
  await expect(page.getByRole('menu')).toHaveCount(0);
});
for (const [gesture, key, code, shift] of [
  ['logical Shift semicolon', ';', 'Comma', true],
  ['physical layout fallback', 'ö', 'Semicolon', false],
] as const)
  test(`[NEO-170-B] Leafloom: trusted ${gesture} toggles once and Alt excludes spelling shortcuts`, async ({
    page,
  }) => {
    const c = await existingBook(page, { chapters: ['<p>tekst</p>'] });
    await c.driver.select(0, 0, 5);
    const session = await page.context().newCDPSession(page),
      mod = process.platform === 'darwin' ? 4 : 2;
    const press = async (alt = false) => {
      const modifiers = mod + (shift ? 8 : 0) + (alt ? 1 : 0);
      await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers });
      await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
    };
    await press(true);
    expect(await flags(page)).toEqual([]);
    await expect(page.locator(flagSelector)).toHaveCount(0);
    await press();
    await expect.poll(() => flags(page)).toEqual(['tekst']);
    await press(true);
    expect(await flags(page)).toEqual(['tekst']);
    await rightClickFlag(page, 'tekst');
    await press();
    await expect.poll(() => flags(page)).toEqual([]);
    await expect(page.locator(flagSelector)).toHaveCount(0);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await session.detach();
  });

test('[NEO-171-A] Leafloom: checks active chapter lazily and coalesces edited chapter scans without checking the whole novel', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p>tekst</p>', '<p>mispell</p>'] });
  const calls = observeChecks(page);
  await c.driver.select(0, 0, 5);
  await toggle(page, true);
  await expect.poll(() => flags(page, 0)).toEqual(['tekst']);
  expect(await flags(page, 1)).toEqual([]);
  expect(calls[0].words).toEqual(['tekst']);
  await c.driver.select(1, 0, 7);
  await expect.poll(() => flags(page, 1)).toEqual(['mispell']);
  expect(await flags(page, 0)).toEqual(['tekst']);
  const before = calls.length,
    started = Date.now();
  await page.keyboard.type(' qzxvplmno');
  await expect.poll(() => flags(page, 1)).toEqual(['mispell', 'qzxvplmno']);
  const rescans = calls.slice(before);
  expect(rescans).toHaveLength(1);
  expect(rescans[0].words).toEqual(['qzxvplmno']);
  expect(rescans[0].at - started).toBeGreaterThanOrEqual(500);
  await page.locator('.tab[data-tab="notes"]').click();
  expect(await flags(page, 0)).toEqual(['tekst']);
});

test('[NEO-172-A] Leafloom: accented apostrophe and non-Latin words reach real dictionaries while acronyms plans and single letters are skipped', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: [
      '<p>A I NASA HELLO déjà l’homme текст qzxvplmno</p><p class="scene-break">***</p><p class="ghost" data-sec-id="plan">planned</p>',
    ],
    library: { spellLanguage: 'fr' },
  });
  const calls = observeChecks(page);
  await c.driver.select(0, 0, 0);
  await toggle(page, true);
  await expect.poll(() => flags(page)).toEqual(['текст', 'qzxvplmno']);
  expect(calls[0].words).toEqual(['déjà', "l'homme", 'текст', 'qzxvplmno']);
  await language(page, 'ru');
  await expect.poll(() => flags(page)).toEqual(['déjà', 'l’homme', 'qzxvplmno']);
});

test('[NEO-173-A] Leafloom: accepted real dictionary compounds stay unmarked and rejected compounds flag only the invalid piece', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p>well-known glarp-known hello-world</p>'] });
  await c.driver.select(0, 0, 0);
  await toggle(page, true);
  await expect.poll(() => flags(page)).toEqual(['glarp']);
});

test('[NEO-174-A] Leafloom: prefix stammers check only the final word and ordinary compounds retain dictionary checks', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p>Wh-what Wh-whut glarp-known</p>'] });
  const calls = observeChecks(page);
  await c.driver.select(0, 0, 0);
  await toggle(page, true);
  await expect.poll(() => flags(page)).toEqual(['whut', 'glarp']);
  expect(calls[0].words).toEqual(['what', 'whut', 'glarp-known', 'glarp', 'known']);
});

test('[NEO-175-A] Leafloom: actual flagged-word context menu offers disabled no-suggestion row plus Learn inside the viewport', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p>qzxvplmnolearn</p><p>hello</p>'] });
  await c.driver.select(0, 0, 0);
  await toggle(page, true);
  await expect.poll(() => flags(page)).toEqual(['qzxvplmnolearn']);
  await page.locator('.chapter-body p').last().click({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#book')).toBeHidden();
  await c.driver.selectBook(c.title);
  await expect.poll(() => flags(page)).toEqual(['qzxvplmnolearn']);
  await rightClickFlag(page, 'qzxvplmnolearn');
  await expect(page.getByRole('menuitem', { name: 'No suggestions', exact: true })).toBeDisabled();
  const rect = await page.getByRole('menu').boundingBox(),
    viewport = page.viewportSize()!;
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
  await page.getByRole('menuitem', { name: 'Learn “qzxvplmnolearn”', exact: true }).click();
  await expect.poll(() => flags(page)).toEqual([]);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('[NEO-176-A] Leafloom: choosing a real suggestion replaces exactly the styled word and author Undo restores the original spelling', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p>Alpha <b>mispell</b> omega.</p>'] });
  await c.driver.select(0, 0, 0);
  await toggle(page, true);
  await expect.poll(() => flags(page)).toEqual(['mispell']);
  await rightClickFlag(page, 'mispell');
  await page.getByRole('menuitem', { name: 'misspell', exact: true }).click();
  await expect(page.locator('.chapter-body p')).toHaveText('Alpha misspell omega.');
  await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText('misspell');
  await c.driver.undo();
  await expect(page.locator('.chapter-body p')).toHaveText('Alpha mispell omega.');
  await expect(page.locator('.chapter-body b,.chapter-body strong')).toHaveText('mispell');
  await c.driver.shelf();
  expect((await persistedBook(page, c.title)).chapters[0].html).toBe(
    '<p>Alpha <b>mispell</b> omega.</p>',
  );
});

test('[NEO-177-A] Leafloom: learned name clears every checked chapter and persists through dictionary and application reload', async ({
  page,
}) => {
  const word = 'qzxvplmnopersist',
    c = await existingBook(page, { chapters: ['<p>' + word + '</p>', '<p>' + word + '</p>'] });
  await c.driver.select(0, 0, 0);
  await toggle(page, true);
  await expect.poll(() => flags(page, 0)).toEqual([word]);
  await c.driver.select(1, 0, 0);
  await expect.poll(() => flags(page, 1)).toEqual([word]);
  await rightClickFlag(page, word);
  await page.getByRole('menuitem', { name: 'Learn “' + word + '”', exact: true }).click();
  await expect.poll(() => flags(page)).toEqual([]);
  const learned = JSON.parse(
    await readFile(path.join(privateStorageRoot(page), 'spell-words.json'), 'utf8'),
  );
  expect(learned['en-US']).toContain(word);
  expect((await persistedLibrary(page)).customWords).toContain(word);
  await language(page, 'fr');
  // NEO supplies global library.customWords to every dictionary load.
  await expect.poll(() => flags(page)).toEqual([]);
  await language(page, 'en-US');
  await expect.poll(() => flags(page)).toEqual([]);
  await c.driver.shelf();
  await page.reload();
  await c.driver.selectBook(c.title);
  await c.driver.select(0, 0, 0);
  await toggle(page, true);
  await expect.poll(() => flags(page)).toEqual([]);
  expect((await persistedLibrary(page)).customWords).toContain(word);
});

for (const [code, correct] of languages)
  test(`[NEO-178-A] Leafloom: ${code} uses its real bundled dictionary and durably remembers the selected language`, async ({
    page,
  }) => {
    const c = await existingBook(page, { chapters: ['<p>' + correct + ' qzxvplmno</p>'] });
    const calls = observeChecks(page);
    await c.driver.select(0, 0, 0);
    await language(page, code);
    await toggle(page, true);
    await expect.poll(() => flags(page)).toEqual(['qzxvplmno']);
    expect(calls.at(-1)?.language).toBe(code);
    await expect.poll(async () => (await persistedLibrary(page)).spellLanguage).toBe(code);
    await c.driver.shelf();
    await page.reload();
    await c.driver.selectBook(c.title);
    await c.driver.select(0, 0, 0);
    await toggle(page, true);
    await expect.poll(() => flags(page)).toEqual(['qzxvplmno']);
    expect(calls.at(-1)?.language).toBe(code);
  });
test('[NEO-177-A] Leafloom: learning a curly-apostrophe name accepts its straight alias across chapters and a fresh deliberate pass', async ({
  page,
}) => {
  const curly = 'qzxv’persistalias',
    straight = "qzxv'persistalias";
  const c = await existingBook(page, {
    chapters: ['<p>' + curly + '</p>', '<p>' + straight + '</p>'],
  });
  await c.driver.select(0, 0, 0);
  await toggle(page, true);
  await expect.poll(() => flags(page, 0)).toEqual([curly]);
  await c.driver.select(1, 0, 0);
  await expect.poll(() => flags(page, 1)).toEqual([straight]);
  await c.driver.select(0, 0, 0);
  await rightClickFlag(page, curly);
  await page.getByRole('menuitem', { name: 'Learn “' + curly + '”', exact: true }).click();
  await expect.poll(() => flags(page)).toEqual([]);
  await toggle(page, false);
  await toggle(page, true);
  await expect.poll(() => flags(page)).toEqual([]);
  expect((await persistedLibrary(page)).customWords).toContain(straight);
  await c.driver.shelf();
  expect(
    (await persistedBook(page, c.title)).chapters.map((chapter: { html: string }) => chapter.html),
  ).toEqual(['<p>' + curly + '</p>', '<p>' + straight + '</p>']);
});
