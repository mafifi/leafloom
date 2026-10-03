import { it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { BackupProvider } from './backups.ts';
it('daily backup retains whole readable files, reports omitted sources, skips private/transient files and keeps fourteen UTC dates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-backup-'));
  try {
    await mkdir(join(root, 'book-test'));
    await writeFile(join(root, 'book-test/manuscript.json'), 'author words Καλημέρα');
    await writeFile(join(root, 'book-test/blocked.html'), 'blocked words');
    await writeFile(join(root, '.writer.lock'), 'private lock');
    await writeFile(join(root, '.leafloom-fixture'), '');
    await mkdir(join(root, 'Exports'));
    await writeFile(join(root, 'Exports/old.pdf'), 'export');
    await symlink(join(root, 'book-test/manuscript.json'), join(root, 'foreign'));
    const reader: typeof readFile = ((path: Parameters<typeof readFile>[0], ...args: unknown[]) => {
      if (String(path).endsWith('blocked.html'))
        return Promise.reject(Object.assign(Error(), { code: 'EACCES' }));
      return readFile(path, ...(args as []));
    }) as typeof readFile;
    const clock = () => new Date('2026-10-02T23:59:59.000Z');
    const provider = new BackupProvider(root, clock, reader);
    const result = await provider.create();
    expect(result.omitted).toBe(2);
    const zip = await JSZip.loadAsync(await readFile(join(root, 'Backups', result.name)));
    expect(await zip.file('book-test/manuscript.json')!.async('string')).toBe(
      'author words Καλημέρα',
    );
    expect(await zip.file('_left-out-of-this-backup.txt')!.async('string')).toContain(
      'blocked.html (EACCES)',
    );
    expect(zip.file('.writer.lock')).toBeNull();
    expect(zip.file('Exports/old.pdf')).toBeNull();
    expect((await provider.create()).created).toBe(false);
    for (let day = 1; day <= 16; day++)
      await new BackupProvider(
        root,
        () => new Date(`2026-10-${String(day).padStart(2, '0')}T00:00:00Z`),
      ).create();
    const archives = await provider.list();
    expect(archives).toHaveLength(14);
    expect(archives[0].date).toBe('2026-10-16');
    expect(archives.at(-1)?.date).toBe('2026-10-03');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
