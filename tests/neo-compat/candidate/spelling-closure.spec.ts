import { test, expect } from './author-fixture';
import { dictionaryFlags, dictionaryWord } from './spelling-observation';
import type { Page } from '@playwright/test';
import { existingBook } from './book-fixture';
import { persistedBook, persistedLibrary, privateStorageRoot } from './storage-probe';
import { clickReferenceMenu } from '../reference/harness';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const source = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const invented = 'qzxvplmnospellclosure';
async function flags(page: Page) {
  return (await dictionaryFlags(page)).sort();
}
async function pass(page: Page) {
  if (source) await clickReferenceMenu(page, ['Edit', 'Spellcheck Pass']);
  else {
    await page.locator('#format-menu').click();
    await page.getByRole('menuitem', { name: 'Spellcheck on', exact: true }).click();
  }
}
async function off(page: Page) {
  if (source) await clickReferenceMenu(page, ['Edit', 'Spellcheck Pass']);
  else {
    await page.locator('#format-menu').click();
    await page.getByRole('menuitem', { name: 'Spellcheck off', exact: true }).click();
    await expect(page.locator('[data-annotation-kind="spelling"]')).toHaveCount(0);
  }
}
async function language(page: Page, code: 'ro' | 'pt' | 'fr') {
  if (source)
    await clickReferenceMenu(page, [
      'Edit',
      'Spellcheck Language',
      { ro: 'Română', pt: 'Português (Brasil)', fr: 'Français' }[code],
    ]);
  else {
    await page.locator('#format-menu').click();
    await page.getByRole('menuitem', { name: 'Language: ' + code, exact: true }).click();
  }
  await expect
    .poll(async () => (await persistedLibrary(page)).spellLanguage)
    .toBe(source && code === 'pt' ? 'pt-BR' : code);
}
async function wordMenu(page: Page, word: string) {
  if (source) {
    const point = await page.evaluate((word) => {
      const r = Array.from(CSS.highlights.get('neo-spell') || []).find(
        (r) => r.toString() === word,
      );
      if (!(r instanceof Range)) throw Error('Actual flagged range missing');
      const b = r.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, word);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await expect(page.locator('.spell-menu')).toBeVisible();
  } else {
    await (await dictionaryWord(page, word)).click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
  }
}
async function learn(page: Page, word: string) {
  await wordMenu(page, word);
  if (source)
    await page
      .locator('.spell-menu button')
      .filter({ hasText: /Add .*dictionary/ })
      .click();
  else await page.getByRole('menuitem', { name: 'Learn “' + word + '”', exact: true }).click();
}

test('[NEO-181-A][NEO-183-A] Leafloom: actual Romanian Unicode matrix learns comma cedilla and decomposed names across checked chapters Notes and reload', async ({
  page,
}) => {
  const comma = 'Nerțulică',
    cedilla = 'Nerţulică',
    decomposed = comma.normalize('NFD');
  const text =
    'școală şcoală ' + 'Țară'.normalize('NFD') + ' ' + cedilla + ' ' + comma + ' ' + decomposed;
  const c = await existingBook(page, {
    chapters: ['<p>' + text + '</p>', '<p><i>' + comma + '</i></p>'],
    notes: '<p>' + cedilla + ' frgament</p>',
  });
  await language(page, 'ro');
  await c.driver.select(0, 0, 0);
  await pass(page);
  await expect.poll(() => flags(page)).toEqual([cedilla, comma, decomposed].sort());
  await c.driver.select(1, 0, 0);
  await expect.poll(() => flags(page)).toEqual([cedilla, comma, decomposed, comma].sort());
  await page.locator('.tab[data-tab="notes"]').click();
  await page.locator('#aux-editor').click();
  await expect
    .poll(() => flags(page))
    .toEqual([cedilla, comma, decomposed, comma, cedilla, 'frgament'].sort());
  await page.locator('.tab[data-tab="manuscript"]').click();
  await page.locator('.chapter-body').first().scrollIntoViewIfNeeded();
  await c.driver.select(0, 0, 0);
  await learn(page, cedilla);
  await expect.poll(() => flags(page)).toEqual(['frgament']);
  expect((await persistedLibrary(page)).customWords).toContain(cedilla);
  await c.driver.shelf();
  const before = await persistedBook(page, c.title, c.id);
  expect(before.chapters.map((ch: { html: string }) => ch.html)).toEqual([
    '<p>' + text + '</p>',
    '<p><i>' + comma + '</i></p>',
  ]);
  expect(before.notes).toBe('<p>' + cedilla + ' frgament</p>');
  await page.reload();
  await c.driver.selectBook(c.title);
  await c.driver.select(0, 0, 0);
  await pass(page);
  await expect.poll(() => flags(page)).toEqual([]);
  await c.driver.select(1, 0, 0);
  await expect.poll(() => flags(page)).toEqual([]);
  await page.locator('.tab[data-tab="notes"]').click();
  await page.locator('#aux-editor').click();
  await expect.poll(() => flags(page)).toEqual(['frgament']);
  expect((await persistedBook(page, c.title, c.id)).notes).toBe(before.notes);
});

test('[NEO-174-A][NEO-176-A][NEO-182-A] Leafloom: real Portuguese compounds and stammers retain accents and suggestion replacement has rich author Undo', async ({
  page,
}) => {
  const prefix =
    'fazê-lo disse-lhe dir-se-ia amá-lo-ei guarda-chuva e-mail ideia voo linguiça E-eu N-não ';
  const html = '<p>' + prefix + '<i>coracao</i> excessão previlégio</p>';
  const c = await existingBook(page, { chapters: [html] });
  await language(page, 'pt');
  await c.driver.select(0, 0, 0);
  await pass(page);
  await expect.poll(() => flags(page)).toEqual(['coracao', 'excessão', 'previlégio'].sort());
  await wordMenu(page, 'coracao');
  if (source)
    await page
      .locator('.spell-menu button')
      .filter({ hasText: /^coração$/ })
      .click();
  else await page.getByRole('menuitem', { name: 'coração', exact: true }).click();
  await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText('coração');
  await expect.poll(() => flags(page)).toEqual(['excessão', 'previlégio'].sort());
  await c.driver.undo();
  await expect(page.locator('.chapter-body i,.chapter-body em')).toHaveText('coracao');
  await c.driver.reopen();
  expect((await persistedBook(page, c.title, c.id)).chapters[0].html).toBe(html);
  expect((await persistedLibrary(page)).spellLanguage).toBe(source ? 'pt-BR' : 'pt');
});

for (const mutation of ['text', 'chapter', 'toggle', 'language'] as const)
  test(`[NEO-180-A] Leafloom: delayed real dictionary response cannot paint stale ranges after ${mutation} changes`, async ({
    page,
  }) => {
    const c = await existingBook(page, {
      chapters: [
        '<p><b>' + (mutation === 'language' ? 'bonjour' : invented) + '</b></p>',
        '<p><i>hello</i></p>',
      ],
      notes: '<p>Notes stay.</p>',
    });
    await c.driver.select(0, 0, 0);
    let completed = false;
    let oldSpellId: number | undefined;
    const fixtureRoot = path.resolve(privateStorageRoot(page), '../..');
    const records = async () =>
      JSON.parse(await readFile(path.join(fixtureRoot, 'intercepted-effects.json'), 'utf8')) as {
        type: string;
        payload: { channel: string; id?: number };
      }[];
    if (source)
      await writeFile(
        path.join(path.resolve(privateStorageRoot(page), '../..'), '.neo-parity-host.json'),
        JSON.stringify({ ipcLog: true, ipcDelays: { 'spell:check': { after: 1200 } } }),
      );
    else
      await page.route('**/__leafloom/host', async (route) => {
        const b = route.request().postDataJSON();
        if (b.method !== 'spellcheck' || completed) return route.continue();
        completed = true;
        const response = await route.fetch();
        await new Promise((r) => setTimeout(r, 1200));
        await route.fulfill({ response });
      });
    await pass(page);
    if (source) {
      await expect
        .poll(
          async () =>
            (await records()).filter(
              (r) => r.type === 'ipc-start' && r.payload.channel === 'spell:check',
            ).length,
        )
        .toBe(1);
      oldSpellId = (await records()).find(
        (r) => r.type === 'ipc-start' && r.payload.channel === 'spell:check',
      )!.payload.id;
      expect(oldSpellId).toBeDefined();
      await writeFile(
        path.join(fixtureRoot, '.neo-parity-host.json'),
        JSON.stringify({ ipcLog: true }),
      );
    }
    if (mutation === 'text') {
      await c.driver.select(0, 0, 0, invented.length);
      await page.keyboard.insertText('hello');
    }
    if (mutation === 'chapter') await c.driver.select(1, 0, 0);
    if (mutation === 'toggle') await off(page);
    if (mutation === 'language') await language(page, 'fr');
    // Observe the full real delayed reply window; this is the declared asynchronous oracle.
    await page.waitForTimeout(1450);
    if (source && mutation === 'language') {
      const completions = (await records()).filter(
        (r) => r.type === 'ipc-complete' && r.payload.channel === 'spell:check',
      );
      expect(completions).toHaveLength(2);
      expect(completions[0].payload.id).not.toBe(oldSpellId);
      expect(completions[1].payload.id).toBe(oldSpellId);
    }
    if (source && mutation === 'language') {
      await expect.poll(() => flags(page)).toEqual(['bonjour']);
      test
        .info()
        .annotations.push({
          type: 'source-characterization',
          description:
            'The completed newer French scan is overwritten by the older English reply; original paints bonjour under the persisted French dictionary. Leafloom must reject that old-language result and retain no flag.',
        });
    } else if (mutation === 'chapter') await expect.poll(() => flags(page)).toEqual([invented]);
    else await expect.poll(() => flags(page)).toEqual([]);
    if (source)
      expect(
        await page.evaluate(() =>
          Array.from(CSS.highlights.get('neo-spell') || []).every(
            (r) => r.startContainer.isConnected && r.endContainer.isConnected,
          ),
        ),
      ).toBe(true);
    else expect(completed).toBe(true);
    await c.driver.shelf();
    const saved = await persistedBook(page, c.title, c.id);
    expect(saved.chapters.map((ch: { html: string }) => ch.html)).toEqual([
      '<p><b>' +
        (mutation === 'text' ? 'hello' : mutation === 'language' ? 'bonjour' : invented) +
        '</b></p>',
      '<p><i>hello</i></p>',
    ]);
    expect(saved.notes).toBe('<p>Notes stay.</p>');
    await c.driver.selectBook(c.title);
    await c.driver.expectParagraphs([
      [mutation === 'text' ? 'hello' : mutation === 'language' ? 'bonjour' : invented],
      ['hello'],
    ]);
  });

test('[NEO-179-A] Leafloom: actual failed Romanian dictionary load retains the previous dictionary and durable choice then permits a real retry', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p><b>hello qzxvplmnodictionary</b></p>'],
    notes: '<p>Research stays.</p>',
  });
  await c.driver.select(0, 0, 0);
  await pass(page);
  await expect.poll(() => flags(page)).toEqual(['qzxvplmnodictionary']);
  const before = (await persistedLibrary(page)).spellLanguage;
  let fail = true;
  const faultFile = path.join(
    path.resolve(privateStorageRoot(page), '../..'),
    '.neo-parity-host.json',
  );
  if (source) await writeFile(faultFile, JSON.stringify({ spellDictionaryFault: 'ro' }));
  else
    await page.route('**/__leafloom/host', async (route) => {
      const b = route.request().postDataJSON();
      if (
        fail &&
        b.method === 'spellcheck' &&
        b.payload.language === 'ro' &&
        b.payload.words.length === 0
      )
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, code: 'DICTIONARY_ERROR' }),
        });
      return route.continue();
    });
  if (source) await clickReferenceMenu(page, ['Edit', 'Spellcheck Language', 'Română']);
  else {
    await page.locator('#format-menu').click();
    await page.getByRole('menuitem', { name: 'Language: ro', exact: true }).click();
  }
  await expect(page.locator('#hint,#toast')).toContainText('That dictionary would not load');
  expect((await persistedLibrary(page)).spellLanguage).toBe(before);
  await off(page);
  await pass(page);
  await expect.poll(() => flags(page)).toEqual(['qzxvplmnodictionary']);
  if (source) {
    test.info().annotations.push({
      type: 'native-radio-qualification',
      description:
        'Source native radio selection can remain checked on failed choice; actual provider and persisted selection remain previous.',
    });
    await writeFile(faultFile, '{}');
  } else fail = false;
  await language(page, 'ro');
  await c.driver.shelf();
  const saved = await persistedBook(page, c.title, c.id);
  expect(saved.chapters[0].html).toBe('<p><b>hello qzxvplmnodictionary</b></p>');
  expect(saved.notes).toBe('<p>Research stays.</p>');
  await c.driver.selectBook(c.title);
  await c.driver.expectParagraphs([['hello qzxvplmnodictionary']]);
});
