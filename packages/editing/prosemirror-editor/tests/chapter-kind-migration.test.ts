import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { BookCore } from '../src/core';
import { Book, type MetadataValue } from '@leafloom/document-contracts';
const document = new JSDOM('').window.document;
function open(extra: Record<string, MetadataValue[string]>) {
  return new BookCore(
    document,
    Book.parse({
      formatVersion: 'neo-lifecycle/v1',
      revision: 3,
      metadata: { id: 'legacy-roles', title: 'Legacy', author: 'Writer', ...extra },
      chapters: [
        { id: 'first', html: '<p><b>Before.</b></p>' },
        { id: 'middle', html: '<p><i>Middle.</i></p>' },
        { id: 'last', html: '<p>After.</p>' },
      ],
      darlings: [],
    }),
    null,
    '<p>Private notes.</p>',
    '<p>Private outline.</p>',
  );
}
it('migrates valid legacy edge roles into durable kinds once, without an author Undo or changing rich passage identities', () => {
  const core = open({ prologue: 'first', epilogue: 'last' });
  expect(core.revision).toBe(4);
  expect(core.canUndo).toBe(false);
  const before = core.passageRows('middle');
  const saved = core.checkpoint();
  expect(saved.book.metadata.chapterKinds).toEqual({ first: 'prologue', last: 'epilogue' });
  expect(saved.book.metadata).not.toHaveProperty('prologue');
  expect(saved.book.metadata).not.toHaveProperty('epilogue');
  expect(saved.book.chapters.map((chapter) => chapter.html)).toEqual([
    '<p><b>Before.</b></p>',
    '<p><i>Middle.</i></p>',
    '<p>After.</p>',
  ]);
  core.selectPassage(before[0].id, 7);
  core.insert('X');
  core.undo();
  expect(core.metadata.chapterKinds).toEqual({ first: 'prologue', last: 'epilogue' });
  expect(core.html('middle')).toBe('<p><i>Middle.</i></p>');
  const checkpoint = core.checkpoint();
  const reopened = new BookCore(
    document,
    checkpoint.book,
    checkpoint.reviews,
    checkpoint.notes,
    checkpoint.outline,
  );
  expect(reopened.revision).toBe(core.revision);
  expect(reopened.passageRows('middle').map((row) => row.id)).toEqual(before.map((row) => row.id));
  expect(reopened.metadata.chapterKinds).toEqual({ first: 'prologue', last: 'epilogue' });
  expect(checkpoint.notes).toBe('<p>Private notes.</p>');
  expect(checkpoint.outline).toBe('<p>Private outline.</p>');
});
it('discards invalid legacy positions while retaining modern non-edge kinds and pruning removed, default and unknown kinds', () => {
  const core = open({
    prologue: 'middle',
    epilogue: 'first',
    chapterKinds: { middle: 'prologue', last: 'chapter', missing: 'epilogue', first: 'nonsense' },
  });
  expect(core.metadata.chapterKinds).toEqual({ middle: 'prologue' });
  expect(core.metadata).not.toHaveProperty('prologue');
  expect(core.metadata).not.toHaveProperty('epilogue');
  expect(core.chapters.map((chapter) => chapter.kind)).toEqual(['chapter', 'prologue', 'chapter']);
});
it('an explicit modern default blocks legacy role fallback before its redundant kind entry is removed', () => {
  const core = open({ prologue: 'first', chapterKinds: { first: 'chapter' } });
  expect(core.metadata.chapterKinds).toEqual({});
  expect(core.chapters[0].kind).toBe('chapter');
  expect(core.metadata).not.toHaveProperty('prologue');
});
it('modern-only metadata keeps explicit default and future kinds unchanged across reopen', () => {
  const core = open({
    chapterKinds: { first: 'chapter', middle: 'future-kind', last: 'epilogue' },
  });
  expect(core.revision).toBe(3);
  expect(core.metadata.chapterKinds).toEqual({
    first: 'chapter',
    middle: 'future-kind',
    last: 'epilogue',
  });
  const saved = core.checkpoint();
  const reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.metadata.chapterKinds).toEqual(core.metadata.chapterKinds);
  expect(reopened.revision).toBe(3);
});
