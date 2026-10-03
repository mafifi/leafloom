import { it, expect, vi } from 'vitest';
import {
  Metadata,
  type MetadataValue,
} from '../../packages/documents/document-contracts/src/index';
import { Library } from '../../packages/library/src/index';
import {
  CoverArtViewModel,
  coverPaintable,
  coverMode,
  type CoverArtContext,
  type CoverArtPresentation,
} from '../../apps/desktop/src/lib/cover-art';
function fixture() {
  let library = Library.parse({ coverArt: { auto: true } });
  let books: MetadataValue[] = [
    Metadata.parse({ id: 'story', title: 'Title', author: 'Writer', wordCount: 1000 }),
  ];
  let presentation: CoverArtPresentation | null = null;
  const calls: { method: string; payload: unknown }[] = [];
  let configured = true;
  const context: CoverArtContext = {
    snapshot: () => ({ book: books[0], books, library }),
    requestOS: async (method, payload) => {
      calls.push({ method, payload });
      if (method === 'hasSecret' || method === 'setSecret')
        return {
          provider: 'openai',
          configured:
            method === 'setSecret'
              ? (configured = Boolean('value' in payload && payload.value))
              : configured,
          storage: 'fixture',
        };
      return { bookId: 'story', jobId: '12345678-1234-4234-8234-123456789abc', status: 'brief' };
    },
    requestHost: async () => null,
    saveBook: vi.fn(async () => {}),
    updateMetadata: async (id, patch) => {
      books = books.map((book) => (book.id === id ? Metadata.parse({ ...book, ...patch }) : book));
    },
    writeLibrary: async (value) => {
      library = value;
    },
    prepareCovers: vi.fn(async () => {}),
    publish: (value) => {
      presentation = value;
    },
    hint: vi.fn(),
    t: (key, args = {}) => key.replace(/\{(\w+)\}/g, (_, name) => String(args[name] ?? name)),
    now: () => new Date('2026-10-02T20:00:00Z'),
  };
  const vm = new CoverArtViewModel(context);
  return {
    vm,
    context,
    calls,
    get state() {
      return presentation;
    },
    get library() {
      return library;
    },
    get books() {
      return books;
    },
    setConfigured(value: boolean) {
      configured = value;
    },
  };
}
it('source eligibility is threshold1000, excludes supplied art/pages, and retries only stale pending', () => {
  const meta = Metadata.parse({ id: 'story', title: 'Title', author: 'Writer', wordCount: 1000 });
  const now = new Date('2026-10-02T20:00:00Z');
  expect(coverPaintable(meta, now)).toBe(true);
  expect(coverPaintable({ ...meta, wordCount: 999 }, now)).toBe(false);
  expect(coverPaintable({ ...meta, coverImage: 'mine.png' }, now)).toBe(false);
  expect(coverPaintable({ ...meta, kind: 'cover' }, now)).toBe(false);
  expect(
    coverPaintable({ ...meta, coverArt: { status: 'pending', at: '2026-10-02T19:51:00Z' } }, now),
  ).toBe(false);
  expect(
    coverPaintable({ ...meta, coverArt: { status: 'pending', at: '2026-10-02T19:49:00Z' } }, now),
  ).toBe(true);
  expect(coverPaintable({ ...meta, coverArt: { status: 'failed' } }, now)).toBe(false);
});
it('settings keeps secret outside library, validates before saving, and blank keys preserve stored secret', async () => {
  const f = fixture();
  await f.vm.openSettings();
  expect(f.state?.kind).toBe('settings');
  f.vm.edit('key', 'bad key');
  await f.vm.saveSettings();
  expect(f.calls.filter((call) => call.method === 'setSecret')).toEqual([]);
  expect(f.state?.kind).toBe('settings');
  f.vm.edit('key', '');
  f.vm.edit('textModel', 'custom-text');
  f.vm.edit('imageModel', 'custom-image');
  f.vm.edit('quality', 'high');
  f.vm.edit('auto', false);
  await f.vm.saveSettings();
  expect(f.state).toBe(null);
  expect(f.library.coverArt).toEqual({
    provider: 'openai',
    auto: false,
    quality: 'high',
    models: { openai: { text: 'custom-text', image: 'custom-image' } },
  });
  expect(JSON.stringify(f.library)).not.toContain('key');
});
it('remove forgets credential and cancel clears draft without writing settings', async () => {
  const f = fixture();
  await f.vm.openSettings();
  f.vm.edit('key', 'remove');
  await f.vm.saveSettings();
  expect(f.calls.find((call) => call.method === 'setSecret')?.payload).toEqual({
    provider: 'openai',
    value: null,
  });
  await f.vm.openSettings();
  f.vm.edit('key', 'a'.repeat(24));
  f.vm.cancel();
  expect(f.state).toBe(null);
  expect(f.calls.filter((call) => call.method === 'setSecret')).toHaveLength(1);
});
it('automatic key nudge is once per library and never submits a paint job without a secret', async () => {
  const f = fixture();
  f.setConfigured(false);
  await f.vm.maybePaint(f.books[0]);
  await f.vm.maybePaint(f.books[0]);
  expect(f.context.hint).toHaveBeenCalledTimes(1);
  expect(f.library.coverArtNudged).toBe(true);
  expect(f.calls.some((call) => call.method === 'paintCover')).toBe(false);
});
it('asynchronous paint uses book ownership, saves latest text first, and does not overwrite a supplied image picked during job', async () => {
  const f = fixture();
  await f.vm.choose('story', 'paint');
  expect(f.context.saveBook).toHaveBeenCalledOnce();
  expect(f.books[0].coverArt).toMatchObject({ status: 'pending', words: 1000 });
  expect(f.calls.at(-1)?.method).toBe('paintCover');
  await f.context.updateMetadata('story', { coverImage: 'mine.png', coverMode: 'image' });
  await f.vm.progress({
    bookId: 'story',
    jobId: '12345678-1234-4234-8234-123456789abc',
    status: 'done',
    result: {
      file: 'art-123.png',
      brief: 'Abstract sea',
      textModel: 'custom-text',
      imageModel: 'custom-image',
    },
  });
  expect(f.books[0].coverArt).toMatchObject({ status: 'done', file: 'art-123.png' });
  expect(coverMode(f.books[0])).toBe('image');
  expect(f.context.prepareCovers).toHaveBeenCalled();
});
it('cover choices preserve all layers and reroll title style over a painting', async () => {
  const f = fixture();
  await f.context.updateMetadata('story', {
    coverArt: { status: 'done', file: 'art-123.png' },
    coverMode: 'painted',
  });
  await f.vm.openChoices('story');
  expect(f.state).toMatchObject({
    kind: 'choices',
    options: expect.arrayContaining([
      expect.objectContaining({ value: 'abstract' }),
      expect.objectContaining({ value: 'reroll' }),
      expect.objectContaining({ value: 'paint' }),
    ]),
  });
  await f.vm.choose('story', 'reroll');
  expect(f.books[0].coverMode).toBe('painted');
  expect(f.books[0].coverArt).toMatchObject({ file: 'art-123.png' });
  expect(f.books[0].coverSeed).toContain('story:1000:');
});
it('a new generation queues terminal events that arrive before its receipt and ignores older jobs', async () => {
  const f = fixture(),
    old = '12345678-1234-4234-8234-123456789abc',
    newer = '22345678-1234-4234-8234-123456789abc';
  const result = {
    file: 'art-123.png',
    brief: 'Sea',
    textModel: 'custom-text',
    imageModel: 'custom-image',
  };
  await f.vm.choose('story', 'paint');
  await f.vm.progress({ bookId: 'story', jobId: old, status: 'done', result });
  f.context.requestOS = async (method) => {
    if (method === 'hasSecret') return { provider: 'openai', configured: true, storage: 'fixture' };
    await f.vm.progress({
      bookId: 'story',
      jobId: newer,
      status: 'done',
      result: { ...result, file: 'art-456.png' },
    });
    return { bookId: 'story', jobId: newer, status: 'brief' };
  };
  await f.vm.choose('story', 'paint');
  expect(f.books[0].coverArt).toMatchObject({ status: 'done', file: 'art-456.png' });
  await f.vm.progress({ bookId: 'story', jobId: old, status: 'failed', code: 'INTERRUPTED' });
  expect(f.books[0].coverArt).toMatchObject({ status: 'done', file: 'art-456.png' });
});
it('restart recovery uses validated job receipt and preserves a selected custom image', async () => {
  const f = fixture();
  await f.context.updateMetadata('story', {
    coverImage: 'mine.png',
    coverMode: 'image',
    coverArt: { status: 'pending', at: '2026-10-02T19:00:00Z' },
  });
  f.context.requestHost = async () => ({
    bookId: 'story',
    status: 'done',
    result: {
      file: 'art-789.png',
      brief: 'Sea',
      textModel: 'custom-text',
      imageModel: 'custom-image',
    },
  });
  await f.vm.recover(f.books[0]);
  expect(f.books[0].coverArt).toMatchObject({ status: 'done', file: 'art-789.png' });
  expect(f.books[0].coverMode).toBe('image');
});
it('failure receipt persists an explicit failed state without credential or manuscript text', async () => {
  const f = fixture();
  await f.vm.choose('story', 'paint');
  await f.vm.progress({
    bookId: 'story',
    jobId: '12345678-1234-4234-8234-123456789abc',
    status: 'failed',
    code: 'INTERRUPTED',
  });
  expect(f.books[0].coverArt).toEqual({
    status: 'failed',
    error: 'INTERRUPTED',
    at: '2026-10-02T20:00:00.000Z',
  });
  expect(f.context.hint).toHaveBeenCalledWith('Leafloom couldn’t paint that cover: INTERRUPTED');
});
it('metadata from the production ordinary-book factory remains automatically paintable', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { LibraryHost } = await import('../../apps/desktop/host/library');
  const directory = await mkdtemp(join(tmpdir(), 'leafloom-cover-eligibility-')),
    provider = new LibraryHost(directory);
  try {
    await provider.initialize();
    const created = Metadata.parse(
      await provider.request('createBook', { title: 'Story', author: 'Writer', kind: 'novel' }),
    );
    expect(created.kind).toBe('novel');
    expect(coverPaintable({ ...created, wordCount: 1000 }, new Date('2026-10-02T20:00:00Z'))).toBe(
      true,
    );
  } finally {
    await provider.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});
it('concurrent automatic requests reserve one host job after asynchronous credential discovery', async () => {
  const f = fixture();
  await Promise.all([f.vm.maybePaint(f.books[0]), f.vm.maybePaint(f.books[0])]);
  expect(f.calls.filter((call) => call.method === 'paintCover')).toHaveLength(1);
  expect(f.context.saveBook).toHaveBeenCalledTimes(1);
});
it('an earlier settings save cannot close a newly opened settings dialog', async () => {
  const f = fixture();
  await f.vm.openSettings();
  let finish: (() => void) | undefined;
  const write = f.context.writeLibrary;
  f.context.writeLibrary = async (library) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await write(library);
  };
  const saving = f.vm.saveSettings();
  f.vm.cancel();
  await f.vm.openSettings();
  finish?.();
  await saving;
  expect(f.state?.kind).toBe('settings');
});
