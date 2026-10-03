# Leafloom replacement closure

Spec: `docs/migration/feature-inventory.json` and `docs/migration/leafloom-scenarios.json`. Preserve all 444 acceptance scenarios. The existing replacement goal remains unfinished; the user resumed it on 2026-10-03.

## Global constraints

Reuse the production contracts, BookCore and isolated source oracle. Keep one author history. Run hidden/headless tests with private synthetic fixtures. Retain sealed release artifacts as historical receipts. Agents remain deferred. A passing subset cannot complete this plan.

### Task 1: Navigation insertion and reorder

Interfaces: EditorPort atomic creation with kind/index/starter; existing reorder command; narrow application actions; mounted navigation.

1. Write actual gap-menu insertion journeys for Part and Copyright, preserving neighbouring rich content, focused writing, durable reopen and one structural Undo. Run before implementation. Expected: failure because gap controls are absent.
2. Write provider tests for atomic creation and invalid input. Expected: failure because creation cannot carry role/starter.
3. Implement atomic validated creation and mounted gap menus. Expected: targeted tests pass.
4. Write pointer drag journeys across a Part in both directions, including cancellation, stable identity, companion ownership and Undo. Expected: failure because chapter rows cannot drag.
5. Implement presentation-owned drag state using the existing reorder command. Expected: targeted browser/provider tests pass.
6. Run strict checks and CPU suite, commit the batch. Expected: zero failures.

### Task 2: Dictionary selection and fidelity explanation

Interfaces: existing host spellcheck preflight; current language/typography presentation; per-section editability projection.

1. Write failing language-load/racing-choice tests and a mounted unsupported-content explanation journey. Expected: old language persists incorrectly or the explanation is absent.
2. Validate dictionary loading before committing preferences; discard stale completions. Project fidelity protection without converting source bytes.
3. Run affected mounted/provider/VM tests and whole CPU suite; commit. Expected: old choice survives failure, newest success wins, unsupported bytes survive save and reopen.

### Task 3: Exact author and storage clauses

Interfaces: public author UI, EditorPort history, actual checkpoint receipts and host lifecycle.

Characterize and port immediate break Undo, blank-heading/poetry Enter, navigation geometry, normal close/restart, failed save/retry and external refresh clauses using the existing closure reports. Preserve unchanged source actions/assertions; document deliberate fidelity/history adaptations. Expected: every claimed clause has concrete source/candidate proof; unmet clauses stay explicit.

### Task 4: Native acceptance and full scenario closure

Interfaces: scenario evidence schema, browser report validation, native-v1 receipts and independent artifact validators.

Add typed native cases without fabricated Playwright rows. First prove rejection of stale, missing, failed, duplicate, unsafe or insufficient-capability receipts. Accept only executed current receipts with artifact verification. Review every inventory clause and bind remaining original/candidate journeys. Expected: all 444 scenarios satisfy full acceptance; no skipped/retried/stale case qualifies.

### Task 5: Final verification and distribution

Freeze source, rebuild host/frontend, refresh coherent original/candidate/native receipts, run policy/type/CPU/parity/performance/recovery checks, then build a fresh stable Developer ID package and source archive. Preserve previous releases. Record signing, Gatekeeper/notarization and actual clean-machine validation separately. Expected: complete acceptance and installable verified package; no subset or unperformed physical OS journey is presented as completion.

## Review focus

Check history grouping, late asynchronous replies, locked/unsupported sections, identity mapping on reorder, failed durable writes, evidence freshness/capabilities and sealed artifact provenance. Assess actual author outcomes rather than report counts.
