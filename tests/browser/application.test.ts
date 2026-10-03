// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, cp, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { get } from 'svelte/store';
import { Application, type ApplicationPlatform } from '../../apps/desktop/src/lib/application';
import { LibraryHost } from '../../apps/desktop/host/library';
import { BookCore, ProseMirrorSurfaces } from '../../packages/editing/prosemirror-editor/src/index';
import { BookFiles } from '../../packages/documents/filesystem-documents/src/index';
import type { DesktopHost } from '../../packages/host/desktop-host/src/index';
async function fixture(platform?: ApplicationPlatform) {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-ui-contract-'));
  const provider = new LibraryHost(root);
  await provider.initialize();
  const host: DesktopHost = {
    async request(method, payload) {
      try {
        return { ok: true, value: await provider.request(method, payload) } as never;
      } catch (error) {
        return { ok: false, code: error instanceof Error ? error.message : 'INVALID' };
      }
    },
  };
  const vm = new Application(
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
    undefined,
    platform,
  );
  await vm.initialize();
  return {
    vm,
    provider,
    host,
    async close() {
      await vm.closeBook();
      await provider.shutdown();
      await rm(root, { recursive: true, force: true });
    },
  };
}
describe('production application commands with real storage', () => {
  it('failed dictionary loading keeps the prior persisted language and author state even with spelling off', async () => {
    const f = await fixture();
    try {
      await f.vm.onboard('Writer', 'pantser');
      await f.vm.preference('spellLanguage', 'en-US');
      await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
      f.vm.createChapter();
      const core = f.vm.editor!;
      core.select(core.chapters[0].id, 1);
      core.insert('Unchanged writing.');
      const initial = core.checkpoint(),
        selection = core.state.selection.toJSON();
      // The real provider rejects this unavailable dictionary. All storage,
      // editor state and preference persistence remain production code.
      await expect(f.vm.preference('spellLanguage', 'unavailable-dictionary')).rejects.toThrow(
        'That dictionary would not load',
      );
      expect(get(f.vm.state).library.spellLanguage).toBe('en-US');
      expect(
        JSON.parse(await readFile(join(f.provider.root, 'library.json'), 'utf8')).spellLanguage,
      ).toBe('en-US');
      expect(core.checkpoint()).toEqual(initial);
      expect(core.state.selection.toJSON()).toEqual(selection);
      expect(get(f.vm.state).spellOn).toBe(false);
      expect(
        await f.provider.request('spellcheck', {
          language: 'en-US',
          words: ['writer', 'zzleafloomwordzz'],
        }),
      ).toEqual({ writer: true, zzleafloomwordzz: false });
    } finally {
      await f.close();
    }
  });
  it('a slow older dictionary selection cannot replace a newer successful choice or lose unrelated settings', async () => {
    const f = await fixture();
    let finish: () => void = () => {};
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const request = f.host.request.bind(f.host);
    // Delay only a dictionary-load response; the dictionaries and every
    // filesystem operation use the real host provider.
    f.host.request = async (method, payload, carrier) => {
      if (
        method === 'spellcheck' &&
        'language' in payload &&
        payload.language === 'fr' &&
        'words' in payload &&
        payload.words.length === 0
      )
        await waiting;
      return request(method, payload, carrier);
    };
    try {
      await f.vm.onboard('Writer', 'pantser');
      await f.vm.preference('spellLanguage', 'en-US');
      const older = f.vm.preference('spellLanguage', 'fr');
      expect(get(f.vm.state).library.spellLanguage).toBe('en-US');
      await f.vm.preference('pageTheme', 'night');
      await f.vm.preference('spellLanguage', 'de');
      finish();
      await older;
      expect(get(f.vm.state).library.spellLanguage).toBe('de');
      expect(get(f.vm.state).library.pageTheme).toBe('night');
      const saved = JSON.parse(await readFile(join(f.provider.root, 'library.json'), 'utf8'));
      expect(saved.spellLanguage).toBe('de');
      expect(saved.pageTheme).toBe('night');
    } finally {
      finish();
      await f.close();
    }
  });
  it('an older failed dictionary reply leaves the newer choice and UI feedback intact', async () => {
    const f = await fixture();
    let finish: () => void = () => {};
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const request = f.host.request.bind(f.host);
    f.host.request = async (method, payload, carrier) => {
      if (
        method === 'spellcheck' &&
        'language' in payload &&
        payload.language === 'fr' &&
        'words' in payload &&
        payload.words.length === 0
      ) {
        await waiting;
        return { ok: false, code: 'IO_FAILURE' };
      }
      return request(method, payload, carrier);
    };
    try {
      await f.vm.onboard('Writer', 'pantser');
      await f.vm.preference('spellLanguage', 'en-US');
      const older = f.vm.execute(() => f.vm.preference('spellLanguage', 'fr'));
      await f.vm.preference('spellLanguage', 'de');
      const priorHint = get(f.vm.state).hint;
      finish();
      await older;
      expect(get(f.vm.state).library.spellLanguage).toBe('de');
      expect(get(f.vm.state).hint).toBe(priorHint);
      expect(
        JSON.parse(await readFile(join(f.provider.root, 'library.json'), 'utf8')).spellLanguage,
      ).toBe('de');
    } finally {
      finish();
      await f.close();
    }
  });
  it('creates, edits, saves and reopens a book with one history across manuscript and notes', async () => {
    const f = await fixture();
    try {
      await f.vm.onboard('Writer', 'pantser');
      const shelf = get(f.vm.state).library.shelves[0];
      await f.vm.newBook(shelf.id, 'novel', 'First book');
      expect(get(f.vm.state).view).toBe('editor');
      f.vm.createChapter();
      const core = f.vm.editor!;
      const chapter = core.chapters[0];
      core.select(chapter.id, 1);
      core.insert('A story.');
      core.select('notes', 1);
      core.insert('Remember the ending.');
      expect(core.canUndo).toBe(true);
      core.undo();
      expect(core.passageRows('notes')[0].text).toBe('');
      core.redo();
      await f.vm.save();
      // Preference persistence cannot dismiss author menus or prevent manuscript saving.
      const request = f.provider.request.bind(f.provider);
      let preferenceWrites = 0;
      const deniedPreferences = vi
        .spyOn(f.provider, 'request')
        .mockImplementation((method, payload, traceparent) => {
          if (method === 'writeLibrary') {
            preferenceWrites++;
            return Promise.reject(Error('DISK_ERROR'));
          }
          return request(method, payload, traceparent);
        });
      f.vm.zoom(0.1);
      f.vm.menu(new MouseEvent('contextmenu'), [{ label: 'Author menu', run() {} }]);
      await vi.waitFor(() => expect(preferenceWrites).toBeGreaterThan(0));
      expect(get(f.vm.state).menu?.items[0].label).toBe('Author menu');
      core.select(chapter.id, 1);
      core.insert('Still safe. ');
      f.vm.zoom(0.1);
      await f.vm.save();
      expect(preferenceWrites).toBeGreaterThan(1);
      expect(get(f.vm.state).dirty).toBe(false);
      deniedPreferences.mockRestore();
      await f.vm.closeBook();
      const book = get(f.vm.state).books[0];
      await f.vm.openBook(book.id);
      expect(f.vm.editor!.passageRows(chapter.id)[0].text).toBe('Still safe. A story.');
      expect(f.vm.editor!.passageRows('notes')[0].text).toBe('Remember the ending.');
      expect(get(f.vm.state).dirty).toBe(false);
    } finally {
      await f.close();
    }
  });
});

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

