import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../../packages/editing/prosemirror-editor/src/core';
import { outlineNativeUndo, outlineStructure } from '../../apps/desktop/src/lib/outline-history-focus';
const document = new JSDOM('').window.document;
const open = () => new BookCore(document, { formatVersion: 'neo-lifecycle/v1', revision: 0, metadata: { id: 'book', title: 'Title', author: 'Writer' }, chapters: [{ id: 'chapter', html: '<p>Prose.</p>' }], darlings: [] }, null, '', '');
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
function setup() {
  const editor = open(), field = document.createElement('div'); field.contentEditable = 'true'; document.body.append(field);
  const context = { editor, writable: () => true, value: { panel: 'outline' }, focusOutline: vi.fn() }, target = { chapterId: 'chapter' };
  const press = () => outlineNativeUndo(context, field, new document.defaultView!.KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
  return { editor, field, context, target, press };
}
it('empty native outline Undo falls back to the single editor history and restores structural source focus', () => {
  const { editor, context, target, press } = setup();
  outlineStructure(editor, target, () => editor.outlineEnter(target));
  expect(press()).toBe(true); vi.runAllTimers();
  expect(editor.chapters).toHaveLength(1); expect(context.focusOutline).toHaveBeenCalledWith(target);
});
it('a native beforeinput answer owns its Undo and leaves editor structure alone', () => {
  const { editor, field, target, press } = setup();
  outlineStructure(editor, target, () => editor.outlineEnter(target)); press();
  field.dispatchEvent(new document.defaultView!.Event('beforeinput')); vi.runAllTimers();
  expect(editor.chapters).toHaveLength(2);
});
it('unrelated author edits clear structural focus origins and cannot be undone by an empty outline field', () => {
  const { editor, target, press } = setup();
  outlineStructure(editor, target, () => editor.outlineEnter(target));
  editor.selectPassage(editor.passageRows('chapter')[0].id, 0); editor.insert('New ');
  const revision = editor.revision; press(); vi.runAllTimers();
  expect(editor.revision).toBe(revision); expect(editor.html('chapter')).toContain('New Prose.'); expect(editor.chapters).toHaveLength(2);
});
it('a changed revision between key delivery and fallback cancels the pending native Undo', () => {
  const { editor, context, target, press } = setup();
  outlineStructure(editor, target, () => editor.outlineEnter(target)); press();
  editor.selectPassage(editor.passageRows('chapter')[0].id, 0); editor.insert('New '); vi.runAllTimers();
  expect(context.focusOutline).not.toHaveBeenCalled(); expect(editor.html('chapter')).toContain('New Prose.');
});
it('bookkeeping revisions retain source origins while successive structural Undo follows the sole history', () => {
  const { editor, context, target, press } = setup();
  const second = outlineStructure(editor, target, () => editor.outlineEnter(target));
  outlineStructure(editor, second, () => editor.outlineEnter(second));
  editor.setBookkeeping({ wordCount: editor.words }); press(); vi.runAllTimers();
  expect(editor.chapters).toHaveLength(2); expect(context.focusOutline).toHaveBeenLastCalledWith(second);
  press(); vi.runAllTimers(); expect(editor.chapters).toHaveLength(1); expect(context.focusOutline).toHaveBeenLastCalledWith(target);
});
