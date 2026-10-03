/** NEO231-C: actual hidden native quit, process exit, and restart; no save after typing. */
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { Library } from '../packages/library/src/index.ts';
import { Book, Manuscript } from '../packages/documents/document-contracts/src/index.ts';
import { Reviews } from '../packages/reviews/review-contracts/src/index.ts';
import { BookFiles } from '../packages/documents/filesystem-documents/src/files.ts';
import { evidenceMetadata } from '../tests/neo-compat/evidence.mjs';

const binary = resolve(process.argv[2] ?? 'apps/desktop/src-tauri/target/debug/leafloom-desktop');
const report = resolve(process.argv[3] ?? '.leafloom/evidence/native-quit-restart.json');
const withUpdater = process.argv.includes('--updater-fixture');
if (withUpdater && process.env.LEAFLOOM_NATIVE_UPDATER_ACCEPTANCE !== '1')
  throw Error('Explicit signed loopback updater fixture opt-in required');
if (process.platform !== 'darwin' || process.env.LEAFLOOM_NATIVE_QUIT_ACCEPTANCE !== '1')
  throw Error('Explicit macOS hidden acceptance opt-in required');
// Release builds deliberately ignore LEAFLOOM_HIDDEN. Never launch those here.
if (!binary.includes('/target/debug/')) throw Error('A frozen debug fixture binary is required');
const binaryBytes = await readFile(binary);
if (
  !binaryBytes.includes(Buffer.from('LEAFLOOM_HIDDEN')) ||
  !binaryBytes.includes(Buffer.from('TAURI_WEBDRIVER_PORT'))
)
  throw Error('Binary lacks hidden fixture driver capability');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const helperSha256 = sha(await readFile(new URL(import.meta.url)));
const buildSha256Before = (await evidenceMetadata('tauri-native-hidden')).buildSha256;
const fixture = await mkdtemp(join(tmpdir(), 'leafloom-native-quit-'));
const artifacts = resolve('.leafloom/evidence/native-quit-restart-' + randomUUID());
await mkdir(artifacts, { recursive: true });
await writeFile(join(fixture, '.leafloom-fixture'), '');
const bookId = 'book-' + randomUUID(),
  chapterId = 'quit-prose',
  otherId = 'retained-rich';
