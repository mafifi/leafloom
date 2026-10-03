import { readFile, readdir, realpath, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
export async function stageReleaseNotices(output) {
  const destination = join(output, 'licenses', 'dependencies'),
    packages = [],
    seen = new Set();
  await mkdir(destination, { recursive: true });
  async function copyNotices(directory, id) {
    const files = [];
    const target = join(destination, id.replace(/[^a-zA-Z0-9._-]/g, '_'));
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!/^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(entry.name)) continue;
      const source = join(directory, entry.name);
      if (entry.isDirectory()) {
        for (const name of await readdir(source)) {
          const path = join(source, name);
          try {
            const text = await readFile(path);
            await mkdir(join(target, entry.name), { recursive: true });
            await copyFile(path, join(target, entry.name, name));
            files.push({
              path: relative(output, join(target, entry.name, name)),
              sha256: createHash('sha256').update(text).digest('hex'),
            });
          } catch (error) {
            if (error.code !== 'EISDIR') throw error;
          }
        }
      } else if (entry.isFile()) {
        const bytes = await readFile(source);
        await mkdir(target, { recursive: true });
        await copyFile(source, join(target, entry.name));
        files.push({
          path: relative(output, join(target, entry.name)),
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      }
    }
    return files;
  }
  async function nodePackage(directory) {
    directory = await realpath(directory);
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')),
      id = 'npm:' + manifest.name + '@' + manifest.version;
    if (seen.has(id)) return;
    seen.add(id);
    const files = await copyNotices(directory, id);
    packages.push({
      ecosystem: 'npm',
      name: manifest.name,
      version: manifest.version,
      license: manifest.license ?? (manifest.name.startsWith('@leafloom/') ? 'MIT' : null),
      repository: manifest.repository ?? null,
      files,
    });
    const require = createRequire(join(directory, 'package.json'));
    for (const name of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    })) {
      let path;
      for (const folder of require.resolve.paths(name + '/') ?? []) {
        try {
          const candidate = join(folder, name),
            found = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
          if (found.name === name) {
            path = candidate;
            break;
          }
        } catch {}
      }
      if (!path) {
        if (Object.hasOwn(manifest.optionalDependencies ?? {}, name)) continue;
        throw Error('Release notice dependency unresolved: ' + name);
      }
      await nodePackage(path);
    }
  }
  await nodePackage(join(root, 'apps/desktop'));
  await nodePackage(join(root, 'apps/desktop/host'));
  const cargo = process.env.CARGO ?? join(homedir(), '.cargo/bin/cargo'),
    metadata = JSON.parse(
      execFileSync(
        cargo,
        [
          'metadata',
          '--format-version',
          '1',
          '--locked',
          '--manifest-path',
          join(root, 'apps/desktop/src-tauri/Cargo.toml'),
          '--filter-platform',
          'aarch64-apple-darwin',
        ],
        { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
      ),
    );
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node])),
    manifests = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  async function rustPackage(id) {
    if (seen.has(id)) return;
    seen.add(id);
    const manifest = manifests.get(id);
    packages.push({
      ecosystem: 'cargo',
      name: manifest.name,
      version: manifest.version,
      license: manifest.license ?? (manifest.name === 'leafloom-desktop' ? 'MIT' : null),
      repository: manifest.repository,
      files: await copyNotices(
        dirname(manifest.manifest_path),
        'cargo:' + manifest.name + '@' + manifest.version,
      ),
    });
    for (const dependency of nodes.get(id)?.deps ?? []) {
      if (dependency.dep_kinds.some((kind) => kind.kind !== 'dev'))
        await rustPackage(dependency.pkg);
    }
  }
  await rustPackage(metadata.resolve.root);
  const supplemental = JSON.parse(
    await readFile(join(root, 'apps/desktop/host/licenses/supplemental/provenance.json'), 'utf8'),
  );
  packages.push({ecosystem:'font-assets',name:'Leafloom bundled writing fonts',version:'source-pinned',files:await copyNotices(join(root,'apps/desktop/public/fonts'),'font-assets')});
  packages.push({ecosystem:'font-assets',name:'Noto Serif export fallback',version:'source-pinned',files:await copyNotices(join(root,'apps/desktop/host/fonts'),'noto-serif')});
  for (const pkg of packages) {
    const extra = supplemental.packages.find(
      (value) =>
        value.ecosystem === pkg.ecosystem &&
        value.name === pkg.name &&
        value.version === pkg.version,
    );
    if (extra) {
      pkg.sourceRevision = extra.revision;
      for (const notice of extra.files ?? []) {
        const path = join(output, 'licenses/supplemental', notice.file),
          bytes = await readFile(path);
        if (createHash('sha256').update(bytes).digest('hex') !== notice.sha256)
          throw Error('Supplemental notice hash mismatch: ' + notice.file);
        pkg.files.push({ ...notice, path: relative(output, path) });
      }
    }
    if (
      !pkg.files.length &&
      (pkg.name.startsWith('@leafloom/') || pkg.name === 'leafloom-desktop')
    ) {
      const file = join(output, 'licenses/LICENSE');
      pkg.files.push({
        path: relative(output, file),
        sha256: createHash('sha256')
          .update(await readFile(file))
          .digest('hex'),
      });
    }
    pkg.noticeCoverage = pkg.files.length ? 'retained' : 'missing';
  }
  const missing = packages.filter((pkg) => pkg.noticeCoverage === 'missing');
  if (missing.length)
    throw Error(
      'Release dependency notices missing: ' +
        missing.map((pkg) => pkg.ecosystem + ':' + pkg.name + '@' + pkg.version).join(', '),
    );
  await writeFile(
    join(output, 'release-notices.json'),
    JSON.stringify({ formatVersion: 1, target: 'aarch64-apple-darwin', packages }, null, 2) + '\n',
  );
  return packages.length;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(process.argv[2] ?? '');
  if (!process.argv[2])
    throw Error('Usage: node scripts/stage-release-notices.mjs <host-directory>');
  console.log(
    'Staged release license notices: ' + (await stageReleaseNotices(output)) + ' packages',
  );
}
