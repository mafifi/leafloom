# Authoring UI architecture spike

An isolated ProseMirror/Svelte/TypeScript MVVM writing surface, a minimal whole-book storage provider and local OpenTelemetry diagnostics. See [the findings](FINDINGS.md), [contracts](CONTRACTS.md) and [execution plan](PLAN.md).

Run from `spikes/editor-options`:

```sh
npm run ui:dev
npm run ui:check
npm run ui:test
npm run ui:e2e
npm run ui:build
```

Open `http://localhost:5180`. Use `?size=500&book=performance-demo` for the larger fixture. The editor comparison remains on port 5178.

The development host writes to a fresh temporary directory per launch. Browser reload preserves saved files; restarting the host selects a fresh directory. Set `NEO_UI_SPIKE_BOOKS` to an explicit folder to retain the same books across host restarts. The renderer can select an opaque book key, never a filesystem path. The host is a loopback development adapter; the static build requires a storage host.

The browser tests run headlessly. They exercise formatting, native Undo/Redo, NEO Enter gestures, chapter navigation, Darlings, DOM paste, notes, outline, save/reopen and concurrent reopen protection. Performance fixtures use 5 and 500 paragraphs. The baseline page uses the original adapter/session pipeline, including its keydown snapshot and Svelte full-document projection.

Node tests cover editor state, ViewModel scheduling, tracing and real filesystem recovery. Writer processes are killed at three durability boundaries. This is a process-interruption proof on the current macOS filesystem.

Browser images and timing samples are written to `/tmp/neo-ui-spike`. Playwright retains traces for failed tests. Agents and the native Electron host are outside this probe.
