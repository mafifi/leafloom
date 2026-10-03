import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
const document = new JSDOM('').window.document;
const open = (
  html = '<p>Alpha  Gamma.</p>',
  darlings: unknown[] = [
    {
      id: 'old',
      text: 'beta',
      html: '<i>beta</i>',
      chapterId: 'a',
      anchorPrefix: 'Alpha ',
      anchorSuffix: ' Gamma.',
    },
  ],
  chapters = [{ id: 'a', html }],
) =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters,
      darlings,
    },
    null,
    '',
    '',
  );
it('legacy Darling context restores rich inline text without a hidden marker', () => {
  const core = open();
  expect(core.chapters[0].title).toBe('');
  expect(core.restore('old')).toEqual({ location: 'context', chapterId: 'a' });
  expect(core.html('a')).toBe('<p>Alpha <i>beta</i> Gamma.</p>');
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha  Gamma.</p>');
  expect(core.darlings).toHaveLength(1);
});
it('legacy block context restores paragraphs after the matching paragraph', () => {
  const core = open('<p>Alpha Gamma.</p>', [
    {
      id: 'old',
      html: '<p><b>Kept.</b></p><p>Again.</p>',
      chapterId: 'a',
      anchorPrefix: 'Alpha ',
      anchorSuffix: 'Gamma.',
    },
  ]);
  const restored = core.restore('old');
  expect(restored.restoredPassageId).toBe(core.passageRows('a')[1].id);
  expect(core.selection?.passageId).toBe(core.passageRows('a')[2].id);
  expect(core.html('a')).toBe('<p>Alpha Gamma.</p><p><b>Kept.</b></p><p>Again.</p>');
});
it('missing legacy context restores to its own chapter, last chapter, or a new chapter', () => {
  for (const chapters of [
    [
      { id: 'a', html: '<p>Changed.</p>' },
      { id: 'b', html: '<p>Later.</p>' },
    ],
    [{ id: 'b', html: '<p>Later.</p>' }],
    [],
  ]) {
    const core = open(
      '',
      [
        {
          id: 'old',
          html: '<i>beta</i>',
          chapterId: 'a',
          anchorPrefix: 'Gone',
          chapterLabel: 'Chapter 1',
        },
      ],
      chapters,
    );
    const result = core.restore('old');
    expect(result.location).toBe('fallback');
    expect(result.notice).toContain('Original spot is gone');
    expect(core.html(result.chapterId)).toContain('<p><i>beta</i></p>');
    expect(result.chapterId).toBe(
      chapters.some((chapter) => chapter.id === 'a')
        ? 'a'
        : (chapters.at(-1)?.id ?? result.chapterId),
    );
    core.undo();
    expect(core.darlings).toHaveLength(1);
  }
});
it('archive records chapter label/date/context and deletion remains in master history', () => {
  const core = open('<p>Alpha <i>beta</i> Gamma.</p>', []),
    passage = core.passageRows('a')[0];
  core.selectPassage(passage.id, 6, 10);
  core.archive();
  expect(core.html('a')).toBe('<p>Alpha  Gamma.</p>');
  expect(core.darlings[0]).toMatchObject({
    chapterLabel: 'Chapter 1',
    text: 'beta',
    chapterId: 'a',
    anchorPrefix: 'Alpha ',
    anchorSuffix: ' Gamma.',
  });
  expect(core.darlings[0].date).toEqual(expect.any(String));
  core.removeDarling(core.darlings[0].id);
  expect(core.darlings).toHaveLength(0);
  core.undo();
  expect(core.darlings).toHaveLength(1);
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha <i>beta</i> Gamma.</p>');
});
it('archived reference locations restore after reopen and stay reversible', () => {
  const core = open('<p>Alpha <i>beta</i> Gamma.</p>', []),
    passage = core.passageRows('a')[0],
    reference = core.capture(passage.id, 6, 10);
  core.selectPassage(passage.id, 6, 10);
  core.archive();
  expect(core.resolve(reference.id).status).toBe('deleted');
  const snapshot = core.checkpoint(),
    reopened = new BookCore(
      document,
      snapshot.book,
      snapshot.reviews,
      snapshot.notes,
      snapshot.outline,
    );
  reopened.restore(reopened.darlings[0].id);
  expect(reopened.resolve(reference.id).status).toBe('current');
  reopened.undo();
  expect(reopened.resolve(reference.id).status).toBe('deleted');
  reopened.redo();
  expect(reopened.resolve(reference.id).status).toBe('current');
});

