// @vitest-environment jsdom
import { cp,readFile,rename,rm,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { get } from 'svelte/store';
import { expect,it,vi } from 'vitest';
import { LibraryHost } from '../../apps/desktop/host/library';
import { Application } from '../../apps/desktop/src/lib/application';
import { BookFiles } from '../../packages/documents/filesystem-documents/src/index';
import { BookCore,ProseMirrorSurfaces } from '../../packages/editing/prosemirror-editor/src/index';
import type { DesktopHost } from '../../packages/host/desktop-host/src/index';
import { fixture,fixturePlatform } from './application-fixture';
it('blocks author mutations in an actual competing-reader session and permits safe close', async () => {
  const f = await fixture();
  let reader: LibraryHost | undefined;
  let vm: Application | undefined;
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    await f.vm.save();
    const id = get(f.vm.state).book!.id;
    reader = new LibraryHost(f.provider.root);
    await reader.initialize();
    const host: DesktopHost = {
      async request(method, payload) {
        try {
          return { ok: true, value: await reader!.request(method, payload) } as never;
        } catch (e) {
          return { ok: false, code: e instanceof Error ? e.message : 'INVALID' };
        }
      },
    };
    vm = new Application(
      host,
      (opened, actions) => {
        const editor = new BookCore(
          document,
          opened.book,
          opened.reviews,
          opened.notes,
          opened.outline,
        );
        return { editor, surfaces: new ProseMirrorSurfaces(editor, actions) };
      },
      async () => {},
    );
    await vm.initialize();
    await vm.openBook(id);
    expect(get(vm.state).readOnly).toBe(true);
    const before = vm.editor!.revision;
    vm.createChapter();
    vm.setMetadata({ title: 'Forbidden' });
    expect(vm.editor!.revision).toBe(before);
    expect(vm.editor!.title).toBe('Untitled');
    await vm.closeBook();
    expect(get(vm.state).view).toBe('library');
    expect(get(vm.state).readOnly).toBe(false);
  } finally {
    await reader?.shutdown();
    await f.close();
  }
});

it('external-change recovery keeps local unsaved writing in a durable separate book', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Original');
    f.vm.createChapter();
    const core = f.vm.editor!,
      chapter = core.chapters[0].id;
    core.select(chapter, 1);
    core.insert('Base text');
    await f.vm.save();
    const id = core.metadata.id;
    core.insert(' plus local writing');
    const path = join(f.provider.root, id, 'manuscript.json'),
      remote = JSON.parse(await readFile(path, 'utf8'));
    remote.metadata.title = 'Remote title';
    remote.revision++;
    await writeFile(path, JSON.stringify(remote));
    await f.vm.documentChanged({ bookId: id, code: 'UNAVAILABLE' });
    expect(get(f.vm.state).externalChange?.bookId).toBe(id);
    await expect(f.vm.save()).rejects.toThrow('EXTERNAL_CHANGE');
    await f.vm.keepExternalCopy();
    const copy = get(f.vm.state).book!;
    expect(copy.id).not.toBe(id);
    expect(f.vm.editor!.passageRows()[0].text).toBe('Base text plus local writing');
    expect(JSON.parse(await readFile(path, 'utf8')).metadata.title).toBe('Remote title');
    await f.vm.closeBook();
    await f.vm.openBook(copy.id);
    expect(f.vm.editor!.passageRows()[0].text).toBe('Base text plus local writing');
    await f.vm.closeBook();
    await f.vm.openBook(id);
    expect(f.vm.editor!.title).toBe('Remote title');
    expect(f.vm.editor!.passageRows()[0].text).toBe('Base text');
  } finally {
    await f.close();
  }
});

