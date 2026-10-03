# Composition contracts

## Ownership

The Svelte View renders projections and issues commands. The ViewModel owns navigation, dirty state, save ordering and close decisions. It consumes `EditorPort`, `DocumentStore`, `AuthoringLifecycle` and `SurfacePort`; it imports neither ProseMirror nor Electron adapters. The renderer composition root selects implementations.

`BookCore` owns one immutable master ProseMirror document and one `prosemirror-history` instance. Sections contain manuscript chapters, notes and outline. Visible editor surfaces project individual sections; their steps map into master coordinates. They have no independent history. Prose, chapter metadata/order, Darling records and accepted suggestion state become ordinary master transactions. Native undo can navigate to the section it restores.

Review attachment and dismissal are persisted review state outside text history. Acceptance edits prose and acceptance state in one history event. New sessions reopen content and review state with an empty editing history.

Follow Drawloom ADR 0004: portable values and contracts, runtime validation, provider conformance, provider selection at composition roots. Production should extract these contracts and providers into packages; the spike keeps them adjacent for inspection.

## Document

A flat book folder holds:

```text
manuscript.json       # one whole-book envelope, ordered chapters
notes.html
outline.html
reviews.json          # independent review state
```

The manuscript retains NEO rich chapter HTML, metadata and Darling records. A small passage index stores stable IDs, paths and content signatures. The root carries a content version UUID and monotonic session revision. This index enables reliable reference reopening without a writing ontology or per-chapter files. Existing import/export providers preserve original folders and assets; the composed host uses a separate imported destination.

The in-memory editor tree provides order, structure and rich runs. Research consumes derived extracts containing immutable origin references, current segments, rich runs, text, chapter order and content version. Research concepts can live in review contracts and skills without becoming mandatory manuscript fields.

Untouched supported sections retain exact source HTML. Supported edits serialize through the rich codec. Unsupported content retains its raw source and becomes read-only; commands that would change it refuse. A fresh checkpoint preserves original metadata, Darling values, chapter HTML, notes and outline. New or changed chapter titles/kinds patch existing metadata. The broader fidelity suite is a migration gate for codec changes.

## References and reviews

References identify an original chapter/passage range and expected rich content. UTF-16/editor offsets stay internal to reference contracts. Current ranges can span split passages and move between chapters. Native undo/redo restores tracked locations at history event boundaries. Reopened IDs must match paths and signatures.

Deterministic review inputs and replies prove the boundary; no agent executes. Replies are request-scoped, validated and attached atomically. Suggestions and notes have standard categories and reference IDs. Acceptance checks expected content and current location. Changed, deleted, unresolved, mixed-mark, atom-containing or multi-segment targets refuse automatic replacement. Uniform marks survive accepted replacement. Repeated acceptance is idempotent.

## Saving and recovery

`DocumentStore.save` takes an immutable checkpoint and expected hashes for all four files. A successful receipt contains the acknowledged revision and resulting hashes. The UI displays Saved only if that revision is still current; typing during a slow save remains dirty.

The filesystem provider preflights all hashes before writes, then commits reviews, notes, outline and finally manuscript. Each changed file uses an exclusive temporary file, file sync, validated backup, rename and directory sync. A receipt is issued only after the complete sequence. Checkpoint validation requires matching review/book IDs and content versions.

The folder is a set of independently durable files. An interrupted sequence can leave newer auxiliary documents beside older prose. On reopen, mismatched review content versions become unresolved and cannot silently target old coordinates. Exact retry can finish the writer's own partial or uncertain checkpoint. Corrupt manuscript recovery can select the validated prior backup; newer review coordinates remain unresolved. This is the chosen small-format recovery model.

Main owns the writer lease, filesystem and lifecycle. Host requests use fixed method names, strict schemas, session/frame checks and a lease; they carry no arbitrary paths. Renderer replies are validated before mounting or acknowledging a save. Close waits for pending saves, pauses autosave during the decision, and retains the draft if saving fails. Explicit discard and cancel are separate commands.

## Telemetry and responsiveness

Fixed OpenTelemetry spans connect UI command/input to editor transactions, and UI save to editor snapshot, IPC and storage checkpoint through W3C trace context. Recorded values exclude manuscript content, book paths and identities. The spike exporter is an in-memory diagnostic fixture.

Typing mutates editor state and small projections. Whole-book HTML/checkpoint serialization happens on save, never on each keystroke. Passage lookup caches follow the immutable document identity. Performance integration tests exercise real keyboard input and measure transaction/projection completion plus next animation frame, with and without attached review references.
