import assert from 'node:assert/strict';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import catalog from '../tests/neo-compat/native/acceptance-contracts.json' with { type: 'json' };
import {
  inspectExport,
  inspectChapterExport,
  inspectEdition,
} from '../tests/neo-compat/shared/document-io.mjs';
import { inspectPDFLayout } from '../tests/neo-compat/shared/pdf-layout.mjs';
import { inspectCoverEPUB, coverPNG } from '../tests/neo-compat/shared/io-cover-edge.mjs';
import { inspectCollection } from '../tests/neo-compat/native/collection-output.mjs';
import { Reviews } from '../packages/reviews/review-contracts/src/index.ts';
import { SourceBook } from '../packages/documents/document-contracts/src/index.ts';

export const nativeContracts = catalog.contracts;
export function nativeContract(id) {
  const matches = nativeContracts.filter((c) => c.contractId === id);
  return matches.length === 1 ? matches[0] : undefined;
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** Re-read every durable companion and its manifest; a receipt value is never the UUID oracle. */
export async function inspectDurableSnapshot(readBytes, snapshot) {
  assert.ok(snapshot && typeof snapshot.path === 'string', 'Durable snapshot missing');
  const manifestBytes = await readBytes(snapshot.path + '/manifest.json');
  assert.equal(hash(manifestBytes), snapshot.manifestSha256, 'Durable manifest changed');
  const manifest = JSON.parse(manifestBytes.toString());
  assert.deepEqual(manifest, { bookId: snapshot.bookId, files: snapshot.files });
  assert.deepEqual(Object.keys(snapshot.files).sort(), [
    'manuscript.json',
    'notes.html',
    'outline.html',
    'reviews.json',
  ]);
  const result = {};
  for (const name of Object.keys(snapshot.files)) {
    const actual = await readBytes(snapshot.path + '/' + name);
    assert.equal(hash(actual), snapshot.files[name].sha256, 'Durable companion changed: ' + name);
    assert.equal(actual.length, snapshot.files[name].bytes);
    result[name] = actual;
  }
  return result;
}
/** Artifacts are read beneath their declared evidence directory, including symlink resolution. */
export async function inspectNativeArtifacts(contract, receipt, options) {
  const io = receipt[contract.section];
  const evidenceRoot = await realpath(path.join(options.root, '.leafloom/evidence'));
  const base = await realpath(io.artifacts);
  assert.ok(
    base.startsWith(evidenceRoot + path.sep),
    'Native artifact directory escapes evidence root',
  );
  const bytes = async (name) => {
    assert.ok(
      typeof name === 'string' && !path.isAbsolute(name) && !name.split(/[\\/]/).includes('..'),
      'Unsafe relative artifact name',
    );
    const resolved = await realpath(path.join(base, name));
    assert.ok(resolved.startsWith(base + path.sep), 'Artifact escapes declared evidence directory');
    return readFile(resolved);
  };
  const row = io.evidence.find((r) => r.id === contract.id && r.title === contract.title);
  const p = contract.parser;
  if (['export', 'chapter', 'edition', 'pdf-layout', 'collection'].includes(p.kind)) {
    const actual = await bytes(p.file);
    assert.equal(
      hash(actual),
      row.artifact?.sha256,
      'Retained artifact differs from executed receipt',
    );
    if (p.kind === 'collection')
      assert.equal(row.artifactFile, p.file, 'Collection artifact path differs');
    if (p.kind === 'export') return inspectExport(p.format, actual);
    if (p.kind === 'chapter') return inspectChapterExport(p.format, actual);
    if (p.kind === 'edition') return inspectEdition(p.format, actual);
    if (p.kind === 'pdf-layout') return inspectPDFLayout(actual);
    return inspectCollection(p.format, actual, { title: p.title, passages: p.passages });
  }
  if (p.kind === 'cover-epub') {
    const names = [
      'picked-edition.epub',
      'picked-edition-repeat.epub',
      'picked-edition-reopened.epub',
    ];
    const keys = ['first', 'second', 'third'];
    const parsed = await Promise.all(
      names.map(async (name, i) => {
        const actual = await bytes(name);
        assert.equal(hash(actual), row.artifacts?.[keys[i]]?.sha256);
        return inspectCoverEPUB(actual, coverPNG);
      }),
    );
    assert.equal(
      new Set(parsed.map((p) => p.identifier)).size,
      1,
      'UUID changed across actual repeated/reopened EPUBs',
    );
    const snapshots = row.durableArtifacts?.snapshots;
    assert.equal(snapshots?.length, 3, 'Each repeated/reopened EPUB requires a durable snapshot');
    for (let i = 0; i < 3; i++) {
      const files = await inspectDurableSnapshot(bytes, snapshots[i]);
      const book = SourceBook.parse(JSON.parse(files['manuscript.json'].toString()));
      const reviews = Reviews.parse(JSON.parse(files['reviews.json'].toString()));
      assert.equal(book.metadata.id, snapshots[i].bookId);
      assert.equal(reviews.bookId, book.metadata.id);
      assert.equal(parsed[i].identifier, 'urn:uuid:' + book.metadata.uuid);
    }
    const source = row.durableArtifacts?.sourceImage;
    assert.equal(hash(await bytes(source.path)), source.sha256);
    assert.deepEqual(await bytes(source.path), coverPNG);
    return parsed;
  }
  if (p.kind === 'denied-write' || p.kind === 'cancel') {
    const denial = nativeContract('document:denied-write');
    const matches = io.evidence.filter((r) => r.id === denial.id && r.title === denial.title);
    assert.equal(
      matches.length,
      1,
      'Cancellation requires the independently reviewed same-run denied-write companion',
    );
    assert.deepEqual(matches[0].driverActions, denial.driverActions);
    assert.deepEqual(matches[0].assertions, denial.assertions);
    assert.equal(
      hash(await bytes('preserved-original-destination.txt')),
      hash(Buffer.from('Original destination must remain exact.')),
    );
    assert.equal(
      matches[0].destination?.sha256,
      hash(Buffer.from('Original destination must remain exact.')),
    );
    return {
      destinationPreserved: true,
      qualification: 'Finite destination/cancel outcome; no physical OS picker claim',
    };
  }
  if (p.kind === 'folder') {
    const hashes = async (folder) => {
      const out = {};
      async function walk(dir) {
        for (const item of await readdir(dir, { withFileTypes: true })) {
          const name = path.join(dir, item.name);
          if (item.isDirectory()) await walk(name);
          else {
            const relative = path.relative(base, name);
            out[path.relative(folder, name)] = hash(await bytes(relative));
          }
        }
      }
      await walk(folder);
      return out;
    };
    assert.deepEqual(
      await hashes(path.join(base, 'original-aside')),
      io.protectedOriginalHashes,
      'Original aside bytes changed',
    );
    assert.deepEqual(
      await hashes(path.join(base, 'incoming-final')),
      io.finalFileHashes,
      'Final companion bytes changed',
    );
    assert.deepEqual(
      JSON.parse((await bytes('protected-original-hashes.json')).toString()),
      io.protectedOriginalHashes,
    );
    assert.equal(
      hash(await bytes('fixture-parser.mjs')),
      io.fixtureParserSha256,
      'Fixture parser changed',
    );
    const before = SourceBook.parse(
      JSON.parse((await bytes('original-aside/manuscript.json')).toString()),
    );
    const after = SourceBook.parse(
      JSON.parse((await bytes('incoming-final/manuscript.json')).toString()),
    );
    assert.deepEqual(
      Object.keys(after.metadata).sort(),
      Object.keys(before.metadata).sort(),
      'Metadata fields lost',
    );
    for (const key of Object.keys(before.metadata).filter(
      (k) => !['modified', 'dailyCounts', 'wordCount', 'lastPosition'].includes(k),
    ))
      assert.deepEqual(after.metadata[key], before.metadata[key], 'Metadata changed: ' + key);
    const oldReviews = Reviews.parse(
      JSON.parse((await bytes('original-aside/reviews.json')).toString()),
    );
    const newReviews = Reviews.parse(
      JSON.parse((await bytes('incoming-final/reviews.json')).toString()),
    );
    assert.equal(oldReviews.bookId, before.metadata.id);
    assert.equal(newReviews.bookId, after.metadata.id);
    if ('version' in before) assert.equal(oldReviews.version, before.version);
    if ('version' in after) assert.equal(newReviews.version, after.version);
    assert.deepEqual(newReviews.references, oldReviews.references);
    assert.deepEqual(newReviews.items, oldReviews.items);
    assert.equal(after.metadata.id, before.metadata.id);
    assert.deepEqual(
      after.chapters.map((c) => c.id),
      before.chapters.map((c) => c.id),
    );
    assert.equal(
      after.chapters[0].html,
      before.chapters[0].html + '<p><b>Remote incoming. X</b></p><p><i>Later remote. Y</i></p>',
    );
    assert.deepEqual(
      after.chapters.slice(1).map((c) => c.html),
      before.chapters.slice(1).map((c) => c.html),
    );
    assert.deepEqual(after.darlings, before.darlings);
    assert.deepEqual(after.metadata.stickies, before.metadata.stickies);
    for (const file of ['notes.html', 'outline.html'])
      assert.deepEqual(
        await bytes('original-aside/' + file),
        await bytes('incoming-final/' + file),
      );
    return {
      originalFiles: Object.keys(io.protectedOriginalHashes).length,
      finalFiles: Object.keys(io.finalFileHashes).length,
    };
  }
  throw Error('No independent parser for native contract');
}
