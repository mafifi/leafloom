/** Actual staged sidecar startup. This driver never calls BackupProvider or an app backup command. */
import { spawn } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  chmod,
  realpath,
  copyFile,
  stat,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { build } from 'esbuild';
import { evidenceMetadata, root as repository } from '../tests/neo-compat/evidence.mjs';
import { nativeContracts } from './native-artifact-contracts.mjs';
const host = await realpath(
  process.argv[2] ?? path.join(repository, 'apps/desktop/src-tauri/binaries/host'),
);
if (!host.startsWith(repository + path.sep)) throw Error('Staged host must be repository owned');
if (process.env.LEAFLOOM_HOST_BACKUP_ACCEPTANCE !== '1')
  throw Error('Explicit private sidecar startup acceptance opt-in required');
if (typeof process.getuid === 'function' && process.getuid() === 0)
  throw Error('Real permission-denial proof cannot run as root');
const artifacts = path.join(repository, '.leafloom/evidence/host-backups-' + randomUUID());
await mkdir(artifacts, { recursive: true });
const report = path.resolve(process.argv[3] ?? path.join(artifacts, 'receipt.json'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const before = (await evidenceMetadata('node-sidecar-startup')).buildSha256;
const driverSha256 = sha(await readFile(new URL(import.meta.url)));
const preloadSource = path.join(repository, 'tests/neo-compat/native/backup-clock-preload.mjs');
const fixtureSource = path.join(repository, 'tests/neo-compat/native/backup-fixture.ts');
const binding = {
  driverPath: 'scripts/verify-host-backups.mjs',
  runtimeEntry: path.join(host, 'main.mjs'),
  runtimeExecutable: path.join(host, 'node'),
  hostMainSha256: sha(await readFile(path.join(host, 'main.mjs'))),
  nodeSha256: sha(await readFile(path.join(host, 'node'))),
  hostBuildSha256: sha(await readFile(path.join(host, 'host-build.json'))),
  driverSha256,
  clockPreloadSha256: sha(await readFile(preloadSource)),
  fixtureSha256: sha(await readFile(fixtureSource)),
};
const provenance = JSON.parse(await readFile(path.join(host, 'host-build.json'), 'utf8'));
assert.equal(provenance.mainSha256, binding.hostMainSha256);
for (const input of provenance.compilerInputs)
  assert.equal(
    sha(await readFile(path.join(repository, input.path))),
    input.sha256,
    'Staged host source is stale: ' + input.path,
  );
const factory = path.join(artifacts, 'seed.mjs');
await build({
  entryPoints: [fixtureSource],
  outfile: factory,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  external: ['jsdom'],
  banner: {
    js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);",
  },
});
const { seed } = await import(factory);
const rows = [],
  children = new Set();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const relative = (file) => path.relative(artifacts, file);
async function retained(file, target) {
  await mkdir(path.dirname(target), { recursive: true });
  const bytes = await readFile(file);
  await writeFile(target, bytes);
  return { path: relative(target), sha256: sha(bytes), bytes: bytes.length };
}
async function launch(root, nowIso, label) {
  const control = path.join(artifacts, label);
  await mkdir(control);
  const preload = path.join(control, 'clock-preload.mjs');
  await copyFile(preloadSource, preload);
  await writeFile(path.join(control, 'clock.json'), JSON.stringify({ root, nowIso }));
  const started = performance.now();
  let stdout = '',
    stderr = '';
  const child = spawn(binding.runtimeExecutable, ['--import', preload, binding.runtimeEntry], {
    env: { PATH: process.env.PATH, LEAFLOOM_LIBRARY_ROOT: root },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.add(child);
  child.stdout.on('data', (b) => (stdout += b));
  child.stderr.on('data', (b) => (stderr += b));
  const deadline = performance.now() + 20000;
  while (
    !stdout.split('\n').some((line) => {
      try {
        return JSON.parse(line).ready === true;
      } catch {
        return false;
      }
    })
  ) {
    if (child.exitCode !== null || performance.now() > deadline)
      throw Error('Real startup did not become ready');
    await pause(25);
  }
  // The production five-second timer and every Node timer remain real.
  await pause(5400);
  assert.equal(child.exitCode, null);
  const exited = once(child, 'exit');
  child.stdin.end();
  await exited;
  children.delete(child);
  assert.equal(child.exitCode, 0);
  const elapsedMs = performance.now() - started;
  assert.ok(elapsedMs >= 5000);
  await writeFile(path.join(control, 'stdout.txt'), stdout);
  await writeFile(path.join(control, 'stderr.txt'), stderr);
  const files = {};
  for (const name of ['clock-preload.mjs', 'clock.json', 'stdout.txt', 'stderr.txt']) {
    const file = path.join(control, name);
    files[name] = { path: relative(file), sha256: sha(await readFile(file)) };
  }
  return { nowIso, pid: child.pid, exitCode: child.exitCode, elapsedMs, files };
}
async function captureInput(root, expected, mode, label) {
  const dir = path.join(artifacts, mode, 'input-' + label),
    files = {};
  for (const name of Object.keys(expected)) {
    const item = await retained(path.join(root, name), path.join(dir, name));
    files[name] = { sha256: item.sha256, bytes: item.bytes };
    assert.equal((await readFile(path.join(root, name))).toString(), expected[name]);
  }
  return { label, path: relative(dir), files };
}
async function snapshot(root, expected, date, mode, label) {
  const file = path.join(root, 'Backups', 'leafloom-backup-' + date + '.zip');
  const actual = await readFile(file),
    zip = await JSZip.loadAsync(actual, { checkCRC32: true });
  for (const [name, text] of Object.entries(expected)) {
    assert.ok(zip.file(name), 'Readable author file missing');
    assert.equal(await zip.file(name).async('string'), text);
  }
  assert.ok(
    !Object.keys(zip.files).some(
      (n) =>
        n.startsWith('Backups/') ||
        n.startsWith('Exports/') ||
        n.endsWith('.DS_Store') ||
        /^\..+\.icloud$/.test(path.basename(n)),
    ),
  );
  return {
    ...(await retained(file, path.join(artifacts, mode, 'archives', path.basename(file)))),
    date,
    input: label,
  };
}
try {
  for (const mode of ['retention', 'rollover', 'partial']) {
    const modeDir = path.join(artifacts, mode);
    await mkdir(modeDir);
    const root = await mkdtemp(path.join(modeDir, 'library-'));
    await writeFile(path.join(root, '.leafloom-fixture'), 'owned-host-backup-fixture-v1');
    let expected = await seed(root);
    const backups = path.join(root, 'Backups');
    await mkdir(backups);
    await mkdir(path.join(root, 'Exports'));
    await writeFile(path.join(root, 'Exports', 'excluded.txt'), 'Export exclusion');
    await writeFile(path.join(root, '.DS_Store'), 'Finder exclusion');
    await writeFile(path.join(root, 'book-backup-fixture', '.draft.icloud'), 'Cloud exclusion');
    if (mode === 'retention')
      for (let day = 1; day <= 16; day++)
        await writeFile(
          path.join(backups, `leafloom-backup-2000-01-${String(day).padStart(2, '0')}.zip`),
          await new JSZip()
            .file('old.txt', 'Old snapshot ' + day)
            .generateAsync({ type: 'nodebuffer' }),
        );
    const beforeArchiveNames = (await readdir(backups)).sort(),
      inputs = [await captureInput(root, expected, mode, 'first')],
      denied = path.join(root, 'permission-denied.txt');
    let permissionProof;
    if (mode === 'partial') {
      await writeFile(denied, 'Denied supplemental input');
      await chmod(denied, 0);
      await assert.rejects(readFile(denied), { code: 'EACCES' });
      assert.equal((await stat(denied)).mode & 0o777, 0);
    }
    const launches = [await launch(root, '2099-04-03T23:59:00.000Z', mode + '/launch-first')],
      first = await snapshot(root, expected, '2099-04-03', mode, 'first'),
      archives = [first],
      sameDayChecks = [];
    if (mode === 'partial') {
      const zip = await JSZip.loadAsync(
        await readFile(first.path.startsWith('/') ? first.path : path.join(artifacts, first.path)),
      );
      assert.equal(zip.file('permission-denied.txt'), null);
      assert.match(
        await zip.file('_left-out-of-this-backup.txt').async('string'),
        /permission-denied.txt \(EACCES\)/,
      );
      await chmod(denied, 0o600);
      permissionProof = {
        ...(await retained(denied, path.join(modeDir, 'permission-denied-input.txt'))),
        errorCode: 'EACCES',
        deniedMode: 0,
        restoredMode: (await stat(denied)).mode & 0o777,
      };
    }
    if (mode === 'retention') {
      assert.deepEqual((await readdir(backups)).sort(), [
        ...Array.from(
          { length: 13 },
          (_, i) => `leafloom-backup-2000-01-${String(i + 4).padStart(2, '0')}.zip`,
        ),
        'leafloom-backup-2099-04-03.zip',
      ]);
      launches.push(await launch(root, '2099-04-03T23:59:00.000Z', mode + '/launch-same'));
      const afterSha256 = sha(await readFile(path.join(backups, 'leafloom-backup-2099-04-03.zip')));
      assert.equal(afterSha256, first.sha256);
      sameDayChecks.push({
        afterLaunch: 1,
        date: '2099-04-03',
        beforeSha256: first.sha256,
        afterSha256,
      });
    }
    if (mode === 'rollover') {
      expected = await seed(root, 'Second day 東京.');
      inputs.push(await captureInput(root, expected, mode, 'second'));
      launches.push(await launch(root, '2099-04-03T23:59:00.000Z', mode + '/launch-same'));
      const sameSha = sha(await readFile(path.join(backups, 'leafloom-backup-2099-04-03.zip')));
      assert.equal(sameSha, first.sha256);
      sameDayChecks.push({
        afterLaunch: 1,
        date: '2099-04-03',
        beforeSha256: first.sha256,
        afterSha256: sameSha,
      });
      launches.push(await launch(root, '2099-04-04T00:01:00.000Z', mode + '/launch-next'));
      archives.push(await snapshot(root, expected, '2099-04-04', mode, 'second'));
      launches.push(await launch(root, '2099-04-04T00:01:00.000Z', mode + '/launch-next-same'));
      const nextSha = sha(await readFile(path.join(backups, 'leafloom-backup-2099-04-04.zip')));
      assert.equal(nextSha, archives[1].sha256);
      sameDayChecks.push({
        afterLaunch: 3,
        date: '2099-04-04',
        beforeSha256: archives[1].sha256,
        afterSha256: nextSha,
      });
      assert.equal(
        sha(await readFile(path.join(backups, 'leafloom-backup-2099-04-03.zip'))),
        first.sha256,
      );
    }
    const manifest = {
      mode,
      bookId: 'book-backup-fixture',
      libraryRoot: relative(root),
      inputs,
      archives,
      launches,
      beforeArchiveNames,
      afterArchiveNames: (await readdir(backups)).sort(),
      sameDayChecks,
      ...(permissionProof ? { permissionProof } : {}),
    };
    const file = path.join(modeDir, 'manifest.json');
    await writeFile(file, JSON.stringify(manifest, null, 2));
    const contract = nativeContracts.find((c) => c.contractId === 'backup:startup:' + mode);
    rows.push({
      id: contract.id,
      title: contract.title,
      status: 'passed',
      driverActions: contract.driverActions,
      assertions: contract.assertions,
      artifact: { sha256: sha(await readFile(file)) },
      qualification:
        'Actual staged Node sidecar startup and private process-only Date preload; Rust launch, renderer and physical OS behavior unproved',
    });
  }
  const after = (await evidenceMetadata('node-sidecar-startup')).buildSha256;
  assert.equal(after, before);
  assert.equal(sha(await readFile(new URL(import.meta.url))), driverSha256);
  await writeFile(
    report,
    JSON.stringify(
      {
        evidenceSchema: 'leafloom/host-startup-v1',
        appImplementation: 'leafloom-production',
        referenceCommit: 'ed090e9988d446daf1ebbde91bcebc13b599909b',
        driver: 'node-sidecar-startup',
        fixtureKind: 'marked private synthetic fixture',
        status: 'passed',
        buildSha256: before,
        buildSha256Before: before,
        buildSha256After: after,
        artifactBinding: binding,
        startupBackups: {
          driver: 'node-sidecar-startup',
          artifacts,
          qualification: 'Actual staged Node startup; Rust launch and physical desktop unproved',
          evidence: rows,
          unexecutedClauses: [],
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile(
    report + '.failure.json',
    JSON.stringify(
      {
        status: 'failed',
        artifactBinding: binding,
        artifacts,
        evidence: rows,
        error: String(error),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  for (const child of children) {
    child.stdin.end();
    if (child.exitCode === null) child.kill('SIGTERM');
  }
}
