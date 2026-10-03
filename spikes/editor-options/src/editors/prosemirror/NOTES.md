# Direct ProseMirror provider

The provider uses ProseMirror model, state, view, keymap, commands and history directly. It does not use a wrapper framework. The view owns native input and selection; transactions translate to the shared manuscript format. The common author service owns chapter gestures, Darlings, proposals, persistence and structural undo.

Each chapter is an isolating node with a stable ID and title attribute. Its DOM includes a non-editable heading and a chapter-body wrapper. Paragraph, poetry and scene-break nodes carry stable block IDs. Poetry preserves line whitespace. Scene breaks are atomic empty nodes displaying a non-editable `***` decoration. Bold, italic and placeholder values are schema marks. ProseMirror merges adjacent text runs with equal marks; empty marked runs have no text-node representation.

The adapter calls the parent gesture callback before keymaps. It bypasses that callback during composition. Native splits copy node attributes, so dispatch repairs missing and duplicate IDs in the same transaction. Undo and redo include those repairs. A join retains the surviving engine node's ID. Parent document revisions and metadata are preserved, and replacement never emits a change callback.

Native text undo is ProseMirror history. Parent replacements that change manuscript content recreate editor state and clear native history. Metadata-only replacement preserves it. This makes the structural snapshot boundary explicit, but means native undo cannot cross a parent structural replacement. A production design needs one coordinated history policy.

The canonical selection contract supports one block. A cross-block native selection returns null; typing and native selection remain functional, but shared range actions cannot use that selection. Offsets use JavaScript UTF-16 indices. Offsets supplied by the parent are clamped to the current block. Paragraph newline text and hard line-break paste do not yet have a separate hard-break schema node.

Paste parses through the schema, which retains only supported nodes and marks. It removes executable/non-text container elements and unrecognized attributes before programmatic parsing. Native HTML paste uses the same sanitization. Imported IDs are discarded and minted by transaction repair. This is a deliberately narrow prose importer, not an HTML fidelity feature.

Adjacent tests verify canonical round trips and position mapping. Browser integration must establish native typing, clipboard, gesture order, history, switching and composition behavior. Real OS IME, mobile input, accessibility, large-book performance and collaborative transaction mapping are outside this provider's current evidence.
