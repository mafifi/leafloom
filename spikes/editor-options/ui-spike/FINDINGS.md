# Authoring UI architecture proof

The spike demonstrates a Svelte MVVM authoring surface with ProseMirror owning editable state and one recoverable manuscript file per book. Typing does not serialize or clone the whole manuscript. Darlings and prose share native Undo/Redo. Agents are deferred.

## Evidence

| Proof | Result |
| --- | --- |
| Editor, ViewModel, telemetry and filesystem contracts | 17 tests passed |
| Headless browser journeys and performance probes | 9 tests passed |
| Final presentation-contract change | 2 affected browser journeys passed again |
| Existing editor comparison contracts | 34 tests passed |
| TypeScript/Svelte checks | Passed, zero diagnostics |
| Production browser build | Passed |

Browser journeys cover typing, selected formatting, paragraph → scene → chapter, keyboard Undo/Redo, chapter navigation, Darlings archive/restore, paste identities and sanitization, notes, outline, actual filesystem save/reopen and protection against overwriting concurrent writing during reopen. Desktop, dark and narrow-viewport screenshots were inspected. Native spellchecking is enabled on the editable surface; native dictionary menus and suggestions were outside this headless probe.

Filesystem tests use real temporary directories and killed child processes. At temporary-file sync and backup replacement, restart loads the previous committed manuscript. After current-file replacement, restart loads the new manuscript. Corrupted current content recovers from a validated backup. Tests also cover stale revisions, caller mutation after submission, failed-operation queue recovery and nonempty Darlings with formatted runs.

## Responsiveness

Measured on this Mac in headless Chromium, with 51 typed-character samples per fixture. The larger fixture has 500 paragraphs across ten chapters, approximately 9,500 words. Standard OpenTelemetry recording was enabled.

| Fixture | Commit p95 | Next frame p95 / p99 | Largest structural gesture | Typing snapshots |
| --- | ---: | ---: | ---: | ---: |
| 5 paragraphs | 1.0 ms | 15.3 / 16.0 ms | 7.4 ms | 0 |
| 500 paragraphs | 1.4 ms | 15.0 / 16.5 ms | 14.0 ms | 0 |

Budgets passed: commit p95 ≤ 10 ms; next frame p95 ≤ 50 ms and p99 ≤ 100 ms; structural gesture ≤ 150 ms. Raw measurements are in [evidence](evidence/).

The baseline harness uses the earlier editor-options ProseMirror adapter and session, including its keydown snapshot, full-document conversion/validation and Svelte projection. At 500 paragraphs its commit p95 was 3.8 ms. This establishes reduced synchronous editing work. Frame timings vary with scheduling; these samples do not establish an end-to-end speedup over that baseline.

The measured structural gestures still serialize and replace the document. They pass at this size. Larger-book probes should determine when to replace those operations with local transactions. The manuscript file layout does not require the editor to render every chapter at once.

## Architecture decisions supported by the probe

1. ProseMirror owns immediate document state, selection and manuscript history. The ViewModel owns typed commands, small reactive projections and scheduling. The readonly `AuthoringUI` contract gives Views no editor or filesystem access.
2. A chapter and its blocks are document structure, not separate files. The existing flat book/chapter/block/run schema is sufficient for these interactions. Whole-book JSON is a candidate format; this probe adds no research graph or agent metadata.
3. Darlings are manuscript metadata that must join text edits in a single transaction. Their shared ProseMirror history works. Notes and outline are independent plain-text documents.
4. Saving sits outside the keystroke path. The ViewModel orders complete save requests; the filesystem provider validates, serializes, queues, syncs, backs up and replaces each file. A single malformed or failed operation does not poison future saves.
5. Standard OpenTelemetry records editor application, save snapshot, storage request and reopen stages. Save stages share a trace. UI histograms measure commit and rendering readiness separately. Collection excludes prose, titles, notes, IDs and paths; a failed tracer does not prevent writing.

## Discussion

The immediate production design can use these boundaries without carrying over the spike implementation. Agree the manuscript schema/version and import/export policy, the View/command contracts and the storage acknowledgment/recovery behavior first.

The three book documents are independently atomic, not a multi-file transaction. The proof uses one writer and process interruptions on macOS. Production work includes external-edit detection, multi-window ownership, migrations, other platform filesystems, real IME input and full native spellchecker UX. Previous broad NEO parity work remains separate evidence; this probe did not repeat that matrix or launch Electron.

The next useful proof is a larger fixture or actual IME/native integration when the corresponding production layer exists. Agent contracts and local Codex/Claude execution remain a later design stage.
