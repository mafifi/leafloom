// End-to-end tests for word counts. NEO runs on a throwaway library, a book
// comes in the way a dropped manuscript does, and every count is read off
// the screen the way the writer sees it. Run with `npm run test:words`.

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// A folder of its own for each run. Chromium writes to its profile until
// the process is gone, so a run can't remove its own; it removes those of
// earlier runs whose process has ended instead, leaving any still running.
for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-words-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-words-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
fs.mkdirSync(path.join(tmp, 'NEO Library'));
fs.writeFileSync(path.join(tmp, 'NEO Library', 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, pageTheme: 'night',
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [] }]
}));
// run from scripts/, NEO's window would look for scripts/index.html
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');

let wc;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const text = (id) => js(`document.getElementById(${JSON.stringify(id)}).textContent`);

// typed as keys: '\n' is Enter
async function type(keys) {
  for (const k of keys) {
    const keyCode = k === '\n' ? 'Enter' : k;
    wc.sendInputEvent({ type: 'keyDown', keyCode });
    wc.sendInputEvent({ type: 'char', keyCode: k === '\n' ? '\r' : k });
    wc.sendInputEvent({ type: 'keyUp', keyCode });
  }
  await tick(300); // the page gets sent keys asynchronously, and counts after them
}

// the caret at the end of the chapter, as a click after its last word leaves it
async function caretAtEnd() {
  await js(`(() => {
    const body = document.querySelector('.chapter-body');
    body.focus();
    const r = document.createRange();
    r.selectNodeContents(body.lastElementChild);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  })()`);
  await tick(300); // the counters catch up with a moved caret after a moment
}

// 51 paragraphs of five words: 255 words, two manuscript pages. A count
// that runs paragraphs together finds 50 words fewer, and one page.
const PARAS = 51;
const LINE = 'Rain fell on the harbor.';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('the book counter counts every paragraph\'s words', async () => {
  assert.equal(await text('word-counter'), '255 words');
});

test('opening the book keeps the count the import saved', async () => {
  assert.equal(await js('book.wordCount'), 255);
});

test('the chapter counter counts every paragraph\'s words', async () => {
  await caretAtEnd();
  await js(`document.getElementById('word-counter').click()`);
  try {
    assert.match(await text('word-counter'), /: 255 words$/);
  } finally {
    await js(`document.getElementById('word-counter').click()`);
  }
});

test('the page the caret is on counts the words before it', async () => {
  await caretAtEnd();
  await js(`document.getElementById('pos-counter').click()`);
  try {
    assert.equal(await text('pos-counter'), 'page 2 of 2');
  } finally {
    await js(`document.getElementById('pos-counter').click()`);
  }
});

test('a selection across paragraphs counts their words', async () => {
  await caretAtEnd();
  await js(`(() => {
    const body = document.querySelector('.chapter-body');
    const r = document.createRange();
    r.selectNodeContents(body);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  })()`);
  await tick(300);
  try {
    assert.equal(await text('word-counter'), '255 selected');
  } finally {
    await caretAtEnd();
  }
});

// the double click's first click moves the caret, which asks for a recount
// a moment later; the word the second click selects keeps its count
test('a double-clicked word counts as selected', async () => {
  await caretAtEnd();
  const [x, y] = await js(`(() => {
    const p = document.querySelector('.chapter-body').lastElementChild;
    p.scrollIntoView({ block: 'center' });
    const r = document.createRange();
    r.setStart(p.firstChild, 0);
    r.setEnd(p.firstChild, 4); // Rain
    const box = r.getBoundingClientRect();
    return [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)];
  })()`);
  for (const clickCount of [1, 2]) {
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount });
    await tick(60); // a hand's double click, not one event
  }
  await tick(300);
  try {
    assert.equal(await js('getSelection().toString().trim()'), 'Rain');
    assert.equal(await text('word-counter'), '1 selected');
  } finally {
    await caretAtEnd();
  }
});

test('a paragraph typed after the last one adds its words', async () => {
  await caretAtEnd();
  await type('\nwind off the sea.');
  assert.equal(await js(`document.querySelectorAll('.chapter-body > p').length`), PARAS + 1);
  assert.equal(await text('word-counter'), '259 words');
});

/* ---------- runner ---------- */

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    while (!(await js(`typeof library !== 'undefined' && !!library`).catch(() => false))) await tick(50);
    await tick(300);
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      await addImportedBooks([{ name: 'Words', chapters: [
        { title: 'One', paras: Array.from({ length: ${PARAS} }, () => ({ text: ${JSON.stringify(LINE)} })) }
      ] }], library.shelves[0]);
      const ids = library.shelves[0].bookIds;
      await openBook(ids[ids.length - 1]);
    })()`);
    await tick(300);
    win.focus();
    for (const t of tests) {
      try {
        await t.fn();
        console.log('ok   ' + t.name);
      } catch (err) {
        failed++;
        console.log('FAIL ' + t.name + '\n     ' + String(err.message).replace(/\n/g, '\n     '));
      }
    }
    console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error(err);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}
main();
