# Electron lifecycle spike findings

Completed 2 October 2026. The Svelte/TypeScript/MVVM shell can import representative NEO books, commit through Electron main, and restore acknowledged manuscript and note changes after renderer or main-process interruption.

## Evidence

| Probe | Result |
| --- | --- |
| Svelte and TypeScript | 0 errors, 0 warnings |
| Contract, migration and storage tests | 16 passed |
| Signed hidden Electron journeys | 2 passed; 6.9 seconds total; no retries |
| Renderer, main and preload builds | Passed |
| Crash-dump inspection during native journey | No new unexpected Electron/NEO crash dumps |

The node tests cover metadata and rich-content round trips, assets and Unicode filenames, missing/orphan chapters, malformed commands, writer contention, external changes during saving, permission failures, corrupted backups, invalid UTF-8, payload capture, revision rules and uncertain-save retries. A child process is killed at five write checkpoints, including after acknowledgement, then storage is reopened.

The first native journey imports rich manuscript and notes, edits both, verifies durable receipts, rejects an invalid lease, opens a read-only second window and verifies actual UI → IPC → storage trace ancestry. It kills the renderer and verifies automatic recovery, kills main and restarts, then verifies an external-edit conflict preserves disk and the local draft until explicit reload.

The second journey covers cancel, failed save-and-close, successful retry and explicit discard. Waiting beyond the autosave debounce while the close decision is open proves the dialog does not silently save the draft.

Tests use temporary representative fixtures, private profiles and the existing signed host unchanged. Native windows stay hidden. No personal books or Keychain APIs are used. The reopened shell was inspected from its screenshot.

Executable evidence: [native-results.json](native-results.json), [native.spec.ts](native.spec.ts), [files.test.ts](files.test.ts), [legacy.test.ts](legacy.test.ts), [contracts.test.ts](contracts.test.ts). Captured connected spans: [evidence/ipc-traces.json](evidence/ipc-traces.json).

## Format finding

The earlier minimal block/run format cannot faithfully represent all existing NEO content. Rich notes, section and Darling anchors, placeholders and existing settings need preservation. This spike consolidates sections into one versioned `manuscript.json` while retaining their proven rich HTML representation. Notes, outline and sticky data stay separate. There are no new per-chapter files or research graph structures.

Adopt the small whole-book envelope and ownership boundaries as the architecture direction. Decide the final rich-content representation separately: compatible HTML is a working baseline, and a richer portable tree needs a complete fidelity proof before migration. The format used here remains a spike candidate.

## What the lifecycle proof establishes

Main owns durable storage; views remain presentation code. Receipts give Saved a precise meaning. Editor transactions remain local and responsive; disk serialization and ordered writes occur outside the typing transaction. Cross-process traces explain saves without collecting manuscript content. Close decisions and external conflicts preserve author control.

This extends the previous UI/performance proof. It does not rerun the complete NEO UX matrix or establish a new large-book performance baseline. Agents remain deferred.

## Production decisions

1. Choose the rich-content codec and migration versioning rules. Preserve the tested compatibility contract.
2. Keep independent document commits unless a product requirement calls for a whole-folder snapshot. Specify recovery UX for partial auxiliary commits and backup restoration.
3. Choose writer-lock recovery policy. A crash while holding the recovery gate currently causes safe refusal and needs a stale-gate recovery procedure. Optimistic hash checks cannot eliminate the final check-to-rename race with an uncooperative external writer.
4. Verify platform-specific rename, directory-sync and lock behavior on Windows and Linux. Current native evidence is macOS process interruption, not hardware power-loss testing.
5. Integrate the lifecycle port and host telemetry into the eventual full authoring shell, then carry existing parity and performance cases into contract tests. Add local agents after these contracts settle.

No production files were rewritten. Work remains isolated under `spikes/editor-options`; no commit, push or publication was performed.
