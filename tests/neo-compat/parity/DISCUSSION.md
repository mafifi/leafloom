# ProseMirror decision discussion

**Use ProseMirror as the editor foundation.** The compatibility spike demonstrates NEO author workflows with actual editing in ProseMirror transactions. The inventory covers 304 features and 448 scenarios, including 444 required desktop scenarios. The current books suite passes all 94 tests; the fresh complete gate is still pending. Pause implementation here for the architecture discussion. The evidence status is recorded in [PLAN.md](PLAN.md).

This proof retains NEO's application controllers, chrome and file workflows. It is the evidence base for a standalone Svelte/TypeScript Electron application, not the finished production architecture. The current [compatibility boundary](src/legacy-boundary.ts) interposes legacy DOM operations and uses private editor observer/view internals. Production should replace that bridge with explicit typed commands and public ProseMirror plugins, with one owner of editable document state.

## Four decisions

| Decision | Proposed direction | What needs deciding |
| --- | --- | --- |
| Core editor | ProseMirror EditorState, schema, transactions and public plugins; Svelte owns presentation and mounts the editor through a narrow ViewModel port. Preserve Enter/scene/chapter/poetry, history and author caret as domain behavior. | Which behaviors belong to editor plugins versus manuscript commands? Establish transaction/history grouping before migrating legacy controllers. Avoid private DOM observer or view internals. |
| Document representation | Versioned manuscript values with stable book, chapter, block and annotation IDs. PM positions are editor-local coordinates; application contracts own durable identity and revision. | Choose a canonical structured file or readable HTML with durable identity sidecars. Preserve the existing NEO folder layout during migration; make conversion validated, reversible and restart-safe. Keep source files recoverable. |
| Agents and skills | Agents consume explicit snapshots and return proposals. Each proposal names document/revision, stable anchors, expected source text, replacement and rationale. Author acceptance becomes an ordinary undoable command. | Define stale-anchor rebasing, ambiguous-anchor rejection, concurrent edits, cancellation and conflict presentation. Set permission scope for document reads, network, filesystem and tools; plugin installation is separate from permission to change a manuscript. |
| Contracts and MVVM | Portable TypeScript interfaces, runtime schemas and reusable conformance suites; provider-specific editor/Electron/agent details stay behind ports. Views render ViewModel state and issue commands. | Define document, editing, history, persistence, recovery, agent execution and proposal ports, then migrate controller workflows incrementally against the existing parity tests. |

Follow [Drawloom's capability contract standard](/Users/afifim/Development/drawloom/docs/adr/0004-standardise-capability-contracts.md): contracts own domain values and conformance tests; providers depend on contracts; composition roots select implementations. Its [architecture principles](/Users/afifim/Development/drawloom/ARCHITECTURE.md) support local operation, replaceable providers, author control and clear capability ownership. The first spike's [typed contracts](../src/contracts.ts) and proposal/revision tests offer starting examples, not a complete production document format.

## Production proof priorities

1. Run genuine OS IME composition and candidate-window workflows, additional keyboard layouts, Windows/Linux accessibility and native menus. Trusted Chromium composition tests remain useful renderer coverage.
2. Measure large-book typing, spelling, search, layout and history behavior. Establish memory and latency budgets before choosing editor-view virtualization or worker boundaries.
3. Test extension permission enforcement and proposal acceptance under cancellation, stale revisions, overlapping edits and agent failure. Preserve author approval and ordinary Undo/Redo.
4. Exercise crash recovery, interrupted migrations, concurrent external edits, partial writes and export recovery with real files. Validate the signed host lifecycle and native bridge teardown under repeated open/close/rebuild transitions.

Carry the [source inventory](NEO-UX-INVENTORY.md), [interaction specification](PARITY-SPEC.md) and [integration registry](integration-registry.json) into the migration. They make the distinctive writing experience a contract while the implementation changes.
