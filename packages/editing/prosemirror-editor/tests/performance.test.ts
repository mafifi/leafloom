import { it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
import { Node as DocumentNode } from 'prosemirror-model';
const document = new JSDOM('').window.document;
it.each([10_000, 100_000])(
  'large manuscript %i words keeps typing and bookkeeping on one master history',
  (count) => {
    const paragraph =
        '<p>' + Array.from({ length: 100 }, (_, index) => 'word' + index).join(' ') + '</p>',
      chapters = Array.from({ length: count / 1000 }, (_, index) => ({
        id: 'chapter-' + index,
        html: paragraph.repeat(10),
      }));
    const core = new BookCore(
      document,
      {
        formatVersion: 'neo-lifecycle/v1',
        revision: 0,
        metadata: { id: 'book', title: 'Title', author: 'Writer' },
        chapters,
        darlings: [],
      },
      null,
      '',
      '',
    );
    expect(core.words).toBe(count);
    core.select('chapter-0', 1);
    const samples: number[] = [];
    for (let index = 0; index < 20; index++) {
      const start = performance.now();
      core.insert('x');
      core.setBookkeeping({ wordCount: core.words });
      samples.push(performance.now() - start);
    }
    const version = core.version;
    core.setBookkeeping({ modified: '2026-10-02T18:00:00Z' });
    expect(core.version).toBe(version);
    expect(core.words).toBe(count);
    core.undo();
    expect(core.html('chapter-0')).toBe(chapters[0].html);
    expect(core.words).toBe(count);
    expect(core.canUndo).toBe(false);
    samples.sort((left, right) => left - right);
    console.info(
      JSON.stringify({
        scenario: 'core.typing-bookkeeping',
        words: count,
        p50ms: samples[10],
        p95ms: samples[18],
      }),
    );
  },
);
it('five thousand spelling ranges in a100k word book remain exact through bookkeeping and edits', () => {
  const paragraph =
    '<p>' + Array.from({ length: 100 }, (_, index) => 'word' + index).join(' ') + '</p>';
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: Array.from({ length: 100 }, (_, index) => ({
        id: 'chapter-' + index,
        html: paragraph.repeat(10),
      })),
      darlings: [],
    },
    null,
    '',
    '',
  );
  const annotations = core.chapters
    .flatMap((chapter) => core.passageRows(chapter.id))
    .flatMap((passage) =>
      Array.from({ length: 5 }, (_, index) => ({
        id: passage.id + '-' + index,
        kind: 'spelling' as const,
        passageId: passage.id,
        from: index * 6,
        to: index * 6 + 5,
      })),
    );
  core.setAnnotations(annotations);
  const samples: number[] = [];
  for (let index = 0; index < 10; index++) {
    const start = performance.now();
    expect(core.annotations).toEqual(annotations);
    core.setBookkeeping({ modified: String(index) });
    samples.push(performance.now() - start);
  }
  core.selectPassage(annotations[0].passageId, 0, 5);
  core.insert('changed');
  expect(core.annotations).toHaveLength(4999);
  core.undo();
  expect(core.annotations).toEqual([]);
  samples.sort((left, right) => left - right);
  console.info(
    JSON.stringify({
      scenario: 'core.annotation-projection-bookkeeping',
      words: 100000,
      ranges: 5000,
      p50ms: samples[5],
      p95ms: samples[9],
    }),
  );
});

it('ordinary typing avoids whole-book quote inference while quoted input still sees earlier chapter style', () => {
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [
        { id: 'earlier', html: '<p>»Earlier« ' + 'word '.repeat(100_000) + '</p>' },
        { id: 'active', html: '<p></p>' },
      ],
      darlings: [],
    },
    null,
    '',
    '',
  );
  core.configureTypography({ language: 'de' });
  core.select('active', 1);
  const getter = vi.spyOn(DocumentNode.prototype, 'textContent', 'get');
  const bookReads = () =>
    getter.mock.contexts.filter(
      (receiver) => receiver instanceof DocumentNode && receiver.type === core.state.doc.type,
    ).length;
  try {
    core.insert('ordinary typing');
    expect(bookReads()).toBe(0);
    core.undo();
    getter.mockClear();
    const started = performance.now();
    core.insert('"Again"');
    expect(core.html('active')).toBe('<p>»Again«</p>');
    expect(bookReads()).toBeGreaterThan(0);
    console.info(
      JSON.stringify({
        scenario: 'core.quote-book-style',
        words: 100_000,
        durationMs: performance.now() - started,
      }),
    );
    core.undo();
    expect(core.html('active')).toBe('<p></p>');
  } finally {
    getter.mockRestore();
  }
});
