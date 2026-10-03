# Architecture composition spike

A disposable standalone Svelte/TypeScript/MVVM authoring shell combining ProseMirror, whole-book persistence, passage identity, review contracts and Electron lifecycle.

Read [REGROUP.md](REGROUP.md) for the rewrite decision, [CONTRACTS.md](CONTRACTS.md) for ownership and durability, and [AUDIT.md](AUDIT.md) for goal evidence. [migration-ledger.json](migration-ledger.json) carries all 304 inventoried NEO features into the rewrite.

## Run

From `spikes/editor-options`:

```sh
npm run composition:check
npm run composition:test
npm run composition:e2e
npm run composition:native
npm run identity:test
```

Browser journeys use headless Chromium on temporary port 5184. The native journey reuses the existing signed NEO Parity host, keeps windows hidden, and uses a temporary book and private profile. It deliberately kills main once to verify restart. It never operates on personal books.

For a manual preview: `npx vite --config composition-spike/vite.config.ts`. `?manual` disables autosave; `?size=500` selects the performance fixture; `?unsupported` selects protected rich content.

## Files

| Boundary | Files |
| --- | --- |
| Portable document, review, storage and lifecycle contracts | `contracts.ts`, `editor-port.ts`, `conformance.ts` |
| ProseMirror state, identity, references and global history | `core.ts` |
| Editor DOM surfaces and mapped transactions | `prosemirror-surfaces.ts` |
| State projections, commands and save/close coordination | `AuthoringViewModel.svelte.ts` |
| Presentation and composition root | `App.svelte`, `main-renderer.ts`, `renderer-bindings.ts` |
| Renderer storage adapters | `renderer-store.ts` |
| Main storage, host and preload | `files.ts`, `main.ts`, `preload.cts`, `launch.cjs` |
| Observability | `telemetry.ts` |
| Executable proof | `*.test.ts`, `browser.spec.ts`, `native.spec.ts` |

The core reuses rich codec/fidelity primitives from the earlier spikes. Those shared helpers are exported from `identity-spike/session.ts`; its 44 integration tests were rerun. No production source was rewritten.
