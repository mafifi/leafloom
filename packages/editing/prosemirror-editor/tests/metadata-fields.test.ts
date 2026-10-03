import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
import { Step } from 'prosemirror-transform';
import { MetadataFieldStep, fieldSlot } from '../src/metadata-fields';
const document = new JSDOM('').window.document;
function open() {
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [{ id: 'a', html: '<p>Alpha.</p>' }],
      darlings: [],
    },
    null,
    '',
    '',
  );
  core.select('a', 7);
  return core;
}
it('live metadata is checkpoint-owned and finishing contributes exactly one reversible command after prose', () => {
  const core = open();
  core.insert(' Added.');
  core.editMetadataField('title', 'First');
  core.editMetadataField('title', 'Final');
  expect(core.checkpoint().book.metadata.title).toBe('Final');
  const version = core.version,
    revision = core.revision;
  core.finishMetadataField('title');
  expect(core.version).toBe(version);
  expect(core.revision).toBe(revision);
  core.undo();
  expect(core.metadata.title).toBe('Title');
  expect(core.html('a')).toBe('<p>Alpha. Added.</p>');
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha.</p>');
  expect(core.canUndo).toBe(false);
  core.redo();
  core.redo();
  expect(core.html('a')).toBe('<p>Alpha. Added.</p>');
  expect(core.metadata.title).toBe('Final');
});
it('native field Undo and Redo synchronize live values without generating duplicate master undo commands', () => {
  const core = open();
  core.insert(' Added.');
  core.editMetadataField('author', 'WriterX');
  core.editMetadataField('author', 'Writer');
  core.editMetadataField('author', 'WriterX');
  core.finishMetadataField('author');
  core.undo();
  expect(core.metadata.author).toBe('Writer');
  expect(core.html('a')).toBe('<p>Alpha. Added.</p>');
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha.</p>');
  expect(core.canUndo).toBe(false);
});
it('a native edit canceled back to its starting value adds no author command and keeps housekeeping', () => {
  const core = open();
  core.insert(' Added.');
  core.editMetadataField('title', 'TitleX');
  core.setBookkeeping({ modified: 'today', wordCount: 2 });
  core.editMetadataField('title', 'Title');
  core.finishMetadataField();
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha.</p>');
  expect(core.metadata.title).toBe('Title');
  expect(core.metadata.modified).toBe('today');
  expect(core.canUndo).toBe(false);
});
it('finishing a field preserves unrelated bookkeeping and absent subtitle through undo and redo', () => {
  const core = open();
  core.editMetadataField('subtitle', 'A subtitle');
  core.setBookkeeping({ modified: 'today', dailyCounts: { today: { start: 1, end: 2 } } });
  core.finishMetadataField();
  core.undo();
  expect(core.metadata.subtitle).toBeUndefined();
  expect(core.metadata.modified).toBe('today');
  expect(core.metadata.dailyCounts).toEqual({ today: { start: 1, end: 2 } });
  core.redo();
  expect(core.metadata.subtitle).toBe('A subtitle');
  expect(core.metadata.modified).toBe('today');
});
it('another author command finishes the active field in order and preserves stable review references', () => {
  const core = open(),
    passage = core.passageRows('a')[0],
    reference = core.capture(passage.id, 0, 5);
  core.editMetadataField('title', 'New title');
  core.createChapter('Second');
  core.undo();
  expect(core.metadata.title).toBe('New title');
  expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'Alpha' });
  core.undo();
  expect(core.metadata.title).toBe('Title');
  expect(core.resolve(reference.id)).toMatchObject({ status: 'current', text: 'Alpha' });
  core.redo();
  core.redo();
  expect(core.metadata.title).toBe('New title');
  expect(core.chapters).toHaveLength(2);
});
it('switching fields closes their scopes independently and invalid field values never mutate checkpoints', () => {
  const core = open();
  core.editMetadataField('title', 'New title');
  core.editMetadataField('author', 'New writer');
  core.finishMetadataField('title');
  core.finishMetadataField('author');
  core.undo();
  expect(core.metadata).toMatchObject({ title: 'New title', author: 'Writer' });
  core.undo();
  expect(core.metadata).toMatchObject({ title: 'Title', author: 'Writer' });
  const before = core.checkpoint();
  expect(() => Reflect.apply(core.editMetadataField, core, ['id', 'replacement'])).toThrow();
  expect(core.checkpoint()).toEqual(before);
});
it('field history serializes through the public SDK and reverses only its captured field', () => {
  const core = open(),
    before = core.state.doc;
  core.editMetadataField('title', 'New title');
  core.setBookkeeping({ modified: 'today' });
  const current = core.state.doc,
    step = new MetadataFieldStep(
      'title',
      fieldSlot(before.attrs.metadata, 'title'),
      { present: true, value: 'New title' },
      before.attrs.version,
      core.version,
    ),
    decoded = Step.fromJSON(core.state.schema, step.toJSON());
  expect(decoded.apply(current).doc).toBe(current);
  const reversed = decoded.invert(current).apply(current).doc;
  expect(reversed?.attrs.metadata).toMatchObject({ title: 'Title', modified: 'today' });
  expect(reversed?.content).toBe(current.content);
  expect(() =>
    MetadataFieldStep.fromJSON(core.state.schema, { ...step.toJSON(), field: 'id' }),
  ).toThrow();
  expect(() =>
    MetadataFieldStep.fromJSON(core.state.schema, { ...step.toJSON(), after: { present: true } }),
  ).toThrow();
});
it('durable publication UUID is validated bookkeeping and survives field and manuscript history', () => {
  const core = open(),
    uuid = crypto.randomUUID();
  core.insert(' Added.');
  core.editMetadataField('title', 'New title');
  core.setBookkeeping({ uuid });
  core.finishMetadataField();
  core.undo();
  core.undo();
  expect(core.metadata.uuid).toBe(uuid);
  core.redo();
  core.redo();
  const saved = core.checkpoint();
  expect(saved.book.metadata.uuid).toBe(uuid);
  const reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.metadata.uuid).toBe(uuid);
  expect(() => core.setBookkeeping({ uuid: 'not-a-uuid' })).toThrow();
  expect(core.metadata.uuid).toBe(uuid);
});
