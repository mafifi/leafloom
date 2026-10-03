# NEO browser adapter

The provider uses the browser's real `contenteditable` and `execCommand` editing implementation. It renders every chapter as `.chapter[data-id]`, an inert `.chapter-title`, and an editable `.chapter-body`. Each manuscript paragraph owns `data-block-id`. Scene markers are inert `p.scene-break` elements. Poetry carries `.poetry`; inline line breaks round-trip through runs.

## Source and boundary

Source inspected: NEO 1.2.4, root `app.js` at `ed090e9`, copyright Hugh Howey, MIT. The accompanying `LICENSE` is copied from the root. The source's native paragraph separator, bold/italic commands, composition guards, paragraph structure, smart-key replacements and paste policy remain browser editing operations.

`typography.ts` ports `mdEmphasisMatch`, `balancedRuns`, `markdownInline`, `quoteOpenIn`, and English `dialogueDashEdits`/`dialogueDashes` into typed, independent functions. Their matching rules and regexes are retained. Smart-key command sequencing follows `smartKeys` and `markdownEmphasis`: closing emphasis removes markers, applies native marks, then places a plain caret after the word; double hyphen and triple period become em dash and ellipsis. English curly quotes use the original opening-context and open-quotation rules. The spike deliberately fixes English typography; NEO's locale, language preferences and manuscript-wide quote-style detection are absent.

`dom.ts` rebuilds the canonical run serializer/parser around the inspected `cleanPasteHtml` policy: detached DOM parsing, block/break markers, style-only bold and italic, whitespace normalization and inline single-paragraph paste. It emits only escaped text and allowed inline marks. Executable/resource elements and clipboard placeholder identity attributes are discarded. Rich-paste dialogue-dash normalization is not ported; plain-text paste retains NEO's Markdown and English dialogue-dash conversion. The source's inline note placeholders and reconciliation use application note models that the spike contract does not provide. Existing canonical placeholder attributes survive rendering and reading.

The stable-ID bridge, canonical document cloning and DOM-to-selection mapping are new spike code. Native paragraph splits duplicate IDs in Chromium; the first occurrence retains its ID and later occurrences get UUIDs. Newly inserted native paragraphs get UUIDs. The adapter retains the latest `replace` metadata and leaves revisions to the session. `replace` sends no changed callback and restores the caller's selection (or current selection when omitted).

Shared structural Enter/Backspace, Darlings, structural history and proposal operations belong to the parent service. The adapter calls `gesture` before native key handling, except while composing. Native editing history remains browser-owned. NEO's bespoke immediate undo for Markdown/dash substitutions is not extracted; a Markdown conversion comprises multiple native commands, so a native undo can reverse an intermediate command rather than recover all typed delimiters in one step. Application UI, typewriter scrolling, spellcheck, Vim, locale preferences, page layout and native menu integration are outside this provider.

## Validation

Executed: `vitest run src/editors/neo/typography.test.ts`: four tests pass, covering Markdown recognition/escaping, dialogue dash exceptions and quote depth. Executed adapter-only strict TypeScript compilation with TypeScript 6's `--ignoreConfig`: passes. These checks do not prove browser command or IME behavior.

Parent-owned browser checks should cover native typing and paragraph split IDs; collapsed/ranged bold and italic; rich paste containing scripts, styled spans, nested blocks and BR; same-block caret offsets over nested marks; chapter/scene gestures with formatting preserved; native undo and common structural undo; caret restoration after `replace`; selection persistence after toolbar focus; synthetic composition exclusion; switch/dispose/re-mount without duplicate callbacks. Real OS IME remains separate evidence.
