import { test, expect, _electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ManuscriptSchema } from '../src/contracts';
import type { EngineId } from '../src/contracts';
const require = createRequire(import.meta.url);
const executablePath = (): string => require('electron') as string;
const screenshotDirectory = process.env.NEO_SPIKE_SCREENSHOT_DIR ?? path.resolve('screenshots');

for (const engine of ['neo', 'prosemirror', 'lexical'] as const) {
  test(`${engine}: real Electron typing, formatting, disk save and restart`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), `neo-editor-${engine}-`));
    let app: ElectronApplication | null = null;
    const launch = () => _electron.launch({ executablePath: executablePath(), args: [path.resolve('electron-dist/electron/main.js')], env: { ...process.env, NEO_SPIKE_DATA_DIR: directory } });
    try {
      app = await launch(); const page = await app.firstWindow();
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await page.waitForFunction(() => !!window.spike && !!window.spikeHost);
      await page.evaluate((id: EngineId) => window.spike!.switchEngine(id), engine);
      await page.evaluate(() => window.spike!.select({ chapterId: 'chapter-one', blockId: 'opening', from: 0, to: 0 }));
      await page.keyboard.type(`Electron ${engine}: `);
      await expect.poll(() => page.evaluate(() => window.spike!.document.chapters[0].blocks[0].runs.map(run => run.text).join(''))).toContain(`Electron ${engine}: `);
      await page.evaluate(() => window.spike!.select({ chapterId: 'chapter-one', blockId: 'opening', from: 0, to: 8 }));
      await page.getByRole('button', { name: 'Bold', exact: true }).click();
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
      const stored = ManuscriptSchema.parse(JSON.parse(await readFile(path.join(directory, 'manuscript.json'), 'utf8')));
      expect(stored.chapters[0].blocks[0].id).toBe('opening');
      expect(stored.chapters[0].blocks[0].runs.some(run => run.bold && run.text.includes('Electron'))).toBe(true);
      expect(stored.chapters.map(chapter => chapter.id)).toEqual(['chapter-one', 'chapter-two']);
      await page.screenshot({ path: path.join(screenshotDirectory, `electron-${engine}-saved.png`), fullPage: true });
      expect(errors).toEqual([]);
      await app.close(); app = null;
      app = await launch(); const reopened = await app.firstWindow();
      await reopened.waitForFunction(() => !!window.spike && !!window.spikeHost);
      await reopened.evaluate((id: EngineId) => window.spike!.switchEngine(id), engine);
      await reopened.getByRole('button', { name: 'Reopen', exact: true }).click();
      await expect(reopened.getByText('Reopened saved manuscript.', { exact: true })).toBeVisible();
      const restored = await reopened.evaluate(() => JSON.parse(JSON.stringify(window.spike!.document)));
      expect(restored).toEqual(stored);
      await expect(reopened.locator('[data-block-id="opening"]')).toContainText(`Electron ${engine}: `);
      await reopened.screenshot({ path: path.join(screenshotDirectory, `electron-${engine}-reopened.png`), fullPage: true });
      await reopened.evaluate(() => window.spike!.select({ chapterId: 'chapter-one', blockId: 'opening', from: 0, to: 0 }));
      await reopened.keyboard.type('Close flush: ');
      await expect.poll(() => reopened.evaluate(() => window.spike!.document.chapters[0].blocks[0].runs.map(run => run.text).join(''))).toContain('Close flush: ');
      const closed = app.waitForEvent('close');
      await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
      await closed; app = null;
      const flushed = ManuscriptSchema.parse(JSON.parse(await readFile(path.join(directory, 'manuscript.json'), 'utf8')));
      expect(flushed.chapters[0].blocks[0].runs.map(run => run.text).join('')).toContain(`Close flush: Electron ${engine}: `);
      expect(flushed.chapters[0].blocks[0].id).toBe('opening');
      expect(flushed.chapters[0].blocks[0].runs.some(run => run.bold && run.text.includes('Electron'))).toBe(true);
      app = await launch(); const finalWindow = await app.firstWindow();
      await finalWindow.waitForFunction(() => !!window.spike && !!window.spikeHost);
      await finalWindow.evaluate((id: EngineId) => window.spike!.switchEngine(id), engine);
      await finalWindow.getByRole('button', { name: 'Reopen', exact: true }).click();
      await expect(finalWindow.locator('[data-block-id="opening"]')).toContainText(`Close flush: Electron ${engine}: `);
    } finally { await app?.close(); await rm(directory, { recursive: true, force: true }); }
  });
}
