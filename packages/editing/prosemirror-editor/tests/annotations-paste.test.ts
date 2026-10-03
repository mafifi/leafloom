import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
const document = new JSDOM('').window.document;
const open = (html = '<p>Alpha omega.</p>', stickies: unknown[] = []) =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer', stickies },
      chapters: [{ id: 'a', html }],
      darlings: [],
    },
    null,
    '',
    '',
  );
it('native styled paste preserves true bold/italic and removes executable resources and table content', () => {
  const core = open('<p></p>');
  core.select('a', 1);
  core.paste({
    text: 'plain bold italic',
    html: '<b style="font-weight:normal"><span>plain </span><span style="font-weight:700;color:red">bold</span><span> </span><span style="font-style:italic;font-size:50px">italic</span></b><script>evil()</script><img src="secret"><table><tr><td>discard table</td></tr></table>',
  });
  expect(core.passageRows('a')[0].text).toBe('plain bold italic');
  expect(core.html('a')).toContain('<b>bold</b>');
  expect(core.html('a')).toContain('<i>italic</i>');
  expect(core.html('a')).not.toMatch(/script|img|table|style=/);
});
it('one paragraph pastes inline and plain multiline paste trims blank lines while preserving surrounding prose', () => {
  const core = open();
  core.select('a', 7);
  core.paste({ text: 'bold', html: '<p><b>bold</b></p>' });
  expect(core.passageRows('a')[0].text).toBe('Alpha boldomega.');
  core.undo();
  core.select('a', 7);
  core.paste({ text: ' One\r\n\r\n Two ' });
  expect(core.passageRows('a').map((p) => p.text)).toEqual(['Alpha One', 'Twoomega.']);
});
it('paste match style takes the active italic mark rather than clipboard bold', () => {
  const core = open('<p><i>Alpha</i></p>');
  core.select('a', 6);
  core.paste({ text: 'beta', html: '<b>beta</b>', matchStyle: true });
  expect(core.html('a')).toBe('<p><i>Alphabeta</i></p>');
});
it('placeholder copying assigns a distinct sticky with the same note and deletion is undone with the note', () => {
  const core = open(
    '<p>Alpha<span class="ph-mark" data-sid="sticky" contenteditable="false">⚑</span> beta.</p><p>Gamma.</p>',
    [{ id: 'sticky', chapterId: 'a', text: 'Check fact', resolved: false }],
  );
  core.selectPassage(core.passageRows('a')[1].id, 6);
  core.paste({
    text: 'Alpha⚑ beta.',
    html: '<p>Alpha<span class="ph-mark" data-sid="sticky" contenteditable="false">⚑</span> beta.</p>',
  });
  expect(core.stickies).toHaveLength(2);
  expect(new Set(core.stickies.map((s) => s.id)).size).toBe(2);
  expect(core.stickies.map((s) => s.text)).toEqual(['Check fact', 'Check fact']);
  const id = core.stickies[1].id;
  core.removeSticky(id);
  expect(core.stickies).toHaveLength(1);
  core.undo();
  expect(core.stickies).toHaveLength(2);
});
it('a Darling containing a sticky restores its associated note with the rich slice after reopen', () => {
  const core = open(
    '<p>Alpha <span class="ph-mark" data-sid="sticky" contenteditable="false">⚑</span> beta.</p>',
    [{ id: 'sticky', chapterId: 'a', text: 'Check', resolved: false }],
  );
  core.selectPassage(core.passageRows('a')[0].id, 6, 7);
  core.archive();
  expect(core.stickies).toHaveLength(0);
  const snapshot = core.checkpoint(),
    reopened = new BookCore(
      document,
      snapshot.book,
      snapshot.reviews,
      snapshot.notes,
      snapshot.outline,
    );
  reopened.restore(reopened.darlings[0].id);
  expect(reopened.stickies).toEqual([
    { id: 'sticky', chapterId: 'a', text: 'Check', resolved: false },
  ]);
  expect(reopened.html('a')).toContain('data-sid="sticky"');
});
it('sticky text edits and resolve state participate in the same history as manuscript text', () => {
  const core = open();
  core.select('a', 7);
  const id = core.createSticky('Check');
  core.updateSticky(id, { text: 'Confirmed', resolved: true });
  expect(core.stickies[0]).toMatchObject({ text: 'Confirmed', resolved: true });
  core.undo();
  expect(core.stickies[0]).toMatchObject({ text: 'Check', resolved: false });
  core.undo();
  expect(core.stickies).toHaveLength(0);
  expect(core.html('a')).toBe('<p>Alpha omega.</p>');
});
it('diagnostic decorations do not enter history, and replacement preserves mark style', () => {
  const core = open('<p>Alpha <i>teh</i> beta.</p>'),
    passage = core.passageRows('a')[0],
    revision = core.revision;
  core.setAnnotations([
    {
      id: 'typo',
      kind: 'spelling',
      passageId: passage.id,
      from: 6,
      to: 9,
      message: 'Possible spelling error',
    },
  ]);
  expect(core.revision).toBe(revision);
  expect(core.canUndo).toBe(false);
  expect(core.annotations).toHaveLength(1);
  core.replacePassageText(passage.id, 6, 9, 'the');
  expect(core.html('a')).toBe('<p>Alpha <i>the</i> beta.</p>');
  expect(core.annotations).toHaveLength(0);
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha <i>teh</i> beta.</p>');
});
it('one Delete before a placeholder removes its corresponding note and Undo restores both', () => {
  const core = open(
    '<p>Alpha<span class="ph-mark" data-sid="sticky" contenteditable="false">⚑</span> beta.</p>',
    [{ id: 'sticky', chapterId: 'a', text: 'Check', resolved: false }],
  );
  core.selectPassage(core.passageRows('a')[0].id, 5);
  expect(core.deleteForward()).toBe(true);
  expect(core.passageRows('a')[0].text).toBe('Alpha beta.');
  expect(core.stickies).toHaveLength(0);
  core.undo();
  expect(core.stickies).toHaveLength(1);
});
it('sticky creation preserves selected prose and resolving normalizes its seam', () => {
  const core = open('<p>Alpha beta.</p>');
  core.selectPassage(core.passageRows('a')[0].id, 0, 5);
  const id = core.createSticky('Remember');
  expect(core.passageRows('a')[0].text).toBe('Alpha⚑  beta.');
  core.removeSticky(id);
  expect(core.html('a')).toBe('<p>Alpha beta.</p>');
  core.undo();
  expect(core.stickies).toHaveLength(1);
  expect(core.passageRows('a')[0].text).toBe('Alpha⚑  beta.');
});
it('opening an orphan placeholder creates an empty persisted note outside author history', () => {
  const core = open(
    '<p>Alpha <span class="ph-mark" data-sid="orphan" contenteditable="false">⚑</span> beta.</p>',
  );
  expect(core.stickies).toEqual([{ id: 'orphan', chapterId: 'a', text: '', resolved: false }]);
  expect(core.canUndo).toBe(false);
  expect(core.revision).toBe(1);
  const snapshot = core.checkpoint(),
    reopened = new BookCore(
      document,
      snapshot.book,
      snapshot.reviews,
      snapshot.notes,
      snapshot.outline,
    );
  expect(reopened.revision).toBe(1);
  expect(reopened.stickies).toEqual(core.stickies);
});
it('plain manuscript paste applies source Markdown emphasis and dialogue dashes as one undo', () => {
  const core = open('<p></p>');
  core.paste({ text: '- **Hello** *again*\n***Both*** and snake_case' });
  expect(core.html('a')).toBe(
    '<p>— <b>Hello</b> <i>again</i></p><p><b><i>Both</i></b> and snake_case</p>',
  );
  core.undo();
  expect(core.html('a')).toBe('<p></p>');
});
it('auxiliary plain paste preserves leading spaces and blank lines without dialogue conversion', () => {
  const core = open();
  core.select('notes', 1);
  core.paste({ text: ' - list\n\n next ' });
  expect(core.passageRows('notes').map((passage) => passage.text)).toEqual([
    ' - list',
    '',
    ' next ',
  ]);
});

