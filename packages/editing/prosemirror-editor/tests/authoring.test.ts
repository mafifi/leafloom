import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
const document = new JSDOM('').window.document;
const open = (html = '<p>Alpha <i>beta.</i></p><p>Gamma.</p>') =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Promise', author: 'Writer' },
      chapters: [
        { id: 'a', html },
        { id: 'b', html: '<p>Later.</p>' },
      ],
      darlings: [],
    },
    null,
    '<p>Notes.</p>',
    '<p>Outline.</p>',
  );
const texts = (core: BookCore) =>
  core.chapters.map((ch) => core.passageRows(ch.id).map((p) => p.text));
describe('NEO authoring contracts', () => {
  it('single Enter splits marked prose; double inserts scene; triple moves the tail to a chapter', () => {
    const c = open();
    c.select('a', 7);
    c.enter();
    expect(texts(c)).toEqual([['Alpha ', 'beta.', 'Gamma.'], ['Later.']]);
    c.enter();
    expect(texts(c)).toEqual([['Alpha ', '***', 'beta.', 'Gamma.'], ['Later.']]);
    c.enter();
    expect(texts(c)).toEqual([['Alpha '], ['beta.', 'Gamma.'], ['Later.']]);
    expect(c.state.selection.$from.parentOffset).toBe(0);
    expect(c.state.selection.$from.parent.isTextblock).toBe(true);
    c.undo();
    expect(texts(c)).toEqual([['Alpha ', '***', 'beta.', 'Gamma.'], ['Later.']]);
    c.undo();
    expect(texts(c)).toEqual([['Alpha beta.', 'Gamma.'], ['Later.']]);
  });
  it('typing and explicit selection interrupt escalation', () => {
    const c = open();
    c.select('a', 6);
    c.enter();
    c.insert('X');
    c.enter();
    expect(texts(c)[0]).not.toContain('***');
  });
  it('Shift Enter extracts poetry, Enter exits to roman prose, and Backspace first converts poetry', () => {
    const c = open();
    c.select('a', 7);
    c.enter(true);
    expect(c.html('a')).toContain('class="poetry"');
    expect(c.html('a')).toContain('<i>beta.</i>');
    c.enter();
    expect(c.passages('a')[2].node.attrs.class).toBe('');
    expect(c.passages('a')[2].node.child(0).marks).toHaveLength(0);
    c.undo();
    c.backspace();
    expect(c.passages('a')[1].node.attrs.class).toBe('');
    expect(texts(c)[0]).toEqual(['Alpha ', 'beta.', 'Gamma.']);
  });
  it('scene boundary deletion is one reversible command', () => {
    const c = open('<p>Alpha.</p><p class="scene-break">***</p><p>Gamma.</p>');
    c.select('a', 14);
    expect(c.backspace()).toBe(true);
    expect(texts(c)[0]).toEqual(['Alpha.', 'Gamma.']);
    c.undo();
    expect(texts(c)[0]).toEqual(['Alpha.', '***', 'Gamma.']);
  });
  it('master history includes notes, metadata, Darling archive and review acceptance', () => {
    const c = open(),
      first = c.passageRows('a')[0],
      r = c.capture(first.id, 6, 10),
      request = c.extract([r.id], 'voice');
    c.receive({
      reviewId: 'review',
      requestId: request.requestId,
      items: [
        {
          id: 'suggestion',
          kind: 'suggestion',
          category: 'voice',
          references: [r.id],
          message: 'A direct verb',
          replacement: 'said',
        },
      ],
    });
    expect(c.accept('suggestion')).toEqual({ ok: true });
    c.select('notes', 1);
    c.insert('Book ');
    c.undo();
    expect(c.html('notes')).toBe('<p>Notes.</p>');
    c.undo();
    expect(c.reviewRows()[0].state).toBe('pending');
    expect(c.resolve(r.id).status).toBe('current');
  });
  it('unsupported rich sources retain their exact bytes and reject editing', () => {
    const raw = '<p style="color:red"><img src="kept">Alpha.</p>';
    const c = open(raw);
    expect(c.supported('a')).toBe(false);
    expect(c.checkpoint().book.chapters[0].html).toBe(raw);
    expect(() => c.insert('bad')).toThrow('UNSUPPORTED_CONTENT');
  });
  it('a Darling archive restores multiple marked paragraphs as one undoable change', () => {
    const c = open(),
      initial = c.html('a');
    c.select('a', 4, 19);
    c.archive();
    expect(c.darlings).toHaveLength(1);
    expect(c.html('a')).not.toContain('darling-anchor');
    const saved = c.checkpoint(),
      reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
    reopened.restore(reopened.darlings[0].id);
    expect(reopened.html('a')).toBe(initial);
    expect(reopened.darlings).toHaveLength(0);
    reopened.undo();
    expect(reopened.darlings).toHaveLength(1);
    reopened.redo();
    expect(reopened.html('a')).toBe(initial);
  });
});

