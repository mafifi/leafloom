# Desktop NEO interaction parity specification

## Outcome

An author can perform every shipped desktop NEO workflow using ProseMirror editing surfaces and observe the same document content, formatting, structure, navigation, persistence and application results. Every requirement is traced to source/docs and exercised by a valid integration test. The goal remains active while any required scenario is uncovered or fails.

The source inventory is `feature-inventory.json`; `NEO-UX-INVENTORY.md` explains its evidence. `COVERAGE-AUDIT.md` supplies an independent cross-check against menus, preload APIs and non-menu surfaces. Inventory changes extend the required scenario set; missing coverage must fail the gate.

## Proof architecture

The target is a compatibility spike, alongside the existing Svelte/MVVM comparison. It retains original application chrome/controllers/host in a disposable source snapshot and replaces manuscript and rich auxiliary editing roots with real ProseMirror EditorViews. A TypeScript boundary owns the native editor schema, DOM serialization, selection/commands, history and clipboard integration. A separate TypeScript persistence port canonicalizes editor view decorations before the existing real chapter/auxiliary disk handlers. Original root files are never edited.

This architecture answers whether the complete NEO experience can survive a change of editing engine. It does not stand in for migrating every legacy controller into Svelte/TypeScript. The established portable contract/MVVM project remains the architecture reference for that subsequent migration.

A ProseMirror root must own actual EditorState and dispatch actual transactions. Native browser editing with a mirrored PM model, a hidden offscreen PM view, or a fake state helper does not satisfy the proof. Compatibility calls must translate to transactions and observable author-visible updates. Structural application operations need explicit synchronization/history integration; silent full-view resets that lose an author action's undo fail parity.

## Data fidelity

Native NEO paragraph HTML, poetry, scene markers, inline bold/italic, alignment, sticky placeholder marks, Darling anchors and ghost content must survive parsing, editing, serialization and disk restart. Each declared non-text feature receives a schema node/mark/attribute or deliberate application-owned representation with a tested lifecycle. Unsupported markup cannot be silently discarded.

Editor selection maps between DOM and PM positions, including same-block, multi-paragraph and chapter-boundary ranges. Focus, direction, caret, scroll and writing context form observable workflow state rather than incidental test setup.

## Test validity

Tests drive keystrokes, pointers, drag/drop, clipboard or actual Electron menu commands. They assert rendered output, selection/caret, history transitions, persisted state or generated artifacts appropriate to the feature. Fixture injection prepares initial state only; it cannot fabricate the post-action result.

Original and target use isolated temp profiles and equivalent fixtures. Native dictionaries/files/exports use real host services. Paid art, email transmission and update installation stop at a recorded external service boundary; fixture responses must still drive the original application UI. All tests distinguish platform-dependent evidence.

No skipped, expected-failure, retried-pass, inventory-only or private-helper-only test establishes required feature coverage. `integration-registry.json` records feature/scenario ID, test file/title, driver actions, assertions, environment and reference/output oracle. The coverage checker requires successful generated reference/target reports; human review establishes the semantics of each oracle. Reports bind the exact renderer, persistence port, host harness, dependency lock and integration source hashes; stale evidence and known unproved acceptance clauses fail the gate.

## Acceptance checklist

- All shipped desktop docs, menu branches, renderer controls/handlers and host contracts appear in the inventory or an explicit evidence-backed non-UX classification.
- Every required scenario has a valid runnable integration and target implementation; applicable reference scenarios pass against original NEO.
- Editing occurs in visible ProseMirror views and actual native input/commands produce transactions.
- Undo/redo, range editing, annotations, layout/navigation, opt-in spelling, persistence/recovery and output workflows match the specified NEO outcomes.
- Source-to-feature and feature-to-test audits pass with no uncovered requirements; the complete final run has no required failures or skipped tests.
