# Passage identity and review contracts

## Saved book

One `neo-identity/v1` whole-book envelope contains revision, preserved metadata, ordered chapters and original Darling records. Each chapter contains:

```text
id
html
version: opaque UUID
passages: [{ id, path: child-index path, signature: SHA-256 }]
```

The passage index covers editable text blocks: paragraphs, headings and code blocks, including nested rich notes/list structures. Signatures describe normalized rich content and exclude editor identities. They do not duplicate paragraph text. An index is validated against the parsed HTML before identity is accepted. Duplicate IDs, wrong paths and changed content produce an identity error; no identity is inferred by matching quotes.

In memory ProseMirror text blocks carry an internal `pid` attribute, and the document carries its opaque version. These participate in native history. They are stripped when exporting HTML. Legacy export recreates NEO's existing format and deliberately does not export the new identity/review layer.

Untouched chapters retain their exact original HTML. Undo back to their initial semantics restores that raw source. Edited supported content uses the existing rich codec. An independent DOM inventory checks source text, marks, block boundaries, classes, data, alignment and atoms against the codec's output before editing is enabled. Unsupported tags, attributes, styles, links, nested annotations and comments retain their raw source and become read-only. The read-only preview is a safe codec projection; the raw source remains authoritative.

## Identity under editing

| Operation | Identity and reference rule |
| --- | --- |
| Typing | Existing passage ID remains; range boundaries map through the transaction. Insertions at a selected range's edges are excluded. |
| Split | Left block retains the ID; right gets a fresh ID. A crossing reference becomes several segments. |
| Merge | Survivor retains its ID. References to the removed block follow its content into the survivor. |
| Copy | Copy receives a new ID; original retains its ID. |
| Explicit move | ID remains. Referenced content is relocated, including fragments of a formerly contiguous reference. |
| Delete | Deleted references remain recorded with a deleted outcome. |
| Undo/redo | Native editor history restores IDs, reference locations and suggestion acceptance state. |

Moves in this probe are explicit top-level passage moves within a chapter. Cross-chapter moves and a unified book-level undo command belong in the final composition spike.

Reference snapshots are retained at native undo-event boundaries. Typing within one event replaces its latest snapshot. History rollover and branching release unreachable snapshots. Reference tracking does not retain a serialized copy of the manuscript per keystroke. History is session-local; reopening restores current references and review states, not the undo stack.

A reference created after an earlier edit becomes unresolved when undo moves before its creation. Redo to the known state restores it. This prevents invented earlier locations.

## Review input

`ReviewInput` is validated and contains request ID, book ID, manuscript revision, review category and selected extracts. Each extract carries:

- original immutable reference and expected rich inline content;
- current chapter version and current passage segments;
- chapter and passage order, passage kind;
- text and contract-owned rich runs, breaks and atoms.

Offsets are UTF-16 units for text; inline atoms and hard breaks occupy one editor unit. The provider translates editor values into these contract-owned values. No ProseMirror, agent or filesystem SDK type crosses the public port.

Extraction leaves manuscript content and revision unchanged. No character ontology, plot graph, research summaries or agent state is added to the book. Review categories are voice, character and structure; further categories require evidence and contract evolution.

## Review output and commands

`ReviewOutput` contains the originating request ID, review ID and strict suggestion/note items. A suggestion names one supplied reference and proposes plain text. A note names one or more supplied references. The reply is validated atomically; unknown requests, duplicate items and references outside the request are rejected before any item is attached.

`resolve` returns `current`, `changed`, `deleted` or `unresolved`, plus current segments and text. A current reference can span several nonadjacent fragments in its original reference order. That means its content remains located; it does not authorize replacing the intervening manuscript.

`accept` validates the current rich target again. It accepts only a single text range with uniform marks. Existing marks remain on replacement text. It refuses stale content, atoms, mixed formatting and multi-paragraph targets. Acceptance uses one native undo event, is idempotent, and never edits unrelated writing. Undo restores the original target and pending state; redo restores acceptance. `reject` is idempotent and does not edit the manuscript or enter text history.

## Review storage

A separate `neo-reviews/v1` JSON value contains book ID, references, current segment locations and review items/states. Each reference location is paired with the chapter version at checkpoint. Reopening the matching pair restores identity and references, including fragmented locations. A different chapter version makes those references unresolved. Missing review data leaves the manuscript and passage identities intact. A wrong-book sidecar is rejected.

The version guard permits safe independent persistence without silently applying older review coordinates to newer writing. Coordinating this checkpoint with Electron durable receipts is the final composition spike's responsibility. No new crash-safe writer is introduced here.

## Boundaries

`IdentityPort` consumes and returns contract-owned data. Its shared conformance suite accepts a provider factory. The ProseMirror implementation owns transaction mapping and serialization. The ViewModel owns UI commands and projections; the Svelte View has no document mutation or storage logic. The deterministic reviewer only exercises the input/output seam. Local-agent execution stays outside this spike.
