import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const binary = resolve(process.argv[2] ?? 'apps/desktop/src-tauri/target/debug/leafloom-desktop');
assert(
  binary.includes('/target/debug/'),
  'Only a debug fixture binary may be launched by this hidden diagnostic driver',
);
const receiptPath = resolve(process.argv[3] ?? '.leafloom/evidence/startup-diagnostics.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const receipt = {
  schema: 'leafloom/startup-diagnostics-v1',
  binarySha256: sha256(await readFile(binary)),
  driverSha256: sha256(await readFile(new URL(import.meta.url))),
  hiddenWindow: true,
  fixtureKind: 'marked-private',
  attempts: [],
  rows: [],
};
async function exercise(name, blockedLog) {
  const fixture = await mkdtemp(join(tmpdir(), 'leafloom-startup-fixture-'));
  try {
    await writeFile(join(fixture, '.leafloom-fixture'), 'private startup diagnostic fixture');
    await mkdir(join(fixture, '.profile'));
    const profile = join(fixture, '.profile', 'host-settings.json');
    const log = join(fixture, '.profile', 'startup-errors.json');
    const sentinel = join(fixture, 'author-sentinel');
    const original = Buffer.from('{ malformed synthetic profile');
    const protectedBytes = Buffer.from('synthetic private prose must never enter diagnostics');
    await writeFile(profile, original);
    await writeFile(sentinel, protectedBytes);
    if (blockedLog) await symlink(sentinel, log);
    const began = Date.now();
    const outcome = await new Promise((resolve, reject) => {
      const child = spawn(binary, [], {
        env: { ...process.env, LEAFLOOM_FIXTURE_ROOT: fixture, LEAFLOOM_HIDDEN: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (bytes) => {
        stdout += bytes;
      });
      child.stderr.on('data', (bytes) => {
        stderr += bytes;
      });
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Startup fixture did not terminate within ten seconds'));
      }, 10000);
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal, stdout, stderr });
      });
    });
    assert.equal(outcome.code, 1);
    assert.equal(outcome.signal, null);
    assert.match(outcome.stderr, /Leafloom startup failed: INVALID_PROFILE/);
    assert(
      !outcome.stderr.includes(fixture) &&
        !outcome.stderr.includes(protectedBytes.toString()) &&
        !outcome.stderr.includes('malformed synthetic'),
    );
    assert.deepEqual(await readFile(profile), original);
    assert.deepEqual(await readFile(sentinel), protectedBytes);
    receipt.attempts.push({
      name,
      exitCode: outcome.code,
      signal: outcome.signal,
      finiteDiagnostic: 'INVALID_PROFILE',
      profilePreserved: true,
      authorSentinelPreserved: true,
      elapsedMs: Date.now() - began,
    });
    let records;
    if (!blockedLog) {
      const value = JSON.parse(await readFile(log, 'utf8'));
      assert.equal(value.version, 1);
      assert.equal(value.records.length, 1);
      assert.deepEqual(Object.keys(value.records[0]).sort(), ['atUnixMs', 'code', 'source']);
      assert.equal(value.records[0].source, 'shell');
      assert.equal(value.records[0].code, 'INVALID_PROFILE');
      assert(Number.isSafeInteger(value.records[0].atUnixMs) && value.records[0].atUnixMs >= began);
      records = value.records;
    }
    receipt.rows.push({
      name,
      passed: true,
      exitCode: outcome.code,
      signal: outcome.signal,
      elapsedMs: Date.now() - began,
      preservedProfileSha256: sha256(original),
      preservedSentinelSha256: sha256(protectedBytes),
      records,
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}
try {
  await exercise('real pre-host corrupt-profile failure persists finite diagnostic', false);
  await exercise('diagnostic symlink failure preserves target and still terminates', true);
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = {
    code: error.code ?? error.name,
    message:
      error.code === 'ENOENT'
        ? 'Expected startup diagnostic file was not created'
        : String(error.message).replaceAll(tmpdir(), '<temporary-root>'),
  };
  process.exitCode = 1;
} finally {
  await mkdir(resolve(receiptPath, '..'), { recursive: true });
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, rows: receipt.rows.length, receiptPath }));
}
