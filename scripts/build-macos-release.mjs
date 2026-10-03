import {
  snapshot,
  buildInputs,
  assertSame,
  writeSourceManifest,
  digest,
  verifySourceManifest,
} from './release-source-manifest.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw Error('Release target requires an arm64 macOS builder');
const env = {
  ...process.env,
  PATH: join(process.env.HOME, '.cargo/bin') + ':' + process.env.PATH,
  APPLE_SIGNING_IDENTITY: '-',
  CARGO_PROFILE_RELEASE_DEBUG_ASSERTIONS: 'false',
  MACOSX_DEPLOYMENT_TARGET: '14.0',
};
for (const name of [
  'APPLE_CERTIFICATE',
  'APPLE_CERTIFICATE_PASSWORD',
  'APPLE_ID',
  'APPLE_PASSWORD',
  'APPLE_TEAM_ID',
  'APPLE_API_ISSUER',
  'APPLE_API_KEY',
  'APPLE_API_KEY_PATH',
  'LEAFLOOM_TELEMETRY_TEST',
  'TAURI_CONFIG',
  'RUSTFLAGS',
  'CARGO_ENCODED_RUSTFLAGS',
  'CARGO_BUILD_RUSTFLAGS',
  'CARGO_TARGET_AARCH64_APPLE_DARWIN_RUSTFLAGS',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_REPL_EXTERNAL_MODULE',
])
  delete env[name];
execFileSync(process.execPath, ['--test', join(root, 'scripts/release-source-manifest.test.mjs'), join(root, 'scripts/verify-release-fonts.test.mjs')], {
  cwd: root,
  env,
  stdio: 'inherit',
});
const before = buildInputs(await snapshot(root, true));
// A frozen default frontend is an explicit input; never silently replace it here.
for (const asset of before.filter(
  (item) => item.path.startsWith('apps/desktop/dist/') && item.path.endsWith('.js'),
)) {
  const bytes = await readFile(join(root, asset.path));
  if (bytes.includes(Buffer.from('__leafloomTelemetryDiagnostics')))
    throw Error('Instrumentation frontend cannot enter a release');
}
const started = new Date().toISOString();
const args = [
  '--filter',
  '@leafloom/desktop',
  'exec',
  'tauri',
  'build',
  '--bundles',
  'app',
  '--config',
  JSON.stringify({
    build: { beforeBuildCommand: 'pnpm run bundle:host' },
    bundle: { macOS: { signingIdentity: '-' } },
  }),
  '--',
  '--locked',
];
await new Promise((resolve, reject) => {
  const child = spawn('pnpm', args, { cwd: root, env, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', (code) =>
    code === 0 ? resolve() : reject(Error('Release build failed: ' + code)),
  );
});
assertSame(before, buildInputs(await snapshot(root, true)));
const app = join(root, 'apps/desktop/src-tauri/target/release/bundle/macos/Leafloom.app');
const shellBytes = await readFile(join(app, 'Contents/MacOS/leafloom-desktop'));
const frontendHTML = await readFile(join(root, 'apps/desktop/dist/index.html'), 'utf8');
const embeddedFrontendEntries = [
  ...frontendHTML.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css))"/g),
].map((match) => match[1].split('/').at(-1));
if (
  !embeddedFrontendEntries.length ||
  embeddedFrontendEntries.some((name) => !shellBytes.includes(Buffer.from(name)))
)
  throw Error('Built shell does not contain the frozen frontend entry names');
const build = {
  started,
  finished: new Date().toISOString(),
  command: ['pnpm', ...args],
  signing: 'ad-hoc build input; Developer ID deferred',
  features: ['tauri/custom-protocol'],
  embeddedFrontendEntries,
  releaseDebugAssertions: false,
  deploymentTarget: '14.0',
  ambientCompilerFlagsCleared: true,
  nativeTestDriver: false,
  telemetryFixtureHook: false,
  rustc: execFileSync(join(process.env.HOME, '.cargo/bin/rustc'), ['--version'], {
    encoding: 'utf8',
  }).trim(),
  cargo: execFileSync(join(process.env.HOME, '.cargo/bin/cargo'), ['--version'], {
    encoding: 'utf8',
  }).trim(),
  pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
  builderNode: process.version,
};
await writeSourceManifest(root, app, before, build);
const binding = await verifySourceManifest(root, app);
const acceptance = execFileSync(
  process.execPath,
  [join(root, 'scripts/verify-macos-app.mjs'), app],
  { cwd: root, env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
);
execFileSync(process.execPath, [join(root, 'scripts/check-bundled-licenses.mjs')], {
  cwd: root,
  env: { ...env, LEAFLOOM_BUNDLE_RESOURCES: join(app, 'Contents/Resources') },
  stdio: 'inherit',
});
const manifestPath = join(app, 'Contents/Resources/source-manifest.json');
const codecLifecycle = [];
for (const flags of [[], ['--after-startup']])
  codecLifecycle.push(
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          join(root, 'scripts/verify-macos-codec-lifecycle.mjs'),
          join(app, 'Contents/MacOS/leafloom-desktop'),
          ...flags,
        ],
        { cwd: root, env, encoding: 'utf8' },
      ),
    ),
  );
await writeFile(
  app + '.build.json',
  JSON.stringify(
    {
      app,
      build,
      binding,
      sourceManifestSha256: digest(await readFile(manifestPath)),
      acceptance: JSON.parse(acceptance),
      codecLifecycle,
      signing:
        'ad-hoc build executables; Developer ID deferred; resource manifest added after build',
      notarization: 'not submitted',
      cleanMachineInstallation: 'not tested',
    },
    null,
    2,
  ) + '\n',
);
console.log('Source-bound release candidate: ' + app);
