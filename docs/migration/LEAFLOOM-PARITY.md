# Leafloom migration acceptance

The pinned original NEO application is the behaviour oracle. The production Leafloom app is the candidate. The copied ProseMirror/Electron compatibility bridge and its reports are historical evidence only.

## Traceability

`feature-inventory.json` contains source-defined feature/scenario acceptance. `integration-registry.json` records the previous bridge's source actions and assertions. `leafloom-scenarios.json` records each production migration port and its evidence; every required scenario begins unmet. Preserve each full acceptance clause, not only a feature ID in a test title.

A valid port drives actual author keystrokes, pointers, menu controls, clipboard, drag/drop or host operations. It asserts visible author content, caret/selection, history, persisted state or generated artifacts. Fixtures prepare initial state only. Tests cannot call private mutation helpers to fabricate postconditions.

Original Electron native controls live only in the reference adapter. Candidate browser and Tauri adapters have separate implementations of semantic driver operations. Browser development defaults to private disposable host fixtures. Foreground native tests require explicit opt-in and stable identity. No skipped, expected-failed, retried-pass or stale case counts as passing.

## Fidelity

Preserve prose/poetry/scene paragraphs, chapter order/roles/titles, marks, alignment, annotations, Darlings, ghost content and unsupported imported material. Round-trip NEO data through editing, serialization, export and real restart. Validate Unicode graphemes and multi-paragraph ranges. Assert mixed typing/structural/annotation/review Undo/Redo through one history.

## Visual and performance proof

Use fixed source/candidate window sizes, bundled fonts, typography, themes and synthetic content. Compare author-visible geometry and screenshots for library, ordinary manuscript, poetry, chapter roles and auxiliary tabs. Preserve source baselines and tolerances per fixture; never infer parity from a screenshot's mere existence.

Measure input-to-visible-update, selection, navigation and scroll on 10,000/100,000-word fixtures. Record p50/p95, environment, content size and build hashes; no arbitrary sleeps or unbounded repeated measurements. The first measured original/reference run establishes comparative thresholds, while candidate interaction targets p95 <=50ms for typing and <=100ms for ordinary UI commands. Report cold start and durable save/recovery separately from rendering.

## Gate

`node scripts/check-neo-parity.mjs` requires immutable oracle bytes, a fresh production build fingerprint and a real passing candidate result for every required scenario. Evidence records actual runtime/driver, fixture, actions, assertions and artifact hashes. Native-only acceptance requires native evidence; service fixtures drive real application paths and stop at the external boundary.

Historical reports and portable unit/conformance passes contribute their own evidence but cannot satisfy whole-app migration acceptance. Remaining gaps stay in `docs/plans/execution-ledger.md` and the machine-readable scenario ledger.
