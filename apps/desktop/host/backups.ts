import { mkdir, readdir, readFile, lstat, open, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';

export type BackupReceipt = { name: string; created: boolean; files: number; omitted: number };
// NEO dailyBackup: UTC day, readable files retained, latest fourteen archives.
export class BackupProvider {
  constructor(
    readonly root: string,
    private clock = () => new Date(),
    private read = readFile,
  ) {}
  async list() {
    const directory = join(this.root, 'Backups');
    try {
      if ((await lstat(directory)).isSymbolicLink()) throw Error('INVALID');
      const names = (await readdir(directory))
        .filter((name) => /^leafloom-backup-\d{4}-\d{2}-\d{2}\.zip$/.test(name))
        .sort()
        .reverse();
      return Promise.all(
        names.map(async (name) => {
          const metadata = await lstat(join(directory, name));
          if (!metadata.isFile() || metadata.isSymbolicLink()) throw Error('INVALID');
          return { name, bytes: metadata.size, date: name.match(/\d{4}-\d{2}-\d{2}/)![0] };
        }),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  async create(): Promise<BackupReceipt> {
    const directory = join(this.root, 'Backups'),
      name = `leafloom-backup-${this.clock().toISOString().slice(0, 10)}.zip`;
    await mkdir(directory, { recursive: true });
    if ((await lstat(directory)).isSymbolicLink()) throw Error('INVALID');
    if ((await this.list()).some((item) => item.name === name))
      return { name, created: false, files: 0, omitted: 0 };
    const zip = new JSZip(),
      missed: string[] = [];
    let files = 0;
    const walk = async (directory: string, relative: string) => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        missed.push(
          `${relative || '.'} (${(error as NodeJS.ErrnoException).code ?? 'UNAVAILABLE'})`,
        );
        return;
      }
      for (const entry of entries) {
        if (
          (!relative && ['Backups', 'Exports'].includes(entry.name)) ||
          entry.name === '.DS_Store' ||
          /^\..+\.icloud$/.test(entry.name) ||
          ['.leafloom-fixture', '.leafloom-host.lock', '.writer.lock', '.writer-recovery', '.profile'].includes(
            entry.name,
          ) ||
          /\.(?:tmp|bak\.tmp)$/.test(entry.name) ||
          entry.name.startsWith('.create-') ||
          entry.name.startsWith('.import-')
        )
          continue;
        const path = join(directory, entry.name),
          rel = relative ? relative + '/' + entry.name : entry.name;
        try {
          const metadata = await lstat(path);
          if (metadata.isSymbolicLink()) {
            missed.push(`${rel} (SYMLINK)`);
            continue;
          }
          if (metadata.isDirectory()) await walk(path, rel);
          else if (metadata.isFile()) {
            zip.file(rel, await this.read(path));
            files++;
          }
        } catch (error) {
          missed.push(`${rel} (${(error as NodeJS.ErrnoException).code ?? 'UNAVAILABLE'})`);
        }
      }
    };
    await walk(this.root, '');
    if (missed.length) zip.file('_left-out-of-this-backup.txt', missed.join('\n') + '\n');
    const temporary = join(directory, '.' + name + '.' + randomUUID() + '.tmp');
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
      await file.sync();
    } catch (error) {
      await file.close();
      await unlink(temporary);
      throw error;
    }
    await file.close();
    try {
      try {
        await link(temporary, join(directory, name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          return { name, created: false, files: 0, omitted: 0 };
        throw error;
      }
      const folder = await open(directory, 'r');
      try {
        await folder.sync();
      } finally {
        await folder.close();
      }
      for (const stale of (await this.list()).slice(14)) await unlink(join(directory, stale.name));
      const folderAfterPrune = await open(directory, 'r');
      try {
        await folderAfterPrune.sync();
      } finally {
        await folderAfterPrune.close();
      }
      return { name, created: true, files, omitted: missed.length };
    } finally {
      try {
        await unlink(temporary);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
}