it('restoring into an empty manuscript replaces its new paragraph shell', () => {
  const core = open('', [{ id: 'old', html: '<i>beta</i>', chapterId: 'gone' }], []);
  const result = core.restore('old');
  expect(core.html(result.chapterId)).toBe('<p><i>beta</i></p>');
});

it('legacy externally edited prose uses original context rather than stale native bookmark coordinates', () => {
  const core = open('<p>Moved Alpha  Gamma.</p>', [
    {
      id: 'old',
      html: '<i>beta</i>',
      chapterId: 'a',
      anchorPrefix: 'Alpha ',
      anchorSuffix: ' Gamma.',
      bookmark: { position: 3 },
    },
  ]);
  expect(core.restore('old').location).toBe('context');
  expect(core.html('a')).toBe('<p>Moved Alpha <i>beta</i> Gamma.</p>');
});

it('Darlings Find searches rendered rich text runs and excludes metadata, with literal query offsets', () => {
  const core = open('', [
    {
      id: 'old',
      html: '<p>Al<b>pha</b> Alpha <i>[beta]</i></p>',
      text: 'Alpha Alpha beta',
      chapterId: 'a',
      chapterLabel: 'Alpha owner',
      date: '2026-10-02',
    },
  ]);
  expect(core.searchDarlings('Alpha')).toEqual([{ darlingId: 'old', runIndex: 2, from: 1, to: 6 }]);
  expect(core.searchDarlings('[beta]')).toEqual([
    { darlingId: 'old', runIndex: 3, from: 0, to: 6 },
  ]);
  expect(core.searchDarlings('2026')).toEqual([]);
  const revision = core.revision;
  expect(core.searchDarlings('owner')).toEqual([]);
  expect(core.revision).toBe(revision);
});

it('legacy optional Darling date metadata cannot hide valid rich text', () => {
  const core = open('', [
    { id: 'old', html: '<i>beta</i>', chapterId: 'a', date: 0, chapterLabel: 'Chapter 1' },
  ]);
  expect(core.darlings[0]).toMatchObject({
    id: 'old',
    html: '<i>beta</i>',
    date: '1970-01-01T00:00:00.000Z',
  });
  expect(core.checkpoint().book.darlings[0]).toMatchObject({ date: 0 });
});
it('whole-paragraph archive restores its paragraph boundary and contained reference after reopen', () => {
  const core = open('<p>Alpha.</p><p><i>Beta.</i></p><p>Gamma.</p>', []),
    passage = core.passageRows('a')[1],
    reference = core.capture(passage.id, 0, 5);
  core.selectPassage(passage.id, 0, 5);
  core.archive();
  expect(core.html('a')).toBe('<p>Alpha.</p><p>Gamma.</p>');
  const snapshot = core.checkpoint(),
    reopened = new BookCore(
      document,
      snapshot.book,
      snapshot.reviews,
      snapshot.notes,
      snapshot.outline,
    );
  reopened.restore(reopened.darlings[0].id);
  expect(reopened.html('a')).toBe('<p>Alpha.</p><p><i>Beta.</i></p><p>Gamma.</p>');
  expect(reopened.resolve(reference.id).status).toBe('current');
});
it('multi-paragraph Darling metadata and emphasis survive reopen, restore, and successive history', () => {
  const html = '<p>Alpha <b>beta.</b></p><p><i>Gamma</i> delta.</p>';
  const core = open(html, []);
  core.select('a', 7, 19);
  core.archive();
  const record = core.darlings[0];
  expect(record).toMatchObject({
    chapterId: 'a',
    chapterLabel: 'Chapter 1',
    text: 'beta.\nGamma',
    anchorPrefix: 'Alpha ',
    anchorSuffix: ' delta.',
  });
  expect(Number.isFinite(Date.parse(String(record.date)))).toBe(true);
  expect(record.html).toContain('<b>beta.</b>');
  expect(record.html).toContain('<i>Gamma</i>');
  const snapshot = core.checkpoint(),
    reopened = new BookCore(
      document,
      snapshot.book,
      snapshot.reviews,
      snapshot.notes,
      snapshot.outline,
    );
  expect(reopened.darlings[0]).toEqual(record);
  reopened.restore(record.id);
  expect(reopened.html('a')).toBe(html);
  reopened.renameChapter('a', 'After restore');
  reopened.undo();
  expect(reopened.html('a')).toBe(html);
  reopened.undo();
  expect(reopened.darlings[0]).toEqual(record);
  expect(reopened.html('a')).toBe(core.html('a'));
  reopened.redo();
  expect(reopened.html('a')).toBe(html);
});
