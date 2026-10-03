import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
import { Darling } from '../src/darlings';
import { onlyDrops, metadataSignature } from '../src/external-reconciliation';
const document = new JSDOM('').window.document;
const options = {
  date: '2026-10-03T00:00:00Z',
  conflictSuffix: 'from other device, 12:00 AM',
  chapterLabels: { a: 'Chapter 1', b: 'Chapter 2' },
};
function open(
  chapters = [
    { id: 'a', html: '<p>Alpha.</p>' },
    { id: 'b', html: '<p>Later.</p>' },
  ],
) {
  return new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer', chapterTitles: { a: 'Opening' } },
      chapters,
      darlings: [],
    },
    null,
    '<p>Notes.</p>',
    '<p>Outline.</p>',
  );
}
it('source drop detection counts the exact stripped-HTML word multiset, including repetitions', () => {
  expect(onlyDrops('<p><b>Alpha Alpha.</b></p><p>Later.</p>', '<p>Alpha Alpha.</p>')).toBe(true);
  expect(onlyDrops('<p>Alpha Alpha</p>', '<p>Alpha</p>')).toBe(true);
  expect(onlyDrops('<p>Alpha Beta</p>', '<p>Beta Alpha</p>')).toBe(false);
  expect(onlyDrops('<p>Alpha</p>', '<p>Alpha Alpha</p>')).toBe(false);
  expect(onlyDrops('<p>Alpha</p>', '<p>Gamma</p>')).toBe(false);
});
it('source metadata signature ignores housekeeping and empty defaults, but includes chapter order', () => {
  const base = open().checkpoint().book;
  expect(metadataSignature(base)).toBe(
    metadataSignature({
      ...base,
      metadata: {
        ...base.metadata,
        modified: 'later',
        wordCount: 90,
        subtitle: '',
        dailyCounts: {},
      },
    }),
  );
  expect(metadataSignature(base)).not.toBe(
    metadataSignature({ ...base, chapters: [...base.chapters].reverse() }),
  );
});
it('clean remote word removal archives complete rich author text and retains companion bytes', () => {
  const html = '<p><b>Alpha beta.</b></p><p><i>Delta epsilon.</i></p>',
    core = open([
      { id: 'a', html },
      { id: 'b', html: '<p>Later.</p>' },
    ]),
    baseline = core.checkpoint(),
    remote = open([
      { id: 'a', html: '<p>Alpha beta.</p>' },
      { id: 'b', html: '<p>Later.</p>' },
    ]).checkpoint();
  const result = core.reconcileExternal(baseline, remote, options);
  expect(result).toMatchObject({
    adoptedChapterIds: ['a'],
    structureChanged: false,
    historyReset: false,
  });
  expect(result.archivedDarlingIds).toHaveLength(1);
  const saved = core.checkpoint();
  expect(saved.book.chapters[0].html).toBe('<p>Alpha beta.</p>');
  expect(saved.book.darlings).toEqual([
    expect.objectContaining({
      html,
      chapterId: 'a',
      chapterLabel: 'Chapter 1',
      date: options.date,
      text: 'Alpha beta.\n\nDelta epsilon.',
    }),
  ]);
  expect(saved.notes).toBe(baseline.notes);
  expect(saved.outline).toBe(baseline.outline);
  expect(core.reconcileExternal(remote, remote, options).archivedDarlingIds).toEqual([]);
});
it('concurrent text keeps local prose and inserts a rich adjacent conflict chapter with one safe history boundary', () => {
  const core = open(),
    baseline = core.checkpoint(),
    remote = open([
      { id: 'a', html: '<p><i>Gamma.</i></p>' },
      { id: 'b', html: '<p>Later.</p>' },
    ]).checkpoint();
  core.select('a', 7);
  core.insert(' Beta locally');
  const result = core.reconcileExternal(baseline, remote, options);
  expect(result.conflictChapterIds).toHaveLength(1);
  expect(core.chapters.map((chapter) => chapter.id)).toEqual([
    'a',
    result.conflictChapterIds[0],
    'b',
  ]);
  expect(core.html('a')).toBe('<p>Alpha. Beta locally</p>');
  expect(core.html(result.conflictChapterIds[0])).toBe('<p><i>Gamma.</i></p>');
  expect(core.chapters[1].title).toBe('Opening ' + options.conflictSuffix);
  expect(result.historyReset).toBe(true);
  expect(core.undo()).toBe(false);
  expect(core.checkpoint().notes).toBe(baseline.notes);
});
it('concurrent structures insert remote nonempty chapters after their nearest predecessor without dropping local nodes or references', () => {
  const core = open(),
    reference = core.capture(core.passageRows('a')[0].id, 0, 5),
    baseline = core.checkpoint(),
    remote = open([
      { id: 'a', html: '<p>Alpha.</p>' },
      { id: 'b', html: '<p>Later.</p>' },
      { id: 'remote', html: '<p><i>Remote content.</i></p>' },
    ]).checkpoint();
  remote.reviews = { ...baseline.reviews, version: remote.book.version };
  const local = core.createChapter('Local');
  core.select(local, 1);
  core.insert('Local content.');
  const result = core.reconcileExternal(baseline, remote, options);
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(['a', 'b', 'remote', local]);
  expect(core.html(local)).toBe('<p>Local content.</p>');
  expect(core.html('remote')).toBe('<p><i>Remote content.</i></p>');
  expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'Alpha' });
  expect(result).toMatchObject({ structureChanged: true, historyReset: true });
  expect(core.canUndo).toBe(false);
});
it('text-only adoption preserves distant stable passage selection and safe unrelated metadata Undo with current references', () => {
  const core = open([{ id: 'a', html: '<p>Alpha.</p><p>Keep reference.</p>' }]),
    baseline = core.checkpoint(),
    second = core.passageRows('a')[1],
    reference = core.capture(second.id, 0, 4),
    remote = open([
      { id: 'a', html: '<p>Much longer incoming text.</p><p>Keep reference.</p>' },
    ]).checkpoint();
  core.setMetadata({ title: 'Local title' });
  core.selectPassage(second.id, 3);
  const result = core.reconcileExternal(baseline, remote, options);
  expect(result.historyReset).toBe(false);
  expect(core.selection).toMatchObject({ passageId: second.id, from: 3, to: 3 });
  expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'Keep' });
  core.undo();
  expect(core.title).toBe('Title');
  expect(core.html('a')).toContain('Much longer incoming text.');
  expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'Keep' });
});
it('remote structural removal retains orphaned rich bytes as a Darling in the flat document format', () => {
  const core = open(),
    baseline = core.checkpoint(),
    remote = open([{ id: 'b', html: '<p>Later.</p>' }]).checkpoint();
  const result = core.reconcileExternal(baseline, remote, options);
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(['b']);
  expect(result.archivedDarlingIds).toHaveLength(1);
  expect(core.checkpoint().book.darlings).toEqual([
    expect.objectContaining({ html: '<p>Alpha.</p>', chapterId: 'a' }),
  ]);
});
it('unsupported replaced source stays exact in its recovered Darling and remains guarded', () => {
  const html = '<p style="color:red">Alpha Delta</p><table><tr><td>epsilon</td></tr></table>',
    core = open([{ id: 'a', html }]),
    baseline = core.checkpoint(),
    remote = open([{ id: 'a', html: '<p>Alpha</p>' }]).checkpoint();
  expect(core.supported('a')).toBe(false);
  core.reconcileExternal(baseline, remote, options);
  expect(core.checkpoint().book.darlings[0]).toMatchObject({ html });
  const darling = core.darlings[0];
  expect(() => core.restore(darling.id)).toThrow();
  expect(core.html('a')).toBe('<p>Alpha</p>');
});
it('ambiguous concurrent companion edits retain the entire current checkpoint without mutation', () => {
  const core = open(),
    baseline = core.checkpoint(),
    remote = open().checkpoint();
  core.select('notes', 7);
  core.insert(' local');
  remote.notes = '<p>Remote notes.</p>';
  const before = core.checkpoint();
  expect(() => core.reconcileExternal(baseline, remote, options)).toThrow('COMPANION_CONFLICT');
  expect(core.checkpoint()).toEqual(before);
});

