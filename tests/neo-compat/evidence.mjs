import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skip = new Set([
  'node_modules',
  'target',
  'dist',
  'build',
  '.git',
  '.leafloom',
  'test-results',
]);
async function walk(directory) {
  const rows = [];
  try {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (skip.has(item.name)) continue;
      const name = path.join(directory, item.name);
      if (item.isDirectory()) {
        if (path.relative(root, name) === 'apps/desktop/src-tauri/gen/schemas') continue;
        rows.push(...(await walk(name)));
      } else if (item.isFile()) rows.push(name);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return rows;
}
export async function evidenceMetadata(driver = 'browser') {
  const names = [
    ...(await walk(path.join(root, 'apps'))),
    ...(await walk(path.join(root, 'packages'))),
    ...(await walk(path.join(root, 'tests/neo-compat/candidate'))),
    ...(await walk(path.join(root, 'tests/neo-compat/shared'))),
  ];
  for (const name of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'tests/reference/provenance.json',
    'tests/neo-compat/evidence.mjs',
    'scripts/check-neo-parity.mjs',
    'scripts/check-native-evidence.mjs',
    'scripts/native-artifact-contracts.mjs',
    'scripts/native-updater-artifacts.mjs',
    'scripts/native-backup-artifacts.mjs',
    'scripts/verify-host-backups.mjs',
    'tests/neo-compat/native/backup-clock-preload.mjs',
    'tests/neo-compat/native/backup-fixture.ts',
    'scripts/native-evidence-types.ts',
    'scripts/verify-macos-quit-restart.mjs',
    'tests/neo-compat/native/updater-fixture.mjs',
    'tests/neo-compat/native/acceptance-contracts.json',
    'tests/neo-compat/native/collection-output.mjs',
    'tests/neo-compat/native/folder-replacement.mjs',
    'docs/migration/leafloom-scenarios.json',
  ])
    names.push(path.join(root, name));
  const hashes = {};
  for (const name of [...new Set(names)].sort()) {
    try {
      hashes[path.relative(root, name)] = createHash('sha256')
        .update(await readFile(name))
        .digest('hex');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return {
    evidenceSchema: 'leafloom/parity-v1',
    appImplementation: 'leafloom-production',
    driver,
    fixturePolicy: 'isolated-synthetic',
    referenceCommit: 'ed090e9988d446daf1ebbde91bcebc13b599909b',
    sourceHashes: hashes,
    buildSha256: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),
  };
}
export async function referenceMetadata() {
  const receipt = await readFile(path.join(root, 'tests/reference/provenance.json'));
  const names = [
    ...(await walk(path.join(root, 'tests/neo-compat/reference'))),
    ...(await walk(path.join(root, 'tests/neo-compat/candidate'))),
    ...(await walk(path.join(root, 'tests/neo-compat/shared'))),
    path.join(root, 'tests/neo-compat/evidence.mjs'),
    path.join(root, 'tests/neo-compat/parity/reference/launch.cjs'),
  ];
  const hashes = {};
  for (const name of names.sort())
    hashes[path.relative(root, name)] = createHash('sha256')
      .update(await readFile(name))
      .digest('hex');
  return {
    evidenceSchema: 'leafloom/reference-v1',
    appImplementation: 'neo-pinned-original',
    driver:
      process.env.LEAFLOOM_REFERENCE_HIDDEN === '1'
        ? 'electron-reference-hidden'
        : 'electron-reference',
    nativeWindowPolicy: process.env.LEAFLOOM_REFERENCE_HIDDEN === '1' ? 'hidden' : 'foreground',
    credentialPolicy: process.env.LEAFLOOM_REFERENCE_HIDDEN === '1' ? 'denied' : 'source-native',
    referenceCommit: 'ed090e9988d446daf1ebbde91bcebc13b599909b',
    referenceSourceSha256: createHash('sha256').update(receipt).digest('hex'),
    referenceHarnessSha256: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),
  };
}
