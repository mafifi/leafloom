import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  snapshot,
  buildInputs,
  writeSourceManifest,
  verifySourceManifest,
  digest,
} from './release-source-manifest.mjs';
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-source-binding-'));
  try {
    for (const path of [
      'apps/desktop/host',
      'apps/desktop/dist',
      'packages',
      'scripts',
      'docs',
      'tests',
    ])
      await mkdir(join(root, path), { recursive: true });
    const source = 'apps/desktop/host/main.ts';
    await writeFile(join(root, source), 'export const value=1;');
    await writeFile(join(root, 'apps/desktop/dist/index.html'), '<p>Frozen UI</p>');
    const app = join(root, 'fixture.app'),
      host = join(app, 'Contents/Resources/host');
    await mkdir(host, { recursive: true });
    await mkdir(join(app, 'Contents/MacOS'), { recursive: true });
    await writeFile(join(host, 'main.mjs'), 'const value=1;');
    await writeFile(join(host, 'node'), 'unsigned Node');
    await writeFile(join(app, 'Contents/MacOS/leafloom-desktop'), 'unsigned shell');
    await writeFile(
      join(host, 'host-build.json'),
      JSON.stringify({
        formatVersion: 1,
        mainSha256: digest(await readFile(join(host, 'main.mjs'))),
        compilerInputs: [{ path: source, sha256: digest(await readFile(join(root, source))) }],
      }),
    );
    await writeSourceManifest(root, app, buildInputs(await snapshot(root, true)), {
      fixture: true,
    });
    await run({ root, app, host, source });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('source binding checks compiler bytes, frozen frontend, and unsigned executables', async () =>
  fixture(async ({ root, app, source }) => {
    const binding = await verifySourceManifest(root, app);
    assert.equal(binding.compilerInputs, 1);
    await writeFile(join(app, 'Contents/MacOS/leafloom-desktop'), 'signed shell');
    await assert.rejects(verifySourceManifest(root, app), /Unsigned executable changed/);
    await verifySourceManifest(root, app, { unsigned: false });
    await writeFile(join(root, source), 'export const value=2;');
    await assert.rejects(
      verifySourceManifest(root, app, { unsigned: false }),
      /Source or frontend changed/,
    );
  }));
test('sealed resources reject additions and changed compiled host bytes', async () =>
  fixture(async ({ root, app, host }) => {
    await writeFile(join(host, 'unexpected.mjs'), 'new payload');
    await assert.rejects(verifySourceManifest(root, app), /Source or frontend changed/);
    await rm(join(host, 'unexpected.mjs'));
    await writeFile(join(host, 'main.mjs'), 'const value=2;');
    await assert.rejects(verifySourceManifest(root, app), /Source or frontend changed/);
  }));
test('manifest refuses source input edits before compilation receipt is sealed', async () =>
  fixture(async ({ root, app, source }) => {
    await writeFile(join(root, source), 'export const value=3;');
    await assert.rejects(
      writeSourceManifest(root, app, buildInputs(await snapshot(root, true)), {}),
      /Compiled host input changed/,
    );
  }));
test('Tauri generated schemas are derived but capability source stays immutable', async () =>
  fixture(async ({ root, app }) => {
    const generated = join(root, 'apps/desktop/src-tauri/gen/schemas');
    const capabilities = join(root, 'apps/desktop/src-tauri/capabilities');
    await mkdir(generated, { recursive: true });
    await mkdir(capabilities, { recursive: true });
    await writeFile(join(generated, 'desktop-schema.json'), '{"generated":"debug"}');
    await writeFile(join(capabilities, 'main.json'), '{"identifier":"main"}');
    const inputs = buildInputs(await snapshot(root, true));
    assert.equal(inputs.some(item => item.path.includes('/gen/schemas/')), false);
    assert.equal(inputs.some(item => item.path.endsWith('/capabilities/main.json')), true);
    await writeSourceManifest(root, app, inputs, {});
    await writeFile(join(generated, 'desktop-schema.json'), '{"generated":"release"}');
    await writeFile(join(generated, 'acl-manifests.json'), '{"generated":true}');
    await verifySourceManifest(root, app);
    await writeFile(join(capabilities, 'main.json'), '{"identifier":"changed"}');
    await assert.rejects(verifySourceManifest(root, app), /Source or frontend changed/);
  }));
