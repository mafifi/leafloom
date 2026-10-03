import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../../packages/editing/prosemirror-editor/src/core';
import { SpellingViewModel } from '../../apps/desktop/src/lib/spelling-view-model';
function fixture() {
  const editor = new BookCore(
    new JSDOM('').window.document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [
        { id: 'a', html: '<p>bad well-known NASA Wh-what</p><p class="ghost">planned</p>' },
        { id: 'b', html: '<p>other</p>' },
      ],
      darlings: [],
    },
    null,
    '<p>note</p>',
    '',
  );
  const state: { enabled: boolean; language: string; active: string; current: BookCore | null } = {
    enabled: true,
    language: 'en-US',
    active: 'a',
    current: editor,
  };
  const request = vi.fn(
    async (
      _method: 'spellcheck',
      payload: { words: string[]; language: string },
    ): Promise<unknown> =>
      Object.fromEntries(
        payload.words.map((word) => [word, !['bad', 'other', 'note'].includes(word)]),
      ),
  );
  const vm = new SpellingViewModel({
    editor: () => state.current,
    request,
    activeSection: () => state.active,
    enabled: () => state.enabled,
    language: () => state.language,
  });
  return { editor, state, request, vm };
}
afterEach(() => vi.useRealTimers());
it('scans only the active author section, excludes plans/acronyms and retains already scanned sections', async () => {
  const { editor, state, request, vm } = fixture();
  await vm.activate();
  expect(request.mock.calls[0][1].words).toEqual(['bad', 'well-known', 'well', 'known', 'what']);
  expect(editor.annotations.map((item) => item.message)).toEqual(['bad']);
  state.active = 'b';
  await vm.activate();
  expect(editor.annotations.map((item) => item.message)).toEqual(['bad', 'other']);
  state.active = 'a';
  await vm.activate();
  expect(request).toHaveBeenCalledTimes(2);
  state.active = 'notes';
  await vm.activate();
  expect(editor.annotations.map((item) => item.message)).toEqual(['bad', 'other', 'note']);
  vm.destroy();
});
it('coalesces edits for 600ms, reuses word checks, and keeps actual inline text-run boundaries', async () => {
  vi.useFakeTimers();
  const { editor, request, vm } = fixture();
  editor.select('a', 1);
  editor.paste({ text: 'splitwords', html: '<b>split</b><i>words</i> ' });
  vm.schedule();
  vm.schedule();
  await vi.advanceTimersByTimeAsync(599);
  expect(request).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(request.mock.calls[0][1].words).toContain('split');
  expect(request.mock.calls[0][1].words).toContain('words');
  expect(request.mock.calls[0][1].words).not.toContain('splitwords');
  editor.select('a', 1);
  editor.insert('bad ');
  await vm.scan();
  expect(request).toHaveBeenCalledTimes(1);
  expect(editor.annotations.filter((item) => item.message === 'bad')).toHaveLength(2);
  vm.destroy();
});
it('discards replies after disable, edits, language changes or a different editor becomes active', async () => {
  const { editor, state, vm, request } = fixture();
  let resolve: (value: Record<string, boolean>) => void = () => {};
  request.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = vm.scan();
  state.enabled = false;
  vm.schedule();
  resolve({ bad: false });
  await pending;
  expect(editor.annotations).toEqual([]);
  state.enabled = true;
  const edited = vm.scan();
  editor.select('a', 1);
  editor.insert('new ');
  resolve({ bad: false });
  await edited;
  expect(editor.annotations).toEqual([]);
  const changedLanguage = vm.scan();
  state.language = 'fr';
  resolve({ bad: false });
  await changedLanguage;
  expect(editor.annotations).toEqual([]);
  const replaced = vm.scan();
  state.current = null;
  resolve({ bad: false });
  await replaced;
  expect(editor.annotations).toEqual([]);
  vm.destroy();
});
it('learning clears word and section caches and rechecks equivalent forms in every scanned section', async () => {
  const { editor, state, request, vm } = fixture();
  await vm.activate();
  state.active = 'b';
  await vm.activate();
  request.mockImplementation(async (_method, payload) =>
    Object.fromEntries(payload.words.map((word) => [word, true])),
  );
  await vm.learned('bad');
  expect(editor.annotations).toEqual([]);
  expect(request.mock.calls.slice(2).flatMap((call) => call[1].words)).toContain('other');
  expect(request.mock.calls.slice(2).flatMap((call) => call[1].words)).not.toContain('bad');
  vm.destroy();
});
it('language change invalidates accepted words and disabling preserves non-spelling annotations and author history', async () => {
  const { editor, state, request, vm } = fixture();
  const passage = editor.passageRows('a')[0];
  editor.setAnnotations([{ id: 'review', kind: 'review', passageId: passage.id, from: 0, to: 3 }]);
  const before = editor.checkpoint();
  await vm.activate();
  state.language = 'fr';
  await vm.activate();
  expect(request.mock.calls[1][1].language).toBe('fr');
  expect(request.mock.calls[1][1].words).toContain('well-known');
  state.enabled = false;
  vm.schedule();
  expect(editor.annotations).toEqual([
    { id: 'review', kind: 'review', passageId: passage.id, from: 0, to: 3 },
  ]);
  expect(editor.checkpoint()).toEqual(before);
  expect(editor.canUndo).toBe(false);
  vm.destroy();
});
it('invalid dictionary responses cannot publish flags or poison the word cache', async () => {
  const { editor, request, vm } = fixture();
  request.mockImplementationOnce(async () => ({ bad: 'incorrect' }));
  await expect(vm.scan()).rejects.toThrow();
  expect(editor.annotations).toEqual([]);
  await vm.scan();
  expect(request).toHaveBeenCalledTimes(2);
  expect(editor.annotations.map((item) => item.message)).toEqual(['bad']);
  vm.destroy();
});
it('a synchronous presentation subscriber cannot recursively rescan or duplicate published flags', async () => {
  const { editor, request, vm } = fixture();
  const refreshes: Promise<void>[] = [];
  const stop = editor.subscribe((event) => {
    if (event.kind === 'decoration') refreshes.push(vm.activate());
  });
  await vm.activate();
  await Promise.all(refreshes);
  expect(request).toHaveBeenCalledTimes(1);
  expect(refreshes).toHaveLength(1);
  expect(editor.annotations).toHaveLength(1);
  stop();
  vm.destroy();
});
