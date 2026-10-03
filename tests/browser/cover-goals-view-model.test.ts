import { expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  Metadata,
  type MetadataValue,
} from '../../packages/documents/document-contracts/src/index';
import { BookCore } from '../../packages/editing/prosemirror-editor/src/index';
import {
  CoverGoalsViewModel,
  coverGoalProgress,
  parseCoverGoal,
  type CoverGoalsContext,
} from '../../apps/desktop/src/lib/cover-goals';

const t = (key: string, args: Record<string, string | number> = {}) =>
  key.replace(/\{(\w+)\}/g, (_, name: string) => String(args[name] ?? name));
function fixture(answer: string | null = '80000') {
  let metadata = Metadata.parse({
    id: 'book',
    title: 'Novel',
    author: 'Writer',
    wordCount: 20000,
    wordGoal: 40000,
    coverMode: 'image',
    coverImage: 'cover.jpg',
  });
  const context: CoverGoalsContext = {
    readMetadata: vi.fn(async () => metadata),
    // The application owns fresh closed-file merge or the current master-history command.
    updateMetadata: vi.fn(async (_id, patch) => {
      metadata = Metadata.parse({ ...metadata, ...patch });
    }),
    prompt: vi.fn(async () => answer),
    changed: vi.fn(async () => {}),
    hint: vi.fn(),
    t,
  };
  return {
    vm: new CoverGoalsViewModel(context),
    context,
    get metadata() {
      return metadata;
    },
    setMetadata(value: MetadataValue) {
      metadata = value;
    },
  };
}

it('source188 prompts with the saved goal and writes only the wordGoal patch before refreshing covers', async () => {
  const f = fixture();
  expect(await f.vm.set('book')).toBe('changed');
  expect(f.context.prompt).toHaveBeenCalledWith({
    title: 'Word count goal for “Novel”',
    help: 'e.g. 80000 — blank removes the goal',
    value: '40000',
  });
  expect(f.context.updateMetadata).toHaveBeenCalledWith('book', { wordGoal: 80000 });
  expect(f.metadata.coverImage).toBe('cover.jpg');
  expect(f.metadata.wordCount).toBe(20000);
  expect(f.context.changed).toHaveBeenCalledOnce();
});
it('blank removes the goal, while cancel does not write or refresh', async () => {
  const remove = fixture('  ');
  expect(await remove.vm.set('book')).toBe('changed');
  expect(remove.metadata.wordGoal).toBe(0);
  expect(coverGoalProgress(remove.metadata, t)).toEqual({
    visible: false,
    percent: 0,
    title: 'Novel',
  });
  const cancel = fixture(null);
  expect(await cancel.vm.set('book')).toBe('canceled');
  expect(cancel.context.updateMetadata).not.toHaveBeenCalled();
  expect(cancel.context.changed).not.toHaveBeenCalled();
});
it('validates complete nonnegative integer input instead of silently truncating author mistakes', async () => {
  expect(parseCoverGoal(' 080000 ')).toBe(80000);
  expect(parseCoverGoal('0')).toBe(0);
  for (const input of ['-1', 'NaN', '80k', '80000 words', '1.5', 'Infinity', '9007199254740992']) {
    expect(parseCoverGoal(input)).toBeNull();
    const f = fixture(input);
    expect(await f.vm.set('book')).toBe('invalid');
    expect(f.context.hint).toHaveBeenCalledWith(
      'Enter a whole number of words, or leave blank to remove the goal.',
    );
    expect(f.context.updateMetadata).not.toHaveBeenCalled();
  }
});
it('the patch preserves metadata changed while the author is answering the prompt', async () => {
  const f = fixture();
  f.context.prompt = async () => {
    f.setMetadata(
      Metadata.parse({
        ...f.metadata,
        title: 'Renamed elsewhere',
        wordCount: 30000,
        custom: { keep: true },
      }),
    );
    return '80000';
  };
  await f.vm.set('book');
  expect(f.metadata.title).toBe('Renamed elsewhere');
  expect(f.metadata.custom).toEqual({ keep: true });
  expect(coverGoalProgress(f.metadata, t)).toEqual({
    visible: true,
    percent: 38,
    title: 'Renamed elsewhere — 30000 / 80000 words',
  });
});
it('a failed durable metadata write does not announce refreshed progress', async () => {
  const f = fixture();
  f.context.updateMetadata = async () => {
    throw Error('DISK_FULL');
  };
  await expect(f.vm.set('book')).rejects.toThrow('DISK_FULL');
  expect(f.context.changed).not.toHaveBeenCalled();
  expect(f.metadata.wordGoal).toBe(40000);
});
it('an open book routes the explicit goal choice through its one author history without changing bookkeeping counts', async () => {
  const core = new BookCore(
    new JSDOM('').window.document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Novel', author: 'Writer', wordCount: 20000, wordGoal: 40000 },
      chapters: [{ id: 'chapter', html: '<p>Alpha.</p>' }],
      darlings: [],
    },
    null,
    '<p></p>',
    '<p></p>',
  );
  const f = fixture();
  f.context.readMetadata = async () => core.metadata;
  f.context.updateMetadata = async (_id, patch) => {
    core.updateMetadata(patch);
  };
  await f.vm.set('book');
  expect(core.metadata.wordGoal).toBe(80000);
  core.undo();
  expect(core.metadata.wordGoal).toBe(40000);
  core.redo();
  expect(core.metadata.wordGoal).toBe(80000);
  expect(core.metadata.wordCount).toBe(20000);
  expect(core.html('chapter')).toBe('<p>Alpha.</p>');
});
it('cover progress uses persisted wordCount, rounds to the source whole percent, and caps completed goals', () => {
  expect(coverGoalProgress({ title: 'Novel', wordCount: 25000, wordGoal: 80000 }, t).percent).toBe(
    31,
  );
  expect(coverGoalProgress({ title: 'Novel', wordCount: 99999, wordGoal: 80000 }, t).percent).toBe(
    100,
  );
  expect(coverGoalProgress({ title: 'Novel', wordGoal: 80000 }, t)).toEqual({
    visible: true,
    percent: 0,
    title: 'Novel — 0 / 80000 words',
  });
  expect(coverGoalProgress({ title: 'Novel', wordGoal: 0 }, t).visible).toBe(false);
  expect(coverGoalProgress({ title: 'Novel', wordGoal: -1 }, t).visible).toBe(false);
});
it('localized tooltip and prompt keep named title/count/goal substitutions', async () => {
  const f = fixture();
  const translate = vi.fn((key: string, args?: Record<string, string | number>) => t(key, args));
  f.context.t = translate;
  await f.vm.set('book');
  coverGoalProgress(f.metadata, translate);
  expect(translate).toHaveBeenCalledWith('{title} — {count} / {goal} words', {
    title: 'Novel',
    count: 20000,
    goal: 80000,
  });
});
