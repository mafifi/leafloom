# ADR 0003: One author history and durable four-file receipts

- Status: Accepted for the authorized rewrite
- Date: 2026-10-02

## Decision

`@leafloom/editor-contracts` owns checkpoint, revision, receipt and author commands. `@leafloom/document-contracts` owns versioned manuscript values and chapter/passage identity. `BookCore` in `@leafloom/prosemirror-editor` holds one authoritative EditorState covering manuscript chapters, notes and outline. Annotation/archive metadata and accepted review IDs participate in the same author history. Visible editor surfaces adapt native input to that state.

Every accepted writing proposal follows the same command boundary. A proposal references its source revision and passage identity. Changed or deleted passages produce explicit conflict outcomes; acceptance cannot silently replace newer author work.

The native document provider persists **four files**: `reviews.json`, `notes.html`, `outline.html`, then `manuscript.json`. Replacement is sequential, not an atomic multi-file commit. The provider validates expected SHA-256 versions, writes durable replacements and issues a receipt only after all required directory fsync operations succeed. The receipt binds the committed revision and the four resulting hashes.

A partial failure or uncertain reply remains an unsaved/recovery state. Retry checks prior matching writes and foreign modifications. Backup recovery validates schemas and book identity before offering recovered content. Open results report recovery and read-only/lease state. A receipt is evidence of durable completion; an optimistic UI update or IPC reply alone is not.

## Verification

Conformance covers failure after each file boundary, lost/late receipts, foreign edits, idempotent retry, stale versions, lease ownership, backup corruption and real process restart. History tests mix typing, chapter restructuring, notes, Darlings and accepted reviews, checking Undo/Redo and durable content. Legacy import/export preserves author HTML and unsupported bytes through a declared codec.

See [the spike-to-production source map](../migration/SPIKE-REUSE.md) for the retained implementations and new integration.

## History capacity

Original NEO retains ten structural snapshots independently from native typing history. Leafloom uses one ProseMirror history with depth 100 for manuscript, auxiliary content, metadata, Darlings and accepted reviews. The deliberate larger capacity preserves recent structural behavior while admitting typing and plugin commands into the same engine. It is not an exact reproduction of the original ten-snapshot eviction rule. Native browser tests prove the source Enter/scene/chapter Undo sequence; provider conformance additionally proves sixteen distinct typing runs can be undone and redone before checkpoint reopen.

Structural conversions and Darling commands gain Redo through the same history. Original empty-poetry structural Undo restores poetry but has no corresponding structural Redo stack. Preserve the source author outcome and native caret through Undo, then replay the same command through the unified history on Redo. The pinned source characterization is recorded in [the hidden reference ledger](../migration/HIDDEN-REFERENCE-EVIDENCE.md).

## Immediate typography Undo

The source explicitly promises that immediate Undo after dialogue-dash conversion restores the typed hyphen while retaining the following character (`app.js:3542–3585`). Its capture listener clears `dashJustSet` on every keydown. A normal modifier transition therefore clears the token before KeyZ: hidden source typing `-H` then Meta-Z restores only `-`, selected from offset0. Direct trusted modified-Z delivery retains `-H` and caret2. The two browser event routes are preserved as separate source characterizations.

Leafloom preserves the specified author result `-H` and collapsed caret2 through the unified history for either route. This is an intentional repair of the source modifier-transition defect. The raw failure and corrected characterization remain in the hidden reference ledger; physical OS accelerator routing is a separate native proof.

## Live metadata fields

Title, subtitle and author fields update checkpoint metadata while the native field remains focused. Native field typing Undo/Redo stays with the focused contenteditable until the edit finishes. A provisional core scope maintains those live values without creating one master-history item per character. Blur, Enter or close completes one validated public `MetadataFieldStep`, preserving unrelated metadata. Chapter headings retain source commit-on-blur behavior. Metadata and prior manuscript writing are tested independently through native typing, Undo/Redo, durable checkpoint and reopen.


## Incoming edits and ownership

External reconciliation compares the last receipted checkpoint, the current author state and a validated incoming snapshot. The application pauses saves after an already dispatched checkpoint, releases its old writer lease and reads under a fresh lease. The editor stages and validates the complete resulting checkpoint before changing state; the application persists against the newly read file hashes.

Incoming cuts preserve the complete replaced rich chapter in Darlings. Concurrent local and incoming chapter prose become adjacent chapters. Concurrent structural changes retain both ordered versions. Conflict copies receive fresh passage identities, with explicit aliases for their incoming review attachments. Ambiguous concurrent notes, outline or review data keep the current author state and require explicit recovery.

Adopted external structure starts a new unified history boundary. This also clears preceding auxiliary history. Clean chapters removed from the flat book are recoverable as ordinary Darlings; original NEO retained their orphan chapter files. Both adaptations belong to the chosen whole-book representation and one-history design.

Book open and close transitions are serialized. Each transition releases the preceding writer lease before opening another book. Background filesystem notifications and polls do not dismiss author menus.

A writer lease also binds the book directory's filesystem identity. Replacing the entire folder invalidates that lease even when all four content hashes and a copied lock token are unchanged. The host reattaches its watcher to the replacement and uses a bounded background poll to catch missed filesystem notifications. The application acquires a fresh lease and reconciles the incoming book with unsaved local writing before saving. Closing the old lease cannot remove a replacement folder's lock.

The watcher compares both file hashes and the current recovery condition with its acknowledged baseline. The open reply retains whether restoration occurred; the watcher records the condition after restoration. An unrelated rename cannot repeat an acknowledged warning, while fresh corruption remains detectable even when recovery returns the same logical content hashes.

Reconciliation applies the staged document through the existing master editor, retaining the mounted surfaces. Disjoint local and incoming chapter edits preserve both passages. Diff boundaries preserve the shared suffix length when repeated text causes their start and end ranges to overlap; the resulting document must equal the validated staged document before the change is accepted.

### Reading positions across devices

A reading position carries a timestamp, chapter identity, stable passage identity and local offsets. Paragraph positions also retain the legacy paragraph/letter coordinates for NEO migration. Legacy paragraph indexes skip headings and code blocks. Heading and code-block positions use stable passage identities without fabricated paragraph coordinates. An unchanged caret keeps its timestamp; changing scroll alone does not claim newer writing activity.

Incoming reading positions remain separate from prose reconciliation. The application follows a newer remote position only in the manuscript, outside a dialog, when no later local key or manuscript pointer activity exists. A paragraph that has not arrived keeps a pending position; subsequent arrivals, focus and the visible refresh tick reconsider it. After two minutes, the source-compatible fallback clamps to the available paragraph. The provider restores the caret through its public selection contract and reveals it at one third of the viewport.

Leaving the window, hiding it and the twenty-second safety tick flush pending writing through the existing checkpoint session. These lifecycle signals preserve the current typing group. Tauri's explicit close command still awaits the durable receipt.

The readable library catalog and bounded runtime error log are derived library-level files. They are outside the four-file book checkpoint. Catalog or diagnostic failure does not turn an already committed manuscript into an unsuccessful author save. Runtime diagnostics contain fixed codes, origin and time; they omit author text and exception messages.
