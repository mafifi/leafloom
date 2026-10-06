import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, utimes, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LibraryHost } from './library';
import { completeFirstRun, createLibrary } from '../../../packages/library/src/index';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-library-recovery-'));
  const host = new LibraryHost(root);
  await host.initialize();
  return {
    root,
    host,
    async close() {
      await host.shutdown();
      await rm(root, { recursive: true, force: true });
    },
  };
}

it('an interrupted complete temporary library restores author preferences and unknown values before the older backup', async () => {
  const f = await fixture();
  try {
    const previous = completeFirstRun(createLibrary(), 'Writer');
    const latest = {
      ...previous,
      scriptContact: 'Contact block',
      customPreference: { keep: true },
    };
    await writeFile(join(f.root, 'library.json'), '{broken');
    await writeFile(join(f.root, 'library.json.bak'), JSON.stringify(previous));
    await writeFile(join(f.root, 'library.json.tmp'), JSON.stringify(latest));
    expect(await f.host.request('readLibrary', {})).toEqual(latest);
    expect(JSON.parse(await readFile(join(f.root, 'library.json'), 'utf8'))).toEqual(latest);
  } finally {
    await f.close();
  }
});

it('ordinary library writes retain a readable previous copy and recover it after main JSON corruption', async () => {
  const f = await fixture();
  try {
    const previous = completeFirstRun(createLibrary(), 'Writer');
    await f.host.request('writeLibrary', { library: previous });
    await f.host.request('writeLibrary', { library: { ...previous, pageTheme: 'night' } });
    await writeFile(join(f.root, 'library.json'), '{broken');
    expect(await f.host.request('readLibrary', {})).toEqual(previous);
  } finally {
    await f.close();
  }
});

it('a missing library with no spare recovers every readable book onto a durable shelf', async () => {
  const f = await fixture();
  try {
    const books = [];
    for (const title of ['First book', 'Second book'])
      books.push(
        (await f.host.request('createBook', { title, author: 'Writer' })) as { id: string },
      );
    const library = (await f.host.request('readLibrary', {})) as {
      firstRunDone: boolean;
      shelves: { bookIds: string[] }[];
    };
    expect(library.firstRunDone).toBe(true);
    expect(library.shelves.flatMap((s) => s.bookIds).sort()).toEqual(books.map((b) => b.id).sort());
    expect(JSON.parse(await readFile(join(f.root, 'library.json'), 'utf8'))).toEqual(library);
  } finally {
    await f.close();
  }
});

it('a malformed library without a valid copy or readable books remains recoverable rather than overwritten', async () => {
  const f = await fixture();
  try {
    const original = '{unfinished author preferences';
    await writeFile(join(f.root, 'library.json'), original);
    await writeFile(join(f.root, 'library.json.tmp'), '{also unfinished');
    await expect(f.host.request('readLibrary', {})).rejects.toThrow('CORRUPT');
    expect(await readFile(join(f.root, 'library.json'), 'utf8')).toBe(original);
  } finally {
    await f.close();
  }
});

it('UUID temporary copies recover by write time rather than filename order', async () => {
  const f = await fixture();
  try {
    const previous = completeFirstRun(createLibrary(), 'Writer');
    const latest = { ...previous, scriptContact: 'Latest contact' };
    await writeFile(join(f.root, 'library.json'), '{broken');
    const old = join(f.root, 'library.json.00000000-0000-4000-8000-000000000000.tmp');
    const newest = join(f.root, 'library.json.ffffffff-ffff-4fff-8fff-ffffffffffff.tmp');
    await writeFile(old, JSON.stringify(previous));
    await writeFile(newest, JSON.stringify(latest));
    await utimes(old, 100, 100);
    await utimes(newest, 200, 200);
    expect(await f.host.request('readLibrary', {})).toEqual(latest);
  } finally {
    await f.close();
  }
});

it('recovery refuses a symlink spare and leaves the original library bytes intact', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'library.json'), '{broken');
    await writeFile(
      join(f.root, 'outside.json'),
      JSON.stringify(completeFirstRun(createLibrary(), 'Writer')),
    );
    await symlink(join(f.root, 'outside.json'), join(f.root, 'library.json.bak'));
    await expect(f.host.request('readLibrary', {})).rejects.toThrow('INVALID');
    expect(await readFile(join(f.root, 'library.json'), 'utf8')).toBe('{broken');
  } finally {
    await f.close();
  }
});
it('recovery cannot overwrite a newer concurrent acknowledged library write', async () => {
  const { readLibraryJSON, writeLibraryJSON } = await import('./library-json-recovery');
  const root = await mkdtemp(join(tmpdir(), 'leafloom-library-interleaving-'));
  let resume!: () => void, paused!: () => void;
  const gate = new Promise<void>((resolve) => {
      resume = resolve;
    }),
    entered = new Promise<void>((resolve) => {
      paused = resolve;
    });
  const files = {
    root,
    async checked(path: string) {
      if (path === join(root, 'library.json.tmp')) {
        paused();
        await gate;
      }
      return path;
    },
    async atomic(path: string, bytes: string | Uint8Array) {
      await writeFile(path, bytes);
    },
    async books() {
      return [];
    },
  };
  try {
    await writeFile(join(root, 'library.json'), '{unfinished');
    await writeFile(
      join(root, 'library.json.tmp'),
      JSON.stringify({ authorName: 'Older writer', opaque: { keep: 'old' } }),
    );
    const reading = readLibraryJSON(files);
    await entered;
    const latest = { authorName: 'Latest writer', opaque: { keep: 'new' } };
    const writing = writeLibraryJSON(files, latest);
    // Release a queued recovery after an overlapping writer has had a chance to finish.
    // Correct serialization queues that writer; the previous implementation acknowledges it and then replaces its bytes.
    await Promise.race([writing, new Promise<void>((resolve) => setTimeout(resolve, 100))]);
    resume();
    await Promise.all([reading, writing]);
    expect(JSON.parse(await readFile(join(root, 'library.json'), 'utf8'))).toEqual(latest);
  } finally {
    resume();
    await rm(root, { recursive: true, force: true });
  }
});
