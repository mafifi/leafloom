# Authoring contracts

The View accepts the readonly `AuthoringUI` presentation contract and invokes its typed commands. It owns no manuscript state, persistence or ProseMirror transaction logic. The ViewModel owns command routing, save scheduling and small reactive projections. The editor owns editable DOM, immutable document state, selection and native history.

## Editor

`EditorCore` exposes typed selection, formatting, structural, Darling, history and navigation commands. Subscribers receive `editor.changed` or `selection.changed`, a monotonic revision and a fixed command name. They receive no full manuscript. Chapter rows change only when chapter identity/order/title changes; words update from the edited paragraph for an inline transaction. Snapshots occur at save/export and structural commands.

The minimal schema is `neo-spike/v1`: book identity, title, author, revision, ordered chapters, stable block IDs, formatted runs and Darlings. Runtime validation rejects duplicate identities and prose inside scene markers. Native paste repairs incoming block identities. Formatting and all structural edits use public ProseMirror APIs.

Darlings belong to the ProseMirror document attributes. A text removal and its Darling record are one transaction, so Undo/Redo owns both. External notes and outline are separate documents with their own edit lifecycle; manuscript Undo does not undo notes. Reopening clears manuscript history. A revision always advances when manuscript content changes, including Undo/Redo.

## Storage

`BookStore` owns four portable operations: `save`, `load`, `saveText`, `loadText`. Auxiliary names are the closed union `notes | outline`. The filesystem provider owns paths, durability and recovery. The HTTP provider owns the transport and validates loaded manuscripts. The renderer receives no filesystem APIs or arbitrary path capability.

One book folder contains `manuscript.json`, `notes.txt`, `outline.txt`, their previous versions and temporary files during writes. There are no chapter files. Each document is independently atomic; the three files are not a multi-file transaction.

Manuscript saves validate and capture the submitted value, serialize, enqueue, sync a temporary file, preserve a validated previous version, replace the current file and sync the directory. Older manuscript revisions are rejected. The queue survives failed operations. Load validates current content, then recovers a valid previous version when necessary. Incomplete temporary writes do not supersede a committed version.

This probe runs with one writer. Multi-window locking, simultaneous external edits, migration and platform-specific filesystem adapters are production decisions.

## Diagnostics

Standard OpenTelemetry trace and metric SDKs record editor application, commands, snapshot, storage request and reopen spans; save snapshot/storage spans share their save trace. Histograms record keydown-to-commit and input-to-next-frame duration. Attributes contain fixed stage names and numeric values. Text, notes, titles, paths and document identifiers are excluded.

The local probe keeps at most 1,000 spans, 500 frame samples and 500 commit samples. Export is local and opt-in at construction. Provider failures do not prevent operations. Frame timing measures rendering readiness; commit timing measures synchronous editor/host work. Both need production sampling and visibility lifecycle policies.
