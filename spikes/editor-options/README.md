# NEO editor options

Three disposable editor providers in a standalone Svelte/TypeScript Electron app: extracted NEO browser editing, direct ProseMirror, and Lexical. Engine tabs share one manuscript, ViewModel and author-workflow service.

```sh
cd spikes/editor-options
npm ci
node node_modules/electron/install.js
npx playwright install chromium
npm run dev
# Or launch the compiled desktop app:
npm run electron
```

The browser opens at http://localhost:5178. Browser saves use local storage. Electron saves a separate `manuscript.json` under its own app data directory; set `NEO_SPIKE_DATA_DIR` to choose a test directory. **Reopen** loads the saved fixture. These files do not use NEO's production manuscript storage.

Select prose before using Bold, Italic, Keep selected passage or Suggest a revision. Press Enter repeatedly to move from paragraph to scene to chapter. The deterministic agent takes 1.5 seconds: edit another paragraph while it works, then accept and undo its revision. Edit the selected target instead to see rejection.

```sh
npm run check
npm test
npm run build
npm run test:e2e
npx playwright test --config tests/electron.config.ts
```

Read [FINDINGS.md](FINDINGS.md) for the comparison and [PLAN.md](PLAN.md) for scope and evidence. Provider-specific source boundaries are in each editor's `NOTES.md`.

The `neo-spike/v1` JSON format is experimental. The spike deliberately keeps domain operations, native editing and persistence as separate capabilities. `src/contracts.ts` owns portable interfaces and boundary schemas; `src/document.ts` owns pure manuscript operations; `src/session.ts` owns events and application history; `WorkbenchViewModel.svelte.ts` adapts these to Svelte; `electron/` supplies disk persistence through a narrow preload bridge.

NEO's extracted code retains its MIT notice in `src/editors/neo/LICENSE`. Installed ProseMirror, Lexical, Svelte and Electron packages declare MIT licenses. Dependencies remain pinned in the lockfile; packaging a distribution also requires retaining dependency notices.
