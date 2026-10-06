import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
const document = new JSDOM('').window.document;
const open = (
  first = '<p>Alpha.</p>',
  second = '<p>Later.</p>',
  sections = [
    { id: 'one', text: 'First beat' },
    { id: 'two', text: 'Second beat' },
  ],
) =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: {
        id: 'book',
        title: 'Title',
        author: 'Writer',
        chapterNotes: { a: 'Beginning', b: 'End' },
        sectionNotes: { a: sections },
      },
      chapters: [
        { id: 'a', html: first },
        { id: 'b', html: second },
      ],
      darlings: [],
    },
    null,
    '',
    '',
  );
it('chapter and section outline rows project portable notes with wrapping labels', () => {
  const core = open(
    undefined,
    undefined,
    Array.from({ length: 28 }, (_, index) => ({ id: String(index), text: 'Beat ' + index })),
  );
  expect(core.outlineRows.filter((row) => row.kind === 'section').map((row) => row.label)).toEqual(
    Array.from({ length: 28 }, (_, index) => String.fromCharCode(65 + (index % 26))),
  );
  core.editOutlineRow({ chapterId: 'a' }, ' Revised ');
  expect(core.metadata.chapterNotes).toEqual({ a: 'Revised', b: 'End' });
  core.undo();
  expect(core.metadata.chapterNotes).toEqual({ a: 'Beginning', b: 'End' });
});
it('NEO 1.3.5 section Enter always adds a chapter after its containing chapter', () => {
  for (const before of [true, false]) {
    const core = open(), next = core.outlineEnter({ chapterId: 'a', sectionId: 'one' }, before);
    expect(next.sectionId).toBeUndefined();
    expect(core.chapters.map((chapter) => chapter.id)).toEqual(['a', next.chapterId, 'b']);
    expect(core.outlineRows.filter((row) => row.kind === 'section').map((row) => row.text)).toEqual(['First beat', 'Second beat']);
    core.undo();
    expect(core.chapters.map((chapter) => chapter.id)).toEqual(['a', 'b']);
  }
  const core = open(), next = core.outlineEnter({ chapterId: 'a' }, true);
  expect(core.chapters[0].id).toBe(next.chapterId);
});
it('NEO 1.3.5 Tab joins written chapters into prior sections and preserves rich prose', () => {
  const core = open('<p>Alpha.</p>', '<p><i>Later.</i></p>');
  expect(core.outlineIndent({ chapterId: 'a' }).notice).toContain('first line');
  const before = core.checkpoint(), result = core.outlineIndent({ chapterId: 'b' });
  expect(core.chapters).toHaveLength(1);
  expect(result.target.sectionId).toBeDefined();
  expect(core.html('a')).toContain('<i>Later.</i>');
  expect(core.html('a')).toContain('data-sec-id="' + result.target.sectionId + '"');
  // joinChapter/orderSectionNotes places physical sections before unplaced plans.
  expect(core.outlineRows.filter((row) => row.kind === 'section').map((row) => row.text)).toEqual(['End', 'First beat', 'Second beat']);
  core.undo();
  expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
  expect(core.metadata.chapterNotes).toEqual(before.book.metadata.chapterNotes);
  core.redo();
  expect(core.chapters).toHaveLength(1);
  expect(core.html('a')).toContain('<i>Later.</i>');
});
it('NEO 1.3.5 Tab on a section creates the next empty section', () => {
  const core = open(), before = core.checkpoint(), result = core.outlineIndent({ chapterId: 'a', sectionId: 'one' });
  expect(result.target.chapterId).toBe('a');
  expect(core.outlineRows.filter((row) => row.kind === 'section').map((row) => row.text)).toEqual(['First beat', '', 'Second beat']);
  core.undo();
  expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
  expect(core.metadata.sectionNotes).toEqual(before.book.metadata.sectionNotes);
});
it('NEO 1.3.5 Shift Tab carries following planned notes, retaining written prose in its owner', () => {
  const core = open('<p data-sec-id="one"><i>Written prose.</i></p>');
  const next = core.outlineIndent({ chapterId: 'a', sectionId: 'one' }, true);
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(['a', next.target.chapterId, 'b']);
  expect(core.outlineRows.find((row) => row.chapterId === next.target.chapterId)?.text).toBe('First beat');
  expect(core.html('a')).toContain('<i>Written prose.</i>');
  expect(core.metadata.sectionNotes).toMatchObject({ a: [], [next.target.chapterId]: [{ id: 'two', text: 'Second beat' }] });
  expect(core.html(next.target.chapterId)).toContain('class="ghost" data-sec-id="two"');
  core.undo();
  expect(core.chapters).toHaveLength(2);
  expect(core.outlineRows.some((row) => row.sectionId === 'one')).toBe(true);
});
it('NEO 1.3.5 Shift Tab leaves every following note when any following section is written', () => {
  const core = open('<p data-sec-id="one">First prose.</p><p class="scene-break">***</p><p data-sec-id="two"><b>Second prose.</b></p>', undefined, [
    { id: 'one', text: 'First beat' }, { id: 'two', text: 'Second beat' }, { id: 'three', text: 'Third plan' },
  ]);
  core.outlineIndent({ chapterId: 'a', sectionId: 'one' }, true);
  expect(core.metadata.sectionNotes).toMatchObject({ a: [{ id: 'two', text: 'Second beat' }, { id: 'three', text: 'Third plan' }] });
  expect(core.html('a')).toContain('<b>Second prose.</b>');
});
it('ghost synchronization preserves written references, notes ordering, IDs and owned scene breaks', () => {
  const core = open(),
    reference = core.capture(core.passageRows('a')[0].id, 0, 5);
  core.editOutlineRow({ chapterId: 'a', sectionId: 'one' }, 'Revised beat');
  expect(core.passageRows('a').map((passage) => passage.text)).toEqual([
    'Alpha.',
    '***',
    'Revised beat',
    '***',
    'Second beat',
  ]);
  expect(core.resolve(reference.id).status).toBe('current');
  expect(core.html('a')).toContain('data-sec-brk="one"');
  expect(core.words).toBe(2);
  const snapshot = core.checkpoint(),
    reopened = new BookCore(
      document,
      snapshot.book,
      snapshot.reviews,
      snapshot.notes,
      snapshot.outline,
    );
  expect(reopened.outlineRows.find((row) => row.sectionId === 'one')?.text).toBe('Revised beat');
});
it('section deletion removes only unconsumed ghost and owned break, with previous-row focus', () => {
  for (const written of [false, true]) {
    const core = open(
      '<p>Alpha.</p><p class="scene-break" data-sec-brk="one">***</p><p ' +
        (written ? '' : 'class="ghost" ') +
        'data-sec-id="one">First beat</p>',
    );
    expect(core.outlineDelete({ chapterId: 'a', sectionId: 'one' })).toEqual({ chapterId: 'a' });
    expect(core.html('a').includes('data-sec-id="one"')).toBe(written);
    expect(core.html('a').includes('data-sec-brk="one"')).toBe(written);
    core.undo();
    expect(core.outlineRows.some((row) => row.sectionId === 'one')).toBe(true);
  }
});

