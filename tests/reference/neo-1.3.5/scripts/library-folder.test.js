'use strict';

// A first library that Documents can't hold (a OneDrive folder on a computer
// where OneDrive isn't set up, #244) goes beside it instead of leaving the
// writer at "Start writing". Loads main.js the way filesystem.test.js does.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { describe, test } = require('node:test');

const root = path.join(__dirname, '..');
const localRequire = createRequire(path.join(root, 'main.js'));
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

// a computer: a home folder (with or without Documents), the app's own
// folder, and a "Documents" that cannot be written in (a path below a file)
function computer({ documents = true, chosen = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-library-folder-'));
  const home = path.join(base, 'home');
  const userData = path.join(base, 'userData');
  fs.mkdirSync(home);
  fs.mkdirSync(userData);
  if (documents) fs.mkdirSync(path.join(home, 'Documents'));
  const gone = path.join(base, 'OneDrive');
  fs.writeFileSync(gone, 'not a folder');
  const broken = path.join(gone, 'Documents', 'NEO Library');
  if (chosen) fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ libraryDir: broken }));

  const shown = { sync: [], async: [] };
  const handlers = new Map();
  const electron = {
    app: {
      commandLine: { appendSwitch() {} },
      getPath: (name) => ({ home, userData, documents: path.dirname(broken) })[name] || os.tmpdir(),
      getLocale: () => 'en',
      requestSingleInstanceLock: () => true,
      whenReady: () => ({ then() {} }),
      on() {}
    },
    ipcMain: { on() {}, handle: (name, fn) => handlers.set(name, fn) },
    BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
    Menu: { buildFromTemplate: (items) => items, setApplicationMenu() {} },
    dialog: {
      showMessageBoxSync: (opts) => { shown.sync.push(opts); return 2; }, // Continue
      showMessageBox: (opts) => { shown.async.push(opts); return Promise.resolve({ response: 0 }); }
    },
    utilityProcess: { fork: () => ({ on() {}, postMessage() {} }) },
    screen: {}
  };
  const context = vm.createContext({
    require: (name) => name === 'electron' ? electron : localRequire(name),
    __dirname: root,
    process: { platform: process.platform, on() {} },
    console,
    startDir: broken
  });
  vm.runInContext(source, context, { filename: path.join(root, 'main.js') });
  vm.runInContext('LIBRARY_DIR = startDir; LIBRARY_FILE = require("path").join(startDir, "library.json");', context);
  const run = (code) => vm.runInContext(code, context);
  return {
    base, home, userData, shown, run,
    dir: () => run('LIBRARY_DIR'),
    settings: () => JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')),
    call: (name, ...args) => handlers.get(name)(null, ...args),
    done: () => fs.rmSync(base, { recursive: true, force: true })
  };
}

describe('a library folder that can\'t be written', { concurrency: 1 }, () => {
  test('a first library goes in the home Documents folder, once, and stays there', () => {
    const pc = computer();
    try {
      pc.run('checkLibraryWritable()');
      const want = path.join(pc.home, 'Documents', 'NEO Library');
      assert.equal(pc.dir(), want);
      assert.equal(pc.settings().libraryDir, want); // the next launch finds it too
      assert.equal(pc.shown.sync.length, 0);        // no question with no answer

      pc.run('announceLibraryFallback()');
      assert.equal(pc.shown.async.length, 1);
      assert.ok(pc.shown.async[0].detail.includes(want));
      pc.run('announceLibraryFallback()');
      assert.equal(pc.shown.async.length, 1);       // said once

      // and the first-run screen's save now works
      assert.equal(pc.call('library:write', { firstRunDone: true, shelves: [] }), true);
      assert.equal(JSON.parse(fs.readFileSync(path.join(want, 'library.json'), 'utf8')).firstRunDone, true);
    } finally {
      pc.done();
    }
  });

  test('with no Documents folder in the home, it goes in the home itself', () => {
    const pc = computer({ documents: false });
    try {
      pc.run('checkLibraryWritable()');
      assert.equal(pc.dir(), path.join(pc.home, 'NEO Library'));
      assert.equal(fs.existsSync(path.join(pc.home, 'Documents')), false);
    } finally {
      pc.done();
    }
  });

  test('a folder the writer chose is never swapped: they are asked instead', () => {
    const pc = computer({ chosen: true });
    try {
      const chosen = pc.settings().libraryDir;
      pc.run('checkLibraryWritable()');
      assert.equal(pc.dir(), chosen);
      assert.equal(pc.shown.sync.length, 1);
      assert.equal(pc.settings().libraryDir, chosen);
      assert.equal(fs.existsSync(path.join(pc.home, 'Documents', 'NEO Library')), false);
    } finally {
      pc.done();
    }
  });

  test('a folder that isn\'t there is not blamed on Windows Security', () => {
    const pc = computer();
    try {
      const say = (code) => {
        pc.run(`probe = ${JSON.stringify(code)}`);
        return pc.run('blockedDetail("X:\\\\Docs", { code: probe })');
      };
      assert.match(say('ENOENT'), /OneDrive/);
      assert.match(say('ENOTDIR'), /OneDrive/);
      assert.doesNotMatch(say('ENOENT'), /Controlled folder access/);
      assert.doesNotMatch(say('EPERM'), /OneDrive/);
    } finally {
      pc.done();
    }
  });
});
