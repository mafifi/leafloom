import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../../packages/editing/prosemirror-editor/src/core';
import { ProseMirrorSurfaces } from '../../packages/editing/prosemirror-editor/src/surfaces';
import { CompositionTelemetry } from '../../packages/editing/prosemirror-editor/src/telemetry';
import { createLibrary } from '../../packages/library/src/index';
import {
  PublicationPageViewModel,
  type PublicationPagePresentation,
} from '../../apps/desktop/src/lib/publication-page';
import type { HostMethod, HostPayload } from '@leafloom/desktop-host';
import { OpenReply } from '../../packages/editing/editor-contracts/src/index';
const versions = {
  manuscript: '0'.repeat(64),
  reviews: '1'.repeat(64),
  notes: '2'.repeat(64),
  outline: '3'.repeat(64),
};
const lease = '11111111-1111-4111-8111-111111111111';
function fixture(readOnly = false) {
  const document = new JSDOM('').window.document;
  let editor: BookCore;
  let shown: PublicationPagePresentation | null = null;
  let fail = false,
    failCode = 'DISK_ERROR';
  const opened = OpenReply.parse({
    book: {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'page', title: 'Page', author: '', kind: 'dedication' },
      chapters: [{ id: 'first', html: '<p>For everyone.</p>' }],
      darlings: [],
    },
    notes: '',
    outline: '',
    reviews: null,
    versions,
    lease: readOnly ? null : lease,
    readOnly,
    recovered: false,
  });
  const calls: { method: string; payload: unknown }[] = [];
  const refresh = vi.fn(async () => {}),
    title = vi.fn(async () => {}),
    error = vi.fn();
  const vm = new PublicationPageViewModel({
    async request<M extends HostMethod>(method: M, payload: HostPayload<M>): Promise<unknown> {
      calls.push({ method, payload });
      if (method === 'openBook') return opened;
      if (method === 'checkpoint') {
        if (fail) throw Error(failCode);
        return { revision: editor.revision, versions };
      }
      return null;
    },
    factory(book, actions, changed) {
      editor = new BookCore(document, book.book, book.reviews, book.notes, book.outline);
      return {
        editor,
        surfaces: new ProseMirrorSurfaces(editor, actions, new CompositionTelemetry(), changed),
      };
    },
    library: createLibrary,
    rendered: async () => {},
    publish(value) {
      shown = value;
    },
    refreshLibrary: refresh,
    saveTitlePage: title,
    error,
    t: (key) => key,
  });
  return {
    vm,
    calls,
    refresh,
    title,
    error,
    opened,
    editor: () => editor!,
    shown: () => shown,
    fail: (value: boolean, code = 'DISK_ERROR') => {
      fail = value;
      failCode = code;
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('coalesces private sheet writes for 600ms and closes only after its durable whole-book checkpoint', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.vm.open({ bookId: 'page', kind: 'dedication', label: 'Dedication' });
  f.editor().select('first', 1);
  f.editor().insert('Dear ');
  f.editor().insert('friend, ');
  expect(f.shown()?.dirty).toBe(true);
  await vi.advanceTimersByTimeAsync(599);
  expect(f.calls.filter((call) => call.method === 'checkpoint')).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(f.calls.filter((call) => call.method === 'checkpoint')).toHaveLength(1);
  f.editor().insert('hello. ');
  await f.vm.close();
  expect(f.calls.map((call) => call.method)).toEqual([
    'openBook',
    'checkpoint',
    'checkpoint',
    'closeBook',
  ]);
  expect(f.shown()).toBe(null);
  expect(f.refresh).toHaveBeenCalledOnce();
});
it('retains the actual core, dirty draft and history after a failed checkpoint and requires a fresh unchanged lease', async () => {
  const f = fixture();
  await f.vm.open({ bookId: 'page', kind: 'part', label: 'Part I' });
  const core = f.editor();
  core.select('first', 1);
  core.insert('Journey ');
  f.fail(true);
  await expect(f.vm.close()).rejects.toThrow('DISK_ERROR');
  expect(f.vm.core).toBe(core);
  expect(f.shown()?.blocked).toBe(true);
  expect(f.vm.dirty).toBe(true);
  await expect(f.vm.close()).rejects.toThrow('RECOVERY_REQUIRED');
  expect(f.calls.filter((call) => call.method === 'closeBook')).toHaveLength(0);
  expect(() =>
    f.vm.rebind({ ...f.opened, versions: { ...versions, manuscript: 'a'.repeat(64) } }),
  ).toThrow('EXTERNAL_CHANGE');
  f.fail(false);
  f.vm.rebind({ ...f.opened, lease: '22222222-2222-4222-8222-222222222222' });
  await f.vm.close();
  expect(f.shown()).toBe(null);
  expect(f.calls.filter((call) => call.method === 'checkpoint')).toHaveLength(2);
});
it('single-line title fields advance, flatten paste, share metadata history, and update shelf title only after saving', async () => {
  const f = fixture();
  await f.vm.open({
    bookId: 'page',
    kind: 'cover',
    label: 'Title Page',
    shelfId: 'shelf',
    shelfName: 'Collected',
    authorName: 'Writer',
  });
  expect(f.shown()?.focus).toMatchObject({ field: 'title', from: 0, to: 9 });
  f.vm.pasteTitle('title', 'New\n stories', 0, 9);
  expect(f.editor().title).toBe('New stories');
  await f.vm.enter('title');
  expect(f.shown()?.focus?.field).toBe('subtitle');
  f.vm.edit('subtitle', 'A collection');
  await f.vm.enter('subtitle');
  expect(f.shown()?.focus?.field).toBe('author');
  f.vm.edit('author', '  A Writer  ');
  f.vm.undo();
  expect(f.editor().author).toBe('Writer');
  f.vm.redo();
  await f.vm.enter('author');
  expect(f.title).toHaveBeenCalledWith(
    'page',
    { title: 'New stories', subtitle: 'A collection', author: 'A Writer' },
    'shelf',
  );
  expect(f.calls.map((call) => call.method)).toEqual(['openBook', 'checkpoint', 'closeBook']);
});
it('readonly sheets expose original text but neither metadata commands nor close produce a checkpoint', async () => {
  const f = fixture(true);
  await f.vm.open({ bookId: 'page', kind: 'cover', label: 'Title Page', shelfName: 'Different' });
  f.vm.edit('title', 'Forbidden');
  f.vm.undo();
  expect(f.editor().title).toBe('Page');
  expect(f.shown()?.readOnly).toBe(true);
  await f.vm.close();
  expect(f.calls.map((call) => call.method)).toEqual(['openBook', 'closeBook']);
  expect(f.title).not.toHaveBeenCalled();
});
it('a host failure preserves the sheet and suspends its pending autosave without replaying the lost lease', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.vm.open({ bookId: 'page', kind: 'epigraph', label: 'Epigraph' });
  f.editor().select('first', 1);
  f.editor().insert('A quote. ');
  f.vm.hostFailed();
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.calls.map((call) => call.method)).toEqual(['openBook']);
  await expect(f.vm.close()).rejects.toThrow('RECOVERY_REQUIRED');
  expect(f.vm.core?.canUndo).toBe(true);
  expect(f.shown()?.dirty).toBe(true);
});
it('publication Enter does not turn repeated blank paragraphs into scenes or chapters and Shift Enter keeps marks', () => {
  const f = fixture(),
    core = new BookCore(new JSDOM('').window.document, f.opened.book, null, '', '');
  core.select('first', 1);
  core.format('italic');
  core.enter(true, true);
  core.insert('Verse');
  core.enter(false, true);
  core.enter(false, true);
  core.enter(false, true);
  expect(core.chapters).toHaveLength(1);
  const html = core.checkpoint().book.chapters[0].html;
  expect(html).toContain('<i>');
  expect(html).not.toContain('scene-break');
  expect(html).not.toContain('poetry');
});
it.each(['dedication', 'epigraph', 'part', 'copyright', 'acknowledgments'] as const)(
  'uses the source transient placeholder for %s without saving it',
  async (kind) => {
    const configure = vi.spyOn(ProseMirrorSurfaces.prototype, 'configurePresentation'),
      f = fixture();
    await f.vm.open({ bookId: 'page', kind, label: kind });
    const page = configure.mock.lastCall?.[0].publicationPage;
    expect(page?.placeholder).toBe(
      kind === 'dedication'
        ? 'For…'
        : kind === 'epigraph'
          ? '…'
          : kind === 'part'
            ? 'Title'
            : undefined,
    );
    if (kind === 'copyright' || kind === 'acknowledgments')
      expect(page).not.toHaveProperty('placeholder');
    expect(f.editor().checkpoint().book.metadata).not.toHaveProperty('placeholder');
    await f.vm.close();
  },
);
it('definite disk-full failure retains dirty author history and allows explicit Done retry under the same guarded lease and hashes', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.vm.open({ bookId: 'page', kind: 'dedication', label: 'Dedication' });
  const core = f.editor();
  core.select('first', 1);
  core.insert('For my friend. ');
  f.fail(true, 'DISK_FULL');
  await expect(f.vm.close()).rejects.toThrow('DISK_FULL');
  expect(f.shown()).toMatchObject({
    failure: 'disk',
    blocked: false,
    saving: false,
    closing: false,
    dirty: true,
  });
  expect(f.vm.core).toBe(core);
  expect(core.canUndo).toBe(true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(f.calls.filter((call) => call.method === 'checkpoint')).toHaveLength(1);
  f.fail(false);
  await f.vm.close();
  const writes = f.calls.filter((call) => call.method === 'checkpoint');
  expect(writes).toHaveLength(2);
  expect(writes[0].payload).toEqual(writes[1].payload);
  expect(f.shown()).toBe(null);
});
it.each(['HOST_UNAVAILABLE', 'SAVE_UNCERTAIN', 'EXTERNAL_CHANGE'])(
  'uncertain or conflicting %s never retries a prior lease automatically or from Done',
  async (code) => {
    vi.useFakeTimers();
    const f = fixture();
    await f.vm.open({ bookId: 'page', kind: 'part', label: 'Part I' });
    f.editor().select('first', 1);
    f.editor().insert('Journey ');
    f.fail(true, code);
    await expect(f.vm.close()).rejects.toThrow(code);
    expect(f.shown()?.blocked).toBe(true);
    expect(f.vm.dirty).toBe(true);
    f.fail(false);
    await expect(f.vm.close()).rejects.toThrow('RECOVERY_REQUIRED');
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.calls.filter((call) => call.method === 'checkpoint')).toHaveLength(1);
    expect(f.calls.filter((call) => call.method === 'closeBook')).toHaveLength(0);
  },
);
it('cover metadata autosave retains the pending shelf-title draft until its library callback is durable', async () => {
  const f = fixture();
  await f.vm.open({
    bookId: 'page',
    kind: 'cover',
    label: 'Title Page',
    shelfName: 'Collected',
    shelfId: 'shelf',
  });
  f.vm.edit('title', 'New collection');
  await f.vm.save();
  expect(f.vm.dirty).toBe(true);
  expect(f.title).not.toHaveBeenCalled();
  expect(f.vm.core?.title).toBe('New collection');
  await f.vm.close();
  expect(f.shown()).toBe(null);
});
it('a failed shelf-title write retains the core and pending library draft for explicit Done retry after the book checkpoint', async () => {
  const f = fixture();
  await f.vm.open({
    bookId: 'page',
    kind: 'cover',
    label: 'Title Page',
    shelfName: 'Collected',
    shelfId: 'shelf',
  });
  f.vm.edit('title', 'New collection');
  const core = f.vm.core;
  f.title.mockRejectedValueOnce(Error('DISK_FULL'));
  await expect(f.vm.close()).rejects.toThrow('DISK_FULL');
  expect(f.vm.core).toBe(core);
  expect(f.vm.dirty).toBe(true);
  expect(f.shown()).toMatchObject({ failure: 'disk', blocked: false });
  await f.vm.close();
  expect(f.title).toHaveBeenCalledTimes(2);
  expect(f.shown()).toBe(null);
});
