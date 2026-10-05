// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { get } from 'svelte/store';
import { describe,expect,it,vi } from 'vitest';
import { fixture } from './application-fixture';
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
