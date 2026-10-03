# Electron document lifecycle spike

A disposable Svelte/TypeScript/MVVM authoring shell that imports NEO books, saves through a typed Electron port, and reopens acknowledged content after process interruption.

Read [FINDINGS.md](FINDINGS.md) for the result and [CONTRACTS.md](CONTRACTS.md) for ownership and persistence semantics. The authoring engine and rich HTML codec come from the preceding ProseMirror parity work.

## Run

From `spikes/editor-options`:

```sh
npm run lifecycle:check
npm run lifecycle:test
npm run lifecycle:native
```

The native command builds renderer, main and preload in that order, then runs Playwright against the existing signed macOS host. Prepare that host with `npm run parity:prepare:macos` when absent. Tests create marked temporary fixture folders and private profiles. Windows remain hidden; tests use no Keychain APIs or native menus.

The fixture is representative NEO data generated from the original storage format. Personal books are never opened. This shell exercises document lifecycle; the full NEO UX inventory and editor parity suites remain separate.

## Files

- `contracts.ts`: validated commands, replies, book envelope and storage errors.
- `legacy.ts`: staged NEO import and compatible export.
- `files.ts`: ordered atomic replacement, receipts, recovery, writer ownership.
- `main.ts`, `preload.cts`: authenticated IPC and Electron lifecycle.
- `LifecycleViewModel.svelte.ts`, `App.svelte`: commands and presentation.
- `telemetry.ts`: content-free spans with explicit IPC context propagation.
- `*.test.ts`, `native.spec.ts`: executable contract and lifecycle evidence.
