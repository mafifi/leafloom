import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
const document = new JSDOM('').window.document;
const open = (first: string, second: string, metadata: Record<string, unknown> = {}) =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer', ...metadata },
      chapters: [
        { id: 'a', html: first },
        { id: 'b', html: second },
      ],
      darlings: [{ id: 'darling', chapterId: 'b', html: '<i>saved</i>' }],
    },
    null,
    '<p>Notes</p>',
    '<p>Outline</p>',
  );
it('indexed Copyright creation is one history action and preserves rich neighbours on reopen', () => {
  const core = open('<p>Alpha <b>bold</b>.</p>', '<p>Beta <i>italic</i>.</p>');
  const initial = core.checkpoint();
  const id = core.createChapter('', 0, {
    kind: 'copyright',
    copyrightStarter: { notice: 'Copyright © 2026 Writer', rights: 'All rights reserved.' },
  });
  expect(core.chapters.map((c) => c.kind)).toEqual(['copyright', 'chapter', 'chapter']);
  expect(core.passageRows(id).map((p) => p.text)).toEqual([
    'Copyright © 2026 Writer',
    'All rights reserved.',
  ]);
  expect(core.html('a')).toBe('<p>Alpha <b>bold</b>.</p>');
  const saved = core.checkpoint();
  const reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.chapters.map((c) => c.id)).toEqual([id, 'a', 'b']);
  expect(reopened.passageRows(id).map((p) => p.text)).toEqual([
    'Copyright © 2026 Writer',
    'All rights reserved.',
  ]);
  core.undo();
  expect(core.checkpoint().book.chapters).toEqual(initial.book.chapters);
  expect(core.checkpoint().book.metadata).toEqual(initial.book.metadata);
  core.redo();
  expect(core.chapters.map((c) => c.id)).toEqual([id, 'a', 'b']);
});
it('entry creation rejects malformed role, index and starter without changing author state', () => {
  const core = open('<p>Alpha.</p>', '<p>Beta.</p>');
  const initial = core.checkpoint();
  for (const [index, options] of [
    [-1, { kind: 'part' }],
    [3, { kind: 'part' }],
    [1, { kind: 'invalid' }],
    [1, { kind: 'copyright', copyrightStarter: { notice: '', rights: 'Rights' } }],
  ] as const) {
    expect(() => core.createChapter('', index, options)).toThrow();
    expect(core.checkpoint()).toEqual(initial);
  }
});
it('merging story chapters preserves paragraphs, identities, sticky and section ownership through Undo', () => {
  const core = open(
    '<p>Alpha.</p>',
    '<p><span class="ph-mark" data-sid="sticky" contenteditable="false">⚑</span> Beta.</p><p data-sec-id="section">Gamma.</p>',
    {
      stickies: [{ id: 'sticky', chapterId: 'b', text: 'Check Beta', resolved: false }],
      sectionNotes: { b: [{ id: 'section', text: 'written section' }] },
      chapterTitles: { b: 'Second' },
      chapterNotes: { b: 'note' },
    },
  );
  const passage = core.passageRows('b')[1],
    reference = core.capture(passage.id, 0, passage.size),
    initial = core.checkpoint();
  core.select('b', 1);
  core.backspace();
  expect(core.chapters).toHaveLength(1);
  expect(core.passageRows('a').map((p) => p.text)).toEqual(['Alpha.', '⚑ Beta.', 'Gamma.']);
  expect(core.resolve(reference.id)).toMatchObject({
    status: 'current',
    segments: [{ chapterId: 'a', passageId: passage.id }],
  });
  const saved = core.checkpoint();
  expect(saved.book.metadata.stickies).toEqual([
    { id: 'sticky', chapterId: 'a', text: 'Check Beta', resolved: false },
  ]);
  expect(core.darlings[0]).toMatchObject({ chapterId: 'a' });
  expect(saved.book.metadata.sectionNotes).toEqual({
    a: [{ id: 'section', text: 'written section' }],
  });
  core.undo();
  expect(core.checkpoint().book.metadata).toEqual(initial.book.metadata);
  expect(core.chapters).toHaveLength(2);
  expect(core.resolve(reference.id).segments[0].chapterId).toBe('b');
});
it('empty first and last chapters dissolve with the correct caret', () => {
  const first = open('<p><br></p>', '<p>Beta.</p>');
  first.select('a', 1);
  first.backspace();
  expect(first.chapters.map((c) => c.id)).toEqual(['b']);
  expect(first.state.selection.$from.parentOffset).toBe(0);
  first.undo();
  expect(first.chapters).toHaveLength(2);
  const last = open('<p>Alpha.</p>', '<p><br></p>');
  last.select('b', 1);
  last.backspace();
  expect(last.chapters.map((c) => c.id)).toEqual(['a']);
  expect(last.state.selection.$from.parentOffset).toBe(6);
});
it('pages cannot merge into story and notes cannot merge into manuscript', () => {
  const core = open('<p>For you.</p>', '<p>Story.</p>', { chapterKinds: { a: 'dedication' } });
  core.select('b', 1);
  core.backspace();
  expect(core.chapters).toHaveLength(2);
  core.select('notes', 1);
  core.backspace();
  expect(core.html('notes')).toBe('<p>Notes</p>');
  expect(core.chapters).toHaveLength(2);
});
it('Tab inserts em spaces and reverse Tab removes only two immediately before the caret', () => {
  const core = open('<p>Alpha.</p>', '<p>Beta.</p>');
  core.select('a', 7);
  core.indent();
  expect(core.passageRows('a')[0].text).toBe('Alpha.\u2003\u2003');
  core.indent(true);
  expect(core.passageRows('a')[0].text).toBe('Alpha.');
  core.indent(true);
  expect(core.passageRows('a')[0].text).toBe('Alpha.');
});
it('kind and metadata changes are history commands and pages do not enter the story word count', () => {
  const core = open(
    '<p>Alpha — beta.</p><p class="scene-break">***</p><p class="ghost">Hidden beat</p>',
    '<p>For you.</p>',
  );
  expect(core.words).toBe(4);
  core.setChapterKind('b', 'dedication');
  expect(core.words).toBe(2);
  core.setMetadata({ title: 'Revised' });
  expect(core.title).toBe('Revised');
  core.undo();
  expect(core.title).toBe('Title');
  core.undo();
  expect(core.words).toBe(4);
});

