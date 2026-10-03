import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createFileStore } from './file-store';
import { createFixture } from '../fixture';

describe('isolated host filesystem provider', () => {
 it('round-trips canonical identities, inline marks and placeholder metadata through a real disk file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'neo-file-store-'));
  try {
   const store = createFileStore(path.join(dir, 'nested', 'book.json')); expect(await store.load()).toBeNull();
   const document = createFixture(); document.chapters[0].blocks[0].runs.push({ text: 'Ada', bold: true, italic: true, placeholder: 'protagonist' });
   await store.save(document); expect(await createFileStore(path.join(dir, 'nested', 'book.json')).load()).toEqual(document);
   const newer = structuredClone(document); newer.revision = 2;
   await Promise.all([store.save(document), store.save(newer)]); expect(await store.load()).toEqual(newer);
   expect(JSON.parse(await readFile(path.join(dir, 'nested', 'book.json'), 'utf8'))).toEqual(newer);
  } finally { await rm(dir, { recursive: true, force: true }); }
 });
 it('rejects malformed and colliding identities rather than accepting corrupt persisted state', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'neo-file-store-invalid-'));
  try {
   const file = path.join(dir, 'book.json'), store = createFileStore(file), document = createFixture();
   document.chapters[1].blocks[0].id = document.chapters[0].blocks[0].id;
   expect(() => store.save(document)).toThrow('Document identities must be unique');
   await writeFile(file, '{broken'); await expect(store.load()).rejects.toThrow();
   await writeFile(file, JSON.stringify(document)); await expect(store.load()).rejects.toThrow('Document identities must be unique');
  } finally { await rm(dir, { recursive: true, force: true }); }
 });
});
