import { constants } from 'node:fs';
import { open, readdir, lstat, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { completeFirstRun, createLibrary } from '@leafloom/library';
import { LifecycleError } from '@leafloom/editor-contracts';
import { z } from 'zod';

const LibraryJSON = z.record(z.string(), z.json());
type LibraryJSONValue = z.infer<typeof LibraryJSON>;

type RecoveryFiles = {
  root: string;
  checked(path: string): Promise<string>;
  atomic(path: string, bytes: string | Uint8Array): Promise<void>;
};

async function bytes(files: RecoveryFiles, path: string): Promise<Uint8Array | null> {
  try {
    const file = await open(
      await files.checked(path),
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
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

function parse(value: Uint8Array | null): LibraryJSONValue | null {
  if (!value) return null;
  try {
    return LibraryJSON.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value)),
    );
  } catch {
    return null;
  }
}

// Library metadata is one document. Serialize its async recovery/read/write
// operations, so a restored spare cannot replace a newer acknowledged write.
const libraryOperations = new Map<string, Promise<void>>();
function ordered<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const key = resolve(root),
    previous = libraryOperations.get(key) ?? Promise.resolve();
  const result = previous.then(operation);
  const tail = result.then(
    () => {},
    () => {},
  );
  libraryOperations.set(key, tail);
  void tail.then(() => {
    if (libraryOperations.get(key) === tail) libraryOperations.delete(key);
  });
  return result;
}
type RecoveryLibraryFiles = RecoveryFiles & { books(): Promise<{ id: string; author: string }[]> };
export function readLibraryJSON(files: RecoveryLibraryFiles): Promise<LibraryJSONValue | null> {
  return ordered(files.root, () => readLibraryValue(files));
}
export function writeLibraryJSON(files: RecoveryFiles, value: LibraryJSONValue): Promise<void> {
  return ordered(files.root, () => writeLibraryValue(files, value));
}

/** Recover only complete library values. Never manufacture missing manuscript text. */
async function readLibraryValue(files: RecoveryLibraryFiles): Promise<LibraryJSONValue | null> {
  const path = join(files.root, 'library.json');
  const original = await bytes(files, path);
  const current = parse(original);
  if (current) return current;
  const names = (await readdir(await files.checked(files.root))).filter(
    (name) => /^library\.json\.[0-9a-f-]{36}\.tmp$/.test(name) || name === 'library.json.bak',
  );
  const spares = await Promise.all(
    names.map(async (name) => {
      const modified = (await lstat(await files.checked(join(files.root, name)))).mtimeMs;
      return { name, modified };
    }),
  );
  spares.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
  for (const name of ['library.json.tmp', ...spares.map((spare) => spare.name)]) {
    const candidate = parse(await bytes(files, join(files.root, name)));
    if (!candidate) continue;
    if (original) await files.atomic(path + '.corrupt.' + randomUUID(), original);
    await files.atomic(path, JSON.stringify(candidate, null, 2) + '\n');
    if (name !== 'library.json.bak') await rm(join(files.root, name), { force: true });
    return candidate;
  }
  const books = await files.books();
  if (!books.length) {
    if (original) throw new LifecycleError('CORRUPT');
    return null;
  }
  const recovered = completeFirstRun(createLibrary(), books[0].author);
  recovered.shelves[0].name = 'Works in Progress';
  recovered.shelves[0].bookIds = books.map((book) => book.id);
  if (original) await files.atomic(path + '.corrupt.' + randomUUID(), original);
  await files.atomic(path, JSON.stringify(recovered, null, 2) + '\n');
  return LibraryJSON.parse(recovered);
}

/** Retain a schema-valid prior value before the existing fsync/replace protocol. */
async function writeLibraryValue(files: RecoveryFiles, value: LibraryJSONValue): Promise<void> {
  const path = join(files.root, 'library.json');
  const previous = await bytes(files, path);
  if (parse(previous)) await files.atomic(path + '.bak', previous!);
  await files.atomic(path, JSON.stringify(value, null, 2) + '\n');
}