it('binding creates a real cover, writes page prose, and parks pages without deleting their files', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelf = get(f.vm.state).library.shelves[0].id;
    await f.vm.newBook(shelf, 'novel', 'Story');
    f.vm.createChapter();
    const story = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    await f.vm.bindShelf(shelf, true);
    const bound = get(f.vm.state).library.shelves[0];
    expect(bound.binding?.bound).toBe(true);
    expect(bound.bookIds.at(-1)).toBe(story);
    const cover = bound.bookIds[0];
    expect(get(f.vm.state).books.find((b) => b.id === cover)?.kind).toBe('cover');
    await f.vm.addBoundPage(shelf, 'copyright');
    const page = get(f.vm.state).publicationPage!.bookId;
    const body = document.createElement('div'),
      auxiliary = document.createElement('div');
    document.body.append(body, auxiliary);
    f.vm.bindPublicationPage(body, auxiliary);
    expect(body.textContent).toContain('Copyright ©');
    body.remove();
    auxiliary.remove();
    await f.vm.closeBook();
    await f.vm.bindShelf(shelf, false);
    expect(get(f.vm.state).library.shelves[0].bookIds).toEqual([story]);
    expect(get(f.vm.state).books.some((b) => b.id === page)).toBe(true);
    await f.vm.bindShelf(shelf, true);
    expect(get(f.vm.state).library.shelves[0].bookIds).toEqual([cover, page, story]);
    await f.vm.openBook(page);
    expect(f.vm.editor!.passageRows()[0].text).toContain('Writer');
  } finally {
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

it('preserves every rapid focus and text-size command in memory and in the real library file', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await Promise.all([f.vm.cycleFocus(), f.vm.cycleFocus()]);
    expect(get(f.vm.state).library.focusMode).toBe('sentence');
    await Promise.all(Array.from({ length: 12 }, () => f.vm.textSize(1)));
    expect(get(f.vm.state).library.editorFontSize).toBe(22);
    const saved = JSON.parse(await readFile(join(f.provider.root, 'library.json'), 'utf8'));
    expect(saved.focusMode).toBe('sentence');
    expect(saved.editorFontSize).toBe(22);
  } finally {
    await f.close();
  }
});

it('flushes a still-focused margin note on close and undoes resolving both note and flag together', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('Hello');
    const sticky = core.createSticky('');
    f.vm.updateSticky(sticky, 'Finish this thought');
    const id = core.metadata.id;
    await f.vm.closeBook();
    await f.vm.openBook(id);
    expect(f.vm.editor!.stickies.find((note) => note.id === sticky)?.text).toBe(
      'Finish this thought',
    );
    f.vm.resolveSticky(sticky, true);
    expect(f.vm.editor!.stickies).toHaveLength(0);
    expect(f.vm.editor!.checkpoint().book.chapters[0].html).not.toContain('data-sid');
    f.vm.undo();
    expect(f.vm.editor!.stickies[0].text).toBe('Finish this thought');
    expect(f.vm.editor!.checkpoint().book.chapters[0].html).toContain(sticky);
  } finally {
    await f.close();
  }
});

