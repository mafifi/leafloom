import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { inspectHTML } from '../../../packages/editing/prosemirror-editor/src/fidelity';
import { entries, signature } from '../../../packages/editing/prosemirror-editor/src/identity';
import {
  Book,
  SourceBook,
  Metadata,
} from '../../../packages/documents/document-contracts/src/index';
import { Library } from '../../../packages/library/src/index';
import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook, persistedLibrary, privateStorageRoot } from './storage-probe';
const source = () => process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference';
const refresh = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));
const blur = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('blur')));
function referenceDirectory(page: Page) {
  return path.resolve(privateStorageRoot(page), '../..');
}
async function events(page: Page) {
  const raw: unknown = JSON.parse(
    await readFile(path.join(referenceDirectory(page), 'intercepted-effects.json'), 'utf8'),
  );
  if (!Array.isArray(raw)) throw Error('Invalid IPC observation');
  return raw.filter(
    (entry): entry is { type: string; payload: { channel?: string; args?: unknown[] } } =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.type === 'string' &&
      typeof entry.payload === 'object' &&
      entry.payload !== null,
  );
}
/** Delay only an actual already-read reply; never manufacture document data. */
async function delayedRead(page: Page, channel: string, method: string, bookId?: string) {
  let captured = false,
    completed = false,
    release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  if (source()) {
    const baseline = (await events(page).catch(() => [])).length;
    await writeFile(
      path.join(referenceDirectory(page), '.neo-parity-host.json'),
      JSON.stringify({ ipcLog: true, ipcDelays: { [channel]: { after: 1800 } } }),
    );
    return {
      started: async () =>
        expect
          .poll(async () =>
            (await events(page))
              .slice(baseline)
              .some(
                (e) =>
                  e.type === 'ipc-start' &&
                  e.payload.channel === channel &&
                  (!bookId || e.payload.args?.[0] === bookId),
              ),
          )
          .toBe(true),
      finished: async () =>
        expect
          .poll(async () =>
            (await events(page))
              .slice(baseline)
              .some((e) => e.type === 'ipc-complete' && e.payload.channel === channel),
          )
          .toBe(true),
      release: async () => {
        await writeFile(
          path.join(referenceDirectory(page), '.neo-parity-host.json'),
          JSON.stringify({ ipcLog: true }),
        );
      },
    };
  }
  await page.route('**/__leafloom/host', async (route) => {
    const payload = route.request().postDataJSON();
    if (captured || payload.method !== method || (bookId && payload.payload?.bookId !== bookId))
      return route.continue();
    const response = await route.fetch();
    captured = true;
    setTimeout(release, 1800);
    await held;
    await route.fulfill({ response });
    completed = true;
  });
  return {
    started: async () => expect.poll(() => captured).toBe(true),
    finished: async () => expect.poll(() => completed).toBe(true),
    release: async () => {
      release();
    },
  };
}
async function remote(page: Page, folder: string, edit: 'prose' | 'sides') {
  if (source()) {
    if (edit === 'prose')
      await writeFile(path.join(folder, 'chapters/ch-1.html'), '<p><b>Stale incoming.</b></p>');
    else {
      const metadata = Metadata.parse(
        JSON.parse(await readFile(path.join(folder, 'book.json'), 'utf8')),
      );
      metadata.subtitle = 'External first-book side revision';
      await writeFile(path.join(folder, 'book.json'), JSON.stringify(metadata));
      await writeFile(
        path.join(folder, 'stickies.json'),
        JSON.stringify([
          { id: 'foreign', chapterId: 'ch-1', text: 'First foreign sticky', resolved: false },
        ]),
      );
      await writeFile(
        path.join(folder, 'darlings.json'),
        JSON.stringify([
          {
            id: 'foreign-d',
            chapterId: 'ch-1',
            html: '<p><b>First foreign saved passage.</b></p>',
            text: 'First foreign saved passage.',
            date: '2026-01-01T00:00:00Z',
          },
        ]),
      );
    }
  } else {
    const file = path.join(folder, 'manuscript.json'),
      book = SourceBook.parse(JSON.parse(await readFile(file, 'utf8')));
    if (edit === 'prose') {
      const first = book.chapters[0];
      first.html = '<p><b>Stale incoming.</b></p>';
      if ('passages' in first) {
        const parsed = inspectHTML(new JSDOM('').window.document, first.html);
        if (!parsed.supported) throw Error('Unsupported remote fixture');
        first.passages = entries(parsed.model).map((entry) => ({
          id: crypto.randomUUID(),
          path: entry.path,
          signature: signature(entry.node),
        }));
      }
    } else {
      book.metadata.subtitle = 'External first-book side revision';
      book.metadata.stickies = [
        { id: 'foreign', chapterId: 'ch-1', text: 'First foreign sticky', resolved: false },
      ];
      book.darlings = [
        {
          id: 'foreign-d',
          chapterId: 'ch-1',
          html: '<p><b>First foreign saved passage.</b></p>',
          text: 'First foreign saved passage.',
          date: '2026-01-01T00:00:00Z',
        },
      ];
    }
    await writeFile(file, JSON.stringify(SourceBook.parse(book)));
  }
}
async function secondBook(page: Page, firstId: string) {
  const root = privateStorageRoot(page),
    id = firstId + '-second',
    title = 'Second safe book ' + test.info().testId.slice(-6),
    folder = path.join(root, id);
  const html =
      '<p><i>Second own words.</i> <span class="ph-mark" data-sid="own" contenteditable="false">⚑</span></p>',
    metadata = {
      id,
      title,
      author: 'Fixture Writer',
      chapterTitles: { 'ch-1': 'Second' },
      stickies: [{ id: 'own', chapterId: 'ch-1', text: 'Second own sticky', resolved: false }],
    },
    darlings = [
      {
        id: 'own-d',
        chapterId: 'ch-1',
        html: '<p><i>Second own saved passage.</i></p>',
        text: 'Second own saved passage.',
        date: '2026-01-01T00:00:00Z',
      },
    ];
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'notes.html'), '<p><b>Second own notes.</b></p>');
  await writeFile(path.join(folder, 'outline.html'), '<p>Second own outline.</p>');
  if (source()) {
    await mkdir(path.join(folder, 'chapters'));
    await writeFile(path.join(folder, 'chapters/ch-1.html'), html);
    await writeFile(
      path.join(folder, 'book.json'),
      JSON.stringify({ ...metadata, chapterOrder: ['ch-1'] }),
    );
    await writeFile(path.join(folder, 'stickies.json'), JSON.stringify(metadata.stickies));
    await writeFile(path.join(folder, 'darlings.json'), JSON.stringify(darlings));
  } else
    await writeFile(
      path.join(folder, 'manuscript.json'),
      JSON.stringify(
        Book.parse({
          formatVersion: 'neo-lifecycle/v1',
          revision: 0,
          metadata,
          chapters: [{ id: 'ch-1', html }],
          darlings,
        }),
      ),
    );
  const lib = Library.parse(await persistedLibrary(page));
  lib.shelves[0].bookIds.push(id);
  await writeFile(path.join(root, 'library.json'), JSON.stringify(lib));
  await page.reload();
  await expect(page.locator('#bookshelf-view')).toBeVisible();
  return { id, title, folder };
}
async function four(page: Page, folder: string) {
  return Promise.all(
    (source()
      ? ['book.json', 'stickies.json', 'notes.html', 'outline.html']
      : ['manuscript.json', 'reviews.json', 'notes.html', 'outline.html']
    ).map(async (name) => ({
      name,
      bytes: await readFile(path.join(folder, name), 'utf8').catch((error) => {
        if (name === 'reviews.json' && error.code === 'ENOENT') return null;
        throw error;
      }),
    })),
  );
}

