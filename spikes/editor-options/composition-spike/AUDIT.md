# Approved goal audit

| Requirement | Evidence |
| --- | --- |
| Composed Svelte/TypeScript/MVVM and public editor provider boundary | `App.svelte`, `AuthoringViewModel.svelte.ts`, `editor-port.ts`, `prosemirror-surfaces.ts`, `main-renderer.ts`; clean type checks |
| Rich content and original preservation | Fresh checkpoint test in `core.test.ts`; unsupported read-only browser/core journeys; existing 44 identity/fidelity regression tests |
| Full authoring journey | `browser.spec.ts`: prose, Darling archive/restore, notes and outline, global undo, chapters, save/reopen |
| Cross-chapter passage operations and book-level history | `core.test.ts` and browser review-move journey: stable reference follows move, acceptance, undo/redo, saved accepted state |
| Durable manuscript/review checkpoint and mismatch safety | `storage.test.ts`: four-file receipts, partial checkpoint, exact uncertain retry, external preflight, writer contention, permission failure, backup recovery and unresolved review coordinates |
| Provider-independent storage conformance | Same `conformance.ts` assertions against memory fixture and filesystem provider |
| Runtime contracts and validated IPC replies | `contracts.test.ts`, `contracts.ts`, `renderer-store.ts`; malformed paths/lease/context/replies, mismatched review/book identity/version |
| UI → editor and UI → IPC → storage telemetry | Native assertions plus `evidence/ipc-traces.json`; content/path exclusion assertions |
| Meaningful composed responsiveness | Two real-keyboard 500-paragraph browser journeys, with and without 20 review references; saved JSON and zero typing snapshots |
| Signed Electron open/save/close/restart | `native.spec.ts`; actual disk, main SIGKILL/restart, failed save-on-close and retry; hidden windows and no unexpected crash dumps |
| Preserve NEO acceptance scope for rewrite | All 304 features in `migration-ledger.json`; 444 registered desktop scenarios retained; composed coverage and remaining features distinguished in `REGROUP.md` |
| No real agents; bounded background native activity | Deterministic fixture replies, headless browser, temporary marked folder/profile and unchanged signed host |
| Discussion-ready verdict | `REGROUP.md`, `CONTRACTS.md` and retained executable evidence |

Fresh final checks: 18 composition integration tests, 7 browser journeys, 1 signed native journey and 44 identity/fidelity regression tests passed. Svelte/TypeScript reports zero errors and warnings; renderer/main/preload builds passed. Existing full parity suites were not rerun in this goal. The composition spike establishes architecture feasibility; complete feature replacement is governed by the retained NEO registry.
