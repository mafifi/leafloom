import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { readdir, realpath } from 'node:fs/promises';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { SourceBook } from '../packages/documents/document-contracts/src/index.ts';
import { Reviews } from '../packages/reviews/review-contracts/src/index.ts';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const id = 'book-backup-fixture';
const names = [
  'library.json',
  ...['manuscript.json', 'reviews.json', 'notes.html', 'outline.html'].map(
    (name) => id + '/' + name,
  ),
].sort();
const first = 'First day Καλημέρα.',
  second = 'Second day 東京.';
const plain = (html) => new JSDOM(html).window.document;
/** Reparse the executed startup ZIP and its exact retained pre-startup author snapshot. */
export async function inspectBackupArtifacts(parser, row, bytes, binding, { base }) {
  const raw = await bytes(parser.file);
  assert.equal(sha(raw), row.artifact?.sha256, 'Backup manifest changed');
  const m = JSON.parse(raw.toString());
  assert.equal(m.mode, parser.mode);
  assert.equal(m.bookId, id);
  assert.ok(
    Array.isArray(m.inputs) && Array.isArray(m.archives) && Array.isArray(m.launches),
    'Startup stages missing',
  );
  assert.equal(
    (await bytes(m.libraryRoot + '/.leafloom-fixture')).toString(),
    'owned-host-backup-fixture-v1',
  );
  const expectedLabels = parser.mode === 'rollover' ? ['first', 'second'] : ['first'];
  assert.deepEqual(
    m.inputs.map((i) => i.label),
    expectedLabels,
  );
  const inputs = new Map();
  for (const input of m.inputs) {
    assert.deepEqual(
      Object.keys(input.files).sort(),
      names,
      'Complete four-file input snapshot missing',
    );
    const captured = {};
    for (const name of names) {
      const value = await bytes(input.path + '/' + name);
      assert.equal(sha(value), input.files[name].sha256, 'Author input bytes changed');
      assert.equal(value.length, input.files[name].bytes);
      captured[name] = value;
    }
    const book = SourceBook.parse(JSON.parse(captured[id + '/manuscript.json']));
    assert.equal(book.metadata.id, id);
    assert.equal(book.metadata.title, 'Backup fixture');
    assert.equal(book.metadata.author, 'Backup writer');
    assert.deepEqual(
      book.chapters.map((ch) => ch.id),
      ['rich', 'other'],
    );
    assert.equal(
      plain(book.chapters[0].html).querySelector('b,strong')?.textContent,
      input.label === 'first' ? first : second,
    );
    assert.equal(
      plain(book.chapters[1].html).querySelector('i,em')?.textContent,
      'Other rich chapter.',
    );
    assert.equal(captured[id + '/notes.html'].toString(), '<p><b>Retained research.</b></p>');
    assert.equal(captured[id + '/outline.html'].toString(), '<p><i>Retained plan.</i></p>');
    const reviews = Reviews.parse(JSON.parse(captured[id + '/reviews.json']));
    assert.equal(reviews.bookId, id);
    assert.equal(reviews.version, book.version);
    const library = JSON.parse(captured['library.json']);
    assert.ok(library.shelves.some((s) => s.bookIds.includes(id)));
    inputs.set(input.label, captured);
  }
  const finalDirectory = await realpath(path.join(base, m.libraryRoot, 'Backups'));
  assert.ok(
    finalDirectory.startsWith(base + path.sep),
    'Backup directory escapes retained fixture',
  );
  assert.deepEqual(
    (await readdir(finalDirectory)).sort(),
    m.afterArchiveNames,
    'Actual retained backup directory differs from manifest',
  );
  for (const name of m.afterArchiveNames) {
    assert.match(name, /^leafloom-backup-\d{4}-\d{2}-\d{2}\.zip$/);
    const archive = await bytes(m.libraryRoot + '/Backups/' + name);
    const parsed = await JSZip.loadAsync(archive, { checkCRC32: true });
    const recorded = m.archives.find((a) => path.basename(a.path) === name);
    if (recorded)
      assert.equal(
        sha(archive),
        recorded.sha256,
        'Final startup archive differs from retained parsed snapshot',
      );
    else {
      const day = Number(name.match(/2000-01-(\d{2})/)?.[1]);
      assert.ok(day >= 4 && day <= 16, 'Unexpected retained historical date');
      assert.equal(await parsed.file('old.txt').async('string'), 'Old snapshot ' + day);
    }
  }
  const dates = parser.mode === 'rollover' ? ['2099-04-03', '2099-04-04'] : ['2099-04-03'];
  assert.deepEqual(
    m.archives.map((a) => a.date),
    dates,
  );
  const archives = new Map();
  for (const a of m.archives) {
    assert.equal(path.basename(a.path), 'leafloom-backup-' + a.date + '.zip');
    const actual = await bytes(a.path);
    assert.equal(sha(actual), a.sha256, 'Backup ZIP bytes changed');
    assert.equal(actual.length, a.bytes);
    const zip = await JSZip.loadAsync(actual, { checkCRC32: true });
    const input = inputs.get(a.input);
    assert.ok(input, 'Backup input stage missing');
    for (const name of names) {
      assert.ok(zip.file(name), 'Readable author input omitted');
      assert.deepEqual(
        await zip.file(name).async('nodebuffer'),
        input[name],
        'ZIP author file differs from startup input',
      );
    }
    assert.ok(
      !Object.keys(zip.files).some(
        (name) =>
          name.startsWith('Backups/') ||
          name.startsWith('Exports/') ||
          name.endsWith('.DS_Store') ||
          /^\..+\.icloud$/.test(path.basename(name)),
      ),
      'Excluded file entered backup',
    );
    archives.set(a.date, { sha256: a.sha256, zip });
  }
  const launchDates =
    parser.mode === 'rollover'
      ? ['2099-04-03', '2099-04-03', '2099-04-04', '2099-04-04']
      : parser.mode === 'retention'
        ? ['2099-04-03', '2099-04-03']
        : ['2099-04-03'];
  assert.deepEqual(
    m.launches.map((l) => l.nowIso.slice(0, 10)),
    launchDates,
  );
  const pids = new Set();
  for (const l of m.launches) {
    assert.ok(
      Number.isSafeInteger(l.pid) && l.pid > 0 && !pids.has(l.pid),
      'Launch PID missing or duplicated',
    );
    pids.add(l.pid);
    assert.equal(l.exitCode, 0);
    assert.ok(l.elapsedMs >= 5000, 'Real startup timer was not observed');
    assert.deepEqual(Object.keys(l.files).sort(), [
      'clock-preload.mjs',
      'clock.json',
      'stderr.txt',
      'stdout.txt',
    ]);
    const captured = {};
    for (const [name, f] of Object.entries(l.files)) {
      captured[name] = await bytes(f.path);
      assert.equal(sha(captured[name]), f.sha256, 'Launch capture changed');
    }
    assert.equal(
      sha(captured['clock-preload.mjs']),
      binding.clockPreloadSha256,
      'Unreviewed clock preload',
    );
    const clock = JSON.parse(captured['clock.json']);
    assert.equal(clock.nowIso, l.nowIso);
    assert.equal(clock.root, path.join(base, m.libraryRoot), 'Clock root escapes marked ownership');
    assert.ok(
      captured['stdout.txt']
        .toString()
        .split('\n')
        .some((line) => {
          try {
            const r = JSON.parse(line);
            return r.ready === true && r.version === 1;
          } catch {
            return false;
          }
        }),
      'Actual sidecar startup readiness missing',
    );
    assert.ok(
      !captured['stderr.txt'].toString().includes('backup.failure'),
      'Startup backup failed',
    );
  }
  const checks =
    parser.mode === 'rollover'
      ? [
          { afterLaunch: 1, date: '2099-04-03' },
          { afterLaunch: 3, date: '2099-04-04' },
        ]
      : parser.mode === 'retention'
        ? [{ afterLaunch: 1, date: '2099-04-03' }]
        : [];
  assert.equal(m.sameDayChecks.length, checks.length);
  for (let i = 0; i < checks.length; i++) {
    const c = m.sameDayChecks[i];
    assert.equal(c.afterLaunch, checks[i].afterLaunch);
    assert.equal(c.date, checks[i].date);
    assert.equal(c.beforeSha256, archives.get(c.date).sha256);
    assert.equal(c.afterSha256, c.beforeSha256, 'Same-day archive changed');
  }
  if (parser.mode === 'retention') {
    assert.deepEqual(
      m.beforeArchiveNames,
      Array.from(
        { length: 16 },
        (_, i) => `leafloom-backup-2000-01-${String(i + 1).padStart(2, '0')}.zip`,
      ),
    );
    assert.deepEqual(m.afterArchiveNames, [
      ...Array.from(
        { length: 13 },
        (_, i) => `leafloom-backup-2000-01-${String(i + 4).padStart(2, '0')}.zip`,
      ),
      'leafloom-backup-2099-04-03.zip',
    ]);
  } else if (parser.mode === 'rollover') {
    assert.deepEqual(m.afterArchiveNames, [
      'leafloom-backup-2099-04-03.zip',
      'leafloom-backup-2099-04-04.zip',
    ]);
    assert.deepEqual(m.beforeArchiveNames, []);
  } else {
    assert.deepEqual(m.beforeArchiveNames, []);
    assert.deepEqual(m.afterArchiveNames, ['leafloom-backup-2099-04-03.zip']);
    const zip = archives.get('2099-04-03').zip;
    assert.equal(zip.file('permission-denied.txt'), null);
    assert.match(
      await zip.file('_left-out-of-this-backup.txt').async('string'),
      /permission-denied.txt \(EACCES\)/,
    );
    assert.equal(m.permissionProof.errorCode, 'EACCES');
    assert.equal(m.permissionProof.deniedMode, 0);
    assert.equal(m.permissionProof.restoredMode, 0o600);
    const denied = await bytes(m.permissionProof.path);
    assert.equal(sha(denied), m.permissionProof.sha256);
    assert.equal(denied.toString(), 'Denied supplemental input');
  }
  return {
    mode: parser.mode,
    authorFiles: names.length,
    archives: m.archives.length,
    startupLaunches: m.launches.length,
    qualifications: [
      'Actual bundled Node startup and private process clock; Rust launcher and physical desktop behavior are unproved.',
    ],
  };
}
