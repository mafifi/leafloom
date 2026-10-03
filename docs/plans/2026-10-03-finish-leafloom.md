# Finish Leafloom: implementation, existing acceptance, platform wake

User scope on 3 October 2026 supersedes the proof-expansion tasks in the earlier closure plan.

Start: 10:39 London / 09:39 UTC. Target: 14:39 London / 13:39 UTC. Hard stop: 16:39 London / 15:39 UTC. Stop earlier when complete. Do not extend the deadline without the user.

## Fixed objective and order

1. Complete the production application from the existing 304-feature / 444-scenario NEO inventory. Review unresolved items against actual code and existing tests, identify concrete missing behaviour, implement it and integrate it. An absent evidence mapping is not automatically absent product behaviour.
2. Run the existing migrated acceptance suite against settled code and resolve genuine Leafloom regressions. Preserve original actions and semantic assertions. Classify the three recorded original-reference failures separately; do not rewrite Leafloom to reproduce upstream defects. Reuse existing CPU, type, policy, browser and native checks appropriate to changed code.
3. Last, implement Windows/Linux OS resume handling so the existing updater schedules a check after waking, preserving the macOS implementation and existing save/update guards.

Clean-machine installation is excluded. Real agents remain deferred. No new spikes, test inventory, proof framework, evidence schema or architecture redesign. No foreground disruption, personal books, remote publishing or repeated Keychain prompts. No per-case reviewer pipeline.

## Deliverables

- Completed implementation checklist referencing concrete production owners and existing tests, with actual missing behaviour and deliberate adaptations distinguished from unexecuted OS evidence.
- Small attributable implementation commits for confirmed omissions and regressions.
- Results from the existing acceptance suite, including exact unresolved failures rather than inferred feature-count percentages.
- Updated usable app and signed/notarized macOS installer when code changes; preserve the current accepted package.
- Concise completion or hard-stop summary listing changed behaviour, remaining concrete blockers and package paths. Never declare completion by changing labels alone.

## Execution limits

- First review pass is bounded to 30–45 minutes. Start implementing confirmed gaps as they are found; do not spend hours expanding clause reports.
- Root owns integration, shared application files, the completion checklist, final existing-suite run and packaging. Delegated owners work in distinct editor and host/library files and send concrete implementation results.
- Leave scenario definitions and acceptance assertions intact. Missing mappings can be recorded using existing cases; no title-only promotion or fabricated receipts.
- Hourly user check-ins report delivered code, actual blockers and time remaining. Between them, keep progress updates short and relevant.
- Six-hour hard stop takes precedence over unfinished work. Leave a usable package and exact handover if the scope is not complete.

## Goal record

The user deleted the previous goal record. The revised goal was created on 3 October 2026 at 09:57 UTC and is active with this scope and the original deadline.

## Status

- [x] Bounded inventory/code review completed; confirmed omissions and regressions fixed in the commits below.
- [x] Final full existing acceptance capture passes 469/469 on the settled implementation, with one worker and zero retries.
- [x] Windows/Linux wake handling implemented last.
- [x] Updated signed/notarized package and final handover delivered within the deadline.

## Implementation delivered

| Owner | Change | Commit |
|---|---|---|
| ProseMirror surfaces | Preserve modified Tab and global fullscreen shortcut ownership, including code blocks | `aa49b9a` |
| Host/library and publication formats | Isolate malformed book folders; source-compatible TXT layout, anonymous attribution and Linux font aliases | `4624c6d` |
| Application and Svelte Views | Saved ordinary Escape, fullscreen and chapter shortcuts; zoom controls and pointer wheel; system contrast; unpinned pane lifetime; publication focus; visible shelf cover work; stable drag identity; content-bound spelling replies | `a1e4812` |
| Application persistence | Background zoom persistence retains menus; preference failure cannot block manuscript checkpoint | `6598981` |
| Existing acceptance fixture | Runtime log assertions retain earlier rows and check the new private failure records | `a3d7726` |
| Platform updater | Actual Windows automatic-resume callback and Linux login1 post-sleep signal, with safe disposal/reconnect ownership | `3782dc4` |
| Application persistence | Retain shelf focus refresh across durable writes with pending host acknowledgements | `58cc859` |
| ProseMirror sections | Reuse immutable document section indexes without changing chapter positions or Undo | `5e1a596` |
| Application appearance | Immediate text-size controls with one debounced durable preference batch and Save flush | `ff26ece` |
| Application fonts | Retain installed body fonts and platform dropcaps during immediate text-size changes | `19a9eef` |

