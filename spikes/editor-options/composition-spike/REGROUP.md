# Rewrite regroup

Completed 2 October 2026. **Start the standalone rewrite using Svelte, TypeScript, MVVM and ProseMirror.** The composition spike joins the architecture seams: responsive editing, one book-level history, rich fidelity and passage identity, portable review contracts, durable storage receipts, close/restart handling and connected telemetry.

Real agents remain last. The next work is a production implementation with feature acceptance gates, rather than another general architecture spike.

## Fresh evidence

| Check | Result |
| --- | --- |
| Svelte/TypeScript | 0 errors, 0 warnings |
| Composition contract/core/storage integration | 18 passed |
| Headless authoring journeys | 7 passed, 8.9 seconds |
| Signed hidden Electron journey | 1 passed, 3.4 seconds including harness |
| Existing identity/fidelity regression | 44 passed |
| Renderer/main/preload production builds | Passed |
| New unexpected NEO/Electron crash dumps during final native journey | None |

The native journey traverses actual renderer → preload → main → disk, verifies trace ancestry, kills and restarts main after acknowledgement, reopens prose/notes/review targets, then forces a real filesystem permission failure during save-on-close and proves retry preserves the draft. It reuses the signed host unchanged and opens no visible native window.

| 500-paragraph keyboard fixture | Input commit p95 | Next frame p95 | Full snapshots during typing |
| --- | --- | --- | --- |
| Plain | 1.3 ms | 11.7 ms | 0 |
| 20 attached review references | 2.0 ms | 14.8 ms | 0 |

The fixture contains 8,495 words after typing. These are Chromium headless measurements on this machine; they define a reproducible regression baseline. Large-book, spellcheck, multi-window, real IME and platform measurements belong to implementation acceptance. [Performance JSON](evidence/performance-500-reviews.json), [connected trace evidence](evidence/ipc-traces.json), and [inspected UI capture](evidence/review.png) are retained.

## Decisions supported by the proof

| Decision | Rewrite direction |
| --- | --- |
| Commands and undo | One book command owner and master editor history. Public ProseMirror plugins issue transactions; views never mutate editable DOM. |
| Svelte/MVVM | Dumb views, typed commands and small reactive projections. Keep ProseMirror state and transaction mapping in providers. |
| Manuscript | One whole-book envelope retaining rich HTML and a small passage identity index. Separate notes, outline and review documents. |
| Fidelity | Preserve original source, validate migrations, and protect unsupported content. Require the rich corpus and real NEO workflows before replacing a feature. |
| Research | Derive bounded rich extracts from the manuscript. Return standard suggestions or notes. Keep writing heuristics out of the permanent manuscript schema. |
| Persistence | Main-only storage, writer lease, hash conflicts, durable receipts and explicit partial-checkpoint recovery. |
| Observability | Content-free OTel spans from input and commands through saving. Ship bounded diagnostics/export policy with the production host. |
| Agents | Defer execution. Existing input/proposal/reference contracts provide the extension seam. |

## Preserve the author experience

The original inventory contains **304 features**; the desktop integration registry contains **444 scenarios**. [migration-ledger.json](migration-ledger.json) retains every feature, its architectural owner and registered acceptance cases. The earlier compatibility proof retains NEO chrome/controllers and interposes ProseMirror. This composition shell proves the new seams for representative authoring workflows; it does **not** implement the entire NEO application.

The composed flows cover rich typing, global undo/redo, explicit chapter create/rename/duplicate/reorder/delete, paragraph relocation, inline Darling archive/restore, independent notes/outline, deterministic review attachment/acceptance, save/reopen and close/restart. Original metadata and raw content remain protected.

The rewrite must port NEO's distinctive behavior into public editor plugins and typed commands: single/double/triple Enter, scene boundaries, poetry, cross-chapter Backspace, structural undo grouping, language typography, paste, placeholders, sticky notes and all Darling restoration modes. The current composition surface uses ProseMirror base keymap for ordinary editing. Its native browser spellcheck attribute is not NEO's Hunspell/language UI. Preserve NEO spelling defaults, dictionaries, lazy scanning and replacement workflows explicitly.

Library/author shelves, covers, bound-book presentation, search, counters/goals, Vim, menus, accessibility, import/export, synchronization and application preferences also remain migration work. The illustrated shell supplies a paper/palette baseline; full NEO layout and author workflows remain acceptance requirements. Carry the registry forward without resetting it to this smaller test count.

## Production sequence

1. Extract portable contracts and conformance suites, provider packages and the Electron/Svelte composition roots. Fix ownership rules and dependency checks. Keep the standalone OSS build independent of Drawloom and the projects monorepo.
2. Deliver a real library/open/edit/save/close slice using validated, reversible migration and backups. Preserve source folders and assets; define recovery UI for mismatched reviews and partial auxiliary commits.
3. Port authoring plugins against NEO acceptance cases. Migrate history, caret, structural gestures and typography first; then Darlings, annotations, notes/outline, search and spellcheck. Compare feature behavior and presentation with original NEO before retiring each legacy path.
4. Finish library/chrome/native features, exports and synchronization. Run the full desktop registry, actual IME/accessibility and Windows/Linux storage/host suites. Grow the performance fixture and track memory/layout alongside input latency.
5. Add plugin execution and local Codex/Claude adapters after the host/document/permission boundaries are stable. Keep proposals author-controlled and acceptance undoable.

## Matters to settle during implementation

- Keep independently durable auxiliaries or require whole-folder atomic snapshots? The tested four-file protocol safely refuses mismatched review targets; full multi-file atomicity would require additional commit machinery.
- Final portable rich-content codec: retain compatible HTML now; change only with a complete fidelity migration proof.
- Specify stale writer-recovery gate cleanup and conflict UI. Optimistic hashes retain a final check-to-rename race against an uncooperative external writer.
- Verify directory sync, rename, lock recovery and packaging on Windows/Linux. Current native evidence is macOS process interruption, not hardware power loss.
- Define telemetry retention/export, CSP and production diagnostics. The fixture exporter and test introspection hooks are spike tools.
- Decide review sidebar hierarchy and colours after authoring UI fidelity is established. Review categories already fit the contracts without changing the book format.

No architectural blocker emerged from composing the providers. These remaining items fit the rewrite's feature and platform gates. No production rewrite, real agent execution, commit, push or publication occurred in this goal.
