# Production acceptance audit

The migration ledger contains 444 required desktop scenarios over 304 NEO features. At this review, 335 source-ID case bindings cover 175 scenarios in the production browser suite. The remaining 269 scenarios have no production browser case binding. No scenario is marked `ported`.

`leafloom-scenarios.json` records the actual candidate and reference test titles, author actions, assertions and remaining clauses. A bracketed feature ID establishes traceability; it does not establish that the feature's whole acceptance requirement passed.

## Evidence layers

| Layer | Proves | Does not substitute for |
| --- | --- | --- |
| Production `BookCore` and provider conformance | Transactions, native surface handling, one history, durable identity, reference mapping, rich fidelity, read-only unsupported bytes | Mounted application gestures, menu routing, scroll, clipboard or native host lifecycle |
| Filesystem and host tests | Real files, four-file receipts, stale hashes, partial retry/recovery, provider algorithms and typed request handling | Author close/reopen through Tauri, platform dialogs, OS shortcuts, signing or Keychain |
| Production browser acceptance | Real Svelte application, PM surfaces, native keyboard/selection/clipboard/Chromium composition, actual private Node filesystem host | Packaged Tauri WebView and its platform menus, hardware IME, foreground focus or macOS integration |
| Pinned NEO reference | Source-defined author actions and observable outcomes in the original application | Leafloom implementation evidence |
| Historical ProseMirror bridge | Prior compatibility investigation | Production Leafloom parity |

Package test counts are not added to the 444-scenario total. They support the relevant invariant only when their assertions implement that invariant. Review acceptance clauses before adding a package result to a scenario.

## Concrete supporting conformance

- `packages/editing/prosemirror-editor/tests/authoring.test.ts` verifies single/double/triple Enter, poetry, scene deletion, shared Notes/metadata/Darling/review history and unsupported exact bytes.
- `boundaries.test.ts` verifies rich chapter merges, empty chapter deletion, ownership, part numbering, selected counts and actual cross-chapter text moves. These do not yet prove the corresponding chapter-menu and native drag journeys.
- `format-contents.test.ts` verifies alignment, generated Contents role/part filtering and Poetry caret placement. Contents conformance does not prove Outline part names; that missing UI assertion found a production defect.
- `outline.test.ts` verifies ghost identity, consumed-section preservation, line restructuring and metadata replacement. Browser cases add actual editable focus, arrow/Tab/Backspace gestures and immediate shelf persistence.
- `darlings.test.ts` verifies rich context restoration, fallback destination and metadata/history. Browser cases add actual keyboard cut and visible list/restore behavior. The source/candidate offscreen case now verifies exact paragraph centering and restored rich bytes.
- `search.test.ts` verifies formatted text-node matching. Browser cases verify all four search scopes, text-node boundaries, literal queries, CSS highlight ranges, Find/Replace controls, native caret and one Undo; the source/candidate offscreen case now verifies viewport visibility without selecting or rewriting prose.
- `surfaces.test.ts` verifies composition guards, literal IME text, refresh/focus handling and reveal scheduling. Browser composition cases use real CDP composition delivery; they do not claim hardware composition.
- `fidelity.test.ts` verifies supported round trips and guarded opaque bytes. Native import/export and disk-migration acceptance still need separate end-to-end results.
- `packages/documents/filesystem-documents/src/files.test.ts` verifies durable receipt/reopen, conflicts, partial retry and recovery. Author save status, native close, external refresh and backup rollover still require their own application cases.

## Remaining finite clauses in authored scenarios