function fixturePlatform(): ApplicationPlatform {
  return {
    os: {
      request: async (method) => {
        if (method === 'fontFamilies') return ['Georgia', 'Installed Face'];
        if (method === 'hasSecret')
          return { provider: 'openai', configured: false, storage: 'fixture' };
        if (method === 'getWindowState') return { fullscreen: false };
        return {};
      },
    },
    selectImportFiles: async () => [],
    selectExportFile: async () => null,
    openExternal: async () => {},
    finishClose: async () => {},
    fullscreen: async () => {},
    print: async () => {},
  };
}
it('native font picker previews, restores and commits a safely quoted installed family without moving author history', async () => {
  const f = await fixture(fixturePlatform());
  try {
    await f.vm.nativeCommand('body-font-pick');
    expect(get(f.vm.state).fontPicker?.rows).toEqual(['Georgia', 'Installed Face']);
    f.vm.previewFont('Installed Face');
    expect(document.documentElement.style.getPropertyValue('--body-font')).toBe(
      '"Installed Face", Georgia, serif',
    );
    f.vm.closeFontPicker();
    expect(document.documentElement.style.getPropertyValue('--body-font')).toContain('Georgia');
    await f.vm.openFontPicker();
    await f.vm.chooseFont('Installed Face');
    expect(get(f.vm.state).library.fonts.body).toBe('Installed Face');
    expect(document.documentElement.style.getPropertyValue('--body-font')).toBe(
      '"Installed Face", Georgia, serif',
    );
    expect(f.vm.bodyFontStyle('Odd "Family"\\Name')).toBe('"Odd FamilyName", Georgia, serif');
  } finally {
    await f.close();
  }
});
it('native cover completion persists outside prose Undo and overlay commands cannot stack', async () => {
  const f = await fixture(fixturePlatform());
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Cover story');
    f.vm.createChapter();
    const bookId = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    await f.vm.openBook(bookId);
    const core = f.vm.editor!,
      chapter = core.chapters[0];
    core.select(chapter.id, 1);
    core.insert('Author sentence.');
    await f.vm.nativeCommand('cover-art');
    await f.vm.nativeCommand('body-font-pick');
    expect(get(f.vm.state).coverArt?.kind).toBe('settings');
    expect(get(f.vm.state).fontPicker).toBeNull();
    f.vm.closeCoverArt();
    await f.vm.coverArtProgress({
      bookId: get(f.vm.state).book!.id,
      jobId: '12345678-1234-4234-8234-123456789abc',
      status: 'done',
      result: {
        file: 'art-123.png',
        brief: 'Fixture',
        textModel: 'fixture-text',
        imageModel: 'fixture-image',
      },
    });
    core.undo();
    expect(core.passageRows(chapter.id)[0].text).toBe('');
    expect(core.metadata.coverMode).toBe('painted');
    expect(core.metadata.coverArt).toMatchObject({ status: 'done', file: 'art-123.png' });
  } finally {
    await f.close();
  }
});
it('closed-book cover choices merge fresh disk metadata and browser has no OS credential fallback', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Before');
    const id = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    const fresh = await f.provider.request('readBookMeta', { bookId: id });
    await f.provider.request('writeBookMeta', {
      bookId: id,
      metadata: { ...(fresh as object), title: 'Fresh disk title' },
    });
    await f.vm.chooseCover(id, 'abstract');
    expect(get(f.vm.state).books.find((book) => book.id === id)?.title).toBe('Fresh disk title');
    await f.vm.openCoverSettings();
    expect(get(f.vm.state).coverArt).toBeNull();
    expect(get(f.vm.state).hint).toContain('desktop app');
    await f.vm.openFontPicker();
    expect(get(f.vm.state).fontPicker).toBeNull();
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
it('email settings and draft route a saved real manuscript fingerprint through fixture OS without launching mail', async () => {
  const platform = fixturePlatform();
  const request = platform.os!.request.bind(platform.os);
  let envelope: unknown;
  platform.os!.request = async (method, payload) => {
    if (method === 'emailDraft') {
      envelope = payload;
      return true;
    }
    return request(method, payload);
  };
  const f = await fixture(platform);
  try {
    const settings = f.vm.openEmailSettings();
    expect(get(f.vm.state).modal?.title).toBe('Email drafts to');
    f.vm.answer('writer@example.com');
    await settings;
    expect(get(f.vm.state).library.emailMethod).toBe('gmail');
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Email story');
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('A saved email sentence.');
    await f.vm.nativeCommand('email-draft');
    expect(envelope).toMatchObject({ to: 'writer@example.com', method: 'gmail' });
    expect(JSON.stringify(envelope)).toMatch(/[a-f0-9]{64}/);
  } finally {
    await f.close();
  }
});
it('chapter context guards prose and exports the selected saved chapter through its format choices', async () => {
  const exportsRoot = await mkdtemp(join(tmpdir(), 'leafloom-chapter-output-'));
  const platform = fixturePlatform();
  platform.selectExportFile = async (name) => join(exportsRoot, name);
  const f = await fixture(platform);
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Output book');
    f.vm.createChapter();
    const core = f.vm.editor!,
      first = core.chapters[0];
    core.select(first.id, 1);
    core.insert('Only the first chapter.');
    f.vm.createChapter();
    const second = core.chapters[1];
    core.select(second.id, 1);
    core.insert('Second chapter must stay out.');
    const menu = f.vm.chapterContext(first.id, 0);
    expect(menu.find((item) => item.label === 'Contents')?.disabled).toBe(true);
    expect(menu.find((item) => item.label === 'Chapter')?.checked).toBe(true);
    expect(menu.find((item) => item.label === 'Move up')?.disabled).toBe(true);
    const output = f.vm.exportChapter(first.id);
    expect(get(f.vm.state).modal?.choices?.map((choice) => choice.value)).toEqual([
      'txt',
      'md',
      'html',
      'pdf',
      'docx',
      'epub',
    ]);
    f.vm.answer('txt');
    await output;
    const text = await readFile(join(exportsRoot, (first.title || first.label) + '.txt'), 'utf8');
    expect(text).toContain('Only the first chapter.');
    expect(text).not.toContain('Second chapter must stay out.');
    await f.vm.closeBook();
    expect(get(f.vm.state).books[0].title).toBe('Output book');
  } finally {
    await f.close();
    await rm(exportsRoot, { recursive: true, force: true });
  }
});
it('later writing style changes future books without moving the currently open author workspace', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelf = get(f.vm.state).library.shelves[0].id;
    await f.vm.newBook(shelf, 'novel', 'Current');
    expect(get(f.vm.state).panel).toBe('manuscript');
    await f.vm.nativeCommand('writing-style:plotter');
    expect(get(f.vm.state).panel).toBe('manuscript');
    await f.vm.closeBook();
    expect(await f.provider.request('readLibrary', {})).toMatchObject({ writingStyle: 'plotter' });
    await f.vm.newBook(shelf, 'novel', 'Future outline');
    expect(get(f.vm.state).panel).toBe('outline');
    await f.vm.nativeCommand('writing-style:pantser');
    expect(get(f.vm.state).panel).toBe('outline');
    await f.vm.closeBook();
    await f.vm.newBook(shelf, 'novel', 'Future manuscript');
    expect(get(f.vm.state).panel).toBe('manuscript');
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

it('closed cover goal choices merge fresh metadata and persist count/progress across application reload', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Goal book');
    const id = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    const previous = await f.provider.request('readBookMeta', { bookId: id });
    await f.provider.request('writeBookMeta', {
      bookId: id,
      metadata: { ...previous, wordCount: 20000, wordGoal: 40000 },
    });
    const setting = f.vm.setCoverGoal(id);
    await vi.waitFor(() => expect(get(f.vm.state).modal?.value).toBe('40000'));
    const during = await f.provider.request('readBookMeta', { bookId: id });
    await f.provider.request('writeBookMeta', {
      bookId: id,
      metadata: { ...during, author: 'Updated while prompting' },
    });
    f.vm.answer('80000');
    await setting;
    const disk = await f.provider.request('readBookMeta', { bookId: id });
    expect(disk).toMatchObject({
      wordGoal: 80000,
      wordCount: 20000,
      author: 'Updated while prompting',
    });
    expect(get(f.vm.state).books.find((book) => book.id === id)).toMatchObject(disk);
    await f.vm.initialize();
    expect(get(f.vm.state).books.find((book) => book.id === id)?.wordGoal).toBe(80000);
    const removal = f.vm.setCoverGoal(id);
    await vi.waitFor(() => expect(get(f.vm.state).modal?.value).toBe('80000'));
    f.vm.answer('');
    await removal;
    expect((await f.provider.request('readBookMeta', { bookId: id })).wordGoal).toBe(0);
  } finally {
    await f.close();
  }
});
it('open cover goal changes share author Undo while canceled cover choices leave history untouched', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Goal book');
    const id = get(f.vm.state).book!.id;
    const previousGoal = f.vm.editor?.metadata.wordGoal;
    const setting = f.vm.setCoverGoal(id);
    await vi.waitFor(() => expect(get(f.vm.state).modal).not.toBeNull());
    f.vm.answer('80000');
    await setting;
    expect(f.vm.editor?.metadata.wordGoal).toBe(80000);
    const cancel = f.vm.setCoverGoal(id);
    await vi.waitFor(() => expect(get(f.vm.state).modal).not.toBeNull());
    f.vm.answer(null);
    await cancel;
    f.vm.editor?.undo();
    expect(f.vm.editor?.metadata.wordGoal).toBe(previousGoal);
    f.vm.editor?.redo();
    expect(f.vm.editor?.metadata.wordGoal).toBe(80000);
  } finally {
    await f.close();
  }
});

