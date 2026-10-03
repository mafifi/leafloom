// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { BookCore } from '../src/core';
import { ProseMirrorSurfaces } from '../src/surfaces';
import { wordOffset } from '../src/vim';
function setup() {
  document.body.innerHTML =
    '<main><div class="chapter-body" data-chid="a"></div><div class="chapter-body" data-chid="b"></div></main><aside></aside>';
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [
        { id: 'a', html: '<p>Alpha_2 can’t... Été 😺.</p><p>Second line.</p>' },
        { id: 'b', html: '<p>Later.</p>' },
      ],
      darlings: [],
    },
    null,
    '<p>Notes.</p>',
    '',
  );
  const surfaces = new ProseMirrorSurfaces(core, {
    undo: () => core.undo(),
    redo: () => core.redo(),
    save: () => {},
    format: (mark) => core.format(mark),
    archive: () => core.archive(),
  });
  surfaces.renderBook(
    document.querySelector('main')!,
    document.querySelector('aside')!,
    'manuscript',
    true,
  );
  core.select('a', 1);
  surfaces.setVim(true);
  const key = (key: string, extra: KeyboardEventInit = {}) =>
    document
      .querySelector(`[data-chid="${core.activeSection?.id ?? 'a'}"] .ProseMirror`)!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }),
      );
  return { core, surfaces, key };
}
it('Vim defaults to insertion, Escape enters navigation, and repeated Escape stays while i writes', () => {
  const { core, surfaces, key } = setup();
  expect(surfaces.vimState).toEqual({ enabled: true, navigation: false, visual: false });
  key('Escape');
  expect(surfaces.vimState.navigation).toBe(true);
  key('Escape');
  expect(surfaces.vimState.navigation).toBe(true);
  key('i');
  expect(surfaces.vimState.navigation).toBe(false);
  surfaces.setVim(false);
  expect(surfaces.vimState).toEqual({ enabled: false, navigation: false, visual: false });
  surfaces.destroy();
});
it('word motions count punctuation, apostrophes, underscore identifiers and Unicode offsets', () => {
  expect(wordOffset('Alpha_2 can’t... Été 😺.', 0, 'w')).toBe(8);
  expect(wordOffset('Alpha_2 can’t... Été 😺.', 8, 'e')).toBe(12);
  expect(wordOffset('Alpha_2 can’t... Été 😺.', 12, 'w')).toBe(13);
  expect(wordOffset('Alpha_2 can’t... Été 😺.', 16, 'w')).toBe(17);
  expect(wordOffset('Alpha_2 can’t... Été 😺.', 20, 'b')).toBe(17);
  const { core, surfaces, key } = setup();
  key('Escape');
  key('3');
  key('w');
  expect(core.state.selection.$from.parentOffset).toBe(17);
  key('b');
  expect(core.state.selection.$from.parentOffset).toBe(13);
  surfaces.destroy();
});
it('counts, chapter/document boundaries and insert transitions remain selection-only history', () => {
  const { core, surfaces, key } = setup();
  key('Escape');
  key('2');
  key('l');
  expect(core.state.selection.$from.parentOffset).toBe(2);
  key('G');
  expect(core.state.selection.$from.parent.textContent).toBe('Second line.');
  key('g');
  key('g');
  expect(core.state.selection.$from.parentOffset).toBe(0);
  key(']');
  key(']');
  expect(core.activeSection?.id).toBe('b');
  key('A');
  expect(surfaces.vimState.navigation).toBe(false);
  expect(core.state.selection.$from.parentOffset).toBe(6);
  expect(core.canUndo).toBe(false);
  surfaces.destroy();
});
it('visual inclusive yank and cut copy portable clipboard payload and share master undo', () => {
  const { core, surfaces, key } = setup();
  const copied: string[] = [];
  surfaces.setHooks({ copy: (value) => copied.push(value.text) });
  key('Escape');
  key('v');
  key('2');
  key('l');
  key('y');
  expect(copied).toEqual(['Alp']);
  expect(core.state.selection.empty).toBe(true);
  key('v');
  key('2');
  key('l');
  key('d');
  expect(copied).toEqual(['Alp', 'Alp']);
  expect(core.passageRows('a')[0].text.startsWith('ha_2')).toBe(true);
  core.undo();
  expect(core.passageRows('a')[0].text.startsWith('Alpha_2')).toBe(true);
  surfaces.destroy();
});
it('o and O create ordinary paragraphs as one native history event', () => {
  const { core, surfaces, key } = setup();
  key('Escape');
  key('o');
  expect(core.passageRows('a').map((p) => p.text)).toEqual([
    'Alpha_2 can’t... Été 😺.',
    '',
    'Second line.',
  ]);
  core.undo();
  core.select('a', 1);
  key('Escape');
  key('O');
  expect(core.passageRows('a')[0].text).toBe('');
  core.undo();
  expect(core.passageRows('a')).toHaveLength(2);
  surfaces.destroy();
});
it('composing keys and modified shortcuts retain their existing behavior', () => {
  const { core, surfaces, key } = setup();
  key('Escape', { isComposing: true });
  expect(surfaces.vimState.navigation).toBe(false);
  key('Escape');
  key('s', { metaKey: true });
  expect(surfaces.vimState.navigation).toBe(true);
  expect(core.revision).toBe(0);
  surfaces.destroy();
});
it('moving focus to a title leaves Vim navigation while moving among author editors retains it', () => {
  const { core, surfaces, key } = setup();
  surfaces.focus();
  key('Escape');
  const next = document.querySelector<HTMLElement>('[data-chid="b"] .ProseMirror')!;
  next.focus();
  expect(surfaces.vimState.navigation).toBe(true);
  const title = document.createElement('input');
  document.body.append(title);
  title.focus();
  expect(surfaces.vimState).toEqual({ enabled: true, navigation: false, visual: false });
  expect(core.canUndo).toBe(false);
  surfaces.destroy();
});
for (const glyph of ['e\u0301', '👨‍👩‍👧‍👦', '👍🏽'])
  it(`Vim navigation and delete preserve whole graphemes ${glyph} with marks, reference mapping and Undo/Redo`, () => {
    const { core, surfaces, key } = setup();
    core.select('a', 1, core.section('a').node.content.size - 1);
    core.insert('');
    core.paste({ text: `A${glyph}B`, html: `<p><b>A${glyph}B</b></p>` });
    const passage = core.passageRows('a')[0].id;
    core.selectPassage(passage, 1);
    const reference = core.capture(passage, 1 + glyph.length, 2 + glyph.length),
      before = core.html('a');
    key('Escape');
    key('l');
    expect(core.selection).toMatchObject({ from: 1 + glyph.length, to: 1 + glyph.length });
    key('h');
    expect(core.selection).toMatchObject({ from: 1, to: 1 });
    key('x');
    expect(core.html('a')).toBe('<p><b>AB</b></p>');
    expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'B' });
    core.undo();
    expect(core.html('a')).toBe(before);
    core.redo();
    expect(core.html('a')).toBe('<p><b>AB</b></p>');
    const snapshot = core.checkpoint(),
      reopened = new BookCore(
        document,
        snapshot.book,
        snapshot.reviews,
        snapshot.notes,
        snapshot.outline,
      );
    expect(reopened.html('a')).toBe('<p><b>AB</b></p>');
    expect(reopened.resolve(reference.id)).toMatchObject({ status: 'current', text: 'B' });
    surfaces.destroy();
  });
