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
- [x] Existing acceptance run completed and genuine regressions resolved; final full capture follows the corrected Escape/reopen test journey.
- [x] Windows/Linux wake handling implemented last.
- [ ] Updated package and final handover delivered within the deadline.

## Implementation delivered

| Owner | Change | Commit |
|---|---|---|
| ProseMirror surfaces | Preserve modified Tab and global fullscreen shortcut ownership, including code blocks | `aa49b9a` |
| Host/library and publication formats | Isolate malformed book folders; source-compatible TXT layout, anonymous attribution and Linux font aliases | `4624c6d` |
| Application and Svelte Views | Saved ordinary Escape, fullscreen and chapter shortcuts; zoom controls and pointer wheel; system contrast; unpinned pane lifetime; publication focus; visible shelf cover work; stable drag identity; content-bound spelling replies | `a1e4812` |
| Application persistence | Background zoom persistence retains menus; preference failure cannot block manuscript checkpoint | `6598981` |
| Existing acceptance fixture | Runtime log assertions retain earlier rows and check the new private failure records | `a3d7726` |
| Platform updater | Actual Windows automatic-resume callback and Linux login1 post-sleep signal, with safe disposal/reconnect ownership | `3782dc4` |

Fresh repository checks at `6598981`: 74 CPU test files pass, 608 tests pass, three existing optional codec cases skip; repository policy, strict TypeScript/Svelte and the default production build pass. The full existing suite completed at 468/469; its remaining test assumed ordinary Escape kept a book open. `0547eea` preserves Escape, asserts the saved shelf return, reopens the same book and retains every spelling-menu assertion. The affected existing spelling suite passes 34/34. The earlier 462/469 baseline failures supplied the concrete regressions; no scenario-count promotion establishes completion.

The last platform change passes 27 default and 28 native-test locked Rust tests, pinned Windows/Gio API-signature compilation and repository policy. Windows/Linux linked runtime and physical sleep/resume are unexecuted OS observations. No new framework, spike, inventory expansion or foreground run was added. The final fresh CI/full-suite capture and updated signed/notarized package remain before handover.
