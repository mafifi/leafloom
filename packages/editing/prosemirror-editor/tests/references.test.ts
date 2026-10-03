import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
const document = new JSDOM('').window.document;
const open = () =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [
        { id: 'a', html: '<p>Alpha beta Gamma.</p><p>Return.</p>' },
        { id: 'b', html: '<p>Later.</p>' },
      ],
      darlings: [],
    },
    null,
    '<p>Notes.</p>',
    '<p>Outline.</p>',
  );
it('a reference spanning a paragraph split resolves as the same marked content across native history and checkpoint', () => {
  const core = open(),
    passage = core.passageRows('a')[0],
    reference = core.capture(passage.id, 6, 10);
  core.selectPassage(passage.id, 8);
  core.enter();
  expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'beta' });
  expect(core.resolve(reference.id).segments).toHaveLength(2);
  core.enter();
  expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'beta' });
  core.enter();
  expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'beta' });
  expect(
    new Set(core.resolve(reference.id).segments.map((segment) => segment.chapterId)).size,
  ).toBe(2);
  core.undo();
  core.undo();
  expect(core.resolve(reference.id).segments).toHaveLength(1);
  expect(core.resolve(reference.id).status).toBe('current');
  const checkpoint = core.checkpoint(),
    reopened = new BookCore(
      document,
      checkpoint.book,
      checkpoint.reviews,
      checkpoint.notes,
      checkpoint.outline,
    );
  expect(reopened.resolve(reference.id)).toEqual(core.resolve(reference.id));
});
it('moved passages retain stable references and duplicate chapters receive new passage identities', () => {
  const core = open(),
    passage = core.passageRows('a')[1],
    reference = core.capture(passage.id, 0, passage.size);
  core.movePassage(passage.id, 'b', 1);
  expect(core.resolve(reference.id)).toMatchObject({
    status: 'current',
    segments: [{ chapterId: 'b', passageId: passage.id }],
  });
  const copy = core.duplicateChapter('b');
  expect(core.passageRows(copy).map((p) => p.id)).not.toEqual(
    core.passageRows('b').map((p) => p.id),
  );
  core.undo();
  core.undo();
  expect(core.resolve(reference.id).segments[0].chapterId).toBe('a');
  core.redo();
  expect(core.resolve(reference.id).segments[0].chapterId).toBe('b');
});
it('review acceptance rejects changed text and preserves adjacent marks on a current suggestion', () => {
  const core = open(),
    passage = core.passageRows('a')[0],
    reference = core.capture(passage.id, 6, 10),
    request = core.extract([reference.id], 'voice');
  core.receive({
    reviewId: 'review',
    requestId: request.requestId,
    items: [
      {
        id: 'suggestion',
        kind: 'suggestion',
        category: 'voice',
        references: [reference.id],
        message: 'Try a direct noun',
        replacement: 'delta',
      },
    ],
  });
  core.selectPassage(passage.id, 8);
  core.insert('X');
  expect(core.accept('suggestion')).toEqual({ ok: false, code: 'STALE' });
  core.undo();
  expect(core.accept('suggestion')).toEqual({ ok: true });
  expect(core.passageRows('a')[0].text).toBe('Alpha delta Gamma.');
  core.undo();
  expect(core.resolve(reference.id).status).toBe('current');
  expect(core.reviewRows()[0].state).toBe('pending');
});
it('unknown requests, duplicate review identities and unrequested references are rejected before attachment', () => {
  const core = open();
  expect(() => core.receive({ reviewId: 'r', requestId: 'missing', items: [] })).toThrow(
    'UNKNOWN_REQUEST',
  );
  const passage = core.passageRows('a')[0],
    reference = core.capture(passage.id, 0, 5),
    request = core.extract([reference.id], 'voice');
  expect(() =>
    core.receive({
      reviewId: 'r',
      requestId: request.requestId,
      items: [
        { id: 'bad', kind: 'note', category: 'voice', references: ['foreign'], message: 'No' },
      ],
    }),
  ).toThrow('INVALID_REVIEW');
  expect(core.reviewRows()).toEqual([]);
});
it('a forged passage signature cannot silently retarget persisted reviews', () => {
  const core = open(),
    saved = core.checkpoint();
  saved.book.chapters[0].passages[0].signature = '0'.repeat(64);
  expect(
    () => new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline),
  ).toThrow('INVALID_IDENTITY');
});
it('recovered review version mismatch preserves accepted decisions while references stay unresolved across later saves', () => {
  const core = open(),
    passage = core.passageRows('a')[0],
    reference = core.capture(passage.id, 0, 5),
    request = core.extract([reference.id], 'voice');
  core.receive({
    reviewId: 'review',
    requestId: request.requestId,
    items: [
      {
        id: 'accepted',
        kind: 'suggestion',
        category: 'voice',
        references: [reference.id],
        message: 'Direct phrasing',
        replacement: 'First',
      },
    ],
  });
  core.accept('accepted');
  const snapshot = core.checkpoint(),
    version = crypto.randomUUID(),
    book = {
      ...snapshot.book,
      version,
      chapters: snapshot.book.chapters.map((chapter) => ({ ...chapter, version })),
    },
    recovered = new BookCore(document, book, snapshot.reviews, snapshot.notes, snapshot.outline);
  expect(recovered.reviewRows()[0].state).toBe('accepted');
  expect(recovered.resolve(reference.id).status).toBe('unresolved');
  expect(recovered.annotations).toEqual([]);
  const next = recovered.checkpoint(),
    reopened = new BookCore(document, next.book, next.reviews, next.notes, next.outline);
  expect(reopened.resolve(reference.id).status).toBe('unresolved');
  expect(reopened.reviewRows()[0].state).toBe('accepted');
});
