/* =========================== NEO POCKET =========================== */
/* The window.neo doorway, implemented for Android and iOS. Reads and    */
/* writes the same plain files as desktop NEO, in a NEO Library folder:  */
/* Android: Documents/NEO Library, shared with the Mac via Syncthing.    */
/* iOS: the app's own folder — inside iCloud Drive when the writer has  */
/* it on (so desktop NEO can point at the same folder), else On My iPad. */
/* Desktop-only powers (export, email, spellcheck, import) stub out      */
/* quietly; writing never does.                                          */

(function () {
  const FS = () => window.Capacitor.Plugins.Filesystem;
  const DIR = 'DOCUMENTS';
  const ROOT = 'NEO Library';
  const isIOS = () => !!(window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios');

  // iOS: HOME is the library folder as a file:// URL, found by the little
  // LibraryHome plugin (ios/App/App/LibraryHome.swift); CLOUD says whether
  // that folder lives in iCloud Drive. Android leaves both alone.
  let HOME = null;
  let CLOUD = false;
  const libraryHome = () => (window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin('LibraryHome') : window.Capacitor.Plugins.LibraryHome);
  const ready = (async () => {
    if (!isIOS()) return;
    try {
      const r = await libraryHome().locate();
      HOME = String(r.path).replace(/\/+$/, '');
      CLOUD = !!r.cloud;
      // first launch on a new iPad: the whole library is still in the cloud
      if (CLOUD) await libraryHome().fetch({ wait: 20000 });
    } catch (err) {
      showErrorDetail('Could not find the library folder: ' + (err && err.message || err) +
        '\nplugins the page can see: ' + Object.keys((window.Capacitor && window.Capacitor.Plugins) || {}).join(', '));
    }
  })();

  // library-relative path -> the Filesystem plugin's idea of where that is
  const p = (...parts) => parts.join('/');
  function at(rel) {
    if (HOME) return { path: rel ? HOME + '/' + rel.split('/').map(encodeURIComponent).join('/') : HOME };
    return { path: rel ? ROOT + '/' + rel : ROOT, directory: DIR };
  }

  // iCloud delivers other devices' files as placeholders until asked;
  // ask before reading anything a Mac might have written.
  async function fetchCloud(rel, wait) {
    if (!CLOUD) return;
    try { await libraryHome().fetch({ path: at(rel).path, wait: wait || 8000 }); } catch { /* read anyway */ }
  }

  async function listDir(rel) {
    await ready;
    const ls = await FS().readdir(at(rel));
    return (ls.files || []).map((f) => (f && f.name) || f).filter((n) => !String(n).endsWith('.icloud'));
  }

  async function ensureDir(path) {
    await ready;
    try {
      await FS().mkdir({ ...at(path), recursive: true });
    } catch { /* exists */ }
  }

  async function readText(path) {
    await ready;
    const r = await FS().readFile({ ...at(path), encoding: 'utf8' });
    return r.data;
  }

  async function writeText(path, data) {
    await ready;
    try {
      await FS().writeFile({ ...at(path), data, encoding: 'utf8', recursive: true });
    } catch (err) {
      showErrorDetail('Could not save ' + path + ': ' + (err && err.message || err));
      throw err;
    }
  }

  let permissionHelpShown = false;
  function showPermissionHelp(err) {
    if (permissionHelpShown) return;
    permissionHelpShown = true;
    const bd = document.createElement('div');
    bd.style.cssText = 'position:fixed;inset:0;background:#191919;color:#d6d2c6;z-index:9999;' +
      'display:flex;align-items:center;justify-content:center;padding:40px;text-align:center';
    const why = isIOS()
      ? '<p style="line-height:1.6;margin-top:16px">Pocket couldn\'t open its NEO Library folder. Force-quit and reopen the app; if it keeps happening, check that iCloud Drive is signed in (Settings → your name → iCloud), or turn it off so Pocket keeps books on the iPad itself.</p>'
      : '<p style="line-height:1.6;margin-top:16px">Pocket can see the NEO Library folder but Android is blocking it from reading files that other apps (like Syncthing) created.</p>' +
        '<p style="line-height:1.6;color:#999;margin-top:12px">The switch is not on the app\'s own Permissions page. Open Android Settings, search for <b>All files access</b> (or Apps → Special app access → All files access), turn it on for NEO Pocket, then come back here.</p>';
    bd.innerHTML = '<div style="max-width:420px"><h2 style="letter-spacing:5px">NEO POCKET</h2>' + why +
      '<p style="font:12px/1.5 monospace;color:#777;margin-top:20px;word-break:break-word">' + String(err && err.message || err || '') + '</p></div>';
    document.body.appendChild(bd);
  }

  // On a phone there's no easy way to open the log, so show the error itself.
  // Long-press the box to copy it; tap to dismiss.
  function showErrorDetail(msg) {
    try {
      let box = document.getElementById('pocket-error-detail');
      if (!box) {
        box = document.createElement('pre');
        box.id = 'pocket-error-detail';
        box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;max-height:40vh;overflow:auto;' +
          'margin:0;padding:12px;background:#2a1d1d;color:#e8c9c9;font:12px/1.5 monospace;' +
          'white-space:pre-wrap;word-break:break-word;border-radius:8px;z-index:9998;user-select:text';
        box.addEventListener('click', () => box.remove());
        document.body.appendChild(box);
      }
      box.textContent = String(msg).slice(0, 2000) + '\n\n(tap to dismiss)';
    } catch { /* never let the reporter itself hiccup */ }
  }

  async function readJSONFile(path, fallback) {
    try { return JSON.parse(await readText(path)); } catch { return fallback; }
  }

  async function writeJSONFile(path, data) {
    await writeText(path, JSON.stringify(data, null, 2));
  }

  const bookDir = (bookId) => p(bookId);

  // The honest access test: reading a file another app created. An app can
  // always touch its OWN files without the big permission — which is exactly
  // how a too-gentle test lies about a half-broken setup.
  async function checkAccess() {
    try {
      await ensureDir('');
      let names = [];
      try { names = await listDir(''); } catch { /* fall through to the write test */ }
      if (names.includes('library.json')) {
        await readText(p('library.json')); // the file that matters, whoever made it
      } else {
        await FS().writeFile({ ...at('.pocket-touch'), data: String(Date.now()), encoding: 'utf8', recursive: true });
        try { await FS().deleteFile(at('.pocket-touch')); } catch { /* fine */ }
      }
      return true;
    } catch (err) {
      showPermissionHelp(err);
      return false;
    }
  }

  function slugify(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  window.neo = {
    /* ---------- library ---------- */
    readLibrary: async () => {
      if (!(await checkAccess())) return { authorName: '', penNames: [], firstRunDone: false, shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [] }] };
      await fetchCloud('library.json', 15000);
      return readJSONFile(p('library.json'), {
        authorName: '', penNames: [], firstRunDone: false, pageTheme: 'night',
        shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [] }]
      });
    },
    writeLibrary: async (data) => { await writeJSONFile(p('library.json'), data); return true; },
    libraryPath: async () => {
      // a served URL lets cover art render in the webview
      try {
        await ready;
        if (HOME) return window.Capacitor.convertFileSrc(HOME);
        const u = await FS().getUri({ path: ROOT, directory: DIR });
        return window.Capacitor.convertFileSrc(u.uri);
      } catch { return 'Documents/NEO Library'; }
    },

    /* ---------- books ---------- */
    readBookMeta: async (bookId) => { await fetchCloud(bookId); return readJSONFile(p(bookId, 'book.json'), null); },
    listBooks: async () => {
      const out = [];
      try {
        for (const name of await listDir('')) {
          if (!String(name).startsWith('book-')) continue;
          const m = await readJSONFile(p(name, 'book.json'), null);
          if (m && m.id) out.push({ id: m.id, title: m.title || 'Untitled', author: m.author || '', modified: m.modified || '', kind: m.kind || '' });
        }
      } catch { /* an empty list is honest enough */ }
      return out;
    },
    writeBookMeta: async (bookId, meta) => {
      meta.modified = new Date().toISOString();
      await writeJSONFile(p(bookId, 'book.json'), meta);
      return meta.modified;
    },
    // app.js asks before re-reading a book: on iCloud, pull down whatever the
    // Mac wrote since (a short wait; the shelf must never hang on the network)
    refreshBook: async (bookId) => { await fetchCloud(bookId, 4000); return true; },
    createBook: async (opts) => {
      const seed = (opts && opts.title) ? slugify(opts.title) : '';
      const id = 'book-' + (seed ? seed + '-' : '') + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      const book = {
        id,
        title: (opts && opts.title) || 'Untitled',
        subtitle: '',
        author: (opts && opts.author) || '',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        chapterOrder: [],
        coverSeed: Math.floor(Math.random() * 100000),
        lastPosition: null
      };
      await ensureDir(bookDir(id) + '/chapters');
      await writeJSONFile(p(id, 'book.json'), book);
      await writeText(p(id, 'notes.html'), '');
      await writeText(p(id, 'outline.html'), '');
      await writeJSONFile(p(id, 'darlings.json'), []);
      await writeJSONFile(p(id, 'stickies.json'), []);
      return book;
    },
    // the folder goes; on iOS the Files app keeps it in Recently Deleted
    deleteBook: async (bookId) => {
      try {
        await ready;
        await FS().rmdir({ ...at(bookId), recursive: true });
        return true;
      } catch (err) {
        showErrorDetail('Could not delete ' + bookId + ': ' + (err && err.message || err));
        return false;
      }
    },

    /* ---------- chapters ---------- */
    // {chId: mtime and size}: lets app.js re-read only what changed on disk
    // (the size too: Syncthing and iCloud keep the other device's mtime, and
    // two saves in the same second must not look alike)
    chapterStamps: async (bookId) => {
      const out = {};
      try {
        await ready;
        const ls = await FS().readdir(at(p(bookId, 'chapters')));
        for (const f of ls.files || []) {
          const name = (f && f.name) || String(f);
          if (name.endsWith('.html')) out[name.slice(0, -5)] = ((f && f.mtime) || 0) + ':' + ((f && f.size) || 0);
        }
      } catch { /* no chapters yet */ }
      return out;
    },
    readChapter: async (bookId, chId) => {
      await fetchCloud(p(bookId, 'chapters', chId + '.html'));
      try { return await readText(p(bookId, 'chapters', chId + '.html')); } catch { return ''; }
    },
    writeChapter: async (bookId, chId, html) => {
      await ensureDir(bookDir(bookId) + '/chapters');
      await writeText(p(bookId, 'chapters', chId + '.html'), html);
      return true;
    },
    deleteChapter: async (bookId, chId) => {
      try { await FS().deleteFile(at(p(bookId, 'chapters', chId + '.html'))); } catch { /* fine */ }
      return true;
    },

    /* ---------- notes / outline / json sidecars ---------- */
    readAux: async (bookId, name) => {
      try { return await readText(p(bookId, name + '.html')); } catch { return ''; }
    },
    writeAux: async (bookId, name, html) => { await writeText(p(bookId, name + '.html'), html); return true; },
    readJSON: (bookId, name, fallback) => readJSONFile(p(bookId, name + '.json'), fallback),
    writeJSON: async (bookId, name, data) => { await writeJSONFile(p(bookId, name + '.json'), data); return true; },

    /* ---------- API keys & painting: desktop only ---------- */
    hasSecret: async () => false,
    setSecret: async () => false,
    paintCover: async () => { throw new Error('Cover painting happens on the desktop'); },

    /* ---------- covers: shown if present, managed on the Mac ---------- */
    readCover: async (bookId, fname) => {
      try {
        await ready;
        const r = await FS().readFile(at(p(bookId, fname)));
        const ext = fname.split('.').pop().toLowerCase();
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        return { base64: r.data, mime, ext };
      } catch { return null; }
    },
    pickCover: async () => null,
    setCover: async () => null,
    removeCover: async () => true,

    /* ---------- desktop powers, politely absent ---------- */
    // Export: the page builds the file (txt/md/html as text, docx/epub as
    // zip entries); it is written to the app's cache and handed to the
    // system share sheet — AirDrop, Files, Mail, whatever the writer picks.
    exportSave: async ({ format, defaultName, content, zipEntries }) => {
      try {
        const Share = window.Capacitor.Plugins.Share;
        if (!Share) throw new Error('Sharing is not available in this build');
        if (format === 'pdf') { if (typeof toast === 'function') toast('PDF export happens on the desktop — html, docx and epub work here'); return null; }
        const name = (defaultName || 'book') + '.' + format;
        let data;
        let encoding = 'utf8';
        if (zipEntries) {
          if (!window.JSZip) throw new Error('Zip support missing');
          const zip = new window.JSZip();
          // same shape main.js zips on the desktop: [{path, content, base64?, store?}]
          for (const e of zipEntries) {
            zip.file(e.path, e.content, { base64: !!e.base64, compression: e.store ? 'STORE' : 'DEFLATE' });
          }
          data = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', mimeType: 'application/epub+zip' });
          encoding = undefined; // base64 to the plugin
        } else {
          data = content;
        }
        const w = await FS().writeFile({ path: 'exports/' + name, directory: 'CACHE', data, encoding, recursive: true });
        await Share.share({ title: name, url: w.uri });
        return name;
      } catch (err) {
        if (!/cancel/i.test(String(err && err.message || err))) showErrorDetail('Export failed: ' + (err && err.message || err));
        return null;
      }
    },
    emailDraft: async () => ({ ok: false }),
    importFiles: async () => [],
    importPick: async () => [],
    pathForFile: () => null,
    checkForUpdate: async () => ({ error: true }),
    openRelease: async () => true,
    fullscreenEscape: async () => false,
    fullscreenToggle: async () => true,
    spellCheckWords: async (words) => { const o = {}; for (const w of words) o[w] = true; return o; },
    spellSuggest: async () => [],
    spellLearn: async () => true,
    setSpellLanguage: async () => false, // the spellcheck pass is a desktop thing
    appVersion: async () => 'Pocket 0.1.0',
    logError: async (msg) => {
      try {
        let prior = '';
        try { prior = await readText(p('neo-errors.log')); } catch { /* first entry */ }
        const line = `[${new Date().toISOString()}] [pocket] ${msg}\n`;
        await writeText(p('neo-errors.log'), (prior + line).slice(-100000));
      } catch { console.error(msg); }
      showErrorDetail(msg);
    },
    // no menu bar in your pocket: the ⋯ sheet (index.html) sends the same
    // messages the desktop menus do, and the tick marks come back here
    onMenu: (fn) => { window.pocketMenu = fn; },
    poetryState: (on) => { window.pocketState.poetry = !!on; },
    typewriterState: (on) => { window.pocketState.typewriter = !!on; }
  };
  window.pocketState = { poetry: false, typewriter: false };

  // Interface language: the same locales/ files as the desktop, picked by
  // the device's language (regional file over its base, English beneath).
  // Read synchronously here because app.js reads window.neo.i18n as it loads.
  function loadLocale() {
    const want = String(navigator.language || 'en').replace('_', '-');
    const base = want.split('-')[0];
    const get = (code) => {
      try {
        const x = new XMLHttpRequest();
        x.open('GET', 'locales/' + code + '.json', false);
        x.send();
        if (x.responseText && (x.status === 200 || x.status === 0)) return JSON.parse(x.responseText);
      } catch { /* no such language */ }
      return null;
    };
    const english = get('en') || {};
    if (base === 'en') return { locale: 'en', dict: {}, base: english };
    const baseDict = get(base);
    const regional = want !== base ? get(want) : null;
    if (!baseDict && !regional) return { locale: 'en', dict: {}, base: english };
    return { locale: regional ? want : base, dict: { ...(baseDict || {}), ...(regional || {}) }, base: english };
  }
  try { window.neo.i18n = loadLocale(); } catch { /* English it is */ }

  // iOS puts a shortcuts bar (bold, italic, mic, ⌘ hints) above its keyboard;
  // it covers Pocket's own bar, and NEO has its own idea of formatting
  // the keyboard's colour follows the page theme (body.night comes and goes
  // as the writer switches Night and Paper)
  if (isIOS()) {
    const tellKeyboard = () => { try { libraryHome().setKeyboard({ dark: document.body.classList.contains('night') }); } catch { /* fine */ } };
    document.addEventListener('DOMContentLoaded', () => {
      tellKeyboard();
      new MutationObserver(tellKeyboard).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    });
  }

  // Android: whatever shows around the page (the camera cutout band on a
  // Samsung, the status bar when a swipe peeks it) takes the page's own
  // color — night, paper or light — instead of the phone's white
  if (!isIOS()) {
    let bars = null;
    try { bars = window.Capacitor.registerPlugin('NeoBars'); } catch { /* older shell */ }
    const tellBars = () => {
      if (!bars) return;
      const bg = (el) => getComputedStyle(el).backgroundColor;
      let c = bg(document.body);
      if (!c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c)) c = bg(document.documentElement);
      bars.set({ color: c }).catch(() => { /* an older APK without the plugin */ });
    };
    document.addEventListener('DOMContentLoaded', () => {
      tellBars();
      // after a theme change, once any color transition has settled
      new MutationObserver(() => { tellBars(); setTimeout(tellBars, 450); })
        .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    });
  }

  // The keyboard's height becomes a CSS variable, and Pocket's own bar and
  // panes sit above it (pocket.css). iOS is told nothing about resizing;
  // its own attempts left a black band behind when the keyboard went away.
  // Android shrinks the window for its keyboard by itself, so there the
  // variable stays 0: lifting the page again left a keyboard-sized gap (#142).
  document.addEventListener('DOMContentLoaded', () => {
    if (!isIOS()) return;
    try {
      const K = window.Capacitor.Plugins.Keyboard;
      if (!K) return;
      const setKb = (h) => document.documentElement.style.setProperty('--kb', Math.max(0, h || 0) + 'px');
      K.addListener('keyboardWillShow', (info) => setKb(info && info.keyboardHeight));
      K.addListener('keyboardWillHide', () => setKb(0));
    } catch { /* not on this platform */ }
  });

  // Pocket is written on a real keyboard, so Android's on-screen one stays
  // down: every editable field gets inputmode="none", which keeps the caret
  // and hardware typing but never summons the soft keyboard. Long-press the
  // ☰ button to bring it back for an emergency (and again to send it away).
  // iPadOS already hides its keyboard whenever a hardware one is attached,
  // so there the on-screen keyboard behaves normally unless toggled off.
  const EDITABLE = '[contenteditable], input, textarea';
  let softKeyboard = isIOS();
  try {
    const saved = localStorage.getItem('pocket-soft-keyboard');
    if (saved) softKeyboard = saved === 'on';
  } catch { /* fine */ }
  function applyKeyboardMode(root) {
    const els = root.matches && root.matches(EDITABLE) ? [root] : [];
    (root.querySelectorAll ? [...els, ...root.querySelectorAll(EDITABLE)] : els).forEach((el) => {
      if (softKeyboard) el.removeAttribute('inputmode');
      else el.setAttribute('inputmode', 'none');
      // iOS would otherwise autocorrect, capitalise, underline and suggest
      // its way through a manuscript. The page is the writer's alone.
      if (isIOS()) {
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('autocapitalize', 'off');
        el.setAttribute('autocomplete', 'off');
        el.setAttribute('spellcheck', 'false');
      }
    });
  }
  window.pocketToggleSoftKeyboard = () => {
    if (isIOS()) return true; // iOS decides for itself: on screen when no keyboard is attached
    softKeyboard = !softKeyboard;
    try { localStorage.setItem('pocket-soft-keyboard', softKeyboard ? 'on' : 'off'); } catch { /* fine */ }
    applyKeyboardMode(document);
    if (softKeyboard && document.activeElement) { document.activeElement.blur(); }
    if (typeof toast === 'function') toast(softKeyboard ? 'On-screen keyboard on' : 'On-screen keyboard off — long-press ☰ to bring it back');
    return softKeyboard;
  };
  document.addEventListener('DOMContentLoaded', () => {
    applyKeyboardMode(document);
    new MutationObserver((muts) => {
      muts.forEach((m) => {
        m.addedNodes.forEach((n) => { if (n.nodeType === 1) applyKeyboardMode(n); });
        if (m.type === 'attributes' && m.target.nodeType === 1) applyKeyboardMode(m.target);
      });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable'] });
  });
  document.addEventListener('focusin', (e) => { if (e.target && e.target.matches && e.target.matches(EDITABLE)) applyKeyboardMode(e.target); }, true);

  // Android's back gesture / Esc lands here (see MainActivity). Returns true
  // when the page handled it, false to let Android background the app.
  window.pocketBack = () => {
    try {
      const nav = document.getElementById('nav-pane');
      if (nav && nav.classList.contains('open')) { nav.classList.remove('open'); return true; }
      const side = document.getElementById('side-pane');
      if (side && side.classList.contains('open')) { side.classList.remove('open'); return true; }
      const modal = document.querySelector('.modal-backdrop:not([hidden])');
      if (modal) { modal.hidden = true; return true; }
      const editor = document.getElementById('editor-view');
      if (editor && !editor.hidden && typeof backToShelf === 'function') { backToShelf(); return true; }
    } catch (err) { console.error(err); }
    return false;
  };
})();
