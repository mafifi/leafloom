import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import type { EngineId, Manuscript, Selection } from '../src/contracts';

const screenshots = process.env.NEO_SPIKE_SCREENSHOT_DIR ?? path.resolve('screenshots');
const opening = 'The lighthouse was quiet. Too quiet.';
async function select(page: Page, blockId: string, from: number, to = from, chapterId = 'chapter-one') {
  await page.evaluate(selection => window.spike!.select(selection), { chapterId, blockId, from, to } satisfies Selection);
}
async function read(page: Page): Promise<Manuscript> {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.spike!.document)) as Manuscript);
}
async function text(page: Page, blockId: string) {
  const document = await read(page);
  return document.chapters.flatMap(chapter => chapter.blocks).find(block => block.id === blockId)?.runs.map(run => run.text).join('');
}
async function waitText(page: Page, blockId: string, expected: string) {
  await expect.poll(() => text(page, blockId)).toBe(expected);
}

for (const engine of ['neo', 'prosemirror', 'lexical'] as const satisfies readonly EngineId[]) {
  test.describe(engine, () => {
    test.beforeEach(async ({ page }) => {
      page.on('pageerror',error=>{throw error;});
      await page.goto(`/?engine=${engine}`);
      await page.waitForFunction(() => Boolean(window.spike));
      await expect(page.locator('.editor-host')).toHaveAttribute('data-engine', engine);
    });

    test('native typing, stable IDs, toolbar formatting and keyboard undo', async ({ page }) => {
      await expect(page.locator('.editor-host .chapter')).toHaveCount(2);
      await select(page, 'opening', 0);
      await page.keyboard.type('Hello ');
      await waitText(page, 'opening', `Hello ${opening}`);
      await select(page, 'opening', 0, 5);
      await page.getByRole('button', { name: 'Bold', exact: true }).click();
      await expect.poll(async () => (await read(page)).chapters[0].blocks[0].runs.some(run => run.text.includes('Hello') && run.bold)).toBe(true);
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(async () => (await read(page)).chapters[0].blocks[0].runs.some(run => run.text.includes('Hello') && run.bold)).toBe(false);
      await waitText(page, 'opening', `Hello ${opening}`);
    });

    test('real Enter gestures split at caret then create scene and chapter; undo restores caret', async ({ page }) => {
      await select(page, 'opening', 15);
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await read(page)).chapters[0].blocks.length).toBe(4);
      await waitText(page, 'opening', opening.slice(0, 15));
      const split = await read(page);
      expect(split.chapters[0].blocks[1].runs.map(run => run.text).join('')).toBe(opening.slice(15));
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await read(page)).chapters[0].blocks.filter(block => block.kind === 'scene-break').length).toBe(1);
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await read(page)).chapters.length).toBe(3);
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(async () => (await read(page)).chapters.length).toBe(2);
      await page.keyboard.press('ControlOrMeta+z');
      await expect.poll(async () => (await read(page)).chapters[0].blocks.filter(block => block.kind === 'scene-break').length).toBe(0);
      await page.keyboard.press('ControlOrMeta+z');
      await waitText(page, 'opening', opening);
      await expect.poll(() => page.evaluate(() => window.spike!.selection)).toEqual({ chapterId: 'chapter-one', blockId: 'opening', from: 15, to: 15 });
    });

    test('Darling preserves formatting after an intervening prefix edit', async ({ page }) => {
      await select(page, 'weather', 18, 25);
      await page.getByRole('button', { name: 'Keep selected passage', exact: true }).click();
      await expect.poll(async () => (await read(page)).darlings.length).toBe(1);
      expect((await read(page)).darlings[0].runs).toEqual([{ text: 'the sea', bold: true }]);
      await select(page, 'weather', 0);
      await page.keyboard.type('Still, ');
      await page.getByRole('button', { name: 'Restore passage', exact: true }).click();
      await expect.poll(async () => (await read(page)).darlings.length).toBe(0);
      await waitText(page, 'weather', 'Still, Beyond the glass, the sea kept its own counsel.');
      expect((await read(page)).chapters[0].blocks.find(block => block.id === 'weather')!.runs.some(run => run.text === 'the sea' && run.bold)).toBe(true);
    });

    test('delayed agent rejects changed target text', async ({ page }) => {
      await select(page, 'opening', 0, 24);
      await page.getByRole('button', { name: 'Suggest a revision', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Reading your passage…', exact: true })).toBeVisible();
      await select(page, 'opening', 19, 24);
      await page.keyboard.type('noisy');
      await page.getByRole('button', { name: 'Apply revision', exact: true }).click();
      await expect(page.locator('footer')).toContainText('proposal target changed');
      await waitText(page, 'opening', 'The lighthouse was noisy. Too quiet.');
      expect(await page.evaluate(() => window.spike!.events.some(event => event.type === 'proposal.rejected'))).toBe(true);
    });

    test('delayed agent survives unrelated edit and undo preserves that edit', async ({ page }) => {
      await select(page, 'opening', 0, 24);
      await page.getByRole('button', { name: 'Suggest a revision', exact: true }).click();
      await select(page, 'return', 0, 0, 'chapter-two');
      await page.keyboard.type('Later, ');
      await page.getByRole('button', { name: 'Apply revision', exact: true }).click();
      await waitText(page, 'opening', 'The lighthouse stood silent. Too quiet.');
      await waitText(page, 'return', 'Later, At sunrise, somebody knocked.');
      expect(await page.evaluate(() => window.spike!.events.some(event => event.type === 'proposal.applied' && event.rebased))).toBe(true);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await waitText(page, 'opening', opening);
      await waitText(page, 'return', 'Later, At sunrise, somebody knocked.');
    });

    test('browser storage save/reopen restores rich manuscript', async ({ page }) => {
      await select(page, 'opening', 0);
      await page.keyboard.type('Saved ');
      await select(page, 'opening', 0, 5);
      await page.getByRole('button', { name: 'Italic', exact: true }).click();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.locator('footer')).toContainText('Saved.');
      const saved = await read(page);
      await page.getByRole('button', { name: 'Reset fixture', exact: true }).click();
      await waitText(page, 'opening', opening);
      await page.getByRole('button', { name: 'Reopen', exact: true }).click();
      await expect.poll(() => read(page)).toEqual(saved);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.spike));
      await page.getByRole('button', { name: 'Reopen', exact: true }).click();
      await expect.poll(() => read(page)).toEqual(saved);
    });

    test('real clipboard paste keeps bold and excludes script content', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await select(page, 'opening', 0);
      await page.evaluate(async () => {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob(['<b>Pasted</b> <script>window.badPaste=true</script>'], { type: 'text/html' }), 'text/plain': new Blob(['Pasted '], { type: 'text/plain' }) })]);
      });
      await page.keyboard.press('ControlOrMeta+v');
      await expect.poll(() => text(page, 'opening')).toContain('Pasted');
      const block = (await read(page)).chapters[0].blocks[0];
      expect(block.runs.some(run => run.bold && run.text.includes('Pasted'))).toBe(true);
      expect(block.runs.map(run => run.text).join('')).not.toContain('window.badPaste');
    });

    test('synthetic composition guard prevents structural Enter', async ({ page }) => {
      await select(page, 'opening', 3);
      const before = await read(page);
      await page.evaluate(() => {
        const active = document.activeElement!;
        active.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
        active.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', isComposing: true }));
        active.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
      });
      expect((await read(page)).chapters).toEqual(before.chapters);
    });

    test('switches dispose editors and preserve canonical manuscript with one edit event', async ({ page }) => {
      await select(page, 'opening', 0);
      await page.keyboard.type('Across ');
      const document = await read(page);
      for (const name of ['NEO browser', 'ProseMirror', 'Lexical']) {
        await page.getByRole('button', { name, exact: true }).click();
        expect((await read(page)).chapters).toEqual(document.chapters);
        await expect(page.locator('.editor-host .chapter')).toHaveCount(2);
      }
      await select(page, 'opening', 0);
      const count = await page.evaluate(() => window.spike!.events.filter(event => event.type === 'document.changed').length);
      await page.keyboard.type('X');
      await waitText(page, 'opening', `XAcross ${opening}`);
      expect(await page.evaluate(() => window.spike!.events.filter(event => event.type === 'document.changed').length)).toBe(count + 1);
    });

    test('captures comparison surface', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.screenshot({ path: path.join(screenshots, `${engine}-comparison.png`) });
    });
  });
}