it('styled clipboard block edges become prose and discard links, alignment, poetry and other source attributes', () => {
  const core = open('<p></p>');
  core.paste({
    text: 'Heading Line Next',
    html: '<h2 style="text-align:right"><u>Heading</u></h2><p class="poetry"><a href="https://example.test"><i>Line</i></a><br>Next</p>',
  });
  expect(core.html('a')).toBe('<p>Heading</p><p><i>Line</i></p><p>Next</p>');
});

it('styled clipboard dialogue normalization preserves surrounding emphasis', () => {
  const core = open('<p></p>');
  core.paste({ text: '- Hello again', html: '<p>- Hello <i>again</i></p>' });
  expect(core.html('a')).toBe('<p>— Hello <i>again</i></p>');
});

it('unused clipboard placeholder identities persist, while existing identities clone their note', () => {
  const core = open('<p></p>');
  core.paste({
    text: 'Check ⚑',
    html: '<p>Check <span class="ph-mark" data-sid="incoming" contenteditable="false">⚑</span></p>',
  });
  expect(core.stickies[0].id).toBe('incoming');
  expect(core.html('a')).toContain('data-sid="incoming"');
  core.paste({
    text: 'Check ⚑',
    html: '<p>Check <span class="ph-mark" data-sid="incoming" contenteditable="false">⚑</span></p>',
  });
  expect(core.stickies).toHaveLength(2);
  expect(core.stickies[1].id).not.toBe('incoming');
});
it('plain text paste inherits the author caret mark just as native insertText does', () => {
  const core = open('<p><i>Alpha</i></p>');
  core.select('a', 6);
  core.paste({ text: 'beta' });
  expect(core.html('a')).toBe('<p><i>Alphabeta</i></p>');
  core.undo();
  expect(core.html('a')).toBe('<p><i>Alpha</i></p>');
});
it('sticky return parks after its flag and following space, while a missing mark is a quiet no-op', () => {
  const core = open('<p>Alpha beta.</p>');
  core.selectPassage(core.passageRows('a')[0].id, 6);
  const id = core.createSticky('Check');
  core.select('notes', 1);
  expect(core.selectSticky(id, true)).toBe(true);
  expect(core.selection).toMatchObject({ chapterId: 'a', from: 8, to: 8 });
  core.insert('Next ');
  expect(core.html('a')).toContain('⚑</span> Next beta.');
  expect(core.selectSticky(id)).toBe(true);
  expect(core.selection).toMatchObject({ from: 6, to: 7 });
  core.removeSticky(id);
  const selection = core.selection,
    revision = core.revision;
  expect(core.selectSticky(id, true)).toBe(false);
  expect(core.selection).toEqual(selection);
  expect(core.revision).toBe(revision);
});
it('sticky text flush with unchanged content contributes no new author Undo step', () => {
  const core = open('<p>Alpha.</p>');
  core.select('a', 1);
  const id = core.createSticky('Check');
  const revision = core.revision;
  core.updateSticky(id, { text: 'Check' });
  expect(core.revision).toBe(revision);
  core.undo();
  expect(core.stickies).toEqual([]);
  expect(core.html('a')).toBe('<p>Alpha.</p>');
});