it('persists a pending margin note without dismissing an author menu', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('A note belongs here.');
    const sticky = core.createSticky('');
    await f.vm.save();
    await f.vm.save();
    f.vm.updateSticky(sticky, 'Keep this thought');
    f.vm.menu(new MouseEvent('click', { clientX: 20, clientY: 20 }), [
      { label: 'Keep reading', run: () => {} },
    ]);
    const menu = get(f.vm.state).menu;
    expect(menu).not.toBeNull();
    await vi.waitFor(
      () => {
        expect(core.stickies.find((note) => note.id === sticky)?.text).toBe('Keep this thought');
        expect(get(f.vm.state).dirty).toBe(false);
      },
      { timeout: 3000 },
    );
    expect(get(f.vm.state).menu).toBe(menu);
    await f.vm.closeBook();
    await f.vm.openBook(core.metadata.id);
    expect(f.vm.editor!.stickies.find((note) => note.id === sticky)?.text).toBe(
      'Keep this thought',
    );
  } finally {
    await f.close();
  }
});

it('native Undo and Redo consume empty draft-field history without reversing saved manuscript writing', async () => {
  const f = await fixture();
  const field = document.createElement('div');
  field.setAttribute('contenteditable', 'true');
  field.tabIndex = 0;
  document.body.append(field);
  const previous = Object.getOwnPropertyDescriptor(document, 'execCommand');
  const native = vi.fn(() => false);
  Object.defineProperty(document, 'execCommand', { configurable: true, value: native });
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('Keep this writing.');
    await f.vm.save();
    const revision = core.revision;
    field.focus();
    await f.vm.nativeCommand('undo');
    await f.vm.nativeCommand('redo');
    expect(native.mock.calls).toEqual([['undo'], ['redo']]);
    expect(document.activeElement).toBe(field);
    expect(core.revision).toBe(revision);
    expect(core.passageRows(core.chapters[0].id)[0].text).toBe('Keep this writing.');
    await f.vm.closeBook();
    await f.vm.openBook(core.metadata.id);
    expect(f.vm.editor!.passageRows(core.chapters[0].id)[0].text).toBe('Keep this writing.');
  } finally {
    field.remove();
    if (previous) Object.defineProperty(document, 'execCommand', previous);
    else Reflect.deleteProperty(document, 'execCommand');
    await f.close();
  }
});

