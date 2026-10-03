# Three editor options

The useful separation is between the manuscript, the author's workflows, the editor engine, and the agent runtime. The spike implements those boundaries in one independently buildable Svelte/TypeScript Electron project.

## Discussion position

Direct ProseMirror is my preferred candidate for the next production design discussion. Its schema and explicit transactions make chapter structure, stable identities, selection mapping and future revision tracking concrete. Lexical is viable and has a capable immutable state model; this manuscript required more custom node machinery. The extracted NEO editor is valuable as a behaviour reference and incremental migration option, but retains the native DOM and `execCommand` complexity that motivated the rewrite.

That preference is an architectural judgment from these implementations. This experiment does not measure full-book performance or demonstrate exact NEO behaviour parity.

| Option | What the spike establishes | What drives the decision |
| --- | --- | --- |
| NEO browser extraction | Real native editing; typed extraction of English smart punctuation and Markdown emphasis; canonical runs and stable paragraph IDs | Closest source lineage. Browser command sequencing, bespoke undo and DOM repair remain application responsibilities. |
| Direct ProseMirror | Real EditorView and transactions; custom chapter/paragraph/poetry/scene schema; bold/italic/placeholder marks; canonical selection translation | Best fit here for explicit document structure and future mapped edits. Production should use transaction-aware history and anchors. |
| Lexical | Real EditorState and commands; custom chapter shadow roots and persistent paragraph/text nodes; mark and placeholder translation | Good framework-independent engine. Chapter slots, custom node lifecycle and serialization require more adapter code here. |

The common Enter, Backspace, Darlings, proposal and application undo code is shared. Passing those scenarios shows that the capability boundary works; it does not establish three independent implementations of NEO's structural behaviour. All three use `contenteditable` underneath. Only the extracted provider relies on `execCommand`.

## What is built

- Compiled Svelte 5 UI and rune ViewModel; strict TypeScript domain services, editor adapters and Electron host.
- A common manuscript with stable book, chapter and block IDs, ordered formatted runs, poetry/scene kinds, revision and Darlings.
- Typed document/proposal events and provider-independent editor, persistence and agent interfaces, with Zod-owned boundary schemas.
- Engine switching in the same writing surface, chapter navigation, theme, bookshelf fixture, formatting, Darlings, repeated Enter and undo/redo.
- Browser storage and serialized atomic JSON disk writes through Electron's isolated preload bridge. Close waits for a final save.
- A delayed deterministic agent with cancellation and source-bound proposals. Unrelated edits survive acceptance; changed text and missing targets reject; acceptance is undoable.

Drawloom's [capability standard](../../../drawloom/docs/adr/0004-standardise-capability-contracts.md) informed contract ownership, schema validation, replaceable providers and shared conformance. Its [plugin standard](../../../drawloom/docs/adr/0018-plugin-standards-and-runtime-extensions.md) remains the reference for a future loader. No private Drawloom package is required or copied. The writing research remains a direction for future skills.

## Representation

The experiment's canonical JSON is separate from DOM, ProseMirror JSON and Lexical JSON. Both rich engines translate native state to that contract. Electron writes the same versioned representation the author service uses in memory. This keeps engine choice out of saved manuscript identity.

For production, settle document semantics before choosing persistence: named entities, annotations, notes, citations, narrative spans, revision lineage, assets and recovery. Plain text with offset annotations is simple to inspect, but every edit must maintain ranges and formatting. Structured blocks and runs make chapters and formatting explicit, but need durable anchors and clear export rules. Engine-native JSON is convenient inside an adapter; making it the only disk format couples manuscripts to that engine's schema.

The current projection serializes whole manuscripts and stores up to 100 snapshots. It establishes the boundary, not a large-book storage/history strategy. ProseMirror merges equivalent runs and cannot represent empty marked text; selection direction and multi-block action ranges are absent from the shared selection contract.

## Agents and plugins

An agent receives a snapshot and selection and returns a proposal. It never gets editor DOM or a direct manuscript mutation handle. Acceptance revalidates stable block identity and exact source text, conservatively rebases a surviving range, emits an event, and enters application history.

The runnable provider tests this protocol with a repeatable 1.5-second delay. Live models, skill discovery, plugin manifests/loading, tool permissions, streaming and research-specific evaluation are not implemented. Those belong to a replaceable runtime behind domain contracts rather than to a Svelte component or editor extension.

