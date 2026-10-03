import {verifyReleaseFonts} from './verify-release-fonts.mjs';
import { verifyReleasePlatform } from './verify-release-platform.mjs';
import { verifyReleaseNotices } from './verify-release-notices.mjs';
import { inspectMacosPayloads } from './inspect-macos-payloads.mjs';
import { stat, readFile, mkdtemp, writeFile, rm, readdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
const app = resolve(process.argv[2] ?? '');
if (!app.endsWith('.app'))
  throw Error('Usage: node scripts/verify-macos-app.mjs <Leafloom.app> [--signed]');
const resources = join(app, 'Contents/Resources'),
  runtime = join(resources, 'host/node'),
  script = join(resources, 'host/main.mjs');
for (const path of [
  runtime,
  script,
  join(resources, 'host/LICENSE.node'),
  join(app, 'Contents/MacOS/leafloom-desktop'),
])
  await stat(path);
async function inspect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = join(path, entry.name);
    if ((await lstat(name)).isSymbolicLink()) throw Error('Bundled resource symlink: ' + name);
    if (entry.isDirectory()) await inspect(name);
  }
}
await inspect(resources);
const releasePlatform = await verifyReleasePlatform(app);
const releaseNotices = await verifyReleaseNotices(join(resources, 'host'));
const bundledFonts=await verifyReleaseFonts(join(resources,'host/fonts')); 
const nativeResourcePayloads = await inspectMacosPayloads(app);
const executable = execFileSync('/usr/bin/file', ['-b', runtime], { encoding: 'utf8' }).trim();
if (!executable.includes('arm64')) throw Error('Bundled Node architecture mismatch');
const codecExecutable=join(app,'Contents/MacOS/leafloom-desktop');
const shellBytes=await readFile(codecExecutable);
for (const debugMarker of ['LEAFLOOM_FIXTURE_DIALOGS','.leafloom-dialogs.json','TAURI_WEBDRIVER_PORT','__leafloomTelemetryDiagnostics'])
  if(shellBytes.includes(Buffer.from(debugMarker)))throw Error('Debug acceptance capability present in release: '+debugMarker);
