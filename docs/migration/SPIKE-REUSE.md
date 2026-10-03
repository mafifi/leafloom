# From the spikes to Leafloom

Leafloom carries the selected spike designs and their implementations into production packages. The application and desktop host are rebuilt around those packages. Production has no runtime imports from `spikes/` or the pinned NEO reference.

## Retained and adapted source

| Retained spike source | Production destination | Relationship and verification |
| --- | --- | --- |
| `spikes/editor-options/parity/src/codec.ts` | `packages/editing/prosemirror-editor/src/codec.ts` | Adapted readable-HTML schema/parser/serializer: paragraph classes, alignment, data attributes, inline marks, flags and clean export. Tested by `fidelity.test.ts`, `annotations-paste.test.ts` and actual Notes/poetry clipboard journeys. |
| `identity-spike/session.ts` (`identitySchema`, `entries`, `signature`, `runs`) | `prosemirror-editor/src/identity.ts` | Extracted stable passage attributes, structural signatures and rich inline runs into production helpers. Reference mapping is tested in `references.test.ts`; native surfaces send steps to the same master document. |
| `identity-spike/fidelity.ts` | `prosemirror-editor/src/fidelity.ts` | Adapted supported-content inspection and exact unsupported-byte retention. Unsupported content stays readable and guarded; it is not silently flattened into editable prose. |
| `composition-spike/core.ts` | `prosemirror-editor/src/core.ts`, `model.ts`, `reference-history.ts` and focused operation modules | Retained `BookCore`, section schema, master `EditorState`/history, identity/reference mapping, versioned checkpoints and review acceptance. Expanded NEO chapter, poetry, Outline, Darling, search, ownership and word-count commands. The former Darling hidden-anchor-only restore was replaced with source-compatible rich context/fallback restoration. |
| `composition-spike/prosemirror-surfaces.ts` | `prosemirror-editor/src/surfaces.ts` | Adapted native `EditorView` projections and local-to-master step mapping. Production renders every chapter and auxiliary surface, preserves mounted views, and handles NEO gestures, composition, actual author selection, focus and scroll. Surface tests and real Chromium keyboard/IME acceptance exercise this integration. |
| `identity-spike/contracts.ts`, `composition-spike/contracts.ts`, `editor-port.ts` | `packages/documents/document-contracts`, `packages/reviews/review-contracts`, `packages/editing/editor-contracts` | Split validated document/review/checkpoint DTOs and editor operations into portable packages. DOM host types stay generic at the contract boundary; PM and browser APIs belong to the provider. |
| `composition-spike/files.ts`, `lifecycle-spike/files.ts` | `packages/documents/filesystem-documents/src/files.ts` | Adapted writer ownership, UTF-8 validation, expected hashes, fsync/replace stages, backup recovery and partial/uncertain retries. Production retains the sequential four-file checkpoint and receipt model. `files.test.ts` uses actual private files, conflicts and injected delivery/failure barriers. |
| `composition-spike/telemetry.ts`, `lifecycle-spike/telemetry.ts`, `ui-spike/telemetry.ts` | `packages/observability/telemetry-contracts`, `browser-telemetry`, `prosemirror-editor/src/telemetry.ts` | Retained trace propagation and command/transaction/storage spans; added a portable contract, bounded diagnostics and metric reporting. Performance tests measure real typing-to-frame, mounted view retention and actual receipt hashes. |
| `src/WorkbenchViewModel.svelte.ts`, `composition-spike/AuthoringViewModel.svelte.ts` | `apps/desktop/src/lib/application.ts`, `library-view-model.ts`, `search-view-model.ts`, `goals.ts` | Retained MVVM dependency direction and command flow; application state, library interactions and focused ViewModels are reimplemented for the full Svelte application. The spike UI is not embedded. |

Paths after the first row share the prefix `spikes/editor-options/` for spike source and `packages/editing/` for `prosemirror-editor/` destinations.

The comparison is based on inspected implementations and exported operations, not a claim that these files are byte-identical. Production changes are verified against production modules.

## Reimplemented integration

- **Svelte application:** `apps/desktop/src/App.svelte` and its ViewModels mount the production surfaces and reproduce author-facing library, manuscript and auxiliary workspaces. The original `app.js` does not run inside Leafloom.
- **Tauri host:** `apps/desktop/src-tauri` and `apps/desktop/host` implement platform requests, storage composition, library management, imports/exports, spell providers, cover services, backups and stable packaging. Spike Electron main/preload files are retained as investigation material; they are not the production host.
- **Desktop contracts:** `packages/host/desktop-host` validates the production host request/reply boundary. The native OS port belongs to the desktop composition rather than the portable editor contracts.
- **NEO behavior:** the pinned original HTML/CSS, typography, cover algorithms and source inventory provide the behavioral and visual reference. Production implementations retain appropriate upstream attribution. `tests/reference/neo` remains an immutable oracle, not an application dependency.

## Retained tests and fresh evidence

`tests/neo-compat/parity` retains the historical reference/bridge harness and registry as migration material. The semantic author actions and assertions are adapted into `tests/neo-compat/candidate`; the opt-in `reference` adapter runs those actions against pinned NEO. Candidate tests use the real production browser application and private filesystem host. Native cases require their own packaged Tauri driver.

Historical spike reports do not satisfy the Leafloom parity gate. The [acceptance audit](ACCEPTANCE-AUDIT.md) distinguishes package conformance, browser author journeys and native outcomes. The [execution ledger](../plans/execution-ledger.md) records actual production runs and remaining failures.

The architectural decisions are [standalone portable contracts](../adr/0001-standalone-contract-first-repository.md), [Tauri with Svelte MVVM](../adr/0002-tauri-svelte-mvvm.md) and [one history with durable checkpoints](../adr/0003-document-history-and-durability.md).