Before production, decide whether proposals are individual replacement ranges or grouped edits, how narrative/annotation anchors survive structural moves, and how provider provenance and author acceptance are recorded. Text validation currently does not detect an intervening formatting-only edit within the proposed range. Richer proposals should carry source mark/annotation fingerprints as well as source text.

## NEO behaviour preservation

The surface reuses NEO's Gelasio typography, paper treatment, chapter navigation and restrained writing controls. It is a NEO-derived comparison shell, not a pixel-identical recreation. Original NEO was inspected as source; this experiment does not contain an automated original-app behavioural oracle.

Representative paragraph → scene → chapter gestures, formatted splits, undo caret restoration, Darlings and writer/agent races are exercised. Important original behaviours still need an explicit compatibility suite:

- Double-Enter scene undo originally rejoins the preceding split in one operation; shared snapshots here undo scene and split separately.
- Shift+Enter poetry conversion, Backspace verse romanization, scene-safe Delete and seam healing across selections.
- One-step Markdown-delimiter undo and language-specific quotes/dialogue spacing. Extracted punctuation currently uses English.
- Typewriter following, editable chapter titles, Tab em-spaces, spellcheck/Vim and note placeholder reconciliation.

These are product rules to preserve regardless of engine. The next design should specify them as author workflows and let engine adapters implement the required primitive edits and selection mapping.

## Evidence

Final integrated verification, 2 October 2026 on macOS:

| Check | Result |
| --- | --- |
| Svelte diagnostics and strict renderer/host TypeScript | Zero errors and warnings |
| Vitest | 22 tests, 6 files passed |
| Playwright Chromium | 30 scenarios passed across the three providers |
| Real Electron | 3 scenarios passed; each includes Save, restart, exact canonical restoration, immediate close flush and a second reopen |
| Production bundle and Electron compilation | Passed; all three engines in one 605 kB JS comparison bundle (190 kB gzip) |

Browser checks cover real keyboard typing, rich clipboard transfer, toolbar formatting, structural Enter, caret/undo, Darlings after edits, delayed proposals, save/reload and switching without duplicate change events. Browser page errors fail the suite. Composition checks are synthetic guards; they do not establish real OS IME behaviour. Electron validates actual files, stable IDs and retained bold formatting.

Screenshots: [NEO browser](/Users/afifim/.codex/visualizations/2026/10/02/01a0fa49-a47c-73c3-9d3e-e1fbdbf9f854/neo-comparison.png), [ProseMirror](/Users/afifim/.codex/visualizations/2026/10/02/01a0fa49-a47c-73c3-9d3e-e1fbdbf9f854/prosemirror-comparison.png), [Lexical](/Users/afifim/.codex/visualizations/2026/10/02/01a0fa49-a47c-73c3-9d3e-e1fbdbf9f854/lexical-comparison.png). Real desktop restart captures use `electron-<engine>-saved.png` and `electron-<engine>-reopened.png` in the same folder. Test output defaults to local ignored `screenshots/`; set `NEO_SPIKE_SCREENSHOT_DIR` to choose another directory.

Integration review repaired consumed NEO gestures, editable scene markers, invalid proposal bounds, restoration into scene markers, chapter merge after a trailing scene, cancellation/reopen races, and desktop close flushing. The scene restoration and chapter merge failures were reproduced with tests before repair. No mobile, accessibility, collaboration, recovery corruption or long-manuscript performance certification is implied.

## Decisions for our discussion

1. Agree the complete NEO behaviour baseline, particularly poetry, structural undo and writing navigation.
2. Choose engine ownership: ProseMirror transactions as the editing authority, or a portable domain edit stream with engine adapters.
3. Define one history policy for native typing, structural edits and accepted agent proposals. The spike intercepts application undo and rebuilds engine state; native engine history is not independently proven across structural replacements.
4. Specify canonical manuscript semantics, migration from existing NEO files, import/export and durable anchors.
5. Reuse Drawloom's plugin/agent contract patterns for discovery and execution, with author-approved proposals as the document write boundary.

## Licensing

NEO's root MIT license is retained beside extracted code. [ProseMirror](https://github.com/ProseMirror/prosemirror) and [Lexical](https://github.com/facebook/lexical) publish MIT-licensed engines; the pinned installed packages also declare MIT. This leaves substantial source modification available while retaining copyright and license notices. Distribution needs the dependency notices, including the desktop runtime's bundled components.
