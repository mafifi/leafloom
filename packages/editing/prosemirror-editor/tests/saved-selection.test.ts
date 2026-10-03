import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
const document = new JSDOM('').window.document;
function open(html = '<p>Opening.</p><p><b>Final</b> words.</p>') {
  return new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [{ id: 'chapter', html }],
      darlings: [],
    },
    null,
    '',
    '',
  );
}
it('legacy stale paragraph index falls back to the final paragraph and clamps past its last letter', () => {
  const core = open(),
    last = core.passageRows('chapter').at(-1)!,
    revision = core.revision;
  expect(core.restoreSelection({ chapterId: 'chapter', pIdx: 999, off: 999 })).toBe(true);
  expect(core.selection).toMatchObject({
    chapterId: 'chapter',
    passageId: last.id,
    from: last.text.length,
    to: last.text.length,
  });
  expect(core.revision).toBe(revision);
  expect(core.canUndo).toBe(false);
  core.insert(' Next.');
  expect(core.html('chapter')).toBe('<p>Opening.</p><p><b>Final</b> words. Next.</p>');
});
it('stable saved passage offsets clamp on reopen after the same passage becomes shorter', () => {
  const core = open(),
    last = core.passageRows('chapter').at(-1)!;
  core.selectPassage(last.id, last.text.length);
  const savedPosition = core.selection;
  core.selectPassage(last.id, 5, last.text.length);
  core.backspace();
  core.setBookkeeping({ lastPosition: savedPosition });
  const snapshot = core.checkpoint(),
    reopened = new BookCore(
      document,
      snapshot.book,
      snapshot.reviews,
      snapshot.notes,
      snapshot.outline,
    );
  expect(reopened.selection).toMatchObject({
    chapterId: 'chapter',
    passageId: last.id,
    from: 5,
    to: 5,
  });
  expect(reopened.canUndo).toBe(false);
  reopened.insert(' Next.');
  expect(reopened.html('chapter')).toBe('<p>Opening.</p><p><b>Final Next.</b></p>');
});
it('valid saved ranges retain their endpoints while excessive endpoints clamp within the same stable passage', () => {
  const core = open(),
    passage = core.passageRows('chapter')[0];
  expect(
    core.restoreSelection({ chapterId: 'chapter', passageId: passage.id, from: 2, to: 5 }),
  ).toBe(true);
  expect(core.selection).toMatchObject({ from: 2, to: 5 });
  expect(
    core.restoreSelection({ chapterId: 'chapter', passageId: passage.id, from: 2, to: 999 }),
  ).toBe(true);
  expect(core.selection).toMatchObject({ from: 2, to: passage.text.length });
});
it('empty final paragraphs accept a clamped zero caret without inventing content or an undo command', () => {
  const core = open('<p>Opening.</p><p></p>'),
    last = core.passageRows('chapter').at(-1)!;
  expect(core.restoreSelection({ chapterId: 'chapter', pIdx: 999, off: 999 })).toBe(true);
  expect(core.selection).toMatchObject({ passageId: last.id, from: 0, to: 0 });
  expect(core.html('chapter')).toBe('<p>Opening.</p><p></p>');
  expect(core.canUndo).toBe(false);
});
it('missing identities, invalid ranges and negative offsets remain rejected without changing the selection', () => {
  const core = open(),
    selected = core.selection,
    passage = core.passageRows('chapter')[0];
  for (const value of [
    { chapterId: 'missing', pIdx: 999, off: 999 },
    { chapterId: 'chapter', passageId: 'missing', from: 999, to: 999 },
    { chapterId: 'chapter', passageId: passage.id, from: 5, to: 2 },
    { chapterId: 'chapter', pIdx: -1, off: 0 },
  ]) {
    expect(core.restoreSelection(value)).toBe(false);
    expect(core.selection).toEqual(selected);
  }
});
it('legacy scroll-only metadata does not manufacture a first-paragraph caret or override an existing selection', () => {
  const core = open(),
    last = core.passageRows('chapter').at(-1)!;
  core.selectPassage(last.id, 3);
  const selection = core.selection,
    revision = core.revision;
  expect(core.restoreSelection({ chapterId: 'chapter', scroll: 1234 })).toBe(false);
  expect(core.selection).toEqual(selection);
  expect(core.revision).toBe(revision);
  expect(core.canUndo).toBe(false);
});
it('legacy paragraph coordinates skip supported headings and code while stable identities still restore those blocks', () => {
  const html =
    '<h2>Heading</h2><p><b>Alpha.</b></p><pre><code>Code</code></pre><p><i>Gamma.</i></p>';
  const core = open(html),
    rows = core.passageRows('chapter');
  expect(rows.map((row) => row.kind)).toEqual(['heading', 'paragraph', 'code_block', 'paragraph']);
  expect(core.restoreSelection({ chapterId: 'chapter', pIdx: 1, off: 999 })).toBe(true);
  expect(core.selection).toMatchObject({ passageId: rows[3].id, from: 6, to: 6 });
  core.insert('X');
  expect(core.html('chapter')).toBe(html.replace('Gamma.', 'Gamma.X'));
  expect(core.undo()).toBe(true);
  expect(core.html('chapter')).toBe(html);
  expect(core.redo()).toBe(true);
  expect(core.html('chapter')).toContain('Gamma.X');
  for (const row of [rows[0], rows[2]]) {
    expect(core.restoreSelection({ chapterId: 'chapter', passageId: row.id, from: 2, to: 2 })).toBe(
      true,
    );
    expect(core.selection).toMatchObject({ passageId: row.id, from: 2, to: 2 });
  }
  const checkpoint = core.checkpoint(),
    reopened = new BookCore(
      document,
      checkpoint.book,
      checkpoint.reviews,
      checkpoint.notes,
      checkpoint.outline,
    );
  expect(reopened.restoreSelection({ chapterId: 'chapter', pIdx: 999, off: 999 })).toBe(true);
  expect(reopened.selection).toMatchObject({ passageId: rows[3].id, from: 7, to: 7 });
});
