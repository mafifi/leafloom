import { copyFileSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { KnownNodeRuntime } from '../apps/desktop/host/node-runtime.ts';
const directory = resolve(process.argv[2] ?? 'apps/desktop/src-tauri/binaries/host');
mkdirSync(directory, { recursive: true });
const node = join(directory, 'node'),
  license = join(directory, 'LICENSE.node');
copyFileSync(process.execPath, node);
copyFileSync(join(dirname(dirname(process.execPath)), 'LICENSE'), license);
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const found = {
  version: execFileSync(node, ['--version'], { encoding: 'utf8' }).trim().slice(1),
  platform: execFileSync(node, ['-p', 'process.platform'], { encoding: 'utf8' }).trim(),
  arch: execFileSync(node, ['-p', 'process.arch'], { encoding: 'utf8' }).trim(),
  minimumMacOS: execFileSync('/usr/bin/otool', ['-l', node], {encoding:'utf8'}).match(/cmd LC_BUILD_VERSION[\s\S]*?minos ([0-9.]+)/)?.[1],
  bytes: statSync(node).size,
  binarySha256: hash(node),
  licenseBytes: statSync(license).size,
  licenseSha256: hash(license),
};
for (const key of Object.keys(KnownNodeRuntime) as (keyof typeof KnownNodeRuntime)[])
  if (found[key] !== KnownNodeRuntime[key])
    throw new Error('Bundled Node runtime mismatch: ' + key);
writeFileSync(join(directory, 'runtime.json'), JSON.stringify({...found, supportPolicy:'https://raw.githubusercontent.com/nodejs/node/v24.20.0/BUILDING.md'}, null, 2) + '\n');
console.log('Verified bundled Node ' + found.version + ' ' + found.arch);