| Scenarios | Still required |
| --- | --- |
| 003 | Later writing-style native-command dispatch and future defaults pass the real-storage Application VM suite; physical native menu routing remains separate |
| 023 | Several created covers; all seven styles/templates currently have same-browser source algorithm equality rather than full native library coverage |
| 067 | Remaining guard permutations; heading/mouse trusted composition case now passes |
| 087 | Production conformance now verifies opening-poetry conversion before chapter crossing and exact metadata through two Undos; mounted native author journey remains separate |
| 088, 095 | Production surface/core conformance verifies opening-verse drop-cap omission and successive-Undo chapter metadata; complete mounted browser and native menu proof remains separate |
| 140 | Full Darling metadata through mounted Undo/Redo |
| 144, 158 | Independent Outline/Darlings scroll now source/candidate bounded cases pass |
| 146 | Part first-body title red found and corrected; complete role/filter/UI title target now passes |
| 153, 156 | Production core conformance covers rich chapter deletion to Darlings and reordered section/ghost reconciliation; actual Outline context menu and reorder journeys remain separate |
| 157 | Native close flush |
| 164 | Offscreen search now source and candidate verified in bounded cases |
| 163 | Explicit250ms reset and retained count now source/candidate bounded cases pass |
| 200, 204, 211 | Native window theme, physical font accelerator/layout routing and native focus menu ticks |
| 216 | Localized/Vim section variants, ordinary repeated shortcut and pointer-close breadth; physical OS routing |
| 124, 127, 130 | Exact idle timing/native close and export remain separate clauses; original deletion-without-Undo characterization needs fresh reference evidence |
| 282-B | Source/candidate context traversal and actual end-caret now pass |
| 185 | Remaining special-entry names |
| 188 | Closed-cover context goal set/remove, localized title and persisted25% progress pass bounded source/candidate UI; fresh complete report remains required |
| 193 | Count completion notice once across deletion/retyping |

All authored scenarios additionally require a fresh frozen complete production report and fresh pinned NEO reference evidence. The reference adapter is opt-in; foreground native testing is not performed by the default browser command.

## Unported areas

The 269 scenarios without browser bindings retain their original source requirements. The largest open application groups include bound shelves/book movement/deletion, custom/AI covers and secrets, publication pages and chapter menus, typography/alignment/indentation breadth, Sticky export/native-close breadth, spell languages and corrections, fullscreen/Vim, native menus/dialogs/accessibility, external-file refresh, backup/recovery, import/export/email, plugins, settings/update/help and platform lifecycle.

Use `pnpm check:parity` to enumerate the exact unmet rows. Keep failure visible until the required author actions and assertions have production evidence. A successful subset run is recorded as a subset.

## Latest bounded checkpoints

The source and production chapter-kind/menu group passes14/14 (`/tmp/leafloom-chapter-current.json`). It includes all eleven roles, fixed versus editable headings, layout, copyright starter/Undo, Contents guards and the six-format chapter chooser/Cancel. Actual chapter export files remain a separate clause. The completed `/tmp/leafloom-pages-spelling-performance.json` checkpoint passes38/42 with no skips or retries: bound-page/title/binding10, spelling25 and performance3 pass. Only the four native Enter-format inheritance cases fail. Current production Enter-format inheritance cases expose four genuine failures against four passing source cases; their expected bold/italic continuation stays unchanged.

The same checkpoint verifies all thirteen real bundled spelling dictionaries, persisted language selection, suggestion replacement/Undo, global learned-word aliases, deliberate pass controls and trusted renderer fallback shortcuts. Pinned hidden source runs verify thirteen dictionary selections and global learned-word persistence. Physical OS accelerators, late-result cancellation and remaining word-normalization clauses retain explicit gaps. Generated-cover/output VM tests verify request scope and fingerprint forwarding; complete native artifact validation remains separate.

Fresh bounded production checkpoints `/tmp/leafloom-drop-enter-fixed.json` and `/tmp/leafloom-guards-space-poetry-fixed.json` pass ordinary Enter emphasis/drop-order and all nine scene/modifier/space/poetry conditional cases. Source removal/reshelve/page-trash four cases pass with complete recursive file-byte observations; candidate removal/reshelve controls remain under red-green implementation. Fixture dialog responses/private Trash prove original controller outcomes, with physical system routing separate.

The partial `/tmp/leafloom-library-goals-enter-affinity.json` preserves actual candidate goal/removal/cancel passes and two genuine mixed-mark Enter-tail failures. It was interrupted before completing all deletion/reshelving cases. Driver corrections now target the library File control and source-correct Move to Trash confirmation; these are unchanged author intentions, not alternate passing postconditions.

The strengthened production library suite passes7/7 (`/tmp/leafloom-library-isolated-fixed.json`), matching the source controller outcomes. Private fixture setup now gives the chooser exactly the intended loose-book set and valid reviews ownership; page snapshots wait for the actual durable close and lease release. Exact recursive bytes remain unchanged assertions. Hidden original Vim14 passes mode/count/motion/word/insertion/delete/Undo/Find clauses; the current full production baseline includes those tests.