it('typing consumes a selected ghost while preserving section identity and history', () => {
  const core = open();
  core.editOutlineRow({ chapterId: 'a', sectionId: 'one' }, 'First beat');
  const ghost = core
    .passages('a')
    .find((passage) => passage.node.attrs.data['data-sec-id'] === 'one')!;
  core.selectPassage(ghost.id, 0, ghost.size);
  core.insert('Written prose.');
  expect(core.html('a')).toContain('<p data-sec-id="one">Written prose.</p>');
  core.editOutlineRow({ chapterId: 'a', sectionId: 'one' }, 'Changed outline');
  expect(core.html('a')).toContain('Written prose.');
  expect(core.html('a')).not.toContain('Changed outline');
  core.undo();
  core.undo();
  expect(core.html('a')).toContain('class="ghost" data-sec-id="one"');
});

it('unchanged outline blur retains passage identities and does not dirty or extend history', () => {
  const core = open();
  core.editOutlineRow({ chapterId: 'a', sectionId: 'one' }, 'First beat');
  const revision = core.revision,
    passages = core.passageRows('a');
  core.editOutlineRow({ chapterId: 'a', sectionId: 'one' }, 'First beat');
  expect(core.revision).toBe(revision);
  expect(core.passageRows('a')).toEqual(passages);
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha.</p>');
});
it('structured Outline Find searches actual chapter/section notes and Replace All is one metadata/ghost history event', () => {
  const core = open();
  expect(core.searchOutline('beat')).toEqual([
    { chapterId: 'a', sectionId: 'one', from: 6, to: 10 },
    { chapterId: 'a', sectionId: 'two', from: 7, to: 11 },
  ]);
  expect(core.searchOutline('beginning')).toEqual([{ chapterId: 'a', from: 0, to: 9 }]);
  const selection = core.selection;
  core.replaceOutlineMatches(core.searchOutline('beat'), 'scene');
  expect(core.outlineRows.filter((row) => row.kind === 'section').map((row) => row.text)).toEqual([
    'First scene',
    'Second scene',
  ]);
  expect(core.html('a')).toContain('First scene');
  expect(core.selection).toEqual(selection);
  core.undo();
  expect(core.outlineRows.filter((row) => row.kind === 'section').map((row) => row.text)).toEqual([
    'First beat',
    'Second beat',
  ]);
  expect(core.html('a')).toBe('<p>Alpha.</p>');
  expect(core.canUndo).toBe(false);
});
it('structured Outline replacements validate overlapping ranges before mutation and literal query characters remain literal', () => {
  const core = open();
  core.editOutlineRow({ chapterId: 'a' }, '[a] + beta');
  expect(core.searchOutline('[a]')).toEqual([{ chapterId: 'a', from: 0, to: 3 }]);
  const match = core.searchOutline('beat')[0],
    revision = core.revision;
  expect(() => core.replaceOutlineMatches([match, match], 'bad')).toThrow('OVERLAPPING_MATCHES');
  expect(core.revision).toBe(revision);
});

