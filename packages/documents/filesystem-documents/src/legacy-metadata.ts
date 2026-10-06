import { constants } from 'node:fs';
/** Legacy metadata recovery from NEO 1.3.5 main.js:389–438. Source folders are read-only. */
import { lstat, open, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { z } from 'zod';
import { LifecycleError } from '@leafloom/editor-contracts';
const Metadata = z
  .object({
    id: z.string(),
    title: z.string(),
    author: z.string(),
    chapterOrder: z.array(z.string()),
  })
  .catchall(z.json());
type RecoveredMetadata = {
  metadata: z.infer<typeof Metadata>;
  damaged: { name: string; bytes: Uint8Array }[];
};
async function bytes(path: string): Promise<Uint8Array | null> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new LifecycleError('INVALID');
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (!(await file.stat()).isFile()) throw new LifecycleError('INVALID');
      return await file.readFile();
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
export async function readLegacyMetadata(source: string): Promise<RecoveredMetadata> {
  const damaged: RecoveredMetadata['damaged'] = [];
  for (const name of ['book.json', 'book.json.tmp', 'book.json.bak']) {
    const data = await bytes(join(source, name));
    if (!data) continue;
    try {
      return {
        metadata: Metadata.parse(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)),
        ),
        damaged,
      };
    } catch {
      damaged.push({ name, bytes: data });
    }
  }
  const directory = join(source, 'chapters');
  let stat;
  try {
    stat = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new LifecycleError('CORRUPT');
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new LifecycleError('INVALID');
  const chapterOrder = (await readdir(directory))
    .filter((name) => name.endsWith('.html'))
    .map((name) => name.slice(0, -5))
    .sort();
  if (!chapterOrder.length || chapterOrder.some((id) => !id || id === '.' || id === '..'))
    throw new LifecycleError('CORRUPT');
  const id = basename(source);
  if (!id || id === '.' || id === '..') throw new LifecycleError('INVALID');
  const now = new Date().toISOString();
  // The parent catalog is outside the selected book-folder grant. Never reach
  // outside that authority to guess title/author or manufacture manuscript text.
  return {
    metadata: {
      id,
      title: 'Untitled',
      author: 'Anonymous',
      chapterOrder,
      subtitle: '',
      series: '',
      wordGoal: 0,
      created: now,
      modified: now,
      tabNames: { notes: 'Notes', outline: 'Outline' },
    },
    damaged,
  };
}