The full hidden pinned-source renderer checkpoint passes192/202 (`/tmp/leafloom-original-hidden-full-renderer.json`). It preserves ten failures for diagnosis: a solo-heading fixture and incorrect About menu route, plus Darling history, empty poetry history, NBSP merge, typewriter centering, Replace All Undo and three tab-label/cancel cases. Subsequent driver corrections retain actual UI actions and exact postconditions; the complete report is not promoted to current full parity. Seven new source cases pass chapter boundaries, Unicode/mixed emphasis and four paragraph alignments. Their six source scenario mappings are candidate-authored; full Undo metadata, empty front-entry/Contents guards and exported alignment remain explicit clauses.

Local bootstrap CI runs policy, contracts, strict checks, build and the complete headless suite. Separate locked Linux/Windows Tauri jobs compile with unstaged host resources omitted explicitly; packaging, signing and actual cross-platform runtime behavior remain release obligations. Unique per-run trace directories preserve earlier failure artifacts.

Automatic typography adds49 passing pinned-source cases. Its thirteen mapped scenarios remain candidate-authored pending production results. The source normal modifier-transition dash Undo loses the just-typed letter; the approved unified-history target retains it, with both native browser delivery routes explicitly characterized. Chapter078 empty front-entry dissolution and Contents protection, plus077 full metadata Undo and reopen, now pass source3; the corresponding complete production application cases remain pending.

The four guarded hyphen cases now pass against hidden pinned NEO (`/tmp/leafloom-original-hidden-typography-guards.json`): trusted Alt/Control/Meta input and key229 followed by a native composition commit retain literal hyphens and bold marks. These are browser input observations, without a physical keyboard layout claim. Their production runs remain pending. The ledger has 300 case bindings over the same 162 candidate-authored scenarios, with zero ported scenarios.

Source144/167 now have source-valid shared cases and explicit contract-output oracles. Rename persists immediately but NEO's auxiliary heading refreshes only after a tab switch; rename input Escape returns to the shelf. Leafloom retains immediate heading projection and the open editor. NEO's Replace All structural Undo works from its button, without structural Redo; Leafloom preserves editable-prose Undo and Redo. The source no-match assertion re-applies the replacement through the UI after recording unavailable Redo, then proves no extra snapshot. Latest reports are `/tmp/leafloom-original-hidden-tabs-replace-source-valid.json` (three tab cases pass) and `/tmp/leafloom-original-hidden-replace-source-valid.json` (replacement case passes). The earlier failed replacement sequencing remains in the first report.

The bounded production typography run (`/tmp/leafloom-typography-candidate-red.json`) passes37 cases, fails5 and leaves11 unrun. Title/Outline/shelf punctuation handlers and blank Notes click-to-type are actual application gaps. This checkpoint does not establish the late rich NBSP/paste/direct-Undo/guard clauses or a complete typography pass. Source oracles remain unchanged.

The subsequent62-case production batch passes56 and fails6 (`/tmp/leafloom-typography-alignment-boundaries-fixed.json`); all9 alignment/chapter/inline cases pass. Field typing/focus/caret/durability repairs now pass. Four paste failures came from dispatching to the wrapper; using the actual editable child passes the four unchanged text/style/disk assertions (`/tmp/leafloom-typography-paste-driver-fixed.json`). Two genuine provider differences remain: NBSP punctuation mark inheritance and trusted Alt-hyphen bypass. These separate checkpoints are not a complete fresh typography report. Scenario status/counts remain unchanged.

The fresh complete production typography53 passes53/53 (`/tmp/leafloom-typography-all-fixed.json`,48.6s), closing the two observed provider regressions without changing author oracles. Root diagnostic full307 records304PASS/3FAIL (`/tmp/leafloom-full-browser-20261002-2227.json`,6.3m). Its three new marked-run boundary cases were authored with incorrect source mark assumptions; corrected hidden source3 now passes every downstream caret/history/disk/reopen assertion, requiring bold-owned inserted glyphs and an unchanged italic tail. Production remains red pending the provider correction. The complete307 report is not final frozen evidence because a host import helper changed during its execution. Counts and full444 scope remain unchanged.

