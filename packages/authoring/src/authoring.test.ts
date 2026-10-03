import { describe, it, expect } from 'vitest';
import { AuthoringSession } from './index';
describe('authoring lifecycle', () => {
  it('serializes saves and retains edits arriving during a save', async () => {
    let release!: () => void;
    let revision = 1;
    const saved: number[] = [];
    const core = {
      get revision() {
        return revision;
      },
      checkpoint() {
        return { book: { revision } };
      },
    };
    const session = new AuthoringSession(core as never, async (checkpoint) => {
      saved.push(checkpoint.book.revision);
      if (saved.length === 1) await new Promise<void>((r) => (release = r));
    });
    session.changed();
    const saving = session.flush();
    revision = 2;
    session.changed();
    release();
    await saving;
    expect(saved).toEqual([1, 2]);
    expect(session.dirty).toBe(false);
  });
  it('retains dirty state and reports a failed save for retry', async () => {
    let failing = true;
    const session = new AuthoringSession(
      { revision: 1, checkpoint: () => ({ book: { revision: 1 } }) } as never,
      async () => {
        if (failing) throw Error('DISK_ERROR');
      },
    );
    session.changed();
    await expect(session.flush()).rejects.toThrow('DISK_ERROR');
    expect(session.dirty).toBe(true);
    failing = false;
    await session.flush();
    expect(session.dirty).toBe(false);
  });
});

it('settle finishes only the dispatched checkpoint and preserves later edits for explicit resumption', async () => {
  const { BookCore } = await import('../../editing/prosemirror-editor/src/core'),
    { JSDOM } = await import('jsdom');
  const editor = new BookCore(
    new JSDOM('').window.document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [{ id: 'chapter', html: '<p>Alpha.</p>' }],
      darlings: [],
    },
    null,
    '',
    '',
  );
  let release!: () => void;
  const saved: number[] = [];
  const session = new AuthoringSession(editor, async (checkpoint) => {
    saved.push(checkpoint.book.revision);
    if (saved.length === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
  });
  editor.select('chapter', 7);
  editor.insert(' First.');
  session.changed();
  const firstRevision = editor.revision;
  const saving = session.flush();
  editor.insert(' Later.');
  session.changed();
  const laterRevision = editor.revision;
  const settling = session.settle();
  release();
  await settling;
  await saving;
  expect(saved).toEqual([firstRevision]);
  expect(session.dirty).toBe(true);
  await session.flush();
  expect(saved).toEqual([firstRevision, laterRevision]);
  expect(session.dirty).toBe(false);
});
it('settle does not start idle dirty writes and failed paused writes remain retryable', async () => {
  const { BookCore } = await import('../../editing/prosemirror-editor/src/core'),
    { JSDOM } = await import('jsdom');
  const editor = new BookCore(
    new JSDOM('').window.document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [{ id: 'chapter', html: '<p>Alpha.</p>' }],
      darlings: [],
    },
    null,
    '',
    '',
  );
  let reject!: (error: Error) => void,
    failing = true;
  const saved: number[] = [];
  const session = new AuthoringSession(editor, async (checkpoint) => {
    saved.push(checkpoint.book.revision);
    if (failing)
      await new Promise<void>((_resolve, fail) => {
        reject = fail;
      });
  });
  editor.select('chapter', 7);
  editor.insert(' First.');
  session.changed();
  await session.settle();
  expect(saved).toEqual([]);
  expect(session.dirty).toBe(true);
  const saving = session.flush(),
    settling = session.settle();
  editor.insert(' Later.');
  session.changed();
  reject(Error('DISK_FULL'));
  await expect(settling).rejects.toThrow('DISK_FULL');
  await expect(saving).rejects.toThrow('DISK_FULL');
  expect(session.dirty).toBe(true);
  expect(saved).toHaveLength(1);
  failing = false;
  await session.flush();
  expect(saved).toHaveLength(2);
  expect(saved[1]).toBe(editor.revision);
  expect(session.dirty).toBe(false);
});