it('imports a later valid manuscript after an earlier file fails without changing either input', async () => {
  const paths: string[] = [];
  const f = await fixture({ selectImportFiles: async () => paths });
  try {
    await f.vm.onboard('Writer', 'pantser');
    const broken = join(f.provider.root, 'broken.docx');
    const valid = join(f.provider.root, 'after-good.txt');
    const original = 'Chapter One\n\nStill here.\n';
    await writeFile(broken, 'not a ZIP archive');
    await writeFile(valid, original);
    paths.push(broken, valid);
    await f.vm.importBooks();
    const books = get(f.vm.state).books;
    expect(books).toHaveLength(1);
    expect(get(f.vm.state).library.shelves[0].bookIds).toEqual([books[0].id]);
    expect(get(f.vm.state).hint).toMatch(/1.*(?:failed|error)/i);
    expect(await readFile(broken, 'utf8')).toBe('not a ZIP archive');
    expect(await readFile(valid, 'utf8')).toBe(original);
    await f.vm.openBook(books[0].id);
    expect(f.vm.editor!.passageRows(f.vm.editor!.chapters[0].id).map((row) => row.text)).toContain(
      'Still here.',
    );
    await f.vm.closeBook();
    await f.vm.initialize();
    expect(get(f.vm.state).books.map((book) => book.id)).toEqual([books[0].id]);
  } finally {
    await f.close();
  }
});

it('keeps one durable publication UUID across EPUB exports, reopen and author Undo', async () => {
  let destination = '';
  const f = await fixture({ selectExportFile: async () => destination });
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('Keep this publication identity.');
    core.setMetadata({ subtitle: 'First edition' });
    core.insert(' More.');
    destination = join(f.provider.root, 'first.epub');
    await f.vm.exportBook('epub');
    const publicationId = core.metadata.uuid;
    expect(publicationId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
    const checkEpub = async () => {
      const archive = await JSZip.loadAsync(await readFile(destination));
      const opf = Object.values(archive.files).find((file) => file.name.endsWith('.opf'));
      expect(opf).toBeDefined();
      expect(await opf!.async('string')).toContain(`urn:uuid:${publicationId}`);
    };
    await checkEpub();
    core.undo();
    expect(core.metadata.uuid).toBe(publicationId);
    expect(core.passageRows(core.chapters[0].id)[0].text).toBe('Keep this publication identity.');
    core.redo();
    await f.vm.closeBook();
    await f.vm.openBook(core.metadata.id);
    expect(f.vm.editor!.metadata.uuid).toBe(publicationId);
    destination = join(f.provider.root, 'second.epub');
    await f.vm.exportBook('epub');
    await checkEpub();
    const durable = JSON.parse(
      await readFile(join(f.provider.root, core.metadata.id, 'manuscript.json'), 'utf8'),
    );
    expect(durable.metadata.uuid).toBe(publicationId);
  } finally {
    await f.close();
  }
});

it('stores the bound-book publication identity in the real library and keeps it across rename and reload', async () => {
  let destination = '';
  const f = await fixture({ selectExportFile: async () => destination });
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelfId = get(f.vm.state).library.shelves[0].id;
    await f.vm.newBook(shelfId, 'novel', 'First story');
    f.vm.createChapter();
    const core = f.vm.editor!;
    core.select(core.chapters[0].id, 1);
    core.insert('The bound story.');
    await f.vm.closeBook();
    await f.vm.bindShelf(shelfId, true);
    destination = join(f.provider.root, 'bound-first.epub');
    await f.vm.exportShelf(shelfId, 'epub');
    const libraryPath = join(f.provider.root, 'library.json');
    const saved = JSON.parse(await readFile(libraryPath, 'utf8'));
    const uuid = saved.shelves.find((shelf: { id: string }) => shelf.id === shelfId).binding.uuid;
    expect(uuid).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
    const checkEpub = async () => {
      const archive = await JSZip.loadAsync(await readFile(destination));
      const opf = Object.values(archive.files).find((file) => file.name.endsWith('.opf'))!;
      expect(await opf.async('string')).toContain(`urn:uuid:${uuid}`);
    };
    await checkEpub();
    await f.vm.renameShelf(shelfId, 'Renamed collection');
    await f.vm.initialize();
    expect(
      get(f.vm.state).library.shelves.find((shelf) => shelf.id === shelfId)?.binding?.uuid,
    ).toBe(uuid);
    destination = join(f.provider.root, 'bound-second.epub');
    await f.vm.exportShelf(shelfId, 'epub');
    await checkEpub();
  } finally {
    await f.close();
  }
});