The subsequent focused69 checkpoint was stopped after a broad regression was established:11PASS/12FAIL/1interrupted/45unrun (`/tmp/leafloom-typography-boundary-locale-performance-composition.json`). Eight native Chromium composition and three performance cases pass. Marked-node boundaries, actual interface-dependent French spacing and previously passing quote styles fail after the provider query refactor. Source3 boundary and source2 actual-interface cases pass with unchanged final text/mark/history/disk assertions. These five new exact-title bindings bring the ledger to305 bindings over162 candidate-authored scenarios; no scenario is promoted. The provider correction awaits causal native validation.

Causal native-prefix capture at public keydown resolves the query regression: targeted9 passes8.6s, then complete69 passes1.0m (`/tmp/leafloom-typography-prefix-capture-full.json`). All53 typography,3 marked-node boundaries,2 actual-interface contrasts,8 composition cases and3 performance cases pass without retries or skips. The full444 gate stays unmet.

Actual original chapter-only export now passes all six file formats with chosen-story inclusion, neighboring-story exclusion, title/author/heading retention and live/disk preservation. Actual Spanish file import retains dialogue spaces (`—Hola — dijo —.`) while leaving quotes, ellipsis and double hyphens literal; the original input remains byte-identical. These seven source outcomes support the expanded native callback but do not establish its unexecuted production branches. Native TXT/MD/HTML/DOCX/EPUB output passes before PDF CJK loss stops the callback; the host correction requires a fresh actual-artifact run.

## Current finite proof and next author journeys

The production prefix/locale/typography/composition/performance69 checkpoint passes all69 (`/tmp/leafloom-typography-prefix-capture-full.json`). Provisional metadata autosave/history6 passes all6 (`/tmp/leafloom-field-autosave-fixed.json`); its broader104 regressions pass all104 (`/tmp/leafloom-live-metadata-regressions.json`). Source title/subtitle Enter4 and candidate4 pass with front/back preservation, existing-story end caret and missing-story creation (`/tmp/leafloom-original-hidden-title-enter.json`, `/tmp/leafloom-title-enter-current.json`). These are finite production outcomes; the required444 rows and zero `ported` statuses remain unchanged until complete clause mapping and fresh artifact-bound reports.

The current registry is incomplete as a map of authored work: it now contains312 bindings while recent metadata, title-page and real-artifact cases are recorded separately. A missing binding is not automatically a missing implementation. Conversely, a passing bracketed feature ID does not cover every clause. In particular:

| Group | Concrete missing acceptance | Next integration journey |
|---|---|---|
| 230–247 durable lifecycle | Mounted source/production external3 now proves Darling archival, adjacent conflict chapters and merged additions. The registry still needs complete lifecycle clause mapping; delayed read/write, book-switch and startup cases remain separate. | Edit real private files while a book is open; prove clean adoption, conflicting local/incoming words, delayed read/write and book-switch races, recovery receipt and visible scroll/caret. Record deliberate conflict-policy differences before any promotion. |
| 025 custom covers | Native Set/Replace/Remove bytes/menu proof passes. Picker cancellation and actual reopened thumbnail visibility remain separate from the current source menu/disk case. | Cancel replacement and assert exact old image/metadata; reopen and decode the actual thumbnail. Hidden fixture picker evidence cannot establish physical OS panel traversal. |
| 049 title Enter | Four source/production UI cases now include rich Part before story, both fields and absent/existing story. | Include current frozen canonical receipts; Part prose and stable IDs are preserved. |
| 093 history routing | Actual source/production scene → type X → Undo typing → keyboard-focused counter → structural Undo passes with rich bytes, caret and durable reopen. | Include fresh canonical receipts for the authored route; metadata-field history remains independent. |
| 263 PDF | Native actualPDF263-B now passes real TOC page/link agreement, bookmark destinations, title footer suppression, body numbering and poetry geometry. | Parse actual PDF destinations, link annotations, page labels/footer text positions and poetry versus ordinary font/indent coordinates. |
| 267–269 email | Host service tests and native UI configuration are supporting proof. Actual UI draft PDF attachment/hash/subject and cancellation/unavailable-client snapshot remain separate. | Configure fixture address, draft through actual author UI, inspect real generated PDF and retained sanitized native draft command; preserve prose on failure. |
| 233–235 platform persistence | Filesystem lease/backup tests do not prove startup daily rollover/retention or second-process native focus. | Isolated backup clock rollover and real competing process; classify native focus explicitly rather than infer it from lease refusal. |

