import { readdir, lstat, open } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const nativeMagic = new Set([
  'feedface',
  'cefaedfe',
  'feedfacf',
  'cffaedfe',
  'cafebabe',
  'bebafeca',
  'cafebabf',
  'bfbafeca',
]);
export async function inspectMacosPayloads(app) {
  const resources = join(app, 'Contents/Resources'),
    native = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name),
        info = await lstat(file);
      if (info.isSymbolicLink()) throw Error('Resource symlink refused: ' + relative(app, file));
      if (info.isDirectory()) {
        await walk(file);
        continue;
      }
      if (!info.isFile()) throw Error('Unexpected bundled resource: ' + relative(app, file));
      const handle = await open(file, 'r');
      try {
        const header = Buffer.alloc(4);
        await handle.read(header, 0, 4, 0);
        if (nativeMagic.has(header.toString('hex'))) native.push(relative(app, file));
      } finally {
        await handle.close();
      }
    }
  }
  await walk(resources);
  if (native.length !== 1 || native[0] !== 'Contents/Resources/host/node')
    throw Error('Unexpected native resource payloads: ' + JSON.stringify(native));
  return native;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = resolve(process.argv[2] ?? '');
  if (!app.endsWith('.app'))
    throw Error('Usage: node scripts/inspect-macos-payloads.mjs <Leafloom.app>');
  console.log(JSON.stringify({ nativeResourcePayloads: await inspectMacosPayloads(app) }));
}
