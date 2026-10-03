import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyReleasePlatform } from './verify-release-platform.mjs';
test(
  'actual arm64 shell and bundled Node fit the declared macOS platform',
  { skip: process.platform !== 'darwin' || process.arch !== 'arm64' },
  async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'leafloom-platform-gate-')),
      app = join(fixture, 'Leafloom.app');
    try {
      const host = join(app, 'Contents/Resources/host');
      await mkdir(host, { recursive: true });
      await mkdir(join(app, 'Contents/MacOS'), { recursive: true });
      await copyFile(
        resolve('apps/desktop/src-tauri/binaries/host/node'),
        join(host, 'node'),
        constants.COPYFILE_FICLONE,
      );
      await copyFile(
        resolve('apps/desktop/src-tauri/binaries/host/runtime.json'),
        join(host, 'runtime.json'),
      );
      await copyFile(
        resolve('apps/desktop/src-tauri/target/debug/leafloom-desktop'),
        join(app, 'Contents/MacOS/leafloom-desktop'),
        constants.COPYFILE_FICLONE,
      );
      const plist = (minimum) =>
        `<?xml version="1.0"?><plist version="1.0"><dict><key>LSMinimumSystemVersion</key><string>${minimum}</string><key>CFBundleIdentifier</key><string>org.mafifi.leafloom</string><key>CFBundleShortVersionString</key><string>0.1.0</string></dict></plist>`;
      await writeFile(join(app, 'Contents/Info.plist'), plist('14.0'));
      const result = await verifyReleasePlatform(app);
      assert.equal(result.architecture, 'arm64');
      assert.equal(result.minimumMacOS, '14.0');
      assert.equal(result.binaries.find((item) => item.name === 'node').minimumMacOS, '13.5');
      await writeFile(join(app, 'Contents/Info.plist'), plist('13.0'));
      await assert.rejects(verifyReleasePlatform(app), /minimum macOS/);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);
