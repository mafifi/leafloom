import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { retainBookSnapshot } from '../neo-compat/native/document-io.mjs';

test('native capture retains all actual companion bytes and a hash-bound manifest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'leafloom-native-snapshot-'));
  try {
    const fixture = path.join(root, 'fixture'),
      artifacts = path.join(root, 'artifacts'),
      bookId = 'synthetic';
    await mkdir(path.join(fixture, bookId), { recursive: true });
    const files = {
      'manuscript.json': '{"title":"東京"}',
      'reviews.json': '{"items":[]}',
      'notes.html': '<p><b>Note</b></p>',
      'outline.html': '<p>Outline</p>',
    };
    for (const [name, text] of Object.entries(files))
      await writeFile(path.join(fixture, bookId, name), text);
    const captured = await retainBookSnapshot({
      fixture,
      artifacts,
      label: 'imports/synthetic',
      bookId,
    });
    const manifest = await readFile(path.join(artifacts, captured.path, 'manifest.json'));
    assert.equal(captured.manifestSha256, createHash('sha256').update(manifest).digest('hex'));
    assert.deepEqual(JSON.parse(manifest.toString()), { bookId, files: captured.files });
    for (const [name, text] of Object.entries(files)) {
      const bytes = await readFile(path.join(artifacts, captured.path, name));
      assert.equal(bytes.toString(), text);
      assert.deepEqual(captured.files[name], {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      });
    }
    await assert.rejects(() =>
      retainBookSnapshot({ fixture, artifacts, label: '../escape', bookId }),
    );
    await assert.rejects(() =>
      retainBookSnapshot({ fixture, artifacts, label: 'missing', bookId: 'absent' }),
    );
    await assert.rejects(() =>
      retainBookSnapshot({ fixture, artifacts, label: 'escape-id', bookId: '..' }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
