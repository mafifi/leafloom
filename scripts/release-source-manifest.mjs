import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function snapshot(root, includeDist = false) {
  const roots = ['apps', 'packages', 'scripts', 'docs', 'tests'];
  const files = execFileSync(
    'rg',
    [
      '--files',
      ...roots,
      '-g',
      '!**/node_modules/**',
      '-g',
      '!**/target/**',
      '-g',
      '!**/dist/**',
      '-g',
      '!**/binaries/**',
      '-g',
      '!apps/desktop/src-tauri/gen/schemas/**',
      '-g',
      '!**/.DS_Store',
    ],
    { cwd: root, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const file of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'LICENSE',
    'README.md',
    'vitest.config.ts',
  ]) {
    try {
      await stat(join(root, file));
      files.push(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (includeDist)
    files.push(
      ...execFileSync('rg', ['--files', '--no-ignore', 'apps/desktop/dist'], {
        cwd: root,
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .filter(Boolean),
    );
  const result = [];
  for (const path of [...new Set(files)].sort()) {
    const bytes = await readFile(join(root, path));
    result.push({ path, sha256: digest(bytes), bytes: bytes.length });
  }
  return result;
}
export function buildInputs(files) {
  return files.filter(({ path }) => {
    if (/(?:\.test\.|\.spec\.|\/__tests__\/)/.test(path)) return false;
    return (
      /^(apps\/desktop\/(?:src\/|host\/|public\/|src-tauri\/|dist\/|[^/]+\.(?:ts|js|json|html))|packages\/.*(?:\/src\/|\/package\.json)|scripts\/(?:bundle-host|stage-node-runtime|stage-release-notices|verify-release-fonts|build-macos-release|release-source-manifest)\.|docs\/migration\/bundled-licenses\/)/.test(
        path,
      ) ||
      [
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'tsconfig.json',
        'LICENSE',
      ].includes(path)
    );
  });
}
export function assertSame(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw Error('Source or frontend changed during release build');
}
export async function inventory(directory, prefix = '') {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(directory, entry.name),
      name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw Error('Artifact symlink forbidden: ' + name);
    if (entry.isDirectory()) result.push(...(await inventory(path, name + '/')));
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      result.push({ path: name, sha256: digest(bytes), bytes: bytes.length });
    }
  }
  return result;
}
export async function writeSourceManifest(root, app, inputs, build) {
  const host = join(app, 'Contents/Resources/host'),
    hostBuild = JSON.parse(await readFile(join(host, 'host-build.json'), 'utf8'));
  if (
    hostBuild.formatVersion !== 1 ||
    hostBuild.mainSha256 !== digest(await readFile(join(host, 'main.mjs')))
  )
    throw Error('Actual host compiler receipt mismatch');
  for (const input of hostBuild.compilerInputs) {
    const path = resolve(root, input.path);
    if (!path.startsWith(root + '/')) throw Error('Compiler source escapes repository');
    if (digest(await readFile(path)) !== input.sha256)
      throw Error('Compiled host input changed: ' + input.path);
  }
  const source = await snapshot(root),
    resources = (await inventory(join(app, 'Contents/Resources'))).filter(
      (item) => !['source-manifest.json', 'host/node'].includes(item.path),
    );
  const manifest = {
    formatVersion: 1,
    product: 'Leafloom',
    version: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version,
    identifier: 'org.mafifi.leafloom',
    created: new Date().toISOString(),
    target: { architecture: 'arm64', minimumMacOS: '14.0' },
    build,
    buildInputs: inputs,
    repositorySnapshot: source,
    hostBuild,
    resources,
    unsignedShellSha256: digest(await readFile(join(app, 'Contents/MacOS/leafloom-desktop'))),
    nodeSha256: digest(await readFile(join(host, 'node'))),
    manualReleaseChannel: true,
    notarization: 'not submitted',
  };
  await writeFile(
    join(app, 'Contents/Resources/source-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return manifest;
}
export async function verifySourceManifest(root, app, { unsigned = true } = {}) {
  const manifest = JSON.parse(
    await readFile(join(app, 'Contents/Resources/source-manifest.json'), 'utf8'),
  );
  if (
    manifest.formatVersion !== 1 ||
    manifest.identifier !== 'org.mafifi.leafloom' ||
    manifest.target.minimumMacOS !== '14.0' ||
    manifest.target.architecture !== 'arm64'
  )
    throw Error('Source manifest identity invalid');
  assertSame(manifest.buildInputs, buildInputs(await snapshot(root, true)));
  if (unsigned) {
    for (const [path, expected] of [
      [join(app, 'Contents/MacOS/leafloom-desktop'), manifest.unsignedShellSha256],
      [join(app, 'Contents/Resources/host/node'), manifest.nodeSha256],
    ]) {
      if (!/^[0-9a-f]{64}$/.test(expected) || digest(await readFile(path)) !== expected)
        throw Error('Unsigned executable changed since source binding');
    }
  }
  const actual = (await inventory(join(app, 'Contents/Resources'))).filter(
    (item) => !['source-manifest.json', 'host/node'].includes(item.path),
  );
  assertSame(manifest.resources, actual);
  for (const item of manifest.resources) {
    const path = resolve(app, 'Contents/Resources', item.path);
    if (
      !path.startsWith(resolve(app, 'Contents/Resources') + '/') ||
      !/^[0-9a-f]{64}$/.test(item.sha256)
    )
      throw Error('Source manifest resource reference invalid');
    if (digest(await readFile(path)) !== item.sha256)
      throw Error('Sealed resource changed: ' + item.path);
  }
  return {
    files: manifest.repositorySnapshot.length,
    compilerInputs: manifest.hostBuild.compilerInputs.length,
    resources: manifest.resources.length,
    manifestSha256: digest(await readFile(join(app, 'Contents/Resources/source-manifest.json'))),
  };
}
