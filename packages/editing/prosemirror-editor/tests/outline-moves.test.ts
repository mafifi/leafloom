import { expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
import { OutlineOperations } from '../src/outline';
import { bookSchema, sectionsFrom } from '../src/model';
const document = new JSDOM('').window.document;
const open = () => new BookCore(document, {
  formatVersion: 'neo-lifecycle/v1', revision: 0,
  metadata: { id: 'book', title: 'Title', author: 'Writer', chapterNotes: { a: 'Opening', b: 'Ending' },
    sectionNotes: { a: [{ id: 'one', text: 'First note' }, { id: 'two', text: 'Second note' }], b: [{ id: 'third', text: 'Third note' }] } },
  chapters: [
    { id: 'a', html: '<p data-sec-id="one"><i>First prose.</i></p><p class="scene-break" data-sec-brk="two">***</p><p data-sec-id="two"><b>Second prose.</b></p>' },
    { id: 'b', html: '<p>Ending prose.</p><p class="scene-break" data-sec-brk="third">***</p><p class="ghost" data-sec-id="third">Third note</p>' },
  ], darlings: [],
}, null, '', '');
// Exercise the production operation against the same master; no second state owner.
function operations(core: BookCore) {
  return new OutlineOperations({
    state: () => core.state, chapters: () => core.chapters,
    section: (id) => sectionsFrom(core.state.doc).find((section) => section.node.attrs.id === id)!,
    createChapter: (id) => bookSchema.nodes.section.create({ id }, bookSchema.nodes.paragraph.create({ pid: crypto.randomUUID() })),
    wordCount: () => 0, dispatch: (tr, command) => core.dispatch(tr, command),
  });
}
it('NEO 1.3.5 chapter join keeps rich text, durable passage IDs and source section notes with one Undo', () => {
  const core = open(), ops = operations(core), before = core.checkpoint(), ids = core.passageRows('b').map((row) => row.id),
    target = ops.joinChapter('b', 'a');
  expect(target?.sectionId).toBeDefined();
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(['a']);
  expect(core.html('a')).toContain('<i>First prose.</i>');
  expect(core.html('a')).toContain('<b>Second prose.</b>');
  expect(core.passageRows('a').map((row) => row.id)).toEqual(expect.arrayContaining(ids));
  expect(core.metadata.sectionNotes).toMatchObject({ a: [{ id: 'one' }, { id: 'two' }, { id: target!.sectionId, text: 'Ending' }, { id: 'third' }] });
  const saved = core.checkpoint(), reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.html('a')).toBe(core.html('a'));
  expect(reopened.metadata.sectionNotes).toEqual(core.metadata.sectionNotes);
  core.undo();
  expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
  expect(core.metadata.sectionNotes).toEqual(before.book.metadata.sectionNotes);
  core.redo();
  expect(core.chapters).toHaveLength(1);
});
it('NEO 1.3.5 cross-chapter section drop moves full rich segment, note and passage IDs to receiver end', () => {
  const core = open(), ops = operations(core), before = core.checkpoint(), prose = core.passageRows('a').find((row) => row.text === 'Second prose.')!,
    reference = core.capture(prose.id, 0, prose.text.length);
  ops.moveSection('a', 1, { chapterId: 'b', before: null });
  expect(core.passageRows('a').map((row) => row.text)).toEqual(['First prose.']);
  expect(core.passageRows('b').map((row) => row.text)).toEqual(['Ending prose.', '***', 'Third note', '***', 'Second prose.']);
  expect(core.html('b')).toContain('<b>Second prose.</b>');
  expect(core.passageRows('b').at(-1)?.id).toBe(prose.id);
  expect(core.resolve(reference.id).status).toBe('current');
  expect(core.metadata.sectionNotes).toMatchObject({ a: [{ id: 'one' }], b: [{ id: 'third' }, { id: 'two' }] });
  core.undo();
  expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
  expect(core.metadata.sectionNotes).toEqual(before.book.metadata.sectionNotes);
  core.redo();
  expect(core.passageRows('b').at(-1)?.id).toBe(prose.id);
});
it('NEO 1.3.5 section reorder retains rich nodes and inserts a separator ahead of the former first section', () => {
  const core = open(), ops = operations(core), before = core.checkpoint(), prose = core.passageRows('a')[0], ref = core.capture(prose.id, 0, prose.text.length);
  ops.moveSection('a', 1, { chapterId: 'a', before: 0 });
  expect(core.passageRows('a').map((row) => row.text)).toEqual(['Second prose.', '***', 'First prose.']);
  expect(core.html('a')).toContain('<b>Second prose.</b>');
  expect(core.resolve(ref.id).status).toBe('current');
  expect(core.metadata.sectionNotes).toMatchObject({ a: [{ id: 'two' }, { id: 'one' }] });
  core.undo();
  expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
});
it('NEO 1.3.5 chapter join rejects part and published-page roles without mutation', () => {
  const core = open(), ops = operations(core);
  core.setChapterKind('b', 'part');
  const before = core.revision;
  expect(ops.joinChapter('b', 'a')).toBeNull();
  expect(core.revision).toBe(before);
});
it('NEO 1.3.5 join places physical notes before virtual notes without materializing every plan', () => {
  const core = new BookCore(document, {
    formatVersion: 'neo-lifecycle/v1', revision: 0,
    metadata: { id: 'book', title: 'Title', author: 'Writer', chapterNotes: { b: 'Ending' }, sectionNotes: { a: [{ id: 'virtual', text: 'Unplaced plan' }] } },
    chapters: [{ id: 'a', html: '<p>First prose.</p>' }, { id: 'b', html: '<p><i>Ending prose.</i></p>' }], darlings: [],
  }, null, '', '');
  const result = operations(core).joinChapter('b', 'a');
  expect(core.metadata.sectionNotes).toMatchObject({ a: [{ id: result!.sectionId, text: 'Ending' }, { id: 'virtual', text: 'Unplaced plan' }] });
  expect(core.html('a')).not.toContain('Unplaced plan');
});
it('NEO 1.3.5 joining a ghost-only chapter inserts its chapter note ahead of the existing ghost without replacing it', () => {
  const core = new BookCore(document, {
    formatVersion: 'neo-lifecycle/v1', revision: 0,
    metadata: { id: 'book', title: 'Title', author: 'Writer', chapterNotes: { b: 'Ending' }, sectionNotes: { b: [{ id: 'planned', text: 'Existing plan' }] } },
    chapters: [{ id: 'a', html: '<p>First prose.</p>' }, { id: 'b', html: '<p class="ghost" data-sec-id="planned">Existing plan</p>' }], darlings: [],
  }, null, '', '');
  const original = core.passageRows('b')[0].id, result = operations(core).joinChapter('b', 'a');
  expect(core.metadata.sectionNotes).toMatchObject({ a: [{ id: result!.sectionId, text: 'Ending' }, { id: 'planned', text: 'Existing plan' }] });
  expect(core.passageRows('a').at(-1)).toMatchObject({ id: original, text: 'Existing plan' });
  expect(core.html('a')).toContain('class="ghost" data-sec-id="' + result!.sectionId + '"');
});
it('NEO 1.3.5 a break-only chapter joins without leaving a duplicate break or losing its virtual note', () => {
  const core = new BookCore(document, {
    formatVersion: 'neo-lifecycle/v1', revision: 0,
    metadata: { id: 'book', title: 'Title', author: 'Writer', chapterNotes: { b: 'Break note' } },
    chapters: [{ id: 'a', html: '<p>First prose.</p>' }, { id: 'b', html: '<p class="scene-break">***</p>' }], darlings: [],
  }, null, '', '');
  const before = core.checkpoint();
  expect(() => operations(core).joinChapter('b', 'a')).not.toThrow();
  expect(core.passageRows('a').map((row) => row.text)).toEqual(['First prose.', '***']);
  expect(core.outlineRows.at(-1)?.text).toBe('Break note');
  core.undo();
  expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
});
