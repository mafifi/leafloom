# Hidden pinned NEO reference ledger

2026-10-02 renderer comparisons use pinned NEO `ed090e9988d446daf1ebbde91bcebc13b599909b`, Electron43.7.6, an existing certificate-signed reference host copied without signing, and unique marked private fixtures. `hidden-host.cjs` prohibits activation, keeps every window hidden and denies credential-backend access. Original renderer, preload, controllers and document handlers run unchanged. Programmatic native menu-item activation exercises the source handler; it does not prove physical accelerators or foreground menu interaction.

| Group | Actual result | Report |
|---|---|---|
| Authoring |5/5 passed|`/tmp/leafloom-original-hidden-authoring.json`|
| Outline and poetry |29/31 passed|`/tmp/leafloom-original-hidden-poetry-outline.json`|
| Onboarding, identities, shelves, counters, tabs |22/25 passed|`/tmp/leafloom-original-hidden-library-tabs.json`|
| Search and four scopes |10/12 passed; Find Tab then1/1 passed after observable debounce readiness|`/tmp/leafloom-original-hidden-search.json`|
| Goals and formatting/history |13/13 passed after visible-backdrop selector correction|`/tmp/leafloom-original-hidden-goals-history.json`|
| Offscreen restore/Find and250ms debounce |3/3 passed|`/tmp/leafloom-original-hidden-offscreen-debounce.json`|
| Independent auxiliary scroll |1/1 passed|`/tmp/leafloom-original-hidden-scroll-menu.json`|
| Chapter navigation/context |1/1 passed with source end-caret oracle|`/tmp/leafloom-original-hidden-chapter-popup.json`|
| Chapter kind/menu finite UI |14/14 passed including source readonly-frontmatter heading assertions|`/tmp/leafloom-original-hidden-chapter-menus.json`|
| Binding/cover parking/numbering |4/4 passed with three constituent books, seven ghost pages and three Part seams|`/tmp/leafloom-original-hidden-bound-shelves-fresh.json`|
| Bound page/title sheets |6/6 passed with actual typed sheets, Done/Escape, placement, empty Part and field advance/reload|`/tmp/leafloom-original-hidden-bound-pages.json`|
| Pen rack/cross-author move and Undo |3/3 passed with actual pointer drag and durable placement/author/prose|`/tmp/leafloom-original-hidden-library-moves.json`|
| Bundled spelling dictionaries/pass |14/14 passed using actual CSSHighlight ranges and real13-dictionary worker|`/tmp/leafloom-original-hidden-spelling.json`|
| Global learned word |1/1 passed through actual range-coordinate context menu, language switch and reload|`/tmp/leafloom-original-hidden-spelling-learn.json`|
| Cover insertion and empty/populated shelf drop |2/2 passed with visible indicator before release, native pointer drag and durable exact order|`/tmp/leafloom-original-hidden-library-order.json`|
| Explicit source differences |2/2 source-characterization passed|`/tmp/leafloom-original-hidden-characterization.json`|

The interrupted search/history/goals batch passed15 cases, failed two other assertions (Darling Redo and a backdrop selector that also matched hidden onboarding), then encountered five Find activation failures. Its Find activation used a DOM shortcut that requires a foreground native accelerator in NEO; corrected reference drivers call the actual menu item instead. Interrupted or invalid driver results do not count as completed integration evidence. The Find Tab case passed a fresh bounded rerun after observing the actual match count; source scene start/end edges passed2/2.

## Observed differences