it('an initially empty imported book creates its first chapter before notes without losing auxiliary content', () => {
  const c = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'empty', title: 'Empty', author: 'Writer' },
      chapters: [],
      darlings: [],
    },
    null,
    '<p>Notes.</p>',
    '<p>Outline.</p>',
  );
  const id = c.createChapter('First');
  expect(c.chapters.map((ch) => ch.id)).toEqual([id]);
  expect(c.html('notes')).toBe('<p>Notes.</p>');
  c.undo();
  expect(c.chapters).toEqual([]);
});
it('an empty poetry tail retains italic typing marks after identity and version steps', () => {
  const c = open('<p>Alpha.</p>');
  c.select('a', 7);
  c.enter(true);
  expect(c.state.storedMarks?.map((mark) => mark.type.name)).toEqual(['italic']);
  c.insert('Verse');
  expect(c.html('a')).toContain('<p class="poetry"><i>Verse</i></p>');
});
it('Notes Shift Enter inserts a line break without manuscript poetry semantics', () => {
  const c = open();
  c.select('notes', 6);
  c.enter(true);
  expect(c.html('notes')).toBe('<p>Notes<br>.</p>');
  expect(c.html('notes')).not.toContain('poetry');
  c.undo();
  expect(c.html('notes')).toBe('<p>Notes.</p>');
});
it('opening empty poetry keeps italic input marks through title blur and metadata refresh', () => {
  const core = open();
  core.insertOpeningPoetry('a');
  core.renameChapter('a', 'Arrival');
  core.setMetadata({ title: 'Revised' });
  core.insert('Verse');
  expect(core.html('a')).toContain('<p class="poetry"><i>Verse</i></p>');
});
it('reopened empty poetry defaults to italic while an explicit italic-off choice remains roman', () => {
  const core = open('<p class="poetry"></p>');
  core.select('a', 1);
  core.insert('Verse');
  expect(core.html('a')).toBe('<p class="poetry"><i>Verse</i></p>');
  const roman = open('<p class="poetry"></p>');
  roman.select('a', 1);
  roman.format('italic');
  roman.insert('Roman');
  expect(roman.html('a')).toBe('<p class="poetry">Roman</p>');
});

it('saving bookkeeping/checkpoint retains the exact append caret without mounting any surface', () => {
  const core = open('<p></p>');
  core.select('a', 1);
  core.insert('Base text');
  const selection = core.selection;
  core.setBookkeeping({ lastPosition: selection, wordCount: core.words });
  core.checkpoint();
  expect(core.selection).toEqual(selection);
  core.insert(' plus local writing');
  expect(core.passageRows('a')[0].text).toBe('Base text plus local writing');
});