it('host failure blocks old-lease saves and preserves unsaved author text in a fresh local copy', async () => {
  const platform = fixturePlatform();
  const request = platform.os!.request.bind(platform.os);
  platform.os!.request = async (method, payload) =>
    method === 'restartHost' ? { restarted: true, rebindRequired: true } : request(method, payload);
  const f = await fixture(platform);
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Recovery original');
    f.vm.createChapter();
    const core = f.vm.editor!,
      chapter = core.chapters[0];
    core.select(chapter.id, 1);
    core.insert('Local author text.');
    f.vm.hostFailed({ code: 'HOST_UNAVAILABLE', canRestart: true });
    await expect(f.vm.save()).rejects.toThrow('HOST_RECOVERY_REQUIRED');
    expect(core.passageRows(chapter.id)[0].text).toBe('Local author text.');
    await f.vm.recoverHost();
    expect(get(f.vm.state).hostRecovery).toBeNull();
    expect(get(f.vm.state).book?.title).toBe('Recovery original — local copy');
    expect(f.vm.editor!.passageRows(chapter.id)[0].text).toBe('Local author text.');
  } finally {
    await f.close();
  }
});

it('publication title recovery binds a fresh real writer lease, preserves pending author edits and completes the shelf rename', async () => {
  const platform = fixturePlatform();
  const f = await fixture(platform);
  const request = platform.os!.request.bind(platform.os);
  platform.os!.request = async (method, payload) => {
    if (method !== 'restartHost') return request(method, payload);
    await f.provider.shutdown();
    await f.provider.initialize();
    return { restarted: true, rebindRequired: true };
  };
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelfId = get(f.vm.state).library.shelves[0].id;
    await f.vm.bindShelf(shelfId, true);
    const coverId = get(f.vm.state).library.shelves[0].bookIds[0];
    await f.vm.openPublicationPage(coverId, undefined, shelfId);
    f.vm.editPublicationTitle('title', 'Recovered collection');
    f.vm.editPublicationTitle('subtitle', 'Author subtitle');
    f.vm.hostFailed({ code: 'HOST_UNAVAILABLE', canRestart: true });
    await expect(f.vm.save()).rejects.toThrow('HOST_RECOVERY_REQUIRED');
    expect(get(f.vm.state).publicationPage).toMatchObject({
      title: 'Recovered collection',
      blocked: true,
    });
    await f.vm.recoverHost();
    expect(get(f.vm.state).hostRecovery).toBeNull();
    expect(get(f.vm.state).publicationPage).toMatchObject({
      title: 'Recovered collection',
      subtitle: 'Author subtitle',
      blocked: false,
    });
    await f.vm.closePublicationPage();
    expect(get(f.vm.state).publicationPage).toBeNull();
    expect(get(f.vm.state).library.shelves[0].name).toBe('Recovered collection');
    expect(await f.provider.request('readBookMeta', { bookId: coverId })).toMatchObject({
      title: 'Recovered collection',
      subtitle: 'Author subtitle',
    });
    const opened = (await f.provider.request('openBook', { bookId: coverId })) as { lease: string };
    expect(opened.lease).toMatch(/^[0-9a-f-]{36}$/);
    await f.provider.request('closeBook', { bookId: coverId, lease: opened.lease });
  } finally {
    await f.close();
  }
});

it('reconciles concurrent external prose through a fresh writer lease without replacing the author editor', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Concurrent book');
    f.vm.createChapter();
    const editor = f.vm.editor!,
      chapter = editor.chapters[0].id;
    editor.select(chapter, 1);
    editor.insert('Base text.');
    await f.vm.save();
    const baseline = editor.checkpoint(),
      id = editor.metadata.id;
    const remote = new BookCore(
      document,
      baseline.book,
      baseline.reviews,
      baseline.notes,
      baseline.outline,
    );
    remote.select(chapter, 1, 11);
    remote.insert('Incoming prose.');
    const incoming = remote.checkpoint();
    await writeFile(join(f.provider.root, id, 'manuscript.json'), JSON.stringify(incoming.book));
    await writeFile(join(f.provider.root, id, 'reviews.json'), JSON.stringify(incoming.reviews));
    editor.select(chapter, 11);
    editor.insert(' Local prose.');
    await f.vm.documentChanged({ bookId: id });
    expect(f.vm.editor).toBe(editor);
    expect(get(f.vm.state).externalChange).toBeNull();
    expect(editor.chapters).toHaveLength(2);
    expect(editor.passageRows(chapter)[0].text).toBe('Base text. Local prose.');
    expect(editor.passageRows(editor.chapters[1].id)[0].text).toBe('Incoming prose.');
    await f.vm.save();
    const saved = JSON.parse(await readFile(join(f.provider.root, id, 'manuscript.json'), 'utf8'));
    expect(saved.chapters).toHaveLength(2);
    await f.vm.closeBook();
    await f.vm.openBook(id);
    expect(f.vm.editor!.chapters).toHaveLength(2);
    expect(f.vm.editor!.passageRows(chapter)[0].text).toBe('Base text. Local prose.');
    expect(f.vm.editor!.passageRows(f.vm.editor!.chapters[1].id)[0].text).toBe('Incoming prose.');
  } finally {
    if (get(f.vm.state).externalChange) await f.vm.closeBook(false);
    await f.close();
  }
});

