import { test, expect } from './author-fixture';
import type { Page } from '@playwright/test';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from '../evidence.mjs';
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const speechHighlight = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference' ? 'neo-speak' : 'leafloom-speak';
// SpeechSynthesisVoice has native IDL branding. A mocked synthesis service
// needs a matching utterance transport; these cases qualify author behavior,
// not the operating system's installed speech service.
async function mockSpeechUtterances(page: Page) {
  await page.addInitScript(() => {
    class FixtureUtterance {
      text: string;
      voice: SpeechSynthesisVoice | null = null;
      lang = '';
      onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
      onend: ((event: SpeechSynthesisEvent) => void) | null = null;
      onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FixtureUtterance,
    });
  });
}

test('[NEO135-019-A] local voice follows the caret sentence across real rich chapters and Escape returns the reached caret without saved highlights', async ({
  page,
}) => {
  await mockSpeechUtterances(page);
  await page.addInitScript(() => {
    const calls: { text: string; language: string }[] = [],
      utterances: SpeechSynthesisUtterance[] = [];
    const voice = {
      voiceURI: 'private-local',
      name: 'Private local',
      lang: 'fr-FR',
      default: false,
      localService: true,
    } as SpeechSynthesisVoice;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [voice],
        cancel: () => {},
        speak: (u: SpeechSynthesisUtterance) => {
          calls.push({ text: u.text, language: u.lang });
          utterances.push(u);
          u.onstart?.(new Event('start') as SpeechSynthesisEvent);
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    Object.assign(window, {
      __readingCalls: calls,
      __finishReading: () => utterances.at(-1)?.onend?.(new Event('end') as SpeechSynthesisEvent),
    });
  });
  const c = await existingBook(page, {
    chapters: [
      '<p>First sentence. <em>Second sentence.</em></p>',
      '<p><strong>Third sentence.</strong> Last sentence.</p>',
    ],
    library: { spellLanguage: 'fr' },
  });
  await c.driver.select(0, 0, 20);
  await c.driver.key(modifier + '+Shift+u');
  const calls = () =>
    page.evaluate(
      () =>
        (window as unknown as { __readingCalls: { text: string; language: string }[] })
          .__readingCalls,
    );
  await expect.poll(calls).toEqual([{ text: 'Second sentence.', language: 'fr-FR' }]);
  await expect
    .poll(() => page.evaluate((name) => CSS.highlights.get(name)?.size ?? 0, speechHighlight))
    .toBe(1);
  await page.evaluate(() =>
    (window as unknown as { __finishReading: () => void }).__finishReading(),
  );
  await expect.poll(calls).toHaveLength(2);
  expect((await calls())[1]).toEqual({ text: 'Third sentence.', language: 'fr-FR' });
  await c.driver.key('Escape');
  await expect.poll(() => c.driver.caret()).toMatchObject({ chapter: 1, paragraph: 0, offset: 0 });
  expect(await page.evaluate((name) => CSS.highlights.has(name), speechHighlight)).toBe(false);
  await c.driver.type('New ');
  await c.driver.reopen();
  await c.driver.expectParagraphs([
    ['First sentence. Second sentence.'],
    ['New Third sentence. Last sentence.'],
  ]);
  expect((await persistedBook(page, c.title)).chapters.map((ch) => ch.html).join('')).not.toMatch(/leafloom-speak|neo-speak/);
  await expect(page.locator('.chapter-body em,.chapter-body i')).toHaveText('Second sentence.');
});
test('[NEO135-019-B] no installed local voice explains speech availability while preserving author prose and caret', async ({
  page,
}) => {
  await mockSpeechUtterances(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel: () => {},
        speak: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  });
  const c = await existingBook(page, { chapters: ['<p>Keep the writing.</p>'] });
  await c.driver.select(0, 0, 5);
  await c.driver.key(modifier + '+Shift+u');
  await expect(page.locator('body')).toContainText('Read aloud needs a voice on this computer');
  await expect.poll(() => c.driver.caret()).toMatchObject({ chapter: 0, paragraph: 0, offset: 5 });
  await c.driver.reopen();
  await c.driver.expectParagraphs([['Keep the writing.']]);
});

