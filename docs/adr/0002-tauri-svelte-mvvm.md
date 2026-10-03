# ADR 0002: Tauri host and Svelte presentation

- Status: Accepted for the authorized rewrite
- Date: 2026-10-02

## Decision

Tauri packages the desktop app under stable identity `org.mafifi.leafloom`. Rust owns native OS integration, scoped file grants, lifecycle and the native image codec. The managed Node child runs bundled TypeScript `LibraryHost` and `@leafloom/filesystem-documents`, which own document persistence, leases, durable file replacement, receipts, backup and recovery. TypeScript also owns product behaviour. Svelte 5 Views render narrow `{presentation, actions}` props supplied by operation-owning ViewModels. Leaf Views receive only their presentation/action slice; they do not fetch, select providers or receive a concrete ViewModel.

`@leafloom/desktop-host` defines host requests. Browser and Tauri providers implement that boundary. Browser development uses disposable fixture data. Real file, clipboard, menu, window and spell services belong to the native provider.

The desktop bundle includes the pinned Node runtime, bundled host entry, dictionaries, fonts and license resources. Packaging records their hashes in the resource manifest; runtime diagnostics identify the actual child executable and entry. Native test evidence binds those launched resources and the served WebView assets.

Use one composition root for application startup and subscription disposal. Choose the smallest state owner; static presentation does not need a ViewModel class.

## Alternatives

Electron was the original reference host, not the replacement architecture. A browser-only product cannot satisfy desktop file/lifecycle acceptance. Putting host SDKs into portable contracts would couple every consumer to one runtime.

## Verification

Run shared provider conformance, Svelte semantic/focus tests, candidate browser integration and opt-in signed native integration. Browser proof does not substitute for native clipboard, fullscreen, signing, file durability or menu proof.
