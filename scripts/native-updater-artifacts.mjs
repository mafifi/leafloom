import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { UpdateStatus } from '../packages/host/desktop-host/src/updates.ts';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function base64(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^[A-Za-z0-9+/]+={0,2}$/);
  const result = Buffer.from(value, 'base64');
  assert.equal(result.toString('base64'), value);
  return result;
}
/** Minisign ED prehash + global signature, matching the pinned SDK wire format. */
export function verifyMinisignPayload(payload, pubkey, signature) {
  const pubLines = base64(pubkey).toString('utf8').trimEnd().split('\n'),
    sigLines = base64(signature).toString('utf8').trimEnd().split('\n');
  assert.equal(pubLines.length, 2);
  assert.equal(sigLines.length, 4);
  assert.ok(pubLines[0].startsWith('untrusted comment: '));
  assert.ok(sigLines[0].startsWith('untrusted comment: '));
  assert.ok(sigLines[2].startsWith('trusted comment: '));
  const pub = base64(pubLines[1]),
    sig = base64(sigLines[1]),
    global = base64(sigLines[3]);
  assert.equal(pub.length, 42);
  assert.equal(sig.length, 74);
  assert.equal(global.length, 64);
  assert.equal(pub.subarray(0, 2).toString(), 'Ed');
  assert.equal(sig.subarray(0, 2).toString(), 'ED');
  assert.ok(pub.subarray(2, 10).equals(sig.subarray(2, 10)));
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub.subarray(10)]),
    format: 'der',
    type: 'spki',
  });
  assert.ok(
    verify(null, createHash('blake2b512').update(payload).digest(), key, sig.subarray(10)),
    'Signed package is invalid',
  );
  assert.ok(
    verify(
      null,
      Buffer.concat([sig.subarray(10), Buffer.from(sigLines[2].slice(17))]),
      key,
      global,
    ),
    'Trusted signature comment is invalid',
  );
  return true;
}
/** Strict bounded fixture tar reader: no links, path-changing extensions or unsafe paths. */
export function readUpdaterTar(packageBytes) {
  const data = gunzipSync(packageBytes, { maxOutputLength: 2097152 }),
    files = new Map(),
    names = new Set();
  let offset = 0,
    ended = false;
  const str = (b) => b.subarray(0, b.indexOf(0) < 0 ? b.length : b.indexOf(0)).toString('utf8');
  const number = (b) => {
    const s = str(b).trim();
    assert.match(s, /^[0-7]+$/);
    return parseInt(s, 8);
  };
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((v) => v === 0)) {
      ended = true;
      assert.ok(
        data.subarray(offset).every((v) => v === 0),
        'Trailing archive data',
      );
      break;
    }
    const name =
      (str(header.subarray(345, 500)) ? str(header.subarray(345, 500)) + '/' : '') +
      str(header.subarray(0, 100));
    const type = header[156];
    assert.ok(
      (type === 120 && name === 'PaxHeader/Disposable.app') ||
        name === 'Disposable.app' ||
        name.startsWith('Disposable.app/'),
    );
    assert.ok(!name.split('/').some((n) => n === '..' || n.startsWith('._')));
    assert.ok(!names.has(name), 'Duplicate archive entry');
    names.add(name);
    const size = number(header.subarray(124, 136)),
      expected = number(header.subarray(148, 156));
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
    assert.equal(sum, expected, 'Tar checksum differs');
    assert.ok(size <= 1048576);
    assert.ok(
      type === 0 || type === 48 || type === 53 || type === 120,
      'Unsupported archive entry',
    );
    assert.ok(offset + 512 + size <= data.length, 'Truncated archive entry');
    if (type === 120) {
      const records = data.subarray(offset + 512, offset + 512 + size);
      let pos = 0;
      while (pos < records.length) {
        const space = records.indexOf(32, pos);
        assert.ok(space > pos);
        const lengthText = records.subarray(pos, space).toString();
        assert.match(lengthText, /^[1-9][0-9]*$/);
        const length = Number(lengthText);
        assert.ok(pos + length <= records.length && records[pos + length - 1] === 10);
        const record = records.subarray(space + 1, pos + length - 1);
        const equals = record.indexOf(61);
        assert.ok(equals > 0);
        const key = record.subarray(0, equals).toString();
        assert.ok(
          [
            'mtime',
            'LIBARCHIVE.xattr.com.apple.provenance',
            'SCHILY.xattr.com.apple.provenance',
          ].includes(key),
          'Path-changing or unknown PAX field',
        );
        pos += length;
      }
    }
    if (name === 'Disposable.app') assert.equal(type, 53, 'Bundle root must be a directory');
    if (type === 53) assert.equal(size, 0);
    else if (type !== 120)
      files.set(name, Buffer.from(data.subarray(offset + 512, offset + 512 + size)));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.ok(ended, 'Missing tar end marker');
  return files;
}
export async function inspectUpdaterArtifacts(bytes, io) {
  const recorded = JSON.parse((await bytes('update.json')).toString());
  const { artifacts, ...facts } = io;
  assert.deepEqual(recorded, facts, 'Updater durable facts differ from receipt');
  const pkg = await bytes('package.app.tar.gz'),
    pub = await bytes('public-key.txt'),
    sig = await bytes('signature.txt');
  for (const [value, expected] of [
    [pkg, io.payloadSha256],
    [pub, io.publicKeySha256],
    [sig, io.signatureSha256],
  ])
    assert.equal(hash(value), expected);
  verifyMinisignPayload(pkg, pub.toString(), sig.toString());
  const tar = readUpdaterTar(pkg);
  assert.deepEqual([...tar.keys()].sort(), [
    'Disposable.app/Contents/MacOS/fixture',
    'Disposable.app/Contents/payload.bin',
    'Disposable.app/Contents/version.txt',
  ]);
  for (const [phase, expectedNames] of [
    ['previous', ['Contents/MacOS/fixture', 'Contents/version.txt']],
    ['installed', ['Contents/MacOS/fixture', 'Contents/payload.bin', 'Contents/version.txt']],
  ]) {
    const record = io[phase + 'Target'];
    assert.equal(record.directory, phase);
    const manifest = await bytes(phase + '/manifest.json');
    assert.equal(hash(manifest), record.manifestSha256);
    assert.deepEqual(JSON.parse(manifest), { files: record.files });
    assert.deepEqual(Object.keys(record.files).sort(), expectedNames);
    for (const [name, f] of Object.entries(record.files)) {
      const actual = await bytes(phase + '/' + name);
      assert.equal(hash(actual), f.sha256);
      assert.equal(actual.length, f.bytes);
      if (phase === 'installed') assert.ok(actual.equals(tar.get('Disposable.app/' + name)));
    }
  }
  assert.equal(
    (await bytes('previous/Contents/version.txt')).toString(),
    'old disposable bundle\n',
  );
  assert.equal(
    (await bytes('installed/Contents/version.txt')).toString(),
    'signed private updater fixture 0.2.0\n',
  );
  assert.equal((await bytes('installed/Contents/MacOS/fixture')).toString(), '#!/bin/sh\nexit 0\n');
  assert.equal((await bytes('installed/Contents/payload.bin')).length, 262144);
  assert.equal(hash(await bytes('installed/Contents/version.txt')), io.installedMarkerSha256);
  assert.equal(hash(await bytes('installed/Contents/payload.bin')), io.installedPayloadSha256);
  assert.equal(UpdateStatus.parse(io.initial).status, 'idle');
  assert.equal(UpdateStatus.parse(io.bad).code, 'UPDATE_SIGNATURE');
  assert.equal(UpdateStatus.parse(io.ready).status, 'ready');
  assert.equal(io.ready.latestVersion, '0.2.0');
  const events = io.events.map((e) => UpdateStatus.parse(e));
  const bad = events.findIndex((e) => e.status === 'error' && e.code === 'UPDATE_SIGNATURE'),
    ready = events.findIndex((e) => e.status === 'ready');
  assert.ok(bad > 0 && ready > bad);
  const progress = events.slice(bad + 1, ready).filter((e) => e.status === 'downloading');
  assert.ok(progress.length > 1);
  assert.equal(progress.at(-1).transferred, pkg.length);
  assert.equal(progress.at(-1).percent, 100);
  assert.ok(
    progress.every(
      (e, i) => e.total === pkg.length && (i === 0 || e.transferred >= progress[i - 1].transferred),
    ),
  );
  const endpoint = new URL(io.endpoint);
  assert.equal(endpoint.protocol, 'http:');
  assert.equal(endpoint.hostname, '127.0.0.1');
  assert.ok(endpoint.port);
  assert.equal(endpoint.pathname, '/feed');
  assert.equal(endpoint.username, '');
  assert.equal(endpoint.password, '');
  assert.deepEqual(io.requests, [
    { path: '/feed', phase: 'bad-signature' },
    { path: '/package', phase: 'bad-signature' },
    { path: '/feed', phase: 'valid' },
    { path: '/package', phase: 'valid' },
  ]);
  assert.equal(io.downloadDidNotInstall, true);
  assert.equal(io.ordinaryWindowCloseDidNotInstall, true);
  assert.equal(io.failedSaveKeptProcess, true);
  assert.equal(io.failedSaveCommand, 'restartToUpdate');
  return {
    signature: 'verified independent Ed25519/BLAKE2b and trusted comment',
    installedFiles: tar.size,
    progressEvents: progress.length,
    qualification:
      'Private signed loopback provider and disposable SDK target only; no public release channel or physical OS menu/wake claim.',
  };
}