test('[NEO135-019-C] native typing stops local speech without moving the author caret and preserves history', async ({
  page,
}) => {
  await mockSpeechUtterances(page);
  await page.addInitScript(() => {
    const utterances: SpeechSynthesisUtterance[] = [];
    const voice = {
      voiceURI: 'typing-local',
      name: 'Typing local',
      lang: 'fr-FR',
      default: true,
      localService: true,
    } as SpeechSynthesisVoice;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [voice],
        cancel: () => {},
        speak: (u: SpeechSynthesisUtterance) => {
          utterances.push(u);
          u.onstart?.(new Event('start') as SpeechSynthesisEvent);
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    Object.assign(window, {
      __spoken: utterances,
      __finishReading: () => utterances.at(-1)?.onend?.(new Event('end') as SpeechSynthesisEvent),
    });
  });
  const c = await existingBook(page, {
    chapters: ['<p>First sentence. Second sentence.</p>', '<p>Third sentence.</p>'],
    library: { spellLanguage: 'fr' },
  });
  await c.driver.select(0, 0, 20);
  await c.driver.key(modifier + '+Shift+u');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __spoken: SpeechSynthesisUtterance[] }).__spoken.length,
      ),
    )
    .toBe(1);
  await page.evaluate(() =>
    (window as unknown as { __finishReading: () => void }).__finishReading(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __spoken: SpeechSynthesisUtterance[] }).__spoken.length,
      ),
    )
    .toBe(2); // Pinned app.js:10026–10032 stops(false) for typing; only Escape/toggle return the reached caret.
  await c.driver.key('x');
  expect(await page.evaluate((name) => CSS.highlights.has(name), speechHighlight)).toBe(false);
  await c.driver.expectParagraphs([['First sentence. Secoxnd sentence.'], ['Third sentence.']]);
  await c.driver.undo();
  await c.driver.expectParagraphs([['First sentence. Second sentence.'], ['Third sentence.']]);
  await c.driver.redo();
  await c.driver.reopen();
  await c.driver.expectParagraphs([['First sentence. Secoxnd sentence.'], ['Third sentence.']]);
  expect((await persistedBook(page, c.title)).chapters.map((ch) => ch.html).join('')).not.toMatch(/leafloom-speak|neo-speak/);
});

test('[NEO135-017-A] actual full-size cover rendering writes a JPEG through the host destination and cancellation preserves that artifact', async ({
  page,
}) => {
  const c = await existingBook(page, { chapters: ['<p>Cover manuscript.</p>'] });
  const destination = path.join(c.folder, 'cover-publication.jpg');
  const result = await page.evaluate(
    async ({ id, destination, coverModule }) => {
      const saveModule = '/src/lib/cover-image.ts',
        hostModule = '/src/lib/host.ts';
      const { saveCoverImage } = (await import(
        saveModule
      )) as typeof import('../../../apps/desktop/src/lib/cover-image');
      const { PaintedCovers, renderFull: fullCanvas } = (await import(
        coverModule
      )) as typeof import('../../../packages/presentation/painted-covers/src/index');
      const { host } = (await import(
        hostModule
      )) as typeof import('../../../apps/desktop/src/lib/host');
      const request = async (method: string, payload: unknown) => {
        const reply = await host.request(method as never, payload as never);
        if (!reply.ok) throw Error(reply.code);
        return reply.value;
      };
      const meta = await request('readBookMeta', { bookId: id });
      const provider = new PaintedCovers();
      const rendered = await provider.renderFull(meta as never),
        artOnly = fullCanvas(meta as never, { artOnly: true }).toDataURL('image/jpeg', 0.92);
      const bitmap = await createImageBitmap(await (await fetch(rendered)).blob());
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      const context = {
        metadata: async () => meta as never,
        generated: async () => rendered,
        destination: async () => destination,
        request: request as never,
        hint: () => {},
        t: (key: string) => key,
      };
      await saveCoverImage(context, id);
      await saveCoverImage({ ...context, destination: async () => null }, id);
      return { ...dimensions, lettered: rendered !== artOnly, base64: rendered.split(',')[1] };
    },
    {
      id: c.id,
      destination,
      coverModule: '/@fs/' + path.join(root, 'packages/presentation/painted-covers/src/index.ts'),
    },
  );
  expect(result.lettered).toBe(true);
  expect(result.width).toBe(1600);
  expect(result.height).toBe(2560);
  expect(await readFile(destination)).toEqual(Buffer.from(result.base64!, 'base64'));
  await c.driver.reopen();
  await c.driver.expectParagraphs([['Cover manuscript.']]);
});