it('Backspace of a marked word heals seam spaces without changing cut semantics', () => {
  const core = open('<p>Alpha <i>beta</i> Gamma.</p>', '<p>Later.</p>');
  core.selectPassage(core.passageRows('a')[0].id, 6, 10);
  core.backspace();
  expect(core.passageRows('a')[0].text).toBe('Alpha Gamma.');
  core.undo();
  expect(core.passageRows('a')[0].text).toBe('Alpha beta Gamma.');
});
it('bookkeeping persists outside undo without changing manuscript version or review content identity', () => {
  const core = open('<p>Alpha.</p>', '<p>Later.</p>');
  core.setMetadata({ title: 'New' });
  const version = core.checkpoint().book.version;
  core.setBookkeeping({
    wordCount: 2,
    dailyCounts: { '2026-10-02': { start: 1, end: 2 } },
    lastPosition: { chapterId: 'a', paragraph: 0, offset: 2 },
    modified: '2026-10-02T18:00:00Z',
  });
  expect(core.checkpoint().book.version).toBe(version);
  core.undo();
  expect(core.title).toBe('Title');
  expect(core.checkpoint().book.metadata.dailyCounts).toEqual({
    '2026-10-02': { start: 1, end: 2 },
  });
  core.redo();
  expect(core.title).toBe('New');
  expect(core.checkpoint().book.metadata.wordCount).toBe(2);
});
it('parts use Roman labels and restart chapter numbering only when configured', () => {
  const core = open('<p>First.</p>', '<p>Second.</p>');
  core.setChapterKind('a', 'part');
  expect(core.chapters[0].label).toBe('Part I');
  const next = core.createChapter('');
  expect(core.chapters.find((chapter) => chapter.id === next)?.label).toBe('Chapter 2');
  core.updateMetadata({ restartNumbering: true });
  core.setChapterKind('b', 'part');
  expect(core.chapters[1].label).toBe('Part II');
  expect(core.chapters.find((chapter) => chapter.id === next)?.label).toBe('Chapter 1');
});

