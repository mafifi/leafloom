import { test } from 'vitest';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { verifyMinisignPayload, readUpdaterTar } from '../../scripts/native-updater-artifacts.mjs';
function signed(payload: Buffer) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const id = Buffer.from('12345678');
  const signature = sign(null, createHash('blake2b512').update(payload).digest(), privateKey);
  const comment = 'fixture timestamp';
  return {
    publicKey: Buffer.from(
      'untrusted comment: fixture\n' +
        Buffer.concat([Buffer.from('Ed'), id, pub]).toString('base64') +
        '\n',
    ).toString('base64'),
    signature: Buffer.from(
      'untrusted comment: fixture\n' +
        Buffer.concat([Buffer.from('ED'), id, signature]).toString('base64') +
        '\ntrusted comment: ' +
        comment +
        '\n' +
        sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey).toString(
          'base64',
        ) +
        '\n',
    ).toString('base64'),
  };
}
test('independent updater signature checks payload and trusted comment', () => {
  const payload = Buffer.from('actual package'),
    value = signed(payload);
  assert.equal(verifyMinisignPayload(payload, value.publicKey, value.signature), true);
  assert.throws(() =>
    verifyMinisignPayload(Buffer.from('tampered'), value.publicKey, value.signature),
  );
  const decoded = Buffer.from(value.signature, 'base64')
    .toString()
    .replace('fixture timestamp', 'altered timestamp');
  assert.throws(() =>
    verifyMinisignPayload(payload, value.publicKey, Buffer.from(decoded).toString('base64')),
  );
  assert.throws(() => verifyMinisignPayload(payload, value.publicKey, 'not base64'));
});
function tar(name: string, value: Buffer, type = 48) {
  const h = Buffer.alloc(512);
  h.write(name);
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(value.length.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136);
  h.fill(32, 148, 156);
  h[156] = type;
  h.write('ustar\0', 257);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return gzipSync(
    Buffer.concat([h, value, Buffer.alloc((512 - (value.length % 512)) % 512), Buffer.alloc(1024)]),
  );
}
test('updater tar parser rejects traversal hidden metadata malformed checksums and truncation', () => {
  const bytes = tar('Disposable.app/Contents/version.txt', Buffer.from('version'));
  assert.equal(
    readUpdaterTar(bytes).get('Disposable.app/Contents/version.txt')?.toString(),
    'version',
  );
  assert.throws(() => readUpdaterTar(tar('../escape', Buffer.from('bad'))));
  assert.throws(() => readUpdaterTar(tar('._Disposable.app', Buffer.from('AppleDouble'))));
  assert.throws(() => readUpdaterTar(bytes.subarray(0, bytes.length - 5)));
});

test('updater PAX allows timestamp metadata but rejects path and size overrides', () => {
  const pax = (key: string, value: string) => {
    const body = key + '=' + value + '\n';
    let length = Buffer.byteLength(body) + 2;
    while (String(length).length + 1 + Buffer.byteLength(body) !== length)
      length = String(length).length + 1 + Buffer.byteLength(body);
    return Buffer.from(length + ' ' + body);
  };
  assert.equal(
    readUpdaterTar(tar('PaxHeader/Disposable.app', pax('mtime', '123.456'), 120)).size,
    0,
  );
  for (const key of ['path', 'linkpath', 'size'])
    assert.throws(() =>
      readUpdaterTar(tar('PaxHeader/Disposable.app', pax(key, '../../escape'), 120)),
    );
});