it('removes custom cover bytes and metadata without reseeding or replacing fresh book metadata', async () => {
  let source = '';
  const f = await fixture({ selectCoverImage: async () => source });
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Original title');
    const id = f.vm.editor!.metadata.id;
    await f.vm.closeBook();
    source = join(f.provider.root, 'cover.png');
    await writeFile(
      source,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN4sAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    await f.vm.setCover(id);
    const before = (await f.provider.request('readBookMeta', { bookId: id })) as Record<
      string,
      unknown
    >;
    await f.provider.request('writeBookMeta', {
      bookId: id,
      metadata: { ...before, title: 'Fresh disk title', coverSeed: 'retained-seed' },
    });
    await f.vm.removeCover(id);
    const after = (await f.provider.request('readBookMeta', { bookId: id })) as Record<
      string,
      unknown
    >;
    expect(after.coverImage).toBeNull();
    expect(after.coverSeed).toBe('retained-seed');
    expect(after.title).toBe('Fresh disk title');
    expect(await f.provider.request('readCover', { bookId: id })).toBeNull();
    expect(get(f.vm.state).books.find((book) => book.id === id)?.coverImage).toBeNull();
    await f.vm.initialize();
    expect(get(f.vm.state).books.find((book) => book.id === id)?.coverImage).toBeNull();
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

it('keeps ambiguous concurrent notes untouched and recovers the complete local book through its explicit copy command', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id, 'novel', 'Notes conflict');
    f.vm.createChapter();
    const editor = f.vm.editor!,
      chapter = editor.chapters[0].id;
    editor.select(chapter, 1);
    editor.insert('Story remains.');
    editor.select('notes', 1);
    editor.insert('Original notes.');
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
    remote.select('notes', 1, 16);
    remote.insert('Incoming notes.');
    const incoming = remote.checkpoint();
    await writeFile(join(f.provider.root, id, 'manuscript.json'), JSON.stringify(incoming.book));
    await writeFile(join(f.provider.root, id, 'reviews.json'), JSON.stringify(incoming.reviews));
    await writeFile(join(f.provider.root, id, 'notes.html'), incoming.notes);
    editor.select('notes', 16);
    editor.insert(' Local addition.');
    const local = editor.checkpoint();
    await expect(f.vm.documentChanged({ bookId: id })).rejects.toThrow('COMPANION_CONFLICT');
    expect(f.vm.editor).toBe(editor);
    expect(editor.checkpoint()).toEqual(local);
    expect(get(f.vm.state).externalChange?.bookId).toBe(id);
    await expect(f.vm.save()).rejects.toThrow('EXTERNAL_CHANGE');
    expect(await readFile(join(f.provider.root, id, 'notes.html'), 'utf8')).toBe(incoming.notes);
    await f.vm.keepExternalCopy();
    const copy = f.vm.editor!.metadata.id;
    expect(copy).not.toBe(id);
    expect(f.vm.editor!.passageRows('notes')[0].text).toBe('Original notes. Local addition.');
    await f.vm.closeBook();
    await f.vm.openBook(copy);
    expect(f.vm.editor!.passageRows('notes')[0].text).toBe('Original notes. Local addition.');
    await f.vm.closeBook();
    await f.vm.openBook(id);
    expect(f.vm.editor!.passageRows('notes')[0].text).toBe('Incoming notes.');
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

it('exports an unbound anthology under its chosen title through exactly three author format choices', async () => {
  let destination = '';
  const platform: ApplicationPlatform = {
    selectExportFile: async (name) => {
      expect(name).toBe('Chosen anthology.epub');
      return destination;
    },
  };
  const f = await fixture(platform);
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelf = get(f.vm.state).library.shelves[0];
    await f.vm.newBook(shelf.id, 'novel', 'First story');
    f.vm.createChapter();
    f.vm.editor!.select(f.vm.editor!.chapters[0].id, 1);
    f.vm.editor!.insert('Anthology prose.');
    await f.vm.closeBook();
    destination = join(f.provider.root, 'anthology.epub');
    const exporting = f.vm.exportShelfAnthology(shelf.id);
    expect(get(f.vm.state).modal).toMatchObject({ title: 'Anthology title', value: shelf.name });
    expect(get(f.vm.state).modal?.input).not.toBe(false);
    f.vm.answer('Chosen anthology');
    await vi.waitFor(() =>
      expect(get(f.vm.state).modal?.choices?.map((choice) => choice.value)).toEqual([
        'epub',
        'docx',
        'pdf',
      ]),
    );
    f.vm.answer('epub');
    await exporting;
    const epub = await JSZip.loadAsync(await readFile(destination));
    const opf = await epub.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:title>Chosen anthology</dc:title>');
    expect(get(f.vm.state).library.shelves[0].name).toBe(shelf.name);
    expect(get(f.vm.state).books[0].title).toBe('First story');
  } finally {
    await f.close();
  }
});

it('refreshes the closed real library while preserving shelf scroll and rejects a stale read after a local shelf edit', async () => {
  const f = await fixture();
  const shelfElement = document.createElement('div');
  shelfElement.id = 'bookshelf-view';
  document.body.append(shelfElement);
  try {
    await f.vm.onboard('Writer', 'pantser');
    const baseline = structuredClone(get(f.vm.state).library);
    shelfElement.scrollTop = 231;
    const remote = structuredClone(baseline);
    remote.shelves[0].name = 'Remote shelf';
    await f.provider.request('writeLibrary', { library: remote });
    await f.vm.refreshLibraryFromDisk();
    expect(get(f.vm.state).library.shelves[0]).toMatchObject({
      id: baseline.shelves[0].id,
      name: 'Remote shelf',
    });
    expect(shelfElement.scrollTop).toBe(231);
    const request = f.host.request.bind(f.host);
    let readArrived!: () => void, releaseRead!: () => void;
    const arrived = new Promise<void>((resolve) => {
      readArrived = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    f.host.request = async (method, payload) => {
      const value = await request(method, payload);
      if (method === 'readLibrary') {
        readArrived();
        await released;
      }
      return value;
    };
    const refresh = f.vm.refreshLibraryFromDisk();
    await arrived;
    const local = structuredClone(get(f.vm.state).library);
    local.shelves[0].name = 'Newer local shelf';
    await f.vm.updateLibrary(local);
    releaseRead();
    await refresh;
    expect(get(f.vm.state).library.shelves[0].name).toBe('Newer local shelf');
    expect((await f.provider.request('readLibrary', {})).shelves[0].name).toBe('Newer local shelf');
    expect(shelfElement.scrollTop).toBe(231);
  } finally {
    shelfElement.remove();
    await f.close();
  }
});

it('author Undo waits for a shelf move whose durable commit precedes its host reply', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    const id = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    vi.spyOn(f.vm, 'prompt').mockResolvedValue('Penny Writer');
    await f.vm.newAuthor();
    const author = get(f.vm.state).library.authors.find((row) => row.name === 'Penny Writer')!;
    const request = f.provider.request.bind(f.provider);
    let release!: () => void, reached!: () => void;
    const committed = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const reply = new Promise<void>((resolve) => {
      release = resolve;
    });
    let delay = true;
    vi.spyOn(f.provider, 'request').mockImplementation(async (method, payload) => {
      const result = await request(method, payload);
      if (method === 'writeLibrary' && delay) {
        delay = false;
        reached();
        await reply;
      }
      return result;
    });
    const move = f.vm.moveToAuthor(id, author.id);
    await committed;
    const undo = f.vm.undoAuthorMove();
    release();
    await Promise.all([move, undo]);
    await f.vm.openBook(id);
    expect(f.vm.editor!.author).toBe('Writer');
    expect(
      get(f.vm.state).library.shelves.find((row) => row.authorId === author.id)!.bookIds,
    ).not.toContain(id);
    expect(
      get(f.vm.state).library.shelves.find((row) => row.authorId !== author.id)!.bookIds,
    ).toContain(id);
  } finally {
    await f.close();
  }
});

it('a canceled postcommit shelf reply cannot compensate a successfully moved book author', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    const id = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    vi.spyOn(f.vm, 'prompt').mockResolvedValue('Penny Writer');
    await f.vm.newAuthor();
    const author = get(f.vm.state).library.authors.find((row) => row.name === 'Penny Writer')!;
    const request = f.provider.request.bind(f.provider);
    let fail = true;
    vi.spyOn(f.provider, 'request').mockImplementation(async (method, payload) => {
      const result = await request(method, payload);
      if (method === 'writeLibrary' && fail) {
        fail = false;
        throw Error('CLOSED');
      }
      return result;
    });
    await f.vm.moveToAuthor(id, author.id);
    const metadata = await request('readBookMeta', { bookId: id });
    expect(metadata).toMatchObject({ author: 'Penny Writer' });
    await f.vm.openBook(id);
    expect(f.vm.editor!.author).toBe('Penny Writer');
  } finally {
    await f.close();
  }
});