- **NEO086-B:** empty poetry converts to prose; structural Undo restores poetry. Redo leaves poetry in place. Leafloom's unified engine implements redo; source snapshots have no corresponding redo stack (`app.js:6116–6164`). The unchanged common test fails only its final redo assertion.
- **NEO087-A:** native Backspace paragraph merge produces `Alpha\u00a0beta.` and persists `&nbsp;` inside nested Chromium style spans. Reopening visibly heals NBSP to ordinary spaces (`app.js:2294–2299`), while the original file still contains the old serialization until another save. Leafloom immediately preserves ordinary paragraph text without those transient style wrappers. Both visible and durable phases were observed in a dedicated source-characterization test.
- **NEO144-A:** successful Notes/Outline rename updates the tab label, book metadata and future default, but the currently visible auxiliary heading retains the old name until switching tabs (`app.js:4830–4843`). Leafloom updates it immediately. Two common source tests fail that added immediate-heading assertion.
- **NEO144-A:** cancelling the rename with Escape returns NEO to the shelf through the global Escape chain. Subsequent manuscript-tab interaction fails because the editor is hidden. Leafloom's modal owns Escape and retains the editing workspace.
- **NEO165-A:** Find is debounced250ms; Tab before observing matches falls through ordinary focus navigation. The driver now observes the actual match count before testing its caret contract.
- **NEO167-A:** common source ReplaceAll cross-chapter Undo assertion leaves replaced text unchanged in this hidden renderer run. Further source/menu routing diagnosis is required before classifying it as a source defect.

These are source characterization and implementation decisions, not a completed444-scenario Leafloom parity proof. Hidden tests exclude actual foreground focus, physical native accelerators, global clipboard operations, hardware IME and encrypted credential-store evidence.

Desktop chapter navigation (`app.js:4214`) places the caret at the body end before scrolling to the chapter top; the valid third-chapter fixture destination is `Gamma.|`, not `|Gamma.`. The native root-boundary range is observed as the last paragraph/end without changing selection. The original-backed chapter-popup case preserves that destination before menu traversal.

The unchanged chapter-kind/menu group also passes14/14 in Leafloom (`/tmp/leafloom-chapter-current.json`), after fixing nine blank front/back headings and the missing copyright starter/Undo transaction. Binding source controls pass4/4; the source-matched bound-page and binding ten-case candidate checkpoint now passes after the shelf-name blur fix and actual current-cover ID observation. Additional source bound-page clauses pass5/5 (`/tmp/leafloom-original-hidden-bound-pages-extra.json`): title whitespace paste/native Undo/fallbacks, copyright starter edits, written Prologue/Epilogue first-caret/durable body, and multiple Roman Parts with duplicate seam suppression. Candidate comparison for these five is pending.

Additional source reference batches pass: removal/reshelve/page-trash4, book-trash2, closed-cover-goal1, mixed-mark Enter-tail2, scene/modifier guards5 and space-deletion/history2. These tests observe recursive real file bytes and actual controller/renderer outcomes. Native dialog responses and Trash are restricted to the marked fixture; system dialog routing and physical Trash remain separate. The actual hidden source PDF/HTML dropcap export also passes1 and writes retained artifacts `/tmp/leafloom-original-dropcap-reference.{pdf,html}`.

## Complete renderer checkpoint and driver corrections

`/tmp/leafloom-original-hidden-full-renderer.json` retains a complete202-case hidden renderer checkpoint:192 pass,10 fail, no retries or skips. The profile, source217-file provenance and hidden-host restrictions remain unchanged. Notes and Sticky groups that use the global clipboard stay outside this hidden command; their physical/native clauses remain separate.

Four corrected driver cases pass in `/tmp/leafloom-original-hidden-driver-fixed.json`: chapter-heading composition now uses two ordinary stories because a solo untitled story hides its heading; renderer About opens through Help rather than the macOS application role; author removal waits for the actual library receipt; repeated same-title neighbor fixtures are observed by their current cover identity. Neither manuscript postconditions nor recursive file-byte assertions were relaxed.

The typewriter source failure was an internal-property oracle error. Source leaves `--typewriter-room` cached when disabled, while its CSS applies that value only under `body.typewriter`. `/tmp/leafloom-original-hidden-typewriter-rendered.json` verifies keyboard centering, visible mouse placement, larger active room and restoration of the actual normal computed margin. It passes. The remaining source history, NBSP and tab-label failures retain their raw reports and unresolved/intentional-difference dispositions.

New chapter-boundary, native Unicode and paragraph-alignment cases pass7/7 in `/tmp/leafloom-original-hidden-inline-alignment-fixed.json`. Unicode replacement uses one trusted committed input so its one-Undo assertion matches the real browser operation. Flag observations are scoped to the manuscript because the sidebar legitimately has a second element with the same note ID. Alignment exports and full chapter-merge Undo metadata require further clauses.