it('resolving a saved sticky normalizes adjacent NBSP seams and Undo restores the exact source', () => {
  const html =
    '<p><i>Alpha&nbsp;</i><span class="ph-mark" data-sid="old-note" contenteditable="false">⚑</span><b>&nbsp;beta.</b></p>';
  const note = { id: 'old-note', chapterId: 'a', text: 'Check', resolved: false };
  const core = open(html, [note]);
  const original = core.html('a');
  core.removeSticky('old-note');
  expect(core.html('a')).toBe('<p><i>Alpha </i><b>beta.</b></p>');
  expect(core.stickies).toEqual([]);
  core.undo();
  expect(core.html('a')).toBe(original);
  expect(core.stickies).toEqual([note]);
  core.redo();
  expect(core.html('a')).toBe('<p><i>Alpha </i><b>beta.</b></p>');
});
it('cut then paste into another chapter retains the moving flag note and one identity', () => {
  const core = open(
    '<p>Alpha<span class="ph-mark" data-sid="moving-note" contenteditable="false">⚑</span> .</p>',
    [{ id: 'moving-note', chapterId: 'a', text: 'Travel with prose', resolved: false }],
  );
  const destination = core.createChapter('Destination');
  core.selectAll('a');
  const clipboard = core.cutSelection();
  expect(core.stickies).toEqual([]);
  core.select(destination, 1);
  core.paste(clipboard);
  expect(core.stickies).toEqual([
    { id: 'moving-note', chapterId: destination, text: 'Travel with prose', resolved: false },
  ]);
  expect(core.html(destination)).toContain('data-sid="moving-note"');
  core.undo();
  expect(core.stickies).toEqual([]);
  core.undo();
  expect(core.stickies[0]).toMatchObject({
    id: 'moving-note',
    chapterId: 'a',
    text: 'Travel with prose',
  });
});
