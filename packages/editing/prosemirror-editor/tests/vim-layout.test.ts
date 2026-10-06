// @vitest-environment jsdom
import { expect, it } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { BookCore } from '../src/core';
import { VimController, vimKeyOf } from '../src/vim';

for (const [key, code, shiftKey, expected] of [
  ['о', 'KeyJ', false, 'j'],
  ['ω', 'KeyW', false, 'w'],
  ['Dead', 'BracketLeft', true, '{'],
  ['Process', 'KeyN', true, 'N'],
  ['€', 'Digit4', true, '$'],
  ['ArrowRight', 'ArrowRight', false, 'ArrowRight'],
] as const)
  it(`motion maps ${key}/${code} to ${expected}`, () => {
    expect(vimKeyOf(new KeyboardEvent('keydown', { key, code, shiftKey }))).toBe(expected);
  });
it('CapsLock inverts letter shift while punctuation keeps its physical shift', () => {
  const event = new KeyboardEvent('keydown', { key: 'О', code: 'KeyJ' });
  Object.defineProperty(event, 'getModifierState', {
    value: (name: string) => name === 'CapsLock',
  });
  expect(vimKeyOf(event)).toBe('J');
  const shifted = new KeyboardEvent('keydown', { key: 'о', code: 'KeyJ', shiftKey: true });
  Object.defineProperty(shifted, 'getModifierState', {
    value: (name: string) => name === 'CapsLock',
  });
  expect(vimKeyOf(shifted)).toBe('j');
});
function controller() {
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'vim-layout', title: 'Layout', author: 'Writer' },
      chapters: [{ id: 'a', html: '<p><b>Alpha beta gamma.</b></p>' }],
      darlings: [],
    },
    null,
    '',
    '',
  );
  core.select('a', 1);
  const repeats: unknown[] = [];
  let searchWasMoving = false;
  const vim = new VimController(
    core,
    () => ({
      search: () => {
        searchWasMoving = vim.state.navigation;
      },
    }),
    () => {},
    undefined,
    (...args) => repeats.push(args),
  );
  const key = (value: string, init: KeyboardEventInit = {}) =>
    vim.handle(
      new KeyboardEvent('keydown', { key: value, cancelable: true, ...init }),
      {} as EditorView,
    );
  vim.setEnabled(true);
  return { core, vim, key, repeats, searchWasMoving: () => searchWasMoving };
}
it('rest starts motion, insert preserves native layout/IME, and Escape returns without editing history', () => {
  const { core, vim, key } = controller();
  vim.rest();
  expect(vim.state.navigation).toBe(true);
  key('д', { code: 'KeyL' });
  expect(core.state.selection.$from.parentOffset).toBe(1);
  key('Process', { code: 'KeyL', isComposing: true, keyCode: 229 });
  expect(core.state.selection.$from.parentOffset).toBe(2);
  key('ш', { code: 'KeyI' });
  expect(vim.state.navigation).toBe(false);
  expect(key('д', { code: 'KeyL' })).toBe(false);
  expect(key('Escape', { isComposing: true })).toBe(false);
  expect(vim.state.navigation).toBe(false);
  key('Escape');
  expect(core.state.selection.$from.parentOffset).toBe(2);
  expect(vim.state.navigation).toBe(true);
  expect(core.canUndo).toBe(false);
});
it('Find captures moving mode and repeat commands pass counts, reverse and visual state', () => {
  const { vim, key, repeats, searchWasMoving } = controller();
  vim.rest();
  key('/');
  expect(searchWasMoving()).toBe(true);
  expect(vim.state.navigation).toBe(false);
  vim.rest();
  key('3');
  key('n');
  key('v');
  key('N');
  expect(repeats).toEqual([
    [1, 3, false],
    [-1, 1, true],
  ]);
  key('Escape');
  key('n');
  expect(repeats.at(-1)).toEqual([1, 1, false]);
});
it('Escape collapses a backwards visual selection at its document end and clears pending counts', () => {
  const { core, vim, key } = controller();
  vim.rest();
  key('5');
  key('l');
  key('v');
  key('h');
  expect(core.state.selection.anchor).toBeGreaterThan(core.state.selection.head);
  key('Escape');
  expect(core.state.selection.$from.parentOffset).toBe(5);
  expect(core.state.selection.empty).toBe(true);
  expect(vim.state).toMatchObject({ navigation: true, visual: false });
  key('3');
  key('Escape');
  key('l');
  expect(core.state.selection.$from.parentOffset).toBe(6);
  expect(core.canUndo).toBe(false);
});
it('AltGraph and modified shortcuts bypass motion while the beforeinput owner refuses their text', () => {
  const { core, vim } = controller();
  vim.rest();
  const event = new KeyboardEvent('keydown', { key: 'l', code: 'KeyL' });
  Object.defineProperty(event, 'getModifierState', {
    value: (name: string) => name === 'AltGraph',
  });
  expect(vim.handle(event, {} as EditorView)).toBe(false);
  expect(core.state.selection.$from.parentOffset).toBe(0);
});