Fresh repository checks at `6598981`: 74 CPU test files pass, 608 tests pass, three existing optional codec cases skip; repository policy, strict TypeScript/Svelte and the default production build pass. The full existing suite completed at 468/469; its remaining test assumed ordinary Escape kept a book open. `0547eea` preserves Escape, asserts the saved shelf return, reopens the same book and retains every spelling-menu assertion. The affected existing spelling suite passes 34/34. The earlier 462/469 baseline failures supplied the concrete regressions; no scenario-count promotion establishes completion.

The last platform change passes 27 default and 28 native-test locked Rust tests, pinned Windows/Gio API-signature compilation and repository policy. Windows/Linux linked runtime and physical sleep/resume are unexecuted OS observations. No new framework, spike, inventory expansion or foreground run was added. The final fresh CI/full-suite capture and updated signed/notarized package remain before handover.

At 12:01 UTC, the final two regressions have targeted passing results: appearance/keyboard 18/18, existing appearance persistence and shelf-refresh CPU cases 2/2, and the existing 100k-word/100-chapter performance case at 41.8ms p95 against the unchanged 50ms limit. The preceding full run remains recorded as 467/469: rapid-font persistence delayed shelf return, and the 100-chapter performance case exceeded the limit. Neither result is relabelled as passing. Fresh whole-repository and full existing acceptance checks follow the committed fixes.

## Final acceptance, 12:24 UTC

The complete existing browser suite passes **469/469** in 16.5 minutes on runtime commit `19a9eef`, with one worker, zero retries, unchanged semantic assertions and original timeout/performance limits. The preceding failed runs remain available; the final result comes from a new complete run, not aggregation of targeted results.

Fresh repository phases pass: policy, strict TypeScript/Svelte (zero errors/warnings), 74 CPU test files with **608 passed / three existing optional codec skips**, and default production frontend build. The CPU run uses `--maxWorkers=1`; the preceding parallel run recorded four filesystem/time-budget failures which pass in the single-worker complete run without timeout changes.

The full-run 100k-word/100-chapter case retains all 100 views: input-to-paint p50 **23.5ms**, p95 **42.1ms**, durable save **102.3ms**, open **666.1ms**. The 10k-word and dense 100k-word cases also pass the existing performance contract. This is a headless browser result; physical Windows/Linux resume observations remain unexecuted.

Updated signed/notarized packaging follows this settled source. Clean-machine installation and real agent execution remain outside the revised goal.

## Delivery, 12:31 UTC

The production app and installer are available in `release/Leafloom-final-arm64-20261003.{app,dmg}`. Both are signed with Developer ID Application Mostafa Afifi (`QJJ98A74J8`), notarized with accepted submission `0c05a08c-24f2-41d9-b4c3-4c1bb3f40800`, stapled, and accepted by Gatekeeper. The package targets Apple silicon/macOS 14+, retains `org.mafifi.leafloom`, and bundles its Node runtime, fonts and dictionaries. Build/source receipts remain alongside the installer; earlier accepted packages are preserved. The build is bound to commit `86ac2dd`, containing runtime `19a9eef`; subsequent delivery documentation changes no runtime files.

The matching committed source is archived as `release/Leafloom-final-20261003-source.tar.gz`; installation guidance is `release/Leafloom-final-arm64-20261003-README.md`. Fresh acceptance, CPU, build and signing logs are retained under `release/evidence`; earlier failed runs remain there separately. The assembled binary checks cover all six exports, real host/durable-checkpoint operations, dictionaries, bundled fonts and pre/post-startup image codecs without opening a foreground app.

No concrete Leafloom regression remains in the existing full suite. Physical Windows/Linux sleep/resume is still an unexecuted OS validation, despite implemented actual wake hooks, passing Rust tests and pinned API compilation. Clean-machine installation and live agents remain excluded. The three previously recorded original NEO reference failures remain classified separately; no passing result was created by reproducing those defects or promoting evidence labels.