## Automatic typography

`/tmp/leafloom-original-hidden-typography-final.json` passes49 source cases for locale/fallback quote styles, singles/apostrophes, paragraph balance, local/book quote inference, styled em dash and ellipsis, title/Notes/Outline/shelf fields, French spacing, dialogue language/edge rules, immediate dash Undo and rich clipboard-event context. Global fields produce `A—B` with a collapsed caret at3. A canonical empty source paragraph uses `<p><br></p>`; a bare empty `<p></p>` exposes Chromium's unlaid-out empty-block behavior and was removed from this normal-author fixture.

The source normal modifier-transition Undo characterizes the lost `H` and selected hyphen at offset0. The target contract retains `-H` and collapsed caret2, as required by the source comment and approved unified-history repair. Direct trusted modified-Z independently produces the intended output in original NEO. The first raw intended-output failure remains `/tmp/leafloom-original-hidden-typography-ready.json`.

All-dash exclusion concerns pasted dialogue processing; typing paired hyphens invokes immediate em-dash conversion. A pasted `-Hola` fragment after mid-paragraph whitespace stays a suffix hyphen; it does not acquire paragraph-start speech spacing. French replacement after an unmarked NBSP following italic `Oui` inherits the italic mark on `Oui ;`, matching the source delete-then-insert operation. These observations define the assertions.

Guarded modifier/composition em-dash input, Quebec interface spacing and actual imported-file typography retain separate clauses. Clipboard-event payload tests use the real application paste handler without writing the global native clipboard; they do not prove physical clipboard ownership.

### Tab labels and Replace All structural history

`/tmp/leafloom-original-hidden-structural-tabs-characterization.json` records two passing original characterizations (3.0 seconds). The source tab rename handler (`app.js:4830–4844`) updates the tab and persists its name/default, without refreshing the auxiliary heading. A subsequent workspace switch displays the new heading (`app.js:5102–5109`). Escape in the rename input cancels the edit and bubbles into the global Escape handler; the book closes to the shelf. Reopening preserves the committed label and author prose. Leafloom's immediate heading update and modal Escape retention are application improvements rather than exact source outcomes.

Replace All creates a structural snapshot (`app.js:6343–6369`). Its structural Undo handler explicitly declines events originating in editable text or inputs (`app.js:6213–6220`). Focusing the actual Replace All button and invoking Undo restores both chapters. Native Redo does not replay that structural snapshot, because `structuralUndo` resets native history and NEO has no structural Redo stack (`app.js:6134–6160`). Leafloom's single-history Redo contract is recorded in ADR0003. The earlier full-source failures remain retained; these cases identify their actual cause rather than count the old bridge as replacement proof.

## Real document artifacts

`/tmp/leafloom-original-hidden-document-io-full.json` records12/12 passing cases in17.2s. The pinned original writes actual TXT, Markdown, HTML, DOCX, EPUB and PDF through File→Export and private native save responses. Shared readers inspect text/markup, real ZIP resources and PDFjs text/outline. Each export retains the live draft and persisted Sticky metadata. Edition cases inspect actual front/body/back ordering, alignment, poetry, chapter styles and navigation destinations. Import cases exercise picker cancellation, three-file Markdown/numeral-TXT/inherited-style-DOCX selection, unchanged input hashes and malformed-first/later-valid isolation. Export cancellation and unavailable-parent write failure preserve author text.

These results prove original controller and artifact semantics under hidden fixture dialogs. They do not establish physical native picker operation, generated/custom cover identity, chapter-only export scope, PDF geometry or email delivery. The corresponding Leafloom hidden-native callback is separate production evidence and remains unproved until its actual run completes.


## Coherent current source checkpoint

The coherent hidden pinned-original34 run passes34/34 in48.0s (`/tmp/leafloom-original-hidden-coherent34.json`), with live source/harness fingerprint verification. It includes external3, saved-caret clamp2, structural Undo1, title/subtitle Enter4 with Part, and actual document artifacts24. The separate completed Leafloom hidden-native23-row callback and production browser326-case checkpoint are recorded in the execution ledger. Physical picker panels and foreground/native credential claims retain their own evidence boundary.