const codecABI=Buffer.from('LEAFLOOM_PIPE_CODEC_V1\0');
if(!(await readFile(codecExecutable)).includes(codecABI))throw Error('Packaged pipe image codec missing; refusing to launch this executable');
const webpFixture=Buffer.from('UklGRi4AAABXRUJQVlA4TCEAAAAvAUAAEB8w/wKCIv9HExAU+T+agKDouuUCeGfCOkT0PwIA','base64');
const decoded=execFileSync(codecExecutable,['--leafloom-decode-webp'],{input:webpFixture,timeout:10000,maxBuffer:1000,env:{PATH:'/usr/bin:/bin'}});
if(!decoded.subarray(0,codecABI.length).equals(codecABI)||!decoded.subarray(codecABI.length).equals(Buffer.from([2,0,0,0,2,0,0,0,255,0,0,255,0,255,0,128,0,0,255,255,0,0,0,0])))throw Error('Packaged image codec pixels mismatch');
const signed = process.argv.includes('--signed');
if (signed) {
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' });
  for (const artifact of [runtime, app]) {
    const result = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', artifact], {
      encoding: 'utf8',
    });
    if (result.status !== 0) throw Error('Signature inspection failed');
    const description = result.stderr;
    if (
      !description.includes('Authority=Developer ID Application:') ||
      !description.includes('TeamIdentifier=QJJ98A74J8') ||
      !description.includes('runtime') ||
      !description.includes('Timestamp=')
    )
      throw Error('Incomplete Developer ID signature: ' + artifact);
  }
}
const fixture = await mkdtemp(join(tmpdir(), 'leafloom-release-fixture-'));
await writeFile(join(fixture, '.leafloom-fixture'), '');
const child = spawn(runtime, [script], {
  cwd: fixture,
  env: { PATH: '/usr/bin:/bin', HOME: fixture, LEAFLOOM_LIBRARY_ROOT: fixture,LEAFLOOM_IMAGE_DECODER:codecExecutable },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const output = createInterface({ input: child.stdout }),
  iterator = output[Symbol.asyncIterator]();
let stderr = '';
child.stderr.on('data', (chunk) => (stderr += chunk));
async function next() {
  let timer;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('Bundled host timeout')), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
try {
  const ready = JSON.parse((await next()).value);
  if (ready.ready !== true) throw Error('Bundled host readiness invalid');
  let sequence = 0;
  async function request(method, payload) {
    const id = ++sequence;
    child.stdin.write(JSON.stringify({ id, method, payload }) + '\n');
    const response = JSON.parse((await next()).value);
    if (response.id !== id || !response.ok)
      throw Error('Bundled host ' + method + ' failed: ' + JSON.stringify(response));
    return response.value;
  }
  const meta = await request('createBook', { title: 'Assembled app proof', author: 'Fixture' });
  await request('writeLibrary', { library: { books: [meta.id] } });
  const opened = await request('openBook', { bookId: meta.id });
  if (opened.readOnly || !opened.lease) throw Error('Bundled host cannot acquire fixture writer');
  const version = randomUUID();
  const checkpoint = {
    book: {
      ...opened.book,
      formatVersion: 'neo-composed/v1',
      revision: 1,
      version,
      chapters: [
        {
          id: 'chapter-proof',
          version: randomUUID(),
          html: '<p>Bundled manuscript Καλημέρα.</p>',
          passages: [],
        },
      ],
    },
    reviews: {
      formatVersion: 'neo-composed-reviews/v1',
      bookId: meta.id,
      version,
      references: [],
      items: [],
    },
    notes: 'Fixture notes',
    outline: 'Fixture outline',
  };
  await request('checkpoint', {
    bookId: meta.id,
    lease: opened.lease,
    checkpoint,
    expected: opened.versions,
  });
  await request('closeBook', { bookId: meta.id, lease: opened.lease });
  const reopened = await request('openBook', { bookId: meta.id });
  if (
    reopened.book.chapters[0].html !== checkpoint.book.chapters[0].html ||
    reopened.notes !== 'Fixture notes'
  )
    throw Error('Bundled durable checkpoint failed');
  const spell = await request('spellcheck', {
    words: ['writer', 'zzleafloomfixturezz'],
    language: 'en-US',
  });
  if (spell.writer !== true || spell.zzleafloomfixturezz !== false)
    throw Error('Bundled Hunspell failed');
  for (const format of ['txt', 'md', 'html', 'docx', 'epub', 'pdf']) {
    const destination = join(fixture, 'proof.' + format);
    await request('exportBook', { bookId: meta.id, format, destination });
    if ((await stat(destination)).size < 20) throw Error('Bundled export empty: ' + format);
  }
  const customWebP=join(fixture,'cover.webp');await writeFile(customWebP,webpFixture);await request('setCover',{bookId:meta.id,source:customWebP});
  const webpPDF=join(fixture,'webp.pdf');await request('exportBook',{bookId:meta.id,format:'pdf',destination:webpPDF});
  const webpOutput=(await readFile(webpPDF)).toString('latin1');if(!webpOutput.includes('/Width 2')||!webpOutput.includes('/Height 2')||!webpOutput.includes('/SMask'))throw Error('Bundled WebP PDF failed');
  await request('closeBook', { bookId: meta.id, lease: reopened.lease });
  const books = await request('listBooks', {});
  if (books.length !== 1 || books[0].id !== meta.id)
    throw Error('Bundled host storage round trip failed');
  child.stdin.end();
  const [code] = await once(child, 'exit');
  if (code !== 0) throw Error('Bundled host nonzero exit: ' + stderr);
  console.log(
    JSON.stringify(
      {
        app,
        bundledRuntime: execFileSync(runtime, ['--version'], { encoding: 'utf8' }).trim(),
        runtimeSha256: createHash('sha256')
          .update(await readFile(runtime))
          .digest('hex'),
        signed,
        nativeResourcePayloads,
        releaseNotices,
  bundledFonts,
        releasePlatform,
        hostRoundTrip: true,
        durableCheckpoint: true,
        hunspell: true,
        pipeImageCodec:true,
        webpPDF:true,
        exports: ['txt', 'md', 'html', 'docx', 'epub', 'pdf'],
        developmentRuntimeRequired: false,
        notarized: false,
      },
      null,
      2,
    ),
  );
} finally {
  output.close();
  if (child.exitCode === null) child.kill();
  await rm(fixture, { recursive: true, force: true });
}
