import assert from 'node:assert/strict';
import { inspectBackupArtifacts } from './native-backup-artifacts.mjs';
import { inspectUpdaterArtifacts } from './native-updater-artifacts.mjs';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createHash } from 'node:crypto';
import catalog from '../tests/neo-compat/native/acceptance-contracts.json' with { type: 'json' };
import {
  inspectExport,
  inspectChapterExport,
  inspectEdition,
  importFiles,
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
  const row =
    contract.section === 'quitRestart' || contract.section === 'updater'
      ? io
      : io.evidence.find((r) => r.id === contract.id && r.title === contract.title);
  const p = contract.parser;
  if (p.kind === 'startup-backup')
    return inspectBackupArtifacts(p, row, bytes, receipt.artifactBinding, { base });
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
  const snapshotBook = async (snapshot) => {
    const files = await inspectDurableSnapshot(bytes, snapshot);
    const book = SourceBook.parse(JSON.parse(files['manuscript.json'].toString()));
    const reviews = Reviews.parse(JSON.parse(files['reviews.json'].toString()));
    assert.equal(book.metadata.id, snapshot.bookId);
    assert.equal(reviews.bookId, snapshot.bookId);
    if ('version' in book) assert.equal(reviews.version, book.version);
    return { book, files };
  };
  const inputBytes = async (input) => {
    const value = await bytes(input.path);
    assert.equal(hash(value), input.sha256);
    assert.equal(value.length, input.bytes);
    return value;
  };
  const paragraphs = (book) =>
    book.chapters.map((chapter) =>
      [...new JSDOM(chapter.html).window.document.querySelectorAll('p')].map(
        (el) => el.textContent,
      ),
    );
  if (p.kind === 'imports') {
    const expected = await importFiles(),
      observed = row.durableArtifacts;
    assert.equal(observed?.length, 3);
    for (let i = 0; i < 3; i++) {
      const item = observed[i],
        { book } = await snapshotBook(item.snapshot),
        input = await inputBytes(item.input);
      assert.equal(book.metadata.title, expected[i].title);
      assert.equal(item.bookId, book.metadata.id);
      assert.deepEqual(paragraphs(book), expected[i].paragraphs);
      if (i < 2) assert.deepEqual(input, expected[i].bytes);
      else {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(input);
        assert.ok((await zip.file('word/styles.xml').async('string')).includes('Inherited'));
        const dom = new JSDOM(book.chapters[0].html).window.document;
        assert.equal(dom.querySelector('i,em')?.textContent, 'café ');
        assert.equal(dom.querySelector('b,strong')?.textContent, 'bold');
      }
      if (i === 0) {
        const dom = new JSDOM(book.chapters[0].html).window.document;
        assert.equal(dom.querySelector('b,strong')?.textContent, 'bold');
        assert.equal(dom.querySelector('i,em')?.textContent, 'Verse');
      }
    }
    assert.equal(new Set(observed.map((item) => item.bookId)).size, 3);
    return { imported: 3 };
  }
  if (p.kind === 'malformed-import' || p.kind === 'spanish-import') {
    const data = row.durableArtifacts,
      { book } = await snapshotBook(data.snapshot);
    if (p.kind === 'malformed-import') {
      assert.equal(data.inputs.length, 2);
      assert.equal((await inputBytes(data.inputs[0])).toString(), 'not a zip');
      assert.equal((await inputBytes(data.inputs[1])).toString(), 'Good café prose survives.');
      assert.equal(book.metadata.title, 'Survivor');
      assert.deepEqual(paragraphs(book), [['Good café prose survives.']]);
    } else {
      assert.equal(
        (await inputBytes(data.input)).toString(),
        '-Hola - dijo -.\n\n"Literal" ... -- prose.',
      );
      assert.equal(book.metadata.title, 'Dialogue');
      assert.deepEqual(paragraphs(book), [['—Hola — dijo —.', '"Literal" ... -- prose.']]);
    }
    return { title: book.metadata.title };
  }
  if (p.kind === 'cover-menu') {
    const data = row.durableArtifacts;
    assert.deepEqual(await inputBytes(data.images[0]), coverPNG);
    const replacement = await inputBytes(data.images[1]);
    assert.deepEqual(
      replacement,
      await readFile(
        path.join(options.root, 'apps/desktop/src-tauri/icons/Leafloom.iconset/icon_16x16.png'),
      ),
    );
    let initial;
    for (const name of ['before', 'set', 'replace', 'remove']) {
      const state = data.states[name],
        { book } = await snapshotBook(state);
      if (!initial) initial = book;
      assert.deepEqual(
        book.chapters.map((c) => ({ id: c.id, html: c.html })),
        initial.chapters.map((c) => ({ id: c.id, html: c.html })),
      );
      assert.equal(book.metadata.title, initial.metadata.title);
      assert.equal(book.metadata.author, initial.metadata.author);
      const labels = state.menu;
      assert.ok(Array.isArray(labels));
      const custom = name === 'set' || name === 'replace';
      assert.equal(
        labels.some((v) => v.includes('Set cover art')),
        !custom,
      );
      assert.equal(
        labels.some((v) => v.includes('Replace cover art')),
        custom,
      );
      assert.equal(
        labels.some((v) => v.includes('Remove cover art')),
        custom,
      );
      const cover = state.cover ? JSON.parse((await inputBytes(state.cover)).toString()) : null;
      if (custom) {
        assert.equal(cover.mime, 'image/png');
        assert.deepEqual(
          Buffer.from(cover.data, 'base64'),
          name === 'set' ? coverPNG : replacement,
        );
      } else {
        assert.equal(cover, null);
        assert.ok(!book.metadata.coverImage);
      }
    }
    return { states: 4 };
  }
  if (p.kind === 'signed-updater') {
    const normalQuit = await inspectNativeArtifacts(
      nativeContract('lifecycle:normal-quit'),
      receipt,
      options,
    );
    const signedUpdate = await inspectUpdaterArtifacts(bytes, io);
    return { normalQuit, signedUpdate };
  }
  if (p.kind === 'normal-quit') {
    const q = io;
    for (const field of [
      'firstProcessId',
      'restartedProcessId',
      'firstHostProcessId',
      'restartedHostProcessId',
    ])
      assert.ok(Number.isSafeInteger(q[field]) && q[field] > 0);
    assert.equal(q.quitCommand, 'quitApp');
    assert.equal(q.processExited, true);
    assert.equal(q.exitCode, 0);
    assert.equal(q.unsavedAtQuit, true);
    assert.equal(q.quitBeforeDebounce, true);
    assert.ok(q.inputToQuitMs >= 0 && q.inputToQuitMs < 400);
    assert.notEqual(q.firstProcessId, q.restartedProcessId);
    assert.notEqual(q.firstHostProcessId, q.restartedHostProcessId);
    assert.deepEqual(JSON.parse((await bytes('quit.json')).toString()), q);
    const phases = {};
    for (const phase of ['before', 'after']) {
      phases[phase] = {};
      for (const name of ['manuscript.json', 'reviews.json', 'notes.html', 'outline.html']) {
        const actual = await bytes(phase + '/' + name);
        assert.equal(hash(actual), q.files[name][phase + 'Sha256']);
        phases[phase][name] = actual;
      }
    }
    const before = SourceBook.parse(JSON.parse(phases.before['manuscript.json'])),
      after = SourceBook.parse(JSON.parse(phases.after['manuscript.json']));
    assert.equal(after.metadata.id, q.bookId);
    assert.equal(before.metadata.id, q.bookId);
    assert.equal(after.chapters[0].id, 'quit-prose');
    assert.equal(after.chapters[0].html, '<p>Baseline prose. Fresh quit tail.</p>');
    assert.equal(before.chapters[0].html, '<p>Baseline prose.</p>');
    assert.equal(q.reopenedText, 'Baseline prose. Fresh quit tail.');
    for (const key of Object.keys(before.metadata).filter(
      (k) => !['modified', 'wordCount', 'dailyCounts', 'lastPosition'].includes(k),
    ))
      assert.deepEqual(after.metadata[key], before.metadata[key]);
    assert.deepEqual(
      after.chapters.slice(1).map((c) => ({ id: c.id, html: c.html, passages: c.passages })),
      before.chapters.slice(1).map((c) => ({ id: c.id, html: c.html, passages: c.passages })),
    );
    assert.deepEqual(after.darlings, before.darlings);
    const a = Reviews.parse(JSON.parse(phases.after['reviews.json'])),
      b = Reviews.parse(JSON.parse(phases.before['reviews.json']));
    assert.equal(a.version, after.version);
    assert.deepEqual(a.references, b.references);
    assert.deepEqual(a.items, b.items);
    for (const name of ['notes.html', 'outline.html'])
      assert.deepEqual(phases.before[name], phases.after[name]);
    return { files: 8, normalQuit: true };
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