it('a confirmed precommit shelf failure restores durable placement and author in the current UI', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    const id = get(f.vm.state).book!.id;
    await f.vm.closeBook();
    vi.spyOn(f.vm, 'prompt').mockResolvedValue('Penny Writer');
    await f.vm.newAuthor();
    const author = get(f.vm.state).library.authors.find((row) => row.name === 'Penny Writer')!;
    const before = structuredClone(get(f.vm.state).library);
    const request = f.provider.request.bind(f.provider);
    let fail = true;
    vi.spyOn(f.provider, 'request').mockImplementation(async (method, payload) => {
      if (method === 'writeLibrary' && fail) {
        fail = false;
        throw Error('WRITE_FAILED');
      }
      return request(method, payload);
    });
    await expect(f.vm.moveToAuthor(id, author.id)).rejects.toThrow('WRITE_FAILED');
    expect(get(f.vm.state).library).toEqual(before);
    expect(await request('readLibrary', {})).toMatchObject({ shelves: before.shelves });
    expect(await request('readBookMeta', { bookId: id })).toMatchObject({ author: 'Writer' });
    await f.vm.openBook(id);
    expect(f.vm.editor!.author).toBe('Writer');
  } finally {
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

it('imports a later valid dropped manuscript after malformed DOCX without altering either input', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const broken = join(f.provider.root, 'dropped-broken.docx');
    const valid = join(f.provider.root, 'dropped-good.txt');
    const invalidBytes = Buffer.from('not a ZIP archive');
    const original = Buffer.from('Chapter One\n\nDropped prose stays intact.\n');
    await writeFile(broken, invalidBytes);
    await writeFile(valid, original);
    await f.vm.filesDropped({ paths: [broken, valid] });
    const books = get(f.vm.state).books;
    expect(books).toHaveLength(1);
    expect(get(f.vm.state).library.shelves[0].bookIds).toEqual([books[0].id]);
    expect(get(f.vm.state).hint).toMatch(/Imported 1 book; 1 failed/);
    expect(await readFile(broken)).toEqual(invalidBytes);
    expect(await readFile(valid)).toEqual(original);
    const durable = await new BookFiles(join(f.provider.root, books[0].id)).load(false);
    expect(durable.book.chapters.map((chapter) => chapter.html)).toEqual([
      '<p>Dropped prose stays intact.</p>',
    ]);
    await f.vm.openBook(books[0].id);
    expect(f.vm.editor!.passageRows(f.vm.editor!.chapters[0].id).map((row) => row.text)).toEqual([
      'Dropped prose stays intact.',
    ]);
    await f.vm.closeBook();
    await f.vm.initialize();
    expect(get(f.vm.state).books.map((book) => book.id)).toEqual([books[0].id]);
    expect(await readFile(broken)).toEqual(invalidBytes);
    expect(await readFile(valid)).toEqual(original);
  } finally {
    await f.close();
  }
});

