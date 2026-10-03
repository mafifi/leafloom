# ProseMirror editor

`BookCore` owns a single native editor state for the book. Chapters, Notes and
Outline live in section nodes. Darlings, metadata and accepted review identities
live in document attributes, so authoring commands share one undo history.

`ProseMirrorSurfaces` projects chapter content into native browser editors. Mount
all manuscript hosts with `renderBook(root, auxiliary, panel, enabled)`. Each
chapter host has `class="chapter-body"` and `data-chid` set to its stable chapter
identity. After the application renders a changed chapter list, call `update`.
The provider maps native local steps into the master document; surfaces have no
independent history.

Application ViewModels consume `EditorPort` and `SurfacePort<HTMLElement>` from
`@leafloom/editor-contracts`. Compose the production provider at the application
entrypoint. Svelte views render state and invoke ViewModel commands.

The HTML codec retains author marks, poetry, scene markers, notes structures,
placeholder anchors and semantic attributes. Fidelity inspection inventories the
source independently before editing. Unmodified content retains its source
bytes. Unsupported source remains protected through checkpoint and history.

Review references retain immutable captured runs and map their current segments
through master transactions. Passage identities survive splitting and moving;
duplicated passages receive distinct identities. A checkpoint contains the book,
review state, Notes and Outline at one manuscript version.

Structured Outline rows project chapter and section notes. Outline commands edit
those notes, create or convert chapter lines, and synchronize gray manuscript
ghosts with owned scene breaks. Typing over a ghost consumes its presentation
class while retaining its section identity. Written prose stays in place when
its outline note changes or disappears.

Darlings retain their rich selection, chapter identity and surrounding text. New
archives map a document bookmark without adding a marker to the prose. Imported
NEO records restore through their original text context, then fall back to the
owning or last chapter. Restoration returns a location and optional notice for
the ViewModel. Associated placeholders and review locations return with the text.

`selection` exposes a portable passage range. `restoreSelection` accepts that
range and NEO's saved paragraph index and character offset. Bookkeeping metadata
persists outside author history. Word totals reuse immutable paragraph counts;
`wordCountFor` supplies the current section counter and `selectedWords` counts
the selected manuscript range directly.

Annotations and Vim mode are presentation state. Set annotations through the
portable DTO and supply context, activation, clipboard and search hooks through
`SurfacePort.setHooks`. Hunspell and clipboard access belong to host adapters.

`configurePresentation` selects sentence or paragraph focus and keyboard-led
typewriter scrolling. Native CSS highlights paint focus without manuscript
wrappers. The provider measures room below the last page and observes page
resizing. Use `focus({preventScroll: true})` when restoring a saved workspace.

Native text drags share the master transaction path. `moveSelection` relocates
rich text, review ranges and flag ownership across chapter surfaces.
`archiveDraggedSelection` restores the captured drag range for a Darlings tab
drop. Chapter menu deletion archives its rich words in the same undo operation.
`createChapter(title, index)` supports indexed insertion; its default is the
source story-end position before back matter.

Input methods retain native composition transactions, selections and history
grouping. Committed composition bypasses typography. Native paste-and-match-
style shortcuts inherit the author caret marks instead of clipboard marks.

Run the production conformance suite from the workspace:

```sh
node node_modules/vitest/vitest.mjs run packages/editing/prosemirror-editor/tests
```
