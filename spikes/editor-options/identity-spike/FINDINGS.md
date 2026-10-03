# Identity and fidelity verdict

Completed 2 October 2026. ProseMirror can preserve NEO's rich representation while supporting stable passage references and a separate review plane. The tested direction adds a small identity index to the manuscript envelope; it does not replace rich HTML with a flat content model.

## Evidence

| Check | Result |
| --- | --- |
| Svelte / TypeScript | 0 errors, 0 warnings |
| Identity, review and fidelity integration tests | 44 passed |
| Headless Svelte / ProseMirror journeys | 4 passed, no retries |
| Production browser build | Passed |
| Existing lifecycle contract regression suite | 16 passed |

The node suite drives actual ProseMirror transactions, native history and the existing NEO folder adapters. It covers repeated text; typing; splitting; joining, including references to the merged-away block; copying; movement; separated fragments; deletion; undo/redo; history rollover; branching; strict request/reply validation; version mismatches; and JSON reopen. One thousand consecutive typing transactions retain at most three reference snapshots.

The independent fidelity inventory verifies rich blocks, nested formatting, whitespace, Unicode, hard breaks, poetry, section/ghost anchors, placeholders and Darling anchors. Unsupported content is preserved exactly and refused editing. A temporary representative NEO folder is imported, one chapter is edited, checkpointed, reopened and exported; untouched chapters, notes, outline, sticky data and assets retain original bytes, and metadata and Darling records remain equivalent. Personal books were not opened.

Browser journeys exercise real selection and keyboard edits through Svelte commands: review/accept/undo/redo/reopen; stale refusal and dismissal; multi-chapter notes with split/merge/move; and unsupported-content protection. A screenshot of the reopened review shell was inspected. See [evidence/reviews.png](evidence/reviews.png) and [evidence/browser-results.json](evidence/browser-results.json).

## Decisions supported

1. Keep rich HTML as the first rebuild's content baseline. Add opaque passage IDs and a validated index alongside it; exclude identities from legacy HTML export.
2. Use transaction mapping during editing and explicit relocation for moves. Persist current reference segments with the exact chapter version. Avoid quote-search reattachment.
3. Separate reviews from manuscript content. Let a note link several passages or chapters. Represent suggestions as proposals applied through editor commands and native undo.
4. Check rich-content equivalence before opening an editable session. Unknown formatting remains preserved and read-only until its adapter has coverage.
5. Follow Drawloom's accepted capability-contract standard: strict Zod boundaries, inferred types, portable values and provider-neutral conformance. The monorepo's proposed authoring substrate also separates content from identity and annotations; its larger ontology is unnecessary for this proof.

This establishes the research seam. The fixture is deliberately deterministic and makes no claim to assess writing quality. Real research skills can consume the same extracts and return suggestions or notes later.

## Remaining composition work

The next and final proposed spike should combine these contracts with the existing signed Electron lifecycle, full authoring commands and telemetry, then measure responsiveness through that complete path. It should settle cross-chapter operations and book-level undo, and define durable checkpoint ordering for manuscript and review sidecar.

This spike tests top-level moves within chapters and plain-text suggestions that retain uniform marks. Rich replacement patches require their own command semantics. Exhaustive NEO feature migration remains gated by the broader feature inventory and parity suites; these fixtures are a focused identity/fidelity proof.

All work remains throwaway under `spikes/editor-options/identity-spike`. No production rewrite, commit, push or agent integration was performed.