// NEO-098-B: native typing capacity is independent of the old structural ten-stack.
it('sixteen caret-separated author runs undo and redo every paragraph in order', () => {
  const original = Array.from({ length: 16 }, (_, index) => `Line ${index}.`);
  const core = open(original.map((text) => `<p>${text}</p>`).join(''));
  const expected = [...original];
  for (let index = 0; index < original.length; index++) {
    const paragraph = core.passageRows('a')[index];
    core.selectPassage(paragraph.id, paragraph.size);
    const letter = String.fromCharCode(65 + index);
    core.insert(letter);
    expected[index] += letter;
    expect(core.passageRows('a').map((paragraph) => paragraph.text)).toEqual(expected);
  }
  for (let index = original.length - 1; index >= 0; index--) {
    core.undo();
    expected[index] = original[index];
    expect(core.passageRows('a').map((paragraph) => paragraph.text)).toEqual(expected);
  }
  expect(core.canUndo).toBe(false);
  for (let index = 0; index < original.length; index++) {
    core.redo();
    expected[index] += String.fromCharCode(65 + index);
    expect(core.passageRows('a').map((paragraph) => paragraph.text)).toEqual(expected);
  }
  const checkpoint = core.checkpoint();
  const reopened = new BookCore(
    document,
    checkpoint.book,
    checkpoint.reviews,
    checkpoint.notes,
    checkpoint.outline,
  );
  expect(reopened.passageRows('a').map((paragraph) => paragraph.text)).toEqual(expected);
});
it('double Enter at a prose start consumes the empty split head and Undo heals the original marked paragraph', () => {
  const core = open('<p><b>Alpha</b> beta.</p>');
  const original = core.html('a');
  core.selectPassage(core.passageRows('a')[0].id, 0);
  core.enter();
  core.enter();
  expect(texts(core)[0]).toEqual(['***', 'Alpha beta.']);
  expect(core.html('a')).toContain('<b>Alpha</b>');
  expect(core.selection).toMatchObject({ from: 0, to: 0 });
  core.undo();
  expect(core.html('a')).toBe(original);
  core.redo();
  expect(texts(core)[0]).toEqual(['***', 'Alpha beta.']);
});
it('double Enter at a chapter end leaves one editable prose tail through typing and grouped Undo', () => {
  const core = open('<p><i>Alpha.</i></p>');
  core.selectPassage(core.passageRows('a')[0].id, 6);
  core.enter();
  core.enter();
  expect(texts(core)[0]).toEqual(['Alpha.', '***', '']);
  core.insert('Beta.');
  expect(texts(core)[0]).toEqual(['Alpha.', '***', 'Beta.']);
  core.undo();
  expect(texts(core)[0]).toEqual(['Alpha.', '***', '']);
  core.undo();
  expect(core.html('a')).toBe('<p><i>Alpha.</i></p>');
});
it('opening poetry Backspace converts before crossing the chapter boundary and preserves metadata across two Undos', () => {
  const core = open('<p>Alpha.</p>');
  core.select('b', 1);
  core.togglePoetry();
  core.renameChapter('b', 'Second');
  const snapshot = core.checkpoint();
  const reopened = new BookCore(
    document,
    snapshot.book,
    snapshot.reviews,
    snapshot.notes,
    snapshot.outline,
  );
  reopened.selectPassage(reopened.passageRows('b')[0].id, 0);
  reopened.backspace();
  expect(reopened.activeFormatting.poetry).toBe(false);
  expect(reopened.chapters).toHaveLength(2);
  reopened.backspace();
  expect(texts(reopened)).toEqual([['Alpha.', 'Later.']]);
  reopened.undo();
  expect(reopened.chapters).toHaveLength(2);
  expect(reopened.chapters[1].title).toBe('Second');
  expect(reopened.html('b')).not.toContain('poetry');
  reopened.undo();
  expect(reopened.html('b')).toContain('class="poetry"');
  reopened.redo();
  reopened.redo();
  expect(texts(reopened)).toEqual([['Alpha.', 'Later.']]);
});
it('triple Enter at an opening scene keeps a valid empty previous chapter shell', () => {
  const core = open('<p>Alpha.</p>');
  core.selectPassage(core.passageRows('a')[0].id, 0);
  core.enter();
  core.enter();
  core.enter();
  expect(texts(core)).toEqual([[''], ['Alpha.'], ['Later.']]);
  expect(() => core.state.doc.check()).not.toThrow();
  core.undo();
  expect(texts(core)[0]).toEqual(['***', 'Alpha.']);
  core.undo();
  expect(texts(core)[0]).toEqual(['Alpha.']);
});
it('empty imported poetry has a coherent forward Redo and preserves its exact source on Undo', () => {
  const html = '<p class="poetry"><i><br></i></p>',
    core = open(html);
  core.selectPassage(core.passageRows('a')[0].id, 0);
  core.enter();
  expect(core.html('a')).toBe('<p><br></p>');
  core.undo();
  expect(core.html('a')).toBe(html);
  core.redo();
  expect(core.html('a')).toBe('<p><br></p>');
  const saved = core.checkpoint(),
    reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.html('a')).toBe('<p><br></p>');
});
it('ordinary paragraph merging keeps a normal seam immediately and durably without Chromium style spans', () => {
  const core = open('<p>Alpha</p><p class="poetry"><i> beta.</i></p>');
  core.selectPassage(core.passageRows('a')[1].id, 0);
  core.backspace();
  core.backspace();
  expect(core.html('a')).toBe('<p>Alpha beta.</p>');
  const saved = core.checkpoint(),
    reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.html('a')).toBe('<p>Alpha beta.</p>');
  core.undo();
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha</p><p class="poetry"><i> beta.</i></p>');
});
it('successive metadata Undo following a triple split restores chapter ownership before the scene and original paragraph', () => {
  const core = open();
  core.selectPassage(core.passageRows('a')[0].id, 6);
  core.enter();
  core.enter();
  core.enter();
  const split = core.chapters[1].id;
  core.renameChapter(split, 'New chapter');
  core.setChapterKind(split, 'prologue');
  core.undo();
  expect(core.chapters[1]).toMatchObject({ id: split, title: 'New chapter', kind: 'chapter' });
  core.undo();
  expect(core.chapters[1].title).toBe('');
  core.undo();
  expect(texts(core)[0]).toEqual(['Alpha ', '***', 'beta.', 'Gamma.']);
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha <i>beta.</i></p><p>Gamma.</p>');
  expect(core.selection).toMatchObject({ chapterId: 'a', from: 6, to: 6 });
  for (let i = 0; i < 4; i++) core.redo();
  expect(core.chapters[1]).toMatchObject({ id: split, title: 'New chapter', kind: 'prologue' });
});
it('unified author history retains more than the source ten structural snapshots and redoes them with stable chapter identity', () => {
  const core = open(),
    original = core.chapters[0].title,
    ids = core.chapters.map((chapter) => chapter.id);
  for (let index = 0; index < 12; index++) core.renameChapter('a', `Title ${index}`);
  for (let index = 11; index >= 0; index--) {
    expect(core.chapters[0].title).toBe(`Title ${index}`);
    expect(core.undo()).toBe(true);
  }
  expect(core.chapters[0].title).toBe(original);
  expect(core.undo()).toBe(false);
  for (let index = 0; index < 12; index++) expect(core.redo()).toBe(true);
  expect(core.chapters[0].title).toBe('Title 11');
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(ids);
});
it.each(['bold', 'italic'] as const)(
  'ordinary Enter inherits active %s at both middle and end without consuming italic override',
  (mark) => {
    for (const offset of [2, 5]) {
      const core = new BookCore(
        document,
        {
          formatVersion: 'neo-lifecycle/v1',
          revision: 0,
          metadata: { id: 'book', title: 'Title', author: 'Writer' },
          chapters: [
            { id: 'a', html: mark === 'bold' ? '<p><b>Alpha</b></p>' : '<p><i>Alpha</i></p>' },
          ],
          darlings: [],
        },
        null,
        '',
        '',
      );
      core.selectPassage(core.passageRows('a')[0].id, offset);
      core.enter();
      core.insert('Next');
      expect(
        core.state.selection.$from.parent.firstChild?.marks.some((item) => item.type.name === mark),
      ).toBe(true);
      const saved = core.checkpoint(),
        reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
      expect(reopened.html('a')).toContain(mark === 'bold' ? '<b>Next' : '<i>Next');
      core.undo();
      expect(core.html('a')).not.toContain('Next');
      core.redo();
      expect(core.html('a')).toContain('Next');
    }
    const override = new BookCore(
      document,
      {
        formatVersion: 'neo-lifecycle/v1',
        revision: 0,
        metadata: { id: 'book', title: 'Title', author: 'Writer' },
        chapters: [{ id: 'a', html: '<p><i>Alpha</i></p>' }],
        darlings: [],
      },
      null,
      '',
      '',
    );
    override.selectPassage(override.passageRows('a')[0].id, 5);
    override.format('italic');
    override.enter();
    override.insert('Roman');
    expect(override.html('a')).toContain('<p>Roman</p>');
  },
);
it('publication ordinary Enter inherits active emphasis while Shift Enter preserves its hard-break marks', () => {
  const core = open();
  core.select('a', 1);
  core.format('bold');
  core.enter(false, true);
  core.insert('Next');
  expect(
    core.state.selection.$from.parent.firstChild?.marks.some((mark) => mark.type.name === 'bold'),
  ).toBe(true);
  core.enter(true, true);
  core.insert('line');
  expect(core.html('a')).toContain('<b>Next<br>line</b>');
});
it.each([6, 12])(
  'poetry continuation at offset %s preserves a deliberate roman tail but supplies italic for a new empty line',
  (offset) => {
    const core = new BookCore(
      document,
      {
        formatVersion: 'neo-lifecycle/v1',
        revision: 0,
        metadata: { id: 'book', title: 'Title', author: 'Writer' },
        chapters: [{ id: 'a', html: '<p class="poetry">Verse words.</p>' }],
        darlings: [],
      },
      null,
      '',
      '',
    );
    core.selectPassage(core.passageRows('a')[0].id, offset);
    core.enter(true);
    core.insert('Next');
    const tail = core.state.selection.$from.parent;
    expect(String(tail.attrs.class).split(/\s+/)).toContain('poetry');
    expect(tail.firstChild?.marks.some((mark) => mark.type.name === 'italic')).toBe(offset === 12);
    const saved = core.checkpoint(),
      reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
    expect(reopened.html('a')).toContain(offset === 12 ? '<i>Next</i>' : '>Nextwords.</p>');
    core.undo();
    expect(core.html('a')).not.toContain('Next');
    core.redo();
    expect(core.html('a')).toContain('Next');
  },
);