Source custom-cover Set/Replace/Remove passes with exact two different PNGs, conditional menu state, removed metadata, reload and unchanged rich prose (`/tmp/leafloom-original-hidden-cover-controls.json`). The fresh native callback retains strong UUID, denied-write and image-byte assertions. Its full23-row native result now passes; reviewed validation accepts22 rows and retains the cancellation contract gap.


## Frozen completed checkpoint

Production browser326/326 passes with current fingerprint667d0aac… (`/tmp/leafloom-full-browser-20261003-0026.json`), verified against live inputs. Hidden original34/34 passes with matching source/harness fingerprints (`/tmp/leafloom-original-hidden-coherent34.json`). Root reports Application26/26 and complete495-case CPU CI with three explicit optional codec skips.

The completed native callback passes23 finite rows, with actual runtime/asset/module binding and no unexecuted clauses. Independent reviewed contract and artifact validation accepts22/23; the cancellation contract retains its recorded known-gap and is not promoted. See `native-finite-acceptance-validation.json` under `.leafloom/evidence`. Complete444-scenario migration remains unmapped/unpromoted.

The exported seeded procedural abstract is source behavior (`app.js:8052–8065`); AI-generated paintings are excluded. Production custom-image selection and procedural fallback follow that policy. Finding `cover.jpg` in EPUB is insufficient to infer painted-art inclusion.

## Recent finite traceability review

The ledger now binds the actual shelf auto-scroll, manuscript blur flush, remote reading-place, renderer failure, closed-library focus refresh, clamped/scroll-only resume and mixed-block legacy paragraph journeys. Each binding retains its literal test title and assertions, author actions and remaining acceptance clauses. The 335 bindings cover 175 of 444 required scenarios; all remain `candidate-authored`, with zero marked `ported`. Supplemental bindings on the parent A scenarios describe their tested subset rather than completing every source requirement.

The current mixed-block source pair passes 2/2 in 3.5 seconds (`/tmp/leafloom-original-hidden-resume-mixed-current.json`). Both reopen and remote legacy paragraph indices exclude headings and code blocks, preserve rich prose through actual typing, and retain durable paragraph indices and identity. The updated fixture gives the saved local bookmark an explicit old timestamp so the newer remote bookmark is eligible. Earlier receipts remain unchanged.

The recent complete browser checkpoint runs 341 cases: 337 pass and four fail (`/tmp/leafloom-full-browser-frozen-20261003-0154.json`). That count is an application checkpoint rather than 341 fulfilled inventory scenarios. The subsequent registry and fixture changes require new frozen reports. The coherent source suite passes 51/51 in 1.4 minutes (`/tmp/leafloom-original-hidden-coherent51.json`), including both mixed-block journeys. Its source harness fingerprint matches the frozen files at completion. Hidden native document/collection receipts retain their physical keyboard, picker and foreground qualifications.

## Final bounded author journeys

The whole-folder replacement source case passes 1/1 (`/tmp/leafloom-original-hidden-folder-replacement.json`). It replaces the complete private book folder, preserves every original-aside file byte, adopts incoming rich prose through NEO's public focus refresh, and verifies two subsequent native author continuations through durable reopen. Notes, Outline, Darlings, stickies, book/chapter identity and exact rich chapter bytes remain intact. Original NEO has a focus/visibility/periodic refresh cadence; this case does not claim an original filesystem watcher.

The cross-chapter Vim half-page source pair passes 2/2 (`/tmp/leafloom-original-hidden-vim-cross-chapter-final.json`). Both directions hit the real manuscript midpoint in the neighbouring chapter, then preserve actual insertion, Undo/Redo, exact rich output and chapter IDs through reopen. The adapter validates actual observed chapter id/html fields across both legacy and composed envelopes; exact chapter order and rich output assertions remain. These bindings remain candidate-authored until the full inventory acceptance is reviewed.