it('a positioned cover drop updates its closed target while another book stays open', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const shelf = get(f.vm.state).library.shelves[0].id;
    await f.vm.newBook(shelf, 'novel', 'Cover target');
    const target = f.vm.editor!.metadata.id;
    await f.vm.closeBook();
    await f.vm.newBook(shelf, 'novel', 'Current writing');
    f.vm.createChapter();
    f.vm.editor!.select(f.vm.editor!.chapters[0].id, 1);
    f.vm.editor!.insert('Keep my writing and selection.');
    const current = f.vm.editor!.metadata.id;
    const checkpoint = f.vm.editor!.checkpoint();
    const selection = f.vm.editor!.state.selection.toJSON();
    const image = join(f.provider.root, 'drop-cover.png');
    await writeFile(
      image,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN4sAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    await f.vm.filesDropped({
      paths: [image],
      position: { x: 200, y: 100 },
      target: { kind: 'book', bookId: target },
    });
    expect(await f.provider.request('readCover', { bookId: target })).not.toBeNull();
    expect(await f.provider.request('readCover', { bookId: current })).toBeNull();
    expect((await f.provider.request('readBookMeta', { bookId: target })).coverMode).toBe('image');
    expect(f.vm.editor!.checkpoint()).toEqual(checkpoint);
    expect(f.vm.editor!.state.selection.toJSON()).toEqual(selection);
    // Background, stale and shelf-only targets never acquire authority over the open book.
    for (const payload of [
      { paths: [image], position: { x: 900, y: 900 } },
      {
        paths: [image],
        position: { x: 200, y: 100 },
        target: { kind: 'book', bookId: 'missing-book' },
      },
      { paths: [image], position: { x: 200, y: 100 }, target: { kind: 'shelf', shelfId: shelf } },
    ])
      await f.vm.filesDropped(payload);
    expect(await f.provider.request('readCover', { bookId: current })).toBeNull();
    expect(f.vm.editor!.checkpoint()).toEqual(checkpoint);
  } finally {
    await f.close();
  }
});

it('a positioned manuscript drop imports into the chosen shelf rather than the first shelf', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const library = await f.provider.request('readLibrary', {});
    const shelf = { ...library.shelves[0], id: 'second-shelf', name: 'Dropped here', bookIds: [] };
    await f.provider.request('writeLibrary', {
      library: { ...library, shelves: [...library.shelves, shelf] },
    });
    await f.vm.initialize();
    const source = join(f.provider.root, 'chosen-shelf.txt');
    const original = 'Chapter One\n\nChosen shelf writing.\n';
    await writeFile(source, original);
    await f.vm.filesDropped({
      paths: [source],
      position: { x: 100, y: 400 },
      target: { kind: 'shelf', shelfId: shelf.id },
    });
    const durable = await f.provider.request('readLibrary', {});
    expect(durable.shelves[0].bookIds).toEqual([]);
    expect(durable.shelves[1].bookIds).toEqual([get(f.vm.state).books[0].id]);
    expect(await readFile(source, 'utf8')).toBe(original);
  } finally {
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
it('shelf drops resolve before and after placement once against current owned order and persist the exact sequence', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    const library = get(f.vm.state).library;
    const shelves = ['first', 'middle', 'last'].map((id) => ({
      id,
      name: id,
      authorId: library.currentAuthorId!,
      bookIds: [],
    }));
    await f.provider.request('writeLibrary', { library: { ...library, shelves } });
    await f.vm.initialize();
    await f.vm.dropShelf('first', 'middle', false);
    expect(get(f.vm.state).library.shelves.map((s) => s.id)).toEqual(['first', 'middle', 'last']);
    await f.vm.dropShelf('last', 'first', true);
    expect(get(f.vm.state).library.shelves.map((s) => s.id)).toEqual(['first', 'last', 'middle']);
    await f.vm.dropShelf('middle', 'first', false);
    expect(get(f.vm.state).library.shelves.map((s) => s.id)).toEqual(['middle', 'first', 'last']);
    await f.vm.dropShelf('middle', 'last', true);
    const expected = ['first', 'last', 'middle'];
    expect(get(f.vm.state).library.shelves.map((s) => s.id)).toEqual(expected);
    const saved = JSON.parse(await readFile(join(f.provider.root, 'library.json'), 'utf8'));
    expect(saved.shelves.map((s: { id: string }) => s.id)).toEqual(expected);
    await f.vm.dropShelf('missing', 'first', false);
    expect(get(f.vm.state).library.shelves.map((s) => s.id)).toEqual(expected);
  } finally {
    await f.close();
  }
});