it('NEO counters retain contiguous Chinese and Japanese tokens and expose page chapter counts', () => {
  const core = open('<p>这是中文的一句话。 日本語です。</p>', '<p>For you.</p>');
  expect(core.wordCountFor('a')).toBe(2);
  core.setChapterKind('b', 'dedication');
  expect(core.words).toBe(2);
  expect(core.wordCountFor('b')).toBe(2);
});
it('portable caret selection restores stable passage offsets and legacy pIdx/off on reopen', () => {
  const core = open('<p>Alpha.</p><p>Beta.</p>', '<p>Later.</p>', {
    lastPosition: { chapterId: 'a', pIdx: 1, off: 3 },
  });
  expect(core.selection).toMatchObject({ chapterId: 'a', from: 3, to: 3 });
  const selected = core.selection;
  core.setBookkeeping({ lastPosition: selected });
  const snapshot = core.checkpoint(),
    reopened = new BookCore(
      document,
      snapshot.book,
      snapshot.reviews,
      snapshot.notes,
      snapshot.outline,
    );
  expect(reopened.selection).toEqual(selected);
  expect(reopened.canUndo).toBe(false);
  expect(reopened.restoreSelection({ ...selected, from: 999, to: 999 })).toBe(true);
  expect(reopened.selection).toMatchObject({ passageId: selected?.passageId, from: 5, to: 5 });
});
it('protected imported rich chapters retain their readable word counts', () => {
  const core = open('<p style="color:red">Alpha beta.</p>', '<p>Later.</p>');
  expect(core.supported('a')).toBe(false);
  expect(core.words).toBe(3);
  expect(core.wordCountFor('a')).toBe(2);
  expect(() => core.insert('Bad')).toThrow('UNSUPPORTED_CONTENT');
});
it('generated Contents retain fidelity support while guarding author body edits', () => {
  const core = open('<p>Chapter 1</p>', '<p>Later.</p>');
  core.setChapterKind('a', 'contents');
  expect(core.supported('a')).toBe(true);
  expect(core.canEdit('a')).toBe(false);
  expect(() => core.insert('Bad')).toThrow('READ_ONLY_CONTENT');
  expect(core.html('a')).toBe('<p>Chapter 1</p>');
  core.undo();
  expect(core.canEdit('a')).toBe(true);
});

it('chapter title and kind commands project current portable metadata before checkpoint', () => {
  const core = open('<p>Alpha.</p>', '<p>Later.</p>');
  core.renameChapter('a', 'Arrival');
  expect(core.metadata.chapterTitles).toEqual({ a: 'Arrival' });
  core.setChapterKind('a', 'prologue');
  expect(core.metadata.chapterKinds).toEqual({ a: 'prologue' });
  core.undo();
  expect(core.metadata.chapterKinds).toBeUndefined();
  expect(core.chapters[0].kind).toBe('chapter');
  core.undo();
  expect(core.metadata.chapterTitles).toBeUndefined();
});