The preceding coherent hidden pinned-source checkpoint passes 54/54 in 1.4 minutes (`/tmp/leafloom-original-hidden-coherent54.json`), with no skips or retries and a matching harness fingerprint at completion. It includes the new folder-replacement case and both cross-chapter Vim directions alongside the prior 51 cases. This is original-source evidence; it does not replace the candidate or packaged-native results.

The additional Notes guard passes original NEO 1/1 (`/tmp/leafloom-original-hidden-vim-notes-guard.json`): native CtrlD/U preserve scroll200, native caret and all90 italic Notes paragraphs through save/reopen. It is separately bound within NEO-225-A without promoting that scenario.

## Final source and traceability freeze

The coherent pinned-original suite passes 55/55 in 1.4 minutes, with no failed, skipped or flaky cases (`/tmp/leafloom-original-hidden-coherent55.json`, copied to `tests/neo-compat/reference-results.json`). Its harness fingerprint matches the frozen source/test tree at completion. The additional Notes guard and both cross-chapter half-page directions execute alongside the whole-folder replacement and prior 51 cases.

Final reviewed traceability contains 335 browser case bindings across 175 of 444 required scenarios. The remaining 269 scenarios have no browser binding. Zero scenarios are marked `ported`; full 444-scenario acceptance remains unmet. The complete authored suite count and native finite artifact facts do not substitute for complete inventory-clause review. Registry, scripts and tests are frozen for the final candidate/native reports.

## Last finite writing acceptance review

The new scene Enter, nonstory triple Enter and long deleted-chapter recovery journeys pass pinned original NEO 3/3 (`/tmp/leafloom-original-hidden-writing-recovery3.json`) and Leafloom 3/3 (`/tmp/leafloom-writing-recovery3.json`). NEO-072-A leaves exact rich paragraphs and chapter order unchanged; NEO-073-A keeps all new ordinary paragraphs within the dedication without a scene or new story chapter; NEO-142-A persists a 2000-character summary alongside the complete rich archive, then restores every paragraph and mark through durable reopen. These cover their complete literal browser acceptance clauses.

Only those three scenarios are marked `ported`, subject to fresh canonical frozen reports. The ledger contains 338 browser case bindings across 178 of 444 required scenarios; 266 have no browser binding and 441 remain unported. Full 444-scenario acceptance remains unmet. The preceding 347/347 browser checkpoint and independently validated 23 document, six collection and one folder native facts remain retained with their actual fingerprints and hidden-input qualifications. The final three test bindings change the production evidence fingerprint; earlier native receipts are historical rather than relabelled.

The final coherent pinned-original suite passes58/58 in89.5seconds, with no skips, failures or flaky cases (`/tmp/leafloom-original-hidden-coherent58.json`, copied unchanged to `tests/neo-compat/reference-results.json`). Its recorded and live reference harness hashes match (`ca6e6fc3febf577fbfe5f89a96409083faa3cdae1a201eec3fbbab0ea8e8040b`). The three complete writing clauses execute with the prior55 source journeys. Canonical candidate/native release receipts remain separate requirements.

A final literal-clause review also completes NEO-049-A: all four title/subtitle cases test existing story navigation past copyright, dedication and Part, and missing-story insertion before back matter, preserving rich publication content and stable IDs through reopen. This brings ported scenarios to4;440 remain unported, with338 bindings/178 bound/266 unbound unchanged. NEO-093-A remains partial: typing Undo and outside-editor structural Undo are tested, but immediate Undo after consecutive breaks before subsequent typing is not. Its remaining gap names that exact untested route.


### Final bounded corrections — 2026-10-03 04:08 UTC

The sealed350-case preview remains a historical snapshot. Three source-derived defects now have retained RED/GREEN evidence: NEO-079 single-em-space dedent, NEO-051 ordinary chapter-heading Enter focus, and malformed-first dropped-import isolation. The first two add literal browser bindings; the third has actual-filesystem Application coverage. No broader clause was waived or promoted.

The registry now contains340 bindings across180 required scenarios;264 remain unbound,4 ported and440 unported. Source60/60 passes with matching live harness; final CPU537 and strict checks pass. New352 browser and actual native receipts must bind the corrected source. Source051 still requires its blank/ShiftEnter clauses;079 still requires complete modifier/native routing review. Navigation gap insertion/drag, targeted tile/shelf drops and spell-language failure rollback remain concrete capability gaps.
