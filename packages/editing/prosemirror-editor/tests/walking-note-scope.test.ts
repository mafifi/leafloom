import { expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { AllSelection, NodeSelection } from 'prosemirror-state';
import { BookCore } from '../src/core';
import { walkingOutlineNote } from '../src/outline-card-projection';

function open(notes: boolean) {
  return new BookCore(new JSDOM('').window.document, {
    formatVersion: 'neo-lifecycle/v1', revision: 0,
    metadata: { id: 'book', title: 'Title', author: 'Writer', sectionNotes: notes ? {
      'ch-99': [{ id: 'owned', text: 'Last chapter plan' }],
    } : {} },
    chapters: Array.from({ length: 100 }, (_, index) => ({
      id: 'ch-' + index,
      html: index === 99 ? '<p data-sec-id="owned"><b>Last chapter writing.</b></p>' : '<p>Other chapter writing.</p>',
    })), darlings: [],
  }, null, '', '');
}
for (const notes of [false, true]) it(`walking-note projection reads only the caret chapter (${notes ? 'owned note' : 'no notes'})`, () => {
  const core = open(notes), pid = core.passageRows('ch-99')[0].id;
  core.selectPassage(pid, 3);
  // Unchanged chapters must not be segmented on every keystroke. This checks
  // the actual native immutable nodes rather than a timing-sensitive budget.
  const foreign = core.state.doc.child(0), read = vi.spyOn(foreign, 'forEach');
  try {
    expect(core.walkingOutlineNote).toEqual(notes ? {
      chapterId: 'ch-99', sectionId: 'owned', passageId: pid, text: 'Last chapter plan',
    } : null);
    expect(read).not.toHaveBeenCalled();
    expect(core.html('ch-99')).toContain('<b>Last chapter writing.</b>');
  } finally { read.mockRestore(); }
});
it('walking-note projection leaves whole-book and chapter boundary selections without a note', () => {
  const core = open(true), state = core.state;
  expect(walkingOutlineNote(state.apply(state.tr.setSelection(new AllSelection(state.doc))))).toBeNull();
  expect(walkingOutlineNote(state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 0))))).toBeNull();
});
