import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { BookCore } from '../../packages/editing/prosemirror-editor/src/core';
import { verifyCandidateEvidence } from '../../scripts/check-neo-parity.mjs';
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex'),
  fp = 'a'.repeat(64);
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'leafloom-backup-evidence-'))),
    base = path.join(root, '.leafloom/evidence/backup-test');
  await mkdir(base, { recursive: true });
  const contracts = JSON.parse(
    await readFile('tests/neo-compat/native/acceptance-contracts.json', 'utf8'),
  );
  const contract = contracts.contracts.find(
    (c: { contractId: string }) => c.contractId === 'backup:startup:retention',
  );
  const entry = {
    evidenceKind: 'host-startup-v1',
    driver: 'node-sidecar-startup',
    section: 'startupBackups',
    contractId: contract.contractId,
    id: contract.id,
    title: contract.title,
    driverActions: contract.driverActions,
    assertions: contract.assertions,
    requiredCapabilities: contract.capabilities,
  };
  const binaryFiles = [
    'scripts/verify-host-backups.mjs',
    'tests/neo-compat/native/backup-clock-preload.mjs',
    'tests/neo-compat/native/backup-fixture.ts',
    'host/main.mjs',
    'host/node',
    'apps/desktop/host/main.ts',
  ];
  const hashes: Record<string, string> = {};
  for (const file of binaryFiles) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), file);
    hashes[file] = sha(file);
  }
  const hostBuild = JSON.stringify({
    formatVersion: 1,
    target: 'node24',
    platform: 'node',
    mainSha256: hashes['host/main.mjs'],
    compilerInputs: [
      { path: 'apps/desktop/host/main.ts', sha256: hashes['apps/desktop/host/main.ts'] },
    ],
  });
  await writeFile(path.join(root, 'host/host-build.json'), hostBuild);
  const core = new BookCore(
    new JSDOM('').window.document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book-backup-fixture', title: 'Backup fixture', author: 'Backup writer' },
      chapters: [
        { id: 'rich', html: '<p><b>First day Καλημέρα.</b></p>' },
        { id: 'other', html: '<p><i>Other rich chapter.</i></p>' },
      ],
      darlings: [],
    },
    null,
    '<p><b>Retained research.</b></p>',
    '<p><i>Retained plan.</i></p>',
  );
  const checkpoint = core.checkpoint();
  const inputFiles: Record<string, string> = {
    'library.json': JSON.stringify({
      shelves: [{ id: 'shelf', name: 'Backup shelf', bookIds: ['book-backup-fixture'] }],
    }),
    'book-backup-fixture/manuscript.json': JSON.stringify(checkpoint.book),
    'book-backup-fixture/reviews.json': JSON.stringify(checkpoint.reviews),
    'book-backup-fixture/notes.html': checkpoint.notes,
    'book-backup-fixture/outline.html': checkpoint.outline,
  };
  const files: Record<string, { sha256: string; bytes: number }> = {};
  for (const [name, text] of Object.entries(inputFiles)) {
    await mkdir(path.dirname(path.join(base, 'retention/input-first', name)), { recursive: true });
    await writeFile(path.join(base, 'retention/input-first', name), text);
    files[name] = { sha256: sha(text), bytes: Buffer.byteLength(text) };
  }
  const zip = new JSZip();
  for (const [name, text] of Object.entries(inputFiles)) zip.file(name, text);
  const zipBytes = await zip.generateAsync({ type: 'nodebuffer' });
  await mkdir(path.join(base, 'retention/archives'));
  await writeFile(path.join(base, 'retention/archives/leafloom-backup-2099-04-03.zip'), zipBytes);
  await mkdir(path.join(base, 'retention/library'));
  await writeFile(
    path.join(base, 'retention/library/.leafloom-fixture'),
    'owned-host-backup-fixture-v1',
  );
  const launches = [];
  for (let i = 0; i < 2; i++) {
    const launchFiles: Record<string, { path: string; sha256: string }> = {};
    for (const [name, text] of Object.entries({
      'clock.json': JSON.stringify({
        root: path.join(base, 'retention/library'),
        nowIso: '2099-04-03T23:59:00.000Z',
      }),
      'clock-preload.mjs': 'tests/neo-compat/native/backup-clock-preload.mjs',
      'stdout.txt': '{"ready":true,"version":1}\n',
      'stderr.txt': '',
    })) {
      const file = `retention/launch-${i}/${name}`;
      await mkdir(path.dirname(path.join(base, file)), { recursive: true });
      await writeFile(path.join(base, file), text);
      launchFiles[name] = { path: file, sha256: sha(text) };
    }
    launches.push({
      nowIso: '2099-04-03T23:59:00.000Z',
      pid: 100 + i,
      exitCode: 0,
      elapsedMs: 6000,
      files: launchFiles,
    });
  }
  const names = [
    ...Array.from(
      { length: 13 },
      (_, i) => `leafloom-backup-2000-01-${String(i + 4).padStart(2, '0')}.zip`,
    ),
    'leafloom-backup-2099-04-03.zip',
  ];
  await mkdir(path.join(base, 'retention/library/Backups'));
  for (const name of names) {
    const day = Number(name.match(/2000-01-(\d{2})/)?.[1]);
    const bytes =
      name === 'leafloom-backup-2099-04-03.zip'
        ? zipBytes
        : await new JSZip()
            .file('old.txt', 'Old snapshot ' + day)
            .generateAsync({ type: 'nodebuffer' });
    await writeFile(path.join(base, 'retention/library/Backups', name), bytes);
  }
  const manifest = {
    mode: 'retention',
    libraryRoot: 'retention/library',
    bookId: 'book-backup-fixture',
    inputs: [{ label: 'first', path: 'retention/input-first', files }],
    archives: [
      {
        path: 'retention/archives/leafloom-backup-2099-04-03.zip',
        date: '2099-04-03',
        sha256: sha(zipBytes),
        bytes: zipBytes.length,
        input: 'first',
      },
    ],
    launches,
    beforeArchiveNames: Array.from(
      { length: 16 },
      (_, i) => `leafloom-backup-2000-01-${String(i + 1).padStart(2, '0')}.zip`,
    ),
    afterArchiveNames: names,
    sameDayChecks: [
      {
        afterLaunch: 1,
        date: '2099-04-03',
        beforeSha256: sha(zipBytes),
        afterSha256: sha(zipBytes),
      },
    ],
  };
  await writeFile(path.join(base, 'retention/manifest.json'), JSON.stringify(manifest));
  const receipt = {
    evidenceSchema: 'leafloom/host-startup-v1',
    appImplementation: 'leafloom-production',
    referenceCommit: 'ed090e9988d446daf1ebbde91bcebc13b599909b',
    driver: 'node-sidecar-startup',
    fixtureKind: 'marked private synthetic fixture',
    status: 'passed',
    buildSha256: fp,
    buildSha256Before: fp,
    buildSha256After: fp,
    artifactBinding: {
      driverPath: 'scripts/verify-host-backups.mjs',
      driverSha256: hashes[binaryFiles[0]],
      runtimeEntry: path.join(root, 'host/main.mjs'),
      runtimeExecutable: path.join(root, 'host/node'),
      hostMainSha256: hashes['host/main.mjs'],
      nodeSha256: hashes['host/node'],
      hostBuildSha256: sha(hostBuild),
      clockPreloadSha256: hashes[binaryFiles[1]],
      fixtureSha256: hashes[binaryFiles[2]],
    },
    startupBackups: {
      driver: 'node-sidecar-startup',
      artifacts: base,
      qualification: 'Actual bundled Node startup; Rust launch and physical desktop unproved',
      unexecutedClauses: [],
      evidence: [
        {
          id: contract.id,
          title: contract.title,
          status: 'passed',
          driverActions: contract.driverActions,
          assertions: contract.assertions,
          artifact: { sha256: sha(JSON.stringify(manifest)) },
        },
      ],
    },
  };
  return {
    root,
    base,
    entry,
    receipt,
    manifest,
    options: {
      root,
      buildSha256: fp,
      scenarioId: contract.id,
      environment: 'electron-files-clock',
    },
  };
}
test('typed sidecar-startup evidence reparses real ZIP and exact four-file inputs without Playwright rows', async () => {
  const f = await fixture();
  try {
    const r = await verifyCandidateEvidence(f.receipt, f.entry, f.options);
    assert.equal(r.passed, true, JSON.stringify(r));
    assert.equal(r.kind, 'host-startup-v1');
    assert.ok(r.parsed);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test('sidecar evidence rejects stale failed duplicate unexecuted and desktop capability claims', async () => {
  const f = await fixture();
  try {
    for (const mutate of [
      (r: typeof f.receipt) => (r.buildSha256After = 'b'.repeat(64)),
      (r: typeof f.receipt) => (r.status = 'failed'),
      (r: typeof f.receipt) => r.startupBackups.evidence.push(r.startupBackups.evidence[0]),
      (r: typeof f.receipt) => r.startupBackups.unexecutedClauses.push(f.entry.id),
    ]) {
      const r = structuredClone(f.receipt);
      mutate(r);
      assert.equal((await verifyCandidateEvidence(r, f.entry, f.options)).passed, false);
    }
    assert.equal(
      (
        await verifyCandidateEvidence(
          f.receipt,
          { ...f.entry, requiredCapabilities: ['native-files'] },
          f.options,
        )
      ).passed,
      false,
    );
    assert.equal(
      (
        await verifyCandidateEvidence(f.receipt, f.entry, {
          ...f.options,
          environment: 'physical-keyboard',
        })
      ).passed,
      false,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test('sidecar evidence rejects ZIP prose tamper even with a recomputed artifact manifest hash', async () => {
  const f = await fixture();
  try {
    const a = f.manifest.archives[0],
      zip = await JSZip.loadAsync(await readFile(path.join(f.base, a.path)));
    zip.file('book-backup-fixture/manuscript.json', '{}');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    await writeFile(path.join(f.base, a.path), bytes);
    a.sha256 = sha(bytes);
    a.bytes = bytes.length;
    const manifest = JSON.stringify(f.manifest);
    await writeFile(path.join(f.base, 'retention/manifest.json'), manifest);
    f.receipt.startupBackups.evidence[0].artifact.sha256 = sha(manifest);
    assert.equal((await verifyCandidateEvidence(f.receipt, f.entry, f.options)).passed, false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test('sidecar evidence rejects clocks outside marked ownership and artifact symlink escape', async () => {
  const f = await fixture();
  try {
    await rm(path.join(f.base, 'retention/input-first/library.json'));
    const outside = path.join(f.root, 'outside');
    await writeFile(outside, '{}');
    await symlink(outside, path.join(f.base, 'retention/input-first/library.json'));
    assert.equal((await verifyCandidateEvidence(f.receipt, f.entry, f.options)).passed, false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('sidecar receipt cannot bypass the real timer or change the clock ownership root', async () => {
  const f = await fixture();
  try {
    f.manifest.launches[0].elapsedMs = 10;
    let manifest = JSON.stringify(f.manifest);
    await writeFile(path.join(f.base, 'retention/manifest.json'), manifest);
    f.receipt.startupBackups.evidence[0].artifact.sha256 = sha(manifest);
    assert.equal((await verifyCandidateEvidence(f.receipt, f.entry, f.options)).passed, false);
    f.manifest.launches[0].elapsedMs = 6000;
    const clock = f.manifest.launches[0].files['clock.json'];
    const badClock = JSON.stringify({
      root: '/outside-private-ownership',
      nowIso: f.manifest.launches[0].nowIso,
    });
    await writeFile(path.join(f.base, clock.path), badClock);
    clock.sha256 = sha(badClock);
    manifest = JSON.stringify(f.manifest);
    await writeFile(path.join(f.base, 'retention/manifest.json'), manifest);
    f.receipt.startupBackups.evidence[0].artifact.sha256 = sha(manifest);
    assert.equal((await verifyCandidateEvidence(f.receipt, f.entry, f.options)).passed, false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