it('chapter menu deletion preserves rich words in Darlings and removes owned metadata in one Undo', () => {
  const core = open('<p>Alpha.</p>', '<p><i>Beta.</i></p><p>Gamma.</p>', {
      chapterNotes: { b: 'Private note' },
      sectionNotes: { b: [{ id: 'beat', text: 'beat' }] },
    }),
    initial = core.checkpoint();
  core.deleteChapter('b');
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(['a']);
  expect(core.darlings[0]).toMatchObject({
    html: '<p><i>Beta.</i></p><p>Gamma.</p>',
    chapterId: null,
    chapterLabel: 'deleted Chapter 2',
  });
  expect(core.darlings[0].date).toMatch(/^\d{4}-/);
  expect(core.metadata.chapterNotes).toEqual({});
  core.undo();
  expect(core.checkpoint().book.chapters).toEqual(initial.book.chapters);
  expect(core.darlings).toHaveLength(1);
  expect(core.metadata.chapterNotes).toEqual({ b: 'Private note' });
  core.redo();
  expect(core.darlings).toHaveLength(2);
});
it('deleting the final chapter retains its words and allows a fresh first chapter', () => {
  const core = open('<p>Alpha.</p>', '<p></p>');
  core.deleteChapter('b');
  expect(core.darlings).toHaveLength(1);
  core.deleteChapter('a');
  expect(core.chapters).toEqual([]);
  expect(core.darlings[0].text).toBe('Alpha.');
  const id = core.createChapter('');
  expect(core.chapters.map((chapter) => chapter.id)).toEqual([id]);
  core.undo();
  core.undo();
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(['a']);
});
it('quiet empty-chapter Backspace removes orphan chapter metadata and Undo restores it', () => {
  const core = open('<p>Alpha.</p>', '<p></p>', {
    chapterNotes: { b: 'Plan' },
    chapterTitles: { b: 'Future' },
  });
  core.select('b', 1);
  core.backspace();
  expect(core.metadata.chapterNotes).toEqual({});
  expect(core.metadata.chapterTitles).toEqual({});
  core.undo();
  expect(core.metadata.chapterNotes).toEqual({ b: 'Plan' });
});
it('selected word count reads a partial multi-paragraph selection without serializing or counting marks', () => {
  const core = open('<p>Alpha <i>beta.</i></p><p>Gamma delta.</p>', '<p>Later.</p>');
  const rows = core.passages('a');
  core.select('a', 7, rows[1].pos - core.section('a').pos + 6);
  const snapshots = core.snapshots;
  expect(core.selectedWords).toBe(2);
  expect(core.snapshots).toBe(snapshots);
  core.select('a', 1);
  expect(core.selectedWords).toBe(0);
});
it('native text moves across chapters preserve rich marks, sticky ownership and review ranges in one Undo', () => {
  const core = open('<p>Alpha <i>beta</i> gamma.</p>', '<p>Later.</p>');
  const passage = core.passageRows('a')[0],
    reference = core.capture(passage.id, 6, 10);
  core.selectPassage(passage.id, 6, 10);
  core.moveSelection('b', 1);
  expect(core.html('a')).toBe('<p>Alpha  gamma.</p>');
  expect(core.html('b')).toBe('<p><i>beta</i>Later.</p>');
  expect(core.resolve(reference.id)).toMatchObject({
    status: 'current',
    segments: [{ chapterId: 'b', from: 0, to: 4 }],
  });
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha <i>beta</i> gamma.</p>');
  expect(core.html('b')).toBe('<p>Later.</p>');
  expect(core.resolve(reference.id).segments[0].chapterId).toBe('a');
});
it('a move dropped into its own selection is a no-op and guarded source cannot move', () => {
  const core = open('<p>Alpha beta.</p>', '<p>Later.</p>');
  core.select('a', 1, 6);
  const revision = core.revision;
  core.moveSelection('a', 3);
  expect(core.revision).toBe(revision);
  core.setChapterKind('b', 'contents');
  expect(() => core.moveSelection('b', 1)).toThrow('UNSUPPORTED_MOVE');
});
it('moving a flag to a different chapter retains its ID and note through undo', () => {
  const core = open(
    '<p>A <span class="ph-mark" data-sid="flag" contenteditable="false">⚑</span> B.</p>',
    '<p>Later.</p>',
    { stickies: [{ id: 'flag', chapterId: 'a', text: 'Find name', resolved: false }] },
  );
  core.selectPassage(core.passageRows('a')[0].id, 2, 3);
  core.moveSelection('b', 1);
  expect(core.stickies).toEqual([
    { id: 'flag', chapterId: 'b', text: 'Find name', resolved: false },
  ]);
  expect(core.html('b')).toContain('data-sid="flag"');
  core.undo();
  expect(core.stickies[0].chapterId).toBe('a');
});
it('deleted chapter Darling restores flag note ownership into its fallback chapter', () => {
  const core = open(
    '<p>Alpha.</p>',
    '<p><span class="ph-mark" data-sid="flag" contenteditable="false">⚑</span> Beta.</p>',
    { stickies: [{ id: 'flag', chapterId: 'b', text: 'Find name', resolved: false }] },
  );
  core.deleteChapter('b');
  const id = core.darlings[0].id;
  core.restore(id);
  expect(core.stickies).toEqual([
    { id: 'flag', chapterId: 'a', text: 'Find name', resolved: false },
  ]);
  expect(core.html('a')).toContain('data-sid="flag"');
  core.undo();
  expect(core.stickies).toEqual([]);
  expect(core.darlings[0].id).toBe(id);
});
it('a chapter holding only a flag is not mistaken for empty during Backspace', () => {
  const core = open(
    '<p>Alpha.</p>',
    '<p><span class="ph-mark" data-sid="flag" contenteditable="false">⚑</span></p>',
    { stickies: [{ id: 'flag', chapterId: 'b', text: 'Find name', resolved: false }] },
  );
  core.select('b', 1);
  core.backspace();
  expect(core.html('a')).toContain('data-sid="flag"');
  expect(core.stickies[0].chapterId).toBe('a');
  core.undo();
  expect(core.stickies[0].chapterId).toBe('b');
});
it('navigation add inserts after the final numbered chapter before back matter, and an explicit index serves menu insertion', () => {
  const core = open('<p>Alpha.</p>', '<p>The ending.</p>', { chapterKinds: { b: 'epilogue' } });
  const id = core.createChapter('');
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(['a', id, 'b']);
  core.undo();
  const first = core.createChapter('', 0);
  expect(core.chapters.map((chapter) => chapter.id)).toEqual([first, 'a', 'b']);
  expect(() => core.createChapter('', 99)).toThrow('INVALID_TARGET');
});
it('legacy unknown chapter kinds fall back per entry without hiding a valid sibling kind', () => {
  const core = open('<p>Alpha.</p>', '<p>Ending.</p>', {
    chapterKinds: { a: 'future-kind', b: 'epilogue' },
  });
  expect(core.chapters.map((chapter) => chapter.kind)).toEqual(['chapter', 'epilogue']);
  expect(core.metadata.chapterKinds).toEqual({ a: 'future-kind', b: 'epilogue' });
});
it('background cover completion preserves manuscript identity and never displaces author prose Undo', () => {
  const core = open('<p>Alpha.</p>', '<p>Later.</p>');
  core.select('a', 1);
  core.insert('New ');
  const version = core.version;
  core.setCoverBookkeeping({
    coverArt: { status: 'pending', at: '2026-10-02T20:00:00Z', words: 1000 },
  });
  core.setCoverBookkeeping({
    coverArt: { status: 'done', file: 'art-123.png', brief: 'Sea', words: 1000 },
    coverMode: 'painted',
  });
  expect(core.version).toBe(version);
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha.</p>');
  expect(core.metadata.coverArt).toMatchObject({ status: 'done', file: 'art-123.png' });
  expect(core.metadata.coverMode).toBe('painted');
  expect(core.canUndo).toBe(false);
  core.updateMetadata({ coverMode: 'abstract' });
  expect(core.metadata.coverMode).toBe('abstract');
  core.undo();
  expect(core.metadata.coverMode).toBe('painted');
  core.redo();
  expect(core.metadata.coverMode).toBe('abstract');
});
it.each(['backspace', 'deleteForward'] as const)(
  'scene boundary %s treats imported class tokens independently and restores exact styled neighbours',
  (command) => {
    const html =
        '<p><b>Alpha.</b></p><p class="scene-break imported" data-sec-brk="owned">***</p><p><i>Gamma.</i></p>',
      core = open(html, '<p>Later.</p>');
    const rows = core.passageRows('a');
    if (command === 'backspace') core.selectPassage(rows[2].id, 0);
    else core.selectPassage(rows[0].id, rows[0].size);
    expect(core[command]()).toBe(true);
    expect(core.passageRows('a').map((row) => row.text)).toEqual(['Alpha.', 'Gamma.']);
    expect(core.html('a')).toBe('<p><b>Alpha.</b></p><p><i>Gamma.</i></p>');
    core.undo();
    expect(core.html('a')).toBe(html);
  },
);
it.each(['backspace', 'deleteForward'] as const)(
  'selected %s heals every following seam space while preserving the preceding styled space and history',
  (command) => {
    const html = '<p><b>Alpha </b><i>word</i>   Gamma.</p>',
      core = open(html, '<p>Later.</p>');
    core.selectPassage(core.passageRows('a')[0].id, 6, 10);
    core[command]();
    expect(core.html('a')).toBe('<p><b>Alpha </b>Gamma.</p>');
    core.undo();
    expect(core.html('a')).toBe(html);
    core.redo();
    expect(core.html('a')).toBe('<p><b>Alpha </b>Gamma.</p>');
  },
);
it.each(['backspace', 'deleteForward'] as const)(
  'character %s keeps the source preceding bold space instead of transferring seam ownership to italic text',
  (command) => {
    const html = '<p><b>Alpha </b>x<i> Gamma.</i></p>',
      core = open(html, '<p>Later.</p>');
    core.selectPassage(core.passageRows('a')[0].id, command === 'backspace' ? 7 : 6);
    core[command]();
    expect(core.html('a')).toBe('<p><b>Alpha </b><i>Gamma.</i></p>');
    core.undo();
    expect(core.html('a')).toBe(html);
  },
);
