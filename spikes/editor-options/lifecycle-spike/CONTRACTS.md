# Document lifecycle contracts

## Book folder

```text
book/
  manuscript.json
  notes.html
  outline.html
  stickies.json
  cover.png / preserved ancillary files
```

`manuscript.json` contains `formatVersion: "neo-lifecycle/v1"`, a revision, preserved NEO metadata, ordered `{ id, html }` sections and Darling records. The section array owns ordering; metadata has no second chapter-order field. Section IDs are unique. Notes and outline retain rich HTML. Sticky data and assets retain their original bytes.

This is the compatibility candidate. HTML preserves the rich content and anchors already supported by the parity codec. Untouched sections retain original HTML; edited sections pass through that codec. Unsupported markup is preserved and its section becomes read-only. A later format decision must preserve the same content before replacing HTML.

Import validates all referenced sections, rejects orphan chapter files and unsafe paths, and stages the complete target before publishing its folder. Export recreates the legacy chapter folder and metadata order. Import never modifies the source.

## Ownership

The Svelte View consumes a readonly projection and commands. The ViewModel owns presentation state, dirty revisions and editor sessions. ProseMirror owns editor transactions and local editor history. The Electron main process owns files, writer leases and save receipts. The preload exposes a narrow typed request/event port.

IPC validates UUID request IDs, method-specific bodies and optional W3C trace context. Requests carry fixed document names rather than paths. Main authenticates the sending session and its main frame. Save requires that window's current writer lease. A second window opens read-only.

## Save and recovery

Each document has a revision and a SHA-256 version of its disk bytes. Writes run in one ordered queue. A save validates and captures its payload, writes and syncs a unique temporary file, checks the expected disk version, publishes a synced backup of the previous valid version, checks again, replaces the current file and syncs the directory. Only then does main acknowledge `{ name, revision, etag }`.

The ViewModel clears dirt only through the acknowledged revision. **Saved** means all current dirty document revisions have matching receipts. Notes, outline and manuscript commit independently; this is not a transactional multi-file snapshot.

Before replacement, a failed write produces no receipt. After replacement, a failed durability step returns `SAVE_UNCERTAIN`. An identical retry can confirm that exact content by syncing the directory and issuing its receipt. This avoids falsely treating an uncertain write as either saved or absent.

Open validates current data and can restore a validated previous version. Invalid current and backup data produce `CORRUPT`. Stale temporary files are never selected as manuscripts. A live writer prevents another writer. A dead owner can be reclaimed under a recovery gate.

An external hash change returns `EXTERNAL_CHANGE`; the local draft remains available. Explicit discard/reload adopts disk content, guarded against edits made during reload.

## Exit

Close pauses autosave and awaits queued work before showing save/discard/cancel. The editor is disabled while the decision is open. Save closes only after receipts clear all dirt; a failed save keeps the window and draft open. Cancel restores editing and autosave. Discard closes after pending work settles without saving the remaining draft.

Renderer loss recreates the hidden window from committed storage. Main-process restart does the same. Changes without a receipt can be lost on abrupt process death.

## Observability

UI, IPC and storage spans share explicit trace context. Attributes contain fixed lifecycle outcomes rather than prose, book titles, file paths or document IDs. Exported native evidence verifies parent relationships across processes. Production export, retention and sampling remain host configuration decisions.
