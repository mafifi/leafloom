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

The goal tool cannot replace its existing unfinished record or edit its objective. This plan records the user's revised scope; the existing record must not be marked complete until the revised objective is achieved.

## Status

- [ ] Existing inventory reviewed against production; actual omissions fixed.
- [ ] Existing acceptance run and genuine regressions resolved.
- [ ] Windows/Linux wake handling implemented last.
- [ ] Updated package and final handover delivered within the deadline.