const tail = ' Fresh quit tail.';
const files = ['manuscript.json', 'reviews.json', 'notes.html', 'outline.html'];
await mkdir(join(fixture, bookId));
await writeFile(
  join(fixture, 'library.json'),
  JSON.stringify(
    Library.parse({
      firstRunDone: true,
      authorName: 'Quit fixture writer',
      authors: [{ id: 'writer', name: 'Quit fixture writer' }],
      currentAuthorId: 'writer',
      shelves: [{ id: 'shelf', name: 'Quit fixture shelf', authorId: 'writer', bookIds: [bookId] }],
      coverArt: { auto: false },
    }),
  ),
);
await writeFile(
  join(fixture, bookId, 'manuscript.json'),
  JSON.stringify(
    Book.parse({
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: {
        id: bookId,
        title: 'Normal quit fixture',
        author: 'Quit fixture writer',
        kind: 'novel',
        chapterTitles: { [chapterId]: 'Prose', [otherId]: 'Retained' },
        stickies: [
          { id: 'quit-note', chapterId: otherId, text: 'Retained sticky payload', resolved: false },
        ],
      },
      chapters: [
        { id: chapterId, html: '<p>Baseline prose.</p>' },
        {
          id: otherId,
          html: '<p><b>Other rich</b> <i>chapter.</i><span class="ph-mark" data-sid="quit-note" contenteditable="false">⚑</span></p>',
        },
      ],
      darlings: [
        {
          id: 'retained-darling',
          chapterId: otherId,
          html: '<p><i>Retained Darling.</i></p>',
          text: 'Retained Darling.',
          date: 1700000000000,
        },
      ],
    }),
  ),
);
// A legacy book has no review sidecar; its first durable composed checkpoint creates one.
await writeFile(join(fixture, bookId, 'notes.html'), '<p><b>Retained notes.</b></p>');
await writeFile(join(fixture, bookId, 'outline.html'), '<p><i>Retained outline.</i></p>');
// Validate the actual four-file boundary before starting any native process.
await new BookFiles(join(fixture, bookId)).load(false);
const launches = [];
let quitRestart, updaterFixture;
async function launch() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(binary, [], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      LEAFLOOM_FIXTURE_ROOT: fixture,
      LEAFLOOM_HIDDEN: '1',
      TAURI_WEBDRIVER_PORT: String(port),
    },
  });
  const state = { child, session: null, hostPid: null, binding: null, stderr: '' };
  launches.push(state);
  child.stderr.on('data', (bytes) => {
    state.stderr += bytes;
  });
  child.stdout.on('data', () => {});
  const base = 'http://127.0.0.1:' + port;
  state.request = async (path, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok || result.value?.error) throw Error('Native driver request failed: ' + path);
    return result.value;
  };
  state.until = async (predicate, label) => {
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      if (child.exitCode !== null || child.signalCode !== null)
        throw Error('Native exited during ' + label);
      try {
        const value = await predicate();
        if (value) return value;
      } catch {}
      await pause(100);
    }
    throw Error('Native timeout: ' + label);
  };
  state.script = (script, args = []) =>
    state.request('/session/' + state.session + '/execute/sync', { script, args });
  state.invoke = (command, payload) =>
    state.request('/session/' + state.session + '/execute/async', {
      script:
        'const done=arguments[arguments.length-1];window.__TAURI__.core.invoke(arguments[0],arguments[1]).then(v=>done({ok:true,value:v})).catch(()=>done({ok:false}));',
      args: [command, payload],
    });
  state.element = async (selector) =>
    (
      await state.request('/session/' + state.session + '/element', {
        using: 'css selector',
        value: selector,
      })
    )['element-6066-11e4-a52e-4f735466cecf'];
  state.click = async (selector) =>
    state.request(
      '/session/' + state.session + '/element/' + (await state.element(selector)) + '/click',
      {},
    );
  state.type = async (selector, text) =>
    state.request(
      '/session/' + state.session + '/element/' + (await state.element(selector)) + '/value',
      { text },
    );
  await state.until(() => state.request('/status'), 'driver startup');
  state.session = (
    await state.request('/session', { capabilities: { alwaysMatch: {} } })
  ).sessionId;
  await state.until(
    () => state.script('return !!document.querySelector(".book[data-book-id]")'),
    'owned library',
  );
  const response = await state.invoke('host_request', { method: 'diagnostics', payload: {} });
  assert.equal(response.ok, true);
  assert.equal(response.value.ok, true);
  const diag = response.value.value;
  assert.equal(diag.root, fixture);
  state.hostPid = diag.pid;
  assert.equal(dirname(diag.runtime.executable), dirname(diag.runtime.entry));
  assert.ok(diag.runtime.entry.endsWith('/main.mjs'));
  const webAssets = await state.request('/session/' + state.session + '/execute/async', {
    script:
      'const done=arguments[arguments.length-1];Promise.all([...document.querySelectorAll("script[src],link[rel=stylesheet][href]")].map(async el=>{const url=el.src||el.href,bytes=await(await fetch(url)).arrayBuffer();return {path:new URL(url).pathname,sha256:[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(v=>v.toString(16).padStart(2,"0")).join("")};})).then(done).catch(()=>done([]));',
    args: [],
  });
  assert.ok(webAssets.length > 0);
  state.binding = {
    helperSha256,
    driverSha256: helperSha256,
    driverPath: 'scripts/verify-macos-quit-restart.mjs',
    binarySha256: sha(await readFile(binary)),
    runtimeEntry: diag.runtime.entry,
    runtimeExecutable: diag.runtime.executable,
    hostMainSha256: sha(await readFile(diag.runtime.entry)),
    nodeSha256: sha(await readFile(diag.runtime.executable)),
    webAssets,
  };
  return state;
}
async function exitNormally(state) {
  if (state.child.exitCode === null && state.child.signalCode === null)
    await Promise.race([once(state.child, 'exit'), pause(10000)]);
  assert.equal(state.child.exitCode, 0, 'Managed quit must actually exit normally');
  assert.equal(state.child.signalCode, null);
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(state.hostPid, 0);
    } catch (e) {
      if (e.code === 'ESRCH') return;
    }
    await pause(50);
  }
  throw Error('Owned host child survived normal quit');
}
async function capture(stage) {
  await mkdir(join(artifacts, stage));
  const result = {};
  for (const name of files) {
    const bytes = await readFile(join(fixture, bookId, name));
    await writeFile(join(artifacts, stage, name), bytes);
    result[name] = { bytes, sha256: sha(bytes) };
  }
  return result;
}
try {
  if (withUpdater) {
    const { prepareUpdaterFixture } =
      await import('../tests/neo-compat/native/updater-fixture.mjs');
    updaterFixture = await prepareUpdaterFixture({ fixture, artifacts, binary });
    if (['prepare', 'inspect', 'close'].some((key) => typeof updaterFixture?.[key] !== 'function'))
      throw Error('Invalid updater fixture hooks');
  }
  const first = await launch();
  await first.click('.book[data-book-id="' + bookId + '"]');
  await first.until(
    () =>
      first.script(
        'return document.querySelector(".chapter-body")?.textContent.includes("Baseline prose.")',
      ),
    'initial open',
  );
  // Settle legacy migration before the author journey begins, then add a valid retained review.
  await first.click('#back-to-shelf');
  await first.until(
    () => first.script('return !!document.querySelector("#bookshelf-view")'),
    'baseline close',
  );
  const migrated = Manuscript.parse(
    JSON.parse(await readFile(join(fixture, bookId, 'manuscript.json'), 'utf8')),
  );
  const reviews = Reviews.parse(
    JSON.parse(await readFile(join(fixture, bookId, 'reviews.json'), 'utf8')),
  );
  const passage = migrated.chapters[1].passages[0].id;
  reviews.references.push({
    reference: {
      id: 'retained-reference',
      chapterId: otherId,
      passageId: passage,
      from: 0,
      to: 5,
      version: migrated.version,
      expected: [{ kind: 'text', text: 'Other', marks: [{ kind: 'bold', attributes: {} }] }],
      text: 'Other',
    },
    segments: [{ chapterId: otherId, passageId: passage, from: 0, to: 5 }],
    deleted: false,
    unresolved: false,
  });
  reviews.items.push({
    item: {
      id: 'retained-review',
      kind: 'note',
      category: 'voice',
      references: ['retained-reference'],
      message: 'Retained fixture review',
    },
    reviewId: 'fixture-review',
    rejected: false,
    accepted: false,
  });
  await writeFile(join(fixture, bookId, 'reviews.json'), JSON.stringify(Reviews.parse(reviews)));
  await first.click('.book[data-book-id="' + bookId + '"]');
  await first.until(
    () =>
      first.script(
        'return document.querySelector(".chapter-body")?.textContent.includes("Baseline prose.")',
      ),
    'baseline reopen',
  );
  if (updaterFixture) await updaterFixture.prepare(first, { bookId, chapterId });
  const before = await capture('before');
  const beforeBook = Manuscript.parse(JSON.parse(before['manuscript.json'].bytes.toString()));
  const beforeReviews = Reviews.parse(JSON.parse(before['reviews.json'].bytes.toString()));
  assert.equal(beforeReviews.items.length, 1);
  const beforeHTML = beforeBook.chapters[0].html;
  const expectedHTML = beforeHTML.replace('Baseline prose.', 'Baseline prose.' + tail);
  await first.script(
    'const view=document.querySelector(".chapter-body .ProseMirror"),p=view.querySelector("p");view.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(p);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);window.__quitInputAt=null;view.addEventListener("input",()=>window.__quitInputAt=performance.now(),{once:true});return true;',
  );
  await first.type('.chapter-body .ProseMirror', tail);
  // This is the first operation after native input. No blur, save, shelf, or disk polling.
  const observed = await first.script(
    'const p=document.querySelector(".chapter-body p"),at=performance.now(),inputAt=window.__quitInputAt;const result={text:p.textContent,dirty:document.querySelector(".save-state")?.textContent==="Unsaved",inputToQuitMs:inputAt===null?null:at-inputAt,quitCommand:"quitApp"};window.__TAURI__.core.invoke("os_request",{method:"quitApp",payload:{}});return result;',
  );
  assert.equal(observed.text, 'Baseline prose.' + tail);
  assert.equal(observed.dirty, true);
  assert.ok(
    observed.inputToQuitMs !== null && observed.inputToQuitMs < 500,
    'Quit must precede typing debounce',
  );
  await exitNormally(first);
  const after = await capture('after');
  const afterBook = Manuscript.parse(JSON.parse(after['manuscript.json'].bytes.toString()));
  const afterReviews = Reviews.parse(JSON.parse(after['reviews.json'].bytes.toString()));
  assert.equal(afterBook.metadata.id, bookId);
  const authorMetadata = (metadata) =>
    Object.fromEntries(
      Object.entries(metadata).filter(
        ([key]) => !['modified', 'wordCount', 'dailyCounts', 'lastPosition'].includes(key),
      ),
    );
  assert.deepEqual(authorMetadata(afterBook.metadata), authorMetadata(beforeBook.metadata));
  assert.deepEqual(
    afterBook.chapters.map((c) => c.id),
    beforeBook.chapters.map((c) => c.id),
  );
  assert.equal(afterBook.chapters[0].html, expectedHTML);
  assert.equal(afterBook.chapters[1].html, beforeBook.chapters[1].html);
  assert.deepEqual(afterBook.chapters[1].passages, beforeBook.chapters[1].passages);
  assert.deepEqual(afterBook.darlings, beforeBook.darlings);
  assert.deepEqual(afterBook.metadata.stickies, beforeBook.metadata.stickies);
  for (const name of ['notes.html', 'outline.html'])
    assert.ok(after[name].bytes.equals(before[name].bytes));
  assert.equal(afterReviews.version, afterBook.version);
  assert.deepEqual(afterReviews.references, beforeReviews.references);
  assert.deepEqual(afterReviews.items, beforeReviews.items);
  const second = await launch();
  assert.notEqual(second.child.pid, first.child.pid);
  assert.notEqual(second.hostPid, first.hostPid);
  assert.deepEqual(
    second.binding,
    first.binding,
    'Restart must use exactly the same native snapshot',
  );
  await second.click('.book[data-book-id="' + bookId + '"]');
  const reopenedText = await second.until(
    () =>
      second.script(
        'const p=document.querySelector(".chapter-body p");return p?.textContent===arguments[0]?p.textContent:null;',
        ['Baseline prose.' + tail],
      ),
    'durable reopened tail',
  );
  assert.deepEqual(
    await second.script(
      'return [...document.querySelectorAll(".chapter-body")].map(el=>el.dataset.chid)',
    ),
    [chapterId, otherId],
  );
  assert.deepEqual(await second.script('return window.__leafloomErrors??[]'), []);
  quitRestart = {
    contractId: 'lifecycle:normal-quit',
    id: 'NEO-231-C',
    title: 'NEO-231-C normal quit retains fresh native typing across restart',
    actions: [
      'Type fresh tail through actual native author input',
      'Invoke actual quitApp without blur/save/shelf',
      'Observe owned process exit',
      'Restart same private library and reopen book',
    ],
    assertions: [
      'Just-typed tail durably exists in same chapter',
      'Other chapter/Notes/Outline/reviews/identity retained',
      'Restarted actual native DOM displays exact tail',
    ],
    bookId,
    chapterId,
    tail,
    beforeHTML,
    expectedHTML,
    processExited: true,
    exitCode: first.child.exitCode,
    quitCommand: observed.quitCommand,
    unsavedAtQuit: observed.dirty,
    firstProcessId: first.child.pid,
    restartedProcessId: second.child.pid,
    firstHostProcessId: first.hostPid,
    restartedHostProcessId: second.hostPid,
    quitBeforeDebounce: true,
    inputToQuitMs: observed.inputToQuitMs,
    reopenedText,
    artifacts,
    files: Object.fromEntries(
      files.map((name) => [
        name,
        { beforeSha256: before[name].sha256, afterSha256: after[name].sha256 },
      ]),
    ),
  };
  await writeFile(join(artifacts, 'quit.json'), JSON.stringify(quitRestart, null, 2) + '\n');
  const updater = updaterFixture
    ? await updaterFixture.inspect({ launches, quitRestart })
    : undefined;
  await second.script(
    'window.__TAURI__.core.invoke("os_request",{method:"quitApp",payload:{}});return true;',
  );
  await exitNormally(second);
  assert.equal(sha(await readFile(new URL(import.meta.url))), helperSha256);
  const buildSha256After = (await evidenceMetadata('tauri-native-hidden')).buildSha256;
  assert.equal(
    buildSha256After,
    buildSha256Before,
    'Source must remain frozen across both launches',
  );
  const result = {
    evidenceSchema: 'leafloom/native-v1',
    appImplementation: 'leafloom-production',
    driver: 'tauri-native-hidden',
    referenceCommit: 'ed090e9988d446daf1ebbde91bcebc13b599909b',
    status: 'passed',
    buildSha256: buildSha256Before,
    buildSha256Before,
    buildSha256After,
    binary,
    artifactBinding: first.binding,
    restartArtifactBinding: second.binding,
    fixtureKind: 'marked disposable private library',
    hiddenWindow: true,
    quitRestart,
    ...(updater ? { updater } : {}),
  };
  await mkdir(dirname(report), { recursive: true });
  await writeFile(report, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({ status: 'passed', report, artifacts, inputToQuitMs: observed.inputToQuitMs }),
  );
} catch (error) {
  await mkdir(dirname(report), { recursive: true });
  await writeFile(
    report + '.failure.json',
    JSON.stringify(
      {
        status: 'failed',
        buildSha256Before,
        helperSha256,
        artifacts,
        error: String(error),
        launches: await Promise.all(
          launches.map(async (state) => ({
            dom: await state
              .script(
                'return {url:location.href,title:document.title,errors:window.__leafloomErrors??[],body:document.body?.innerText};',
              )
              .catch(() => null),
            pid: state.child.pid,
            exitCode: state.child.exitCode,
            signal: state.child.signalCode,
            binding: state.binding,
            stderr: state.stderr,
          })),
        ),
      },
      null,
      2,
    ) + '\n',
  );
  throw error;
} finally {
  for (const state of launches) {
    if (state.child.exitCode === null && state.child.signalCode === null) {
      await state
        .script(
          'window.__TAURI__.core.invoke("os_request",{method:"quitApp",payload:{}});return true;',
        )
        .catch(() => {});
      await Promise.race([once(state.child, 'exit'), pause(5000)]);
      if (state.child.exitCode === null && state.child.signalCode === null) {
        try {
          process.kill(-state.child.pid, 'SIGTERM');
        } catch {}
        await pause(200);
      }
      if (state.child.exitCode === null && state.child.signalCode === null) {
        try {
          process.kill(-state.child.pid, 'SIGKILL');
        } catch {}
      }
    }
  }
  try {
    await updaterFixture?.close();
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}
