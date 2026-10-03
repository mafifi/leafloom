import { it, expect, vi } from 'vitest';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibraryHost } from './library';
import type { DocumentChange } from '@leafloom/desktop-host';
import type { Opened } from '@leafloom/editor-contracts';
it('the real filesystem watcher reports restored unchanged bytes after an unreadable book without inventing new versions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-read-restoration-'));
  await writeFile(join(root, '.leafloom-fixture'), '');
  const host = new LibraryHost(root);
  let file = '';
  try {
    await host.initialize();
    const metadata = (await host.request('createBook', {
      title: 'Safe reading',
      author: 'Writer',
    })) as { id: string };
    const opened = (await host.request('openBook', { bookId: metadata.id })) as Opened;
    file = join(root, metadata.id, 'manuscript.json');
    const original = await readFile(file);
    await chmod(file, 0);
    await expect(readFile(file)).rejects.toThrow();
    await vi.waitFor(async () => {
      const changes = (await host.request('consumeDocumentChanges', {})) as DocumentChange[];
      expect(
        changes.some((change) => change.bookId === metadata.id && change.code === 'UNAVAILABLE'),
      ).toBe(true);
    });
    await chmod(file, 0o644);
    expect(await readFile(file)).toEqual(original);
    await vi.waitFor(async () => {
      const changes = (await host.request('consumeDocumentChanges', {})) as DocumentChange[];
      expect(changes).toContainEqual({ bookId: metadata.id, versions: opened.versions });
    });
  } finally {
    if (file) await chmod(file, 0o644);
    await host.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});
