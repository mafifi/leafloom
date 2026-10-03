# Original NEO integration reference

Run from `spikes/editor-options`:

```sh
npx playwright test --config parity/reference.config.ts
```

The reference executes original `main.js`, `preload.js`, `app.js`, `index.html` and CSS in real Electron. Every launch copies their bytes into an isolated source snapshot and records SHA-256 hashes. The original editor remains Chromium contenteditable. The source snapshot uses the spike's installed dependencies, including NEO's real Hunspell worker and dictionaries.

Each fixture is an explicitly marked `mkdtemp` directory under the system temporary directory. The launcher rejects a missing, relative, unmarked, or non-temporary data directory. Electron Documents, userData and temp paths point inside it. Settings are private; a settings libraryDir outside its private Documents/NEO Library is rejected. Tests remove their own fixtures after closing Electron.

Host interception protects the author's machine: macOS preference writes are recorded, native menu injection through koffi follows NEO's graceful failure branch, file pickers cancel, message boxes choose their cancel response, external URL/reveal calls are recorded, and trash operations move fixture files into private Trash. Network, painted-cover, email and update calls are blocked and recorded. These external-effect branches need explicit controlled providers and outcome tests before they count as parity coverage.

Relative `BrowserWindow.loadFile` resolves against the copied source snapshot. This is necessary because Electron otherwise resolves it against the wrapper's application directory. Assets are read through symlinks; application/library writes use private paths.

`NEO_PARITY_ENGINE=prosemirror` adds the classic IIFE bundle `parity-dist/neo-prosemirror.js` before original app.js. The original source hash manifest remains the original source evidence; the target bundle has a separate hash. The injected index is intentionally different. Other engine values are rejected.

The reference scenarios establish first-run identity, title-page Enter creating the first chapter, native typing and disk restart, double-Enter scene creation and undo rejoining, triple-Enter chapter splitting, chapter-start Backspace retaining paragraph boundaries, and Shift-Enter italic poetry with two-step Backspace conversion/merge. The poetry merge comparison treats Chromium's ordinary-space-to-NBSP DOM repair as the same visible word spacing.
