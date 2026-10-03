import { readFile, lstat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function verifyReleaseNotices(hostDirectory) {
  const root = resolve(hostDirectory);
  const manifest = JSON.parse(await readFile(join(root, 'release-notices.json'), 'utf8'));
  if (
    manifest.formatVersion !== 1 ||
    manifest.target !== 'aarch64-apple-darwin' ||
    !Array.isArray(manifest.packages) ||
    !manifest.packages.length
  )
    throw Error('Release notice manifest invalid');
  let files = 0;
  for (const pkg of manifest.packages) {
    if (pkg.noticeCoverage !== 'retained' || !Array.isArray(pkg.files) || !pkg.files.length)
      throw Error('Release notices missing: ' + pkg.name);
    for (const entry of pkg.files) {
      const path = resolve(root, entry.path);
      if (
        !path.startsWith(root + sep) ||
        !entry.path.startsWith('licenses/') ||
        !/^[0-9a-f]{64}$/.test(entry.sha256)
      )
        throw Error('Release notice reference invalid: ' + pkg.name);
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink())
        throw Error('Release notice file invalid: ' + entry.path);
      const digest = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
      if (digest !== entry.sha256) throw Error('Release notice changed: ' + entry.path);
      files++;
    }
  }
  return { packages: manifest.packages.length, files };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2])
    throw Error('Usage: node scripts/verify-release-notices.mjs <host-directory>');
  console.log(JSON.stringify(await verifyReleaseNotices(process.argv[2])));
}