it('incoming omission cannot silently delete a local baseline review attachment', () => {
  const core = open();
  core.capture(core.passageRows('a')[0].id, 0, 5);
  const baseline = core.checkpoint(),
    incoming = open().checkpoint(),
    before = core.checkpoint();
  expect(() => core.reconcileExternal(baseline, incoming, options)).toThrow('COMPANION_CONFLICT');
  expect(core.checkpoint()).toEqual(before);
});

it('empty incoming file does not replace established prose during a partial external download', () => {
  const core = open(),
    baseline = core.checkpoint(),
    remote = open([
      { id: 'a', html: '' },
      { id: 'b', html: '<p>Later.</p>' },
    ]).checkpoint();
  expect(core.reconcileExternal(baseline, remote, options).changed).toBe(false);
  expect(core.html('a')).toBe('<p>Alpha.</p>');
});
it('remote structural removal retains a locally written missing chapter in its original predecessor position', () => {
  const core = open(),
    baseline = core.checkpoint(),
    remote = open([{ id: 'b', html: '<p>Later.</p>' }]).checkpoint();
  core.select('a', 7);
  core.insert(' Local writing.');
  core.reconcileExternal(baseline, remote, options);
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(['a', 'b']);
  expect(core.html('a')).toBe('<p>Alpha. Local writing.</p>');
  expect(core.darlings).toEqual([]);
});
it('removed sticky prose and its author note stay together in the recovered rich Darling after reopen', () => {
  const core = open();
  core.select('a', 7);
  const sticky = core.createSticky('Keep this note');
  const baseline = core.checkpoint(),
    remote = open().checkpoint();
  remote.book.metadata.stickies = baseline.book.metadata.stickies;
  const result = core.reconcileExternal(baseline, remote, options),
    saved = core.checkpoint();
  expect(result.archivedDarlingIds).toHaveLength(1);
  expect(Darling.parse(saved.book.darlings[0]).html).toContain('data-sid="' + sticky + '"');
  expect(saved.book.metadata.stickies).toEqual(baseline.book.metadata.stickies);
  const reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(Darling.parse(reopened.checkpoint().book.darlings[0]).html).toBe(
    Darling.parse(saved.book.darlings[0]).html,
  );
  expect(reopened.stickies).toEqual(core.stickies);
});
it('a reference to replaced remote prose becomes explicitly unresolved and remains so on disk reopen', () => {
  const core = open(),
    reference = core.capture(core.passageRows('a')[0].id, 0, 5),
    baseline = core.checkpoint(),
    remote = open([
      { id: 'a', html: '<p>Gamma.</p>' },
      { id: 'b', html: '<p>Later.</p>' },
    ]).checkpoint();
  remote.reviews = { ...baseline.reviews, version: remote.book.version };
  core.reconcileExternal(baseline, remote, options);
  expect(core.resolve(reference.id).status).toBe('unresolved');
  const saved = core.checkpoint(),
    reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.resolve(reference.id).status).toBe('unresolved');
});
it('invalid incoming identity is rejected before source provenance or document state changes', () => {
  const core = open(),
    baseline = core.checkpoint(),
    remote = open().checkpoint(),
    before = core.checkpoint();
  remote.book.chapters[0].passages[0].signature = 'invalid';
  expect(() => core.reconcileExternal(baseline, remote, options)).toThrow();
  expect(core.checkpoint()).toEqual(before);
});
it('incoming metadata adopts source legacy opening/closing roles and validates explicit chapter kinds', () => {
  const core = open(),
    baseline = core.checkpoint(),
    remote = open().checkpoint();
  remote.book.metadata.prologue = 'a';
  remote.book.metadata.epilogue = 'b';
  remote.book.metadata.chapterKinds = { a: 'unknown' };
  core.reconcileExternal(baseline, remote, options);
  expect(core.chapters.map((chapter) => chapter.kind)).toEqual(['prologue', 'epilogue']);
  expect(core.undo()).toBe(false);
});
it('external structural adoption preserves current auxiliary author bytes but establishes a single unified history boundary', () => {
  const core = open(),
    baseline = core.checkpoint(),
    remote = open([
      { id: 'a', html: '<p>Alpha.</p>' },
      { id: 'b', html: '<p>Later.</p>' },
      { id: 'new', html: '<p>Incoming.</p>' },
    ]).checkpoint();
  core.select('notes', 7);
  core.insert(' Private note.');
  core.select('outline', 9);
  core.insert(' Private outline.');
  const local = core.checkpoint();
  expect(core.canUndo).toBe(true);
  core.reconcileExternal(baseline, remote, options);
  expect(core.html('notes')).toBe(local.notes);
  expect(core.html('outline')).toBe(local.outline);
  expect(core.canUndo).toBe(false);
  expect(core.undo()).toBe(false);
  expect(core.chapters.map((chapter) => chapter.id)).toEqual(['a', 'b', 'new']);
});
it('a conflict twin clones retained incoming passage IDs and remaps its review attachments without duplicating local identity', () => {
  const core = open(),
    baseline = core.checkpoint(),
    remoteCore = new BookCore(
      document,
      baseline.book,
      baseline.reviews,
      baseline.notes,
      baseline.outline,
    ),
    original = core.passageRows('a')[0].id;
  remoteCore.selectPassage(original, 0, 6);
  remoteCore.insert('Gamma.');
  const remoteReference = remoteCore.capture(original, 0, 5);
  const incoming = remoteCore.checkpoint();
  core.selectPassage(original, 6);
  core.insert(' Local.');
  const outcome = core.reconcileExternal(baseline, incoming, options),
    checkpoint = core.checkpoint(),
    conflict = outcome.conflictChapterIds[0];
  expect(core.html('a')).toBe('<p>Alpha. Local.</p>');
  expect(core.html(conflict)).toBe('<p>Gamma.</p>');
  expect(core.passageRows('a')[0].id).toBe(original);
  expect(core.passageRows(conflict)[0].id).not.toBe(original);
  expect(core.resolve(remoteReference.id)).toMatchObject({
    status: 'current',
    text: 'Gamma',
    segments: [
      expect.objectContaining({ chapterId: conflict, passageId: core.passageRows(conflict)[0].id }),
    ],
  });
  const ids = checkpoint.book.chapters.flatMap((chapter) =>
    chapter.passages.map((passage) => passage.id),
  );
  expect(new Set(ids).size).toBe(ids.length);
  expect(core.undo()).toBe(false);
});
it('cross-document passage collisions reject the staged checkpoint before changing local state or source provenance', () => {
  const core = open(),
    baseline = core.checkpoint(),
    localChapter = core.createChapter('Local');
  core.select(localChapter, 1);
  core.insert('Local content.');
  const remote = open([
    { id: 'a', html: '<p>Alpha.</p>' },
    { id: 'b', html: '<p>Later.</p>' },
    { id: 'remote', html: '<p>Remote.</p>' },
  ]).checkpoint();
  remote.book.chapters[2].passages[0].id = core.passageRows(localChapter)[0].id;
  const before = core.checkpoint(),
    canUndo = core.canUndo;
  expect(() => core.reconcileExternal(baseline, remote, options)).toThrow('Duplicate passage');
  expect(core.checkpoint()).toEqual(before);
  expect(core.canUndo).toBe(canUndo);
});
it('adopts a saved remote edit in the second created chapter while preserving local first-chapter typing and mapped references', () => {
  const core = open([]);
  const first = core.createChapter('');
  core.select(first, 1);
  core.insert('First.');
  const second = core.createChapter('');
  core.select(second, 1);
  core.insert('Second.');
  const reference = core.capture(core.passageRows(first)[0].id, 0, 5);
  const baseline = core.checkpoint();
  const remote = new BookCore(
    document,
    baseline.book,
    baseline.reviews,
    baseline.notes,
    baseline.outline,
  );
  remote.select(second, 8);
  remote.insert(' Remote.');
  core.select(first, 7);
  core.insert(' Local.');
  const result = core.reconcileExternal(baseline, remote.checkpoint(), options);
  expect(result).toMatchObject({
    adoptedChapterIds: [second],
    structureChanged: false,
    historyReset: false,
  });
  expect(core.html(first)).toBe('<p>First. Local.</p>');
  expect(core.html(second)).toBe('<p>Second. Remote.</p>');
  expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'First' });
  expect(core.checkpoint().notes).toBe(baseline.notes);
  expect(core.checkpoint().outline).toBe(baseline.outline);
  const saved = core.checkpoint();
  const reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.html(first)).toBe('<p>First. Local.</p>');
  expect(reopened.html(second)).toBe('<p>Second. Remote.</p>');
});
it('repeated-suffix remote deletion preserves the replacement delta, distant references and unrelated metadata Undo', () => {
  const core = open([
    { id: 'a', html: '<p><b>First.</b></p>' },
    { id: 'b', html: '<p><i>Second. repeated repeated.</i></p>' },
  ]);
  const reference = core.capture(core.passageRows('a')[0].id, 0, 5);
  const baseline = core.checkpoint();
  const remote = new BookCore(
    document,
    baseline.book,
    baseline.reviews,
    baseline.notes,
    baseline.outline,
  );
  const remotePassage = remote.passageRows('b')[0];
  remote.replacePassageText(remotePassage.id, 8, 17, '');
  core.setMetadata({ title: 'Local title' });
  const outcome = core.reconcileExternal(baseline, remote.checkpoint(), options);
  expect(outcome).toMatchObject({ adoptedChapterIds: ['b'], historyReset: false });
  expect(core.html('b')).toBe('<p><i>Second. repeated.</i></p>');
  expect(core.html('a')).toBe('<p><b>First.</b></p>');
  expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'First' });
  expect(core.undo()).toBe(true);
  expect(core.title).toBe('Title');
  expect(core.html('b')).toBe('<p><i>Second. repeated.</i></p>');
  expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'First' });
  expect(core.redo()).toBe(true);
  expect(core.title).toBe('Local title');
  expect(core.html('b')).toBe('<p><i>Second. repeated.</i></p>');
  expect(core.checkpoint().notes).toBe(baseline.notes);
  expect(core.checkpoint().outline).toBe(baseline.outline);
});