it('ordinary Enter at mixed marks adopts the nonempty right tail while explicit roman overrides remain authoritative', () => {
  for (const plain of [false, true]) {
    const core = open('<p><b>Alpha </b><i>beta.</i></p>');
    core.selectPassage(core.passageRows('a')[0].id, 6);
    expect(core.state.selection.$from.marks().map((mark) => mark.type.name)).toEqual(['bold']);
    core.enter(false, plain);
    core.insert('Next');
    expect(core.html('a')).toBe('<p><b>Alpha </b></p><p><i>Nextbeta.</i></p>');
    core.undo();
    core.undo();
    expect(core.html('a')).toBe('<p><b>Alpha </b><i>beta.</i></p>');
    core.redo();
    core.redo();
    expect(core.html('a')).toBe('<p><b>Alpha </b></p><p><i>Nextbeta.</i></p>');
    const snapshot = core.checkpoint();
    const reopened = new BookCore(
      document,
      snapshot.book,
      snapshot.reviews,
      snapshot.notes,
      snapshot.outline,
    );
    expect(reopened.html('a')).toBe(core.html('a'));

    const override = open('<p><b>Alpha </b><i>beta.</i></p>');
    override.selectPassage(override.passageRows('a')[0].id, 6);
    override.format('bold');
    expect(override.state.storedMarks).toEqual([]);
    override.enter(false, plain);
    override.insert('Roman');
    expect(override.html('a')).toBe('<p><b>Alpha </b></p><p>Roman<i>beta.</i></p>');
  }
});