it('Outline Part names use the page opening prose and source colon, independent of heading metadata', () => {
  const core = open('<p></p><p>Journey</p><p><i>A quotation.</i></p>');
  core.setChapterKind('a', 'part');
  core.renameChapter('a', 'Heading metadata');
  expect(core.outlineRows[0]).toMatchObject({ kind: 'part', label: 'I', text: 'Part I: Journey' });
  expect(core.contentsRows()[0].label).toBe('Part I: Journey');
});
it('NEO 1.3.5 reconciliation retains existing ghost positions and authored paragraph references', () => {
  const core = open(
    '<p class="ghost" data-sec-id="two">Second beat</p><p>Authored afterward.</p><p class="scene-break" data-sec-brk="one">***</p><p class="ghost" data-sec-id="one">First beat</p>',
  );
  const prose = core.passageRows('a').find((row) => row.text === 'Authored afterward.')!,
    reference = core.capture(prose.id, 0, prose.text.length);
  const ghostIds = core
    .passageRows('a')
    .filter((row) => ['First beat', 'Second beat'].includes(row.text))
    .map((row) => row.id);
  core.editOutlineRow({ chapterId: 'a', sectionId: 'one' }, 'Revised first beat');
  expect(core.passageRows('a').map((row) => row.text)).toEqual([
    'Second beat', 'Authored afterward.', '***', 'Revised first beat',
  ]);
  expect(core.passageRows('a')[1].id).toBe(prose.id);
  expect(core.resolve(reference.id).status).toBe('current');
  expect(
    new Set(
      core
        .passages('a')
        .filter((row) => String(row.node.attrs.class).split(/\s+/).includes('ghost'))
        .map((row) => row.id),
    ),
  ).toEqual(new Set(ghostIds));
  core.undo();
  expect(core.passageRows('a')[0].text).toBe('Second beat');
  expect(core.resolve(reference.id).status).toBe('current');
});
it('Outline chapter deletion archives rich authored and planned content and restores all chapter metadata on Undo', () => {
  const core = open(
    '<p>Alpha.</p>',
    '<p><i>Later.</i></p><p class="ghost" data-sec-id="third">Planned</p>',
  );
  core.updateMetadata({
    sectionNotes: {
      a: [
        { id: 'one', text: 'First beat' },
        { id: 'two', text: 'Second beat' },
      ],
      b: [{ id: 'third', text: 'Planned' }],
    },
  });
  core.editOutlineRow({ chapterId: 'b', sectionId: 'third' }, 'Planned');
  core.renameChapter('b', 'End title');
  expect(core.html('b')).not.toContain('scene-break');
  const before = core.checkpoint();
  core.deleteChapter('b');
  expect(core.darlings[0]).toMatchObject({
    chapterId: null,
    chapterLabel: 'deleted Chapter 2',
    // 1.3.5 syncGhosts retains this existing ghost in place and invents no separator.
    text: 'Later.',
  });
  expect(core.darlings[0].html).toContain('<i>Later.</i>');
  expect(core.darlings[0].html).toContain('class="ghost"');
  expect(core.metadata.chapterNotes).toEqual({ a: 'Beginning' });
  expect(core.metadata.sectionNotes).not.toHaveProperty('b');
  core.undo();
  expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
  expect(core.metadata.chapterNotes).toEqual(before.book.metadata.chapterNotes);
  expect(core.metadata.sectionNotes).toEqual(before.book.metadata.sectionNotes);
});
it('chapter reorder moves authored and planned outline rows together without recreating ghost identities or review anchors', () => {
  const core = open();
  core.editOutlineRow({ chapterId: 'a', sectionId: 'one' }, 'First beat');
  core.editOutlineRow({ chapterId: 'a', sectionId: 'two' }, 'Second beat');
  const before = core.checkpoint(),
    rows = core.passageRows('a'),
    reference = core.capture(rows[0].id, 0, 5);
  core.reorderChapter('a', 1);
  expect(core.outlineRows.map((row) => row.chapterId)).toEqual(['b', 'a', 'a', 'a']);
  expect(core.passageRows('a').map((row) => row.id)).toEqual(rows.map((row) => row.id));
  expect(core.resolve(reference.id).status).toBe('current');
  expect(core.metadata.chapterNotes).toEqual(before.book.metadata.chapterNotes);
  expect(core.metadata.sectionNotes).toEqual(before.book.metadata.sectionNotes);
  core.undo();
  expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
  expect(core.resolve(reference.id).status).toBe('current');
  core.redo();
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(['b', 'a']);
});

it('NEO 1.3.5 chapter deletion retains an actual persisted ghost separator in the archive text', () => {
  const core = open('<p>Alpha.</p>', '<p><i>Later.</i></p><p class="scene-break" data-sec-brk="third">***</p><p class="ghost" data-sec-id="third">Planned</p>');
  core.updateMetadata({ sectionNotes: { b: [{ id: 'third', text: 'Planned' }] } });
  core.editOutlineRow({ chapterId: 'b', sectionId: 'third' }, 'Planned');
  core.deleteChapter('b');
  // cleanChapterEl removes the ghost and preserves the real separator.
  expect(core.darlings[0].text).toBe('Later.\n***');
  expect(core.darlings[0].html).toContain('data-sec-brk="third"');
  expect(core.darlings[0].html).toContain('<i>Later.</i>');
});