it('blocks further saves after an uncertain external lease-close acknowledgement while retaining local writing', async () => {
  const f = await fixture(),
    originalRequest = f.host.request;
  let rejectClose = false,
    checkpointCalls = 0;
  f.host.request = async (method, payload, traceparent) => {
    if (method === 'checkpoint') checkpointCalls++;
    const response = await originalRequest(method, payload, traceparent);
    if (method === 'closeBook' && rejectClose) return { ok: false, code: 'HOST_UNAVAILABLE' };
    return response;
  };
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const editor = f.vm.editor!,
      chapter = editor.chapters[0].id,
      id = editor.metadata.id;
    editor.select(chapter, 1);
    editor.insert('Saved words.');
    await f.vm.save();
    editor.insert(' Local words.');
    const before = editor.checkpoint(),
      calls = checkpointCalls;
    rejectClose = true;
    await expect(f.vm.documentChanged({ bookId: id })).rejects.toThrow('HOST_UNAVAILABLE');
    expect(f.vm.editor).toBe(editor);
    expect(editor.checkpoint()).toEqual(before);
    expect(get(f.vm.state).externalChange?.bookId).toBe(id);
    await expect(f.vm.save()).rejects.toThrow('EXTERNAL_CHANGE');
    expect(checkpointCalls).toBe(calls);
    rejectClose = false;
    await f.vm.keepExternalCopy();
    expect(f.vm.editor!.passageRows()[0].text).toBe('Saved words. Local words.');
    await f.vm.closeBook();
    await f.vm.openBook(id);
    expect(f.vm.editor!.passageRows()[0].text).toBe('Saved words.');
  } finally {
    rejectClose = false;
    if (get(f.vm.state).externalChange) await f.vm.closeBook(false);
    await f.close();
  }
});

it('serializes overlapping book opens and releases the prior real writer lease before the final selection', async () => {
  const f = await fixture(),
    originalRequest = f.host.request;
  let release!: () => void, started!: () => void;
  const barrier = new Promise<void>((resolve) => (release = resolve)),
    arrived = new Promise<void>((resolve) => (started = resolve));
  let firstId = '',
    competitor: LibraryHost | undefined;
  f.host.request = async (method, payload, traceparent) => {
    const response = await originalRequest(method, payload, traceparent);
    if (method === 'openBook' && 'bookId' in payload && payload.bookId === firstId) {
      started();
      await barrier;
    }
    return response;
  };
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelf = get(f.vm.state).library.shelves[0].id;
    await f.vm.newBook(shelf, 'novel', 'First');
    const a = f.vm.editor!.metadata.id;
    await f.vm.closeBook();
    await f.vm.newBook(shelf, 'novel', 'Second');
    const b = f.vm.editor!.metadata.id;
    await f.vm.closeBook();
    firstId = a;
    const openingA = f.vm.openBook(a);
    await arrived;
    const openingB = f.vm.openBook(b);
    release();
    await Promise.all([openingA, openingB]);
    expect(get(f.vm.state).book?.id).toBe(b);
    competitor = new LibraryHost(f.provider.root);
    await competitor.initialize();
    const reopened = await competitor.openBook(a);
    expect(reopened.readOnly).toBe(false);
    expect(reopened.lease).not.toBeNull();
  } finally {
    release();
    firstId = '';
    await competitor?.shutdown();
    await f.close();
  }
});