test('[NEO-242-A] source discards a crossed stale chapter reply while Leafloom retains both rich versions under ADR0003', async ({
  page,
}) => {
  const c = await existingBook(page, {
    chapters: ['<p><b>Alpha.</b></p><p><i>Companion.</i></p>'],
    notes: '<p><b>Research stays.</b></p>',
  });
  await c.driver.reopen();
  const delay = await delayedRead(page, 'chapter:read', 'openBook', c.id);
  try {
    await remote(page, c.folder, 'prose');
    await refresh(page);
    await delay.started();
    await c.driver.select(0, 0, 6);
    await page.keyboard.type(' Latest local');
    await blur(page);
    await expect
      .poll(async () => (await persistedBook(page, c.title, c.id)).chapters[0].html)
      .toContain('Latest local');
    await delay.release();
    await delay.finished();
    if (source()) {
      // Literal NEO result: its completed local save invalidates the late reply.
      await c.driver.expectParagraphs([['Alpha. Latest local', 'Companion.']]);
      expect((await persistedBook(page, c.title, c.id)).chapters).toHaveLength(1);
    } else {
      // ADR0003 pauses the writer, then preserves concurrent incoming author text.
      // This is an explicit storage adaptation, not the original no-extra-copy result.
      const expected = [['Alpha. Latest local', 'Companion.'], ['Stale incoming.']];
      await c.driver.expectParagraphs(expected);
      const merged = await persistedBook(page, c.title, c.id);
      expect(merged.chapters[0].id).toBe('ch-1');
      expect(merged.chapters[1].id).not.toBe('ch-1');
      expect(merged.metadata.chapterTitles?.[merged.chapters[1].id]).toContain('from other device');
      expect(merged.chapters[1].html).toBe('<p><b>Stale incoming.</b></p>');
      await expect
        .poll(() => c.driver.caret())
        .toMatchObject({
          chapter: 0,
          paragraph: 0,
          offset: 'Alpha. Latest local'.length,
          collapsed: true,
        });
      await c.driver.undo();
      await c.driver.expectParagraphs(expected);
      await page.keyboard.insertText(' X');
      await c.driver.expectParagraphs([
        ['Alpha. Latest local X', 'Companion.'],
        ['Stale incoming.'],
      ]);
      await c.driver.undo();
      await c.driver.expectParagraphs(expected);
      await blur(page);
      await expect(page.locator('.save-state')).toHaveText('Saved');
      const primary = SourceBook.parse(
        JSON.parse(await readFile(path.join(c.folder, 'manuscript.json'), 'utf8')),
      );
      if (primary.formatVersion === 'neo-composed/v1') {
        const identities = primary.chapters.flatMap((chapter) => chapter.passages.map((p) => p.id));
        expect(new Set(identities).size).toBe(identities.length);
      }
      expect(await readFile(path.join(c.folder, 'outline.html'), 'utf8')).toBe('');
      const reviews = JSON.parse(await readFile(path.join(c.folder, 'reviews.json'), 'utf8'));
      if (reviews !== null)
        expect(reviews.version).toBe('version' in primary ? primary.version : undefined);
    }
    await c.driver.reopen();
    await c.driver.expectParagraphs(
      source()
        ? [['Alpha. Latest local', 'Companion.']]
        : [['Alpha. Latest local', 'Companion.'], ['Stale incoming.']],
    );
    const saved = await persistedBook(page, c.title, c.id);
    expect(saved.chapters[0].html).not.toContain('Stale incoming');
    expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Alpha\. Latest local<\/(?:b|strong)>/);
    expect(saved.notes).toBe('<p><b>Research stays.</b></p>');
    expect(saved.darlings).toEqual([]);
  } finally {
    await delay.release();
  }
});
test('[NEO-242-A] a local shelf rename crossing the actual delayed library reply survives DOM disk and reload', async ({
  page,
}) => {
  const c = await existingBook(page);
  await c.driver.shelf();
  const delay = await delayedRead(page, 'library:read', 'readLibrary');
  try {
    await refresh(page);
    await delay.started();
    await page.locator('.shelf-label').first().fill('Latest local shelf');
    await page.locator('.shelf-label').first().press('Enter');
    await expect
      .poll(async () => (await persistedLibrary(page)).shelves[0].name)
      .toBe('Latest local shelf');
    await delay.release();
    await delay.finished();
    await expect(page.locator('.shelf-label').first()).toHaveText('Latest local shelf');
    await page.reload();
    await expect(page.locator('.shelf-label').first()).toHaveText('Latest local shelf');
    expect((await persistedLibrary(page)).shelves[0].bookIds).toContain(c.id);
  } finally {
    await delay.release();
  }
});
for (const scope of ['prose', 'sides'] as const)
  test(`[NEO-243-${scope === 'prose' ? 'A' : 'B'}] changing books during a delayed real ${scope === 'prose' ? 'chapter' : 'side-file'} reply preserves second-book prose notes outline flags and Darlings`, async ({
    page,
  }) => {
    const c = await existingBook(page, {
      chapters: ['<p><b>First book words.</b></p>'],
      notes: '<p>First research.</p>',
    });
    await c.driver.shelf();
    const second = await secondBook(page, c.id);
    await c.driver.selectBook(c.title);
    await c.driver.reopen();
    const delay = await delayedRead(
      page,
      scope === 'prose' ? 'chapter:read' : 'json:read',
      'openBook',
      c.id,
    );
    try {
      await remote(page, c.folder, scope);
      await refresh(page);
      await delay.started();
      await c.driver.shelf();
      await c.driver.selectBook(second.title);
      await delay.release();
      await delay.finished();
      await expect(page.locator('#tp-title')).toHaveText(second.title);
      await expect(page.locator('.chapter-body')).toContainText('Second own words.');
      await expect(page.locator('.sticky textarea')).toHaveValue('Second own sticky');
      await page.locator('.tab[data-tab="darlings"]').click();
      await expect(page.locator('.darling')).toContainText('Second own saved passage.');
      await expect(page.locator('.darling')).not.toContainText('First foreign');
      await c.driver.shelf();
      const retained = await four(page, second.folder);
      await c.driver.selectBook(second.title);
      await expect(page.locator('.chapter-body')).toContainText('Second own words.');
      await c.driver.shelf();
      const reopened = await four(page, second.folder);
      for (const before of retained) {
        const after = reopened.find((row) => row.name === before.name)!;
        if (before.name.endsWith('.html')) expect(after.bytes).toBe(before.bytes);
        else if (before.bytes !== null && after.bytes !== null) {
          const author = (bytes: string) => {
            const row = JSON.parse(bytes);
            if (row.metadata) {
              for (const key of ['modified', 'lastPosition', 'wordCount', 'dailyCounts'])
                delete row.metadata[key];
              delete row.revision;
              delete row.version;
              for (const chapter of row.chapters ?? []) delete chapter.version;
            } else if (before.name === 'book.json') {
              for (const key of ['modified', 'lastPosition', 'wordCount', 'dailyCounts'])
                delete row[key];
            } else if (before.name === 'reviews.json' && row) delete row.version;
            return row;
          };
          expect(author(after.bytes)).toEqual(author(before.bytes));
        } else expect(after.bytes).toBe(before.bytes);
      }
      const saved = await persistedBook(page, second.title, second.id);
      expect(saved.notes).toBe('<p><b>Second own notes.</b></p>');
      expect(saved.stickies[0]).toMatchObject({ id: 'own', text: 'Second own sticky' });
      expect(saved.darlings[0].html).toMatch(/<i>Second own saved passage\.<\/i>/);
      expect(saved.chapters).toHaveLength(1);
      expect(saved.chapters[0].html).not.toContain('Stale incoming');
      expect(await readFile(path.join(second.folder, 'outline.html'), 'utf8')).toBe(
        '<p>Second own outline.</p>',
      );
    } finally {
      await delay.release();
    }
  });