it('renews directory ownership while preserving unsaved local prose and independently incoming chapter edits', async () => {
  const f = await fixture();
  const work: Promise<void>[] = [];
  const failures: unknown[] = [];
  const unsubscribe = f.provider.subscribeEvents((event) => {
    work.push(
      f.vm.documentChanged(event).catch((error) => {
        failures.push(error);
      }),
    );
  });
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const core = f.vm.editor!;
    const first = core.chapters[0];
    core.select(first.id, 1);
    core.insert('First.');
    f.vm.createChapter();
    const second = core.chapters[1];
    core.select(second.id, 1);
    core.insert('Second.');
    await f.vm.save();
    const id = get(f.vm.state).book!.id,
      folder = join(f.provider.root, id);
    const opened = await new BookFiles(folder).load(false);
    const incoming = new BookCore(
      document,
      opened.book,
      opened.reviews,
      opened.notes,
      opened.outline,
    );
    incoming.select(second.id, 1 + 'Second.'.length);
    incoming.insert(' Remote.');
    const checkpoint = incoming.checkpoint();
    core.select(first.id, 1 + 'First.'.length);
    core.insert(' Local.');
    const staging = join(f.provider.root, '.incoming-' + id),
      aside = join(f.provider.root, '.previous-' + id);
    await cp(folder, staging, { recursive: true });
    await rm(join(staging, '.writer.lock'), { force: true });
    await writeFile(join(staging, 'manuscript.json'), JSON.stringify(checkpoint.book));
    await writeFile(join(staging, 'reviews.json'), JSON.stringify(checkpoint.reviews));
    await writeFile(join(staging, 'notes.html'), checkpoint.notes);
    await writeFile(join(staging, 'outline.html'), checkpoint.outline);
    await rename(folder, aside);
    const prior = await readFile(join(aside, 'manuscript.json'));
    await rename(staging, folder);
    await vi.waitFor(
      () => {
        expect(failures.map((error) => (error instanceof Error ? error.message : error))).toEqual(
          [],
        );
        expect(f.vm.editor).toBe(core);
        expect(core.passageRows(first.id)[0].text).toBe('First. Local.');
        expect(core.passageRows(second.id)[0].text).toBe('Second. Remote.');
      },
      { timeout: 5000 },
    );
    await Promise.all(work);
    expect(failures).toEqual([]);
    expect(await readFile(join(aside, 'manuscript.json'))).toEqual(prior);
    await f.vm.save();
    await f.vm.closeBook();
    await f.vm.openBook(id);
    expect(f.vm.editor!.passageRows(first.id)[0].text).toBe('First. Local.');
    expect(f.vm.editor!.passageRows(second.id)[0].text).toBe('Second. Remote.');
    expect(get(f.vm.state).externalChange).toBeNull();
  } finally {
    unsubscribe();
    await f.vm.closeBook(false);
    await f.close();
  }
});

it('a validated unchanged disk snapshot clears a transient read failure and flushes retained local writing without resetting history', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('Saved original.');
    await f.vm.save();
    const id = get(f.vm.state).book!.id;
    const opened = await new BookFiles(join(f.provider.root, id)).load(false);
    await f.vm.documentChanged({ bookId: id, code: 'UNAVAILABLE' });
    core.insert(' Retained draft.');
    const selection = core.state.selection.toJSON();
    await expect(f.vm.save()).rejects.toThrow('EXTERNAL_CHANGE');
    await f.vm.documentChanged({ bookId: id, versions: opened.versions });
    expect(get(f.vm.state).externalChange).toBeNull();
    expect(f.vm.editor).toBe(core);
    expect(core.state.selection.toJSON()).toEqual(selection);
    expect(
      (await new BookFiles(join(f.provider.root, id)).load(false)).book.chapters[0].html,
    ).toContain('Retained draft.');
    const authored = core.chapters.map(({ id, html }) => ({ id, html }));
    expect(core.undo()).toBe(true);
    expect(core.chapters.some((chapter) => chapter.html.includes('Retained draft.'))).toBe(false);
    expect(core.redo()).toBe(true);
    expect(core.chapters.map(({ id, html }) => ({ id, html }))).toEqual(authored);
  } finally {
    if (get(f.vm.state).externalChange) await f.vm.closeBook(false);
    await f.close();
  }
});
