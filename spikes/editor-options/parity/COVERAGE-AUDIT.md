# NEO UX coverage audit

Audit boundary: shipped desktop NEO at the root of this repository. The ProseMirror spike must preserve the application experience as well as editing semantics. The root application is the behavioural reference. Mobile Pocket is a separate application; the README roadmap is not shipped desktop scope.

This audit was mined independently from `main.js`, `preload.js`, `index.html`, `styles.css`, `app.js`, `README.md` and `TUTORIAL.md`. Paths and line numbers below refer to root files. Each row requires executable coverage in the feature ledger; a row containing several values requires each value to be exercised, rather than one representative toggle.

## Every desktop menu branch

| Menu branch | Source | Required integration evidence |
| --- | --- | --- |
| File / Export / txt, md, html, pdf, docx, epub | main.js:1425–1435; app.js:7483–8566 | Trigger actual command with a formatted multi-chapter manuscript; inspect real output artifacts, chapter/scene order, Unicode, poetry, alignment, title/author, custom headings, front/back matter. PDF text/page/bookmarks; DOCX/EPUB ZIP structure and TOC; cancellation and failure paths. |
| Chapter Titles Only | main.js:1439–1443; app.js:8807–8810 | Toggle menu checkbox; persist/relaunch; inspect exported heading output in both states. |
| Email Draft to Myself; Email Settings | main.js:1448–1452; app.js:8569–8642; main.js:708–757 | UI settings and shortcut; real timestamped PDF and SHA-256 body; capture external compose boundary without sending. Gmail reveal-to-attach, macOS Mail attachment, unavailable-Mail fallback. |
| Cover Art | main.js:1453; app.js:6969–7050; main.js:487–552 | Settings, valid/invalid/remove key, persisted host secret outside library, actual cover/provider boundary, queued repaint and visible error. Deterministic provider fixtures may prove boundary handling; they do not prove live image quality. |
| Goals | main.js:1455–1458; app.js:7068–7140 | Daily/book goal, day-ending hour, sprint start/pause/finish, chart/cover progress and restart persistence. Clock-controlled integration assertions must cross midnight/day-end. |
| New Books Open To / Blank Page, Outline First | main.js:1460–1464; app.js:8824–8828 | Change setting, create actual book, observe correct initial tab, restart and repeat. |
| Import Manuscripts | main.js:1468–1470; app.js:6402–6460; main.js:759–1066 | Actual txt/md/docx fixture files through picker and drag/drop; detected title/chapter/scene, style inheritance, Unicode, ignored/failed files and cancellation. |
| Reshelve a Book | main.js:1472; app.js:2050–2065 | UI recover orphan book, preserve contents and author/shelf metadata; replay restart. |
| Library Folder | main.js:1473; main.js:135–171 | Actual host settings and relaunch into chosen temp directory; default restoration/cancel; old files remain in old directory. The command follows a directory and does not move library files. |
| Close/Quit | main.js:1475 | Actual desktop window close/quit before autosave debounce; reopen all pending edits. |
| Edit / Undo, Redo, Cut, Copy, Paste, Paste and Match Style, Select All | main.js:1481–1487; app.js:5994–6256 | Real menu dispatch and keyboard/clipboard. Mixed native text and structural history, redo invalidation, selection/caret, cross-paragraph/chapter effects. Model helper assertions alone do not cover these commands. |
| Find & Replace | main.js:1490–1492; app.js:6263–6398 | UI search counts, next/previous wrap, all editor roots, single/all replacement, stale result refresh, close/Escape/caret, undo. |
| Spellcheck Pass; Language | main.js:1495–1506; app.js:6466–6710; spell-worker.js | Start off; real dictionary-backed marks, suggestions/correction/undo/learning, language switch/restart, stale scan races, notes as well as manuscript. Languages: en-US, en-GB, en-CA, en-AU, fr, es, de, nl, pl, pt-BR, ro, ru, el. |
| Body Font; Other Font | main.js:1514–1522; app.js:7170–7264 | Every bundled/platform list entry; installed-font discovery, hover preview, pick/cancel restoration, persistence and export font. |
| Drop Cap Style / literary, fantasy, scifi, none | main.js:1525–1531; app.js:7170–7197; styles.css:519–604 | Actual computed appearance, first prose paragraph after leading poetry, dialogue opening suppression, new chapter, exports and restart. |
| Align Paragraph / left, center, right, justify | main.js:1535–1541; app.js:7334–7353 | Toolbar/menu/shortcut reaches selected paragraphs, mixed styles and range boundaries; DOM rendering + undo + persistence/export. |
| Larger Text; Smaller Text; Reset | main.js:1544–1546; app.js:8777–8783 | Font size steps/clamps 14–22, default17; reset also restores page zoom100%; reading place/caret unchanged. |
| Typewriter Scrolling | main.js:1549–1553; app.js:6712–6771 | Toggle and restart; caret near centre in long/short/last chapter; bottom room; manual-scroll behaviour. |
| Poetry Paragraph | main.js:1559–1562; app.js:3109–3227 | Menu checked state tracks caret; toggle existing paragraph; Shift+Enter in body/title; italics override; exit/backspace/undo. |
| Markdown Emphasis | main.js:1568–1571; app.js:3437–3530; app.js:8802–8806 | Typed/pasted single/double/triple stars; no conversion when disabled; immediate undo restores literal asterisks; nested emphasis, punctuation and caret. |
| Keyboard Shortcuts / Help / NEO Shortcuts | main.js:1579–1581,1661–1663; app.js:7357–7480 | Both menu routes and shortcut; OS glyphs, conditional Vim section; repeated invocation focuses one dialog; close/focus return and menu suppression. |
| Full Screen | main.js:1585–1589; main.js:1167–1176; app.js:4164–4180 | Both shortcuts and native window/fullscreen events; Escape; shelf state; focus-mode bottom-bar fade; non-mac menu bar returns. |
| Focus Mode / cycle, sentence, paragraph, off | main.js:1593–1599; app.js:6773–6888 | Cycle order off→paragraph→sentence→off, selection/caret movement, Unicode sentence boundaries, dimming without mutation of saved HTML/history. |
| Vim Keys | main.js:1603–1606; app.js:3916–4162 | Toggle and restart; every actual command/operator/count/motion family, insert/normal/visual transitions, modifier shortcuts, deletion undo, caret. Toggle-only coverage is invalid. |
| Page / night, paper, light | main.js:1610–1616; app.js:7179–7181 | Page and room/shelf theme, restart and actual CSS; exports independent of editing room state. |
| Brighter Interface | main.js:1619–1622; styles.css:1147–1250 | Toggle and restart; controls/ghosts/notes legible; follows system increased contrast only until user choice. |
| Interface Size / 1,1.25,1.5,2,2.5,3 | main.js:1625–1631; styles.css:1261–1299 | Each size affects chrome independently of paper zoom; pinned-panel offsets, readable controls, restart. |
| UI Language | main.js:1636–1641; main.js:37–130; app.js:8833–8838 | Every shipped locale loads; menu/static/dynamic/number labels; system locale fallback; unsaved text flush and open-book restoration on reload; dictionary follows UI only absent explicit choice. |
| Window / minimize, zoom, bring all front or close | main.js:1647–1654; main.js:1126–1186 | Native roles, bounds persistence, removed-monitor fallback, minimum size, fullscreen/minimize must not overwrite normal bounds. |
| About; Check for Update | main.js:1666–1672; app.js:8647–8773; main.js:1850–1965 | Version/about dialog; update checking/error/current/downloading/ready/retry and save-before-restart. Source/portable builds use release fallback; packaged builds auto-download/install on quit. Capture network/updater boundary without installing. |
| macOS App / About, Services, Hide, Hide Others, Show All, Quit | main.js:1408–1422 | Native macOS roles only; other OS templates omit appMenu. Native unwanted Writing Tools/AutoFill items are suppressed; user-requested new agent UI must be opt-in and distinguish the intentional new behaviour. |

## Non-menu UX that must not disappear

| Surface | Source anchors | Required preserved behaviours |
| --- | --- | --- |
| Onboarding | index.html:34–82; app.js:508–585 | Author/optional pen name/Anonymous, pantser/plotter, font/dropcap live preview, done once, persisted settings. |
| Authors and shelves | app.js:587–951,1873–2117 | Add/rename/delete author with safe shelf transfer; author switch; shelf create/rename/reorder/delete; book create/drag across shelves/authors, undo move; progress cover; accessible activation. |
| Cover tile | app.js:1529–1848; covers.js | Seeded art six styles/six templates; title/author typography, refresh, custom image drop/pick/remove, painted/seeded modes, painting threshold1000 and auto toggle, progress updates. |
| Bound shelf / anthology | app.js:953–1525,8271–8520 | Bind/unbind retain works; cover, title/copyright/dedication/epigraph/prologue/epilogue/acknowledgments/about-author pages; Parts/seams; parked metadata recovery; numbering policies; single multi-book output with one TOC. |
| Title page and chapter navigation | index.html:111–119; app.js:2121–2405,3800–3915,4191–4698 | Editable title/subtitle/author; Enter and Shift+Enter routes; hidden first numbering for solo story; automatic numbering/renumbering; prologue/epilogue/front/endmatter roles; chapter add/delete-to-Darlings/reorder; chapter notes/count/red placeholder dot; chapter keyboard stepping. |
| Editing boundary semantics | app.js:2407–3436 | Enter/Enter2/Enter3 at start/middle/end/empty/selected text; scene-break delete; chapter-start/backspace merge and empty chapter removal; poetry insert/continue/exit/backspace; selection seam healing; placeholder marker deletion guard; Tab spacing; safe space deletion; cross-paragraph formatting/paste; IME does not trigger writing gestures. |
| Typography and paste | app.js:3354–3800 | Immediate --→em dash, ...→ellipsis, contextual smart quote/apostrophe locale rules and dialogue dashes; imported/pasted normalization; script/style/foreign wrapper cleanup; formatting retained; markdown conversion toggle and undo literal source. |
| Notes, outline, ghosts and sticky placeholders | app.js:4191–4567,4789–5408 | Notes/outline tab names/defaults; rich auxiliary editor; outline line Enter/Tab/ShiftTab/delete/reorder and chapter notes; section ghosts overwritten by prose; placeholder insertion/note editing/jump/resolve/delete and sticky persistence. |
| Darlings | app.js:4893–5050,5410–5495 | Selection drag or shortcut, formatted multi-block passage, chapter deletion, original location metadata/context restoration after edits, fallback if chapter absent, permanent delete, library persistence, structural undo/redo. |
| Panels and distraction rules | index.html:87–107; styles.css:860–1019,1176–1201; app.js:4699–4865 | Edge hover slide-out; pin/unpin persists per book; manuscript room shifts, no hover flicker while dragging; bottom bar quiet until hover/focus; full-screen+focus hides it. |
| Counters/activity/goals | app.js:449–489,5497–5620,6050–6099,6903–7140 | Book/chapter/selection words, position, today total, net edit tracking, session time inactivity, daily history/chart, configurable day end, goal/sprint statuses. |
| Autosave/local sync/recovery | app.js:5621–5990; main.js:179–416,1075–1120 | Readable per-chapter HTML/meta/aux/JSON; debounced flush on visibility/window unload; external filesystem changes, chapter timestamps/order reconciliation, local-vs-remote conflict copies, unavailable/cloud-placeholder files never erase prose; book delete trash/error outcomes; daily zip14 count and skipped-file manifest. |
| Keyboard and accessibility | app.js:8942–9125; styles.css:1191–1205,1254–1260 | Enter/Space pressable controls; tablist arrows; dialog naming/focus return; F6/CtrlTab regions+Shift reverse+Escape caret; chapter list arrows; shelf regions; screen-reader roles/status; system contrast and reduced motion. |
| Generic context menu/error handling | main.js:1190–1207; app.js:338–425,8886–8895 | Text Cut/Copy/Paste/SelectAll enabled correctly, specialized menus cancel generic menu, menus stay onscreen/keyboard; errors logged and one visible toast, never silently discard an export/save. |

## Preload boundary coverage

Every exposed method must either have a real host integration test or be explicitly mapped to another tested action. `preload.js:3–67` exposes:

- Library/book/chapter: `readLibrary`, `writeLibrary`, `createBook`, `listBooks`, `readBookMeta`, `writeBookMeta`, `deleteBook`, `readChapter`, `chapterStamps`, `writeChapter`, `deleteChapter`.
- Auxiliary structured state: `readAux`, `writeAux`, `readJSON`, `writeJSON`.
- Files/output: `exportSave`, `emailDraft`, `importPick`, `importFiles`, `pathForFile`, `libraryPath`.
- Cover/secret: `pickCover`, `setCover`, `removeCover`, `readCover`, `paintCover`, `setSecret`, `hasSecret`.
- View: `fullscreenEscape`, `fullscreenToggle`, `poetryState`, `typewriterState`, `vimState`, `uiZoomState`, `writingStyleState`, `viewState`.
- Language: synchronous `i18n`, `reloadForLanguage`.
- Spelling: `spellCheckWords`, `spellSuggest`, `spellLearn`, `setSpellLanguage`.
- Application: `logError`, `checkForUpdate`, `installUpdate`, `appVersion`, `openRelease`, `onMenu`.

Testing only mocked `window.neo` calls proves renderer routing, not persistence, dictionary availability, Electron menu/clipboard, export generation or system integration. Use disposable host directories and real Electron processes for those boundaries.

## Valid integration test gate

1. Feature ID maps to a source anchor, setup, author action, observable assertion, and executable test name. A boolean flag or helper result alone does not prove visible UX.
2. Enter, delete, copy/paste, formatting, undo/redo and selection are driven through browser/Electron input and rendered PM view. Model serialization assertions supplement DOM and selection/caret assertions.
3. History sequences mix typing, formatting, chapter/scene structure, Darlings, notes/outline and continued typing; verify exact content, marks, identities and caret after each undo/redo. History reset is an explicit failure.
4. Persistence uses actual temp filesystem state, close/relaunch and artifact inspection; localStorage-only or same-process load does not prove desktop persistence.
5. Dictionary tests use shipped Hunspell dictionaries and worker integration. A fixed misspelled-word map is not spellchecker parity. Language matrix and learning persistence must be explicit.
6. Native clipboard/menu/window tests run in Electron. Browser-synthetic clipboard tests are useful but marked separately; synthetic composition events do not prove a real operating-system IME.
7. Network and destructive external boundaries may use deterministic fixture services and spies at the final OS boundary. Never send email, spend on cover generation, install updates or modify the author's real library to test parity.
8. Tests with skipped/TODO bodies, broad catches, state forcibly injected after the input action, or assertions only against inventory text cannot count as preserved features.
9. Maintain a coverage matrix: documented feature IDs, executable test IDs, implementation provider, pass/fail evidence, platform qualification. There must be no uncovered shipped feature IDs when completing the goal.
10. Visual author experience needs deterministic screenshots/computed-style assertions at typical and minimum desktop sizes: fonts, paper, chapters, drop caps, muted controls, hover/pinned panels, themes, interface/page zoom. Functional counters alone do not prove NEO look and feel.

## Scope distinctions and documentation inconsistencies

- README roadmap: chapter version history, submission manuscript format, global shared end matter. Exclude from shipped parity while preserving current per-book/bound-shelf end matter.
- Pocket has independent iOS/Android platform UX and sync. Root desktop local-folder sync remains in scope.
- Desktop UI language currently follows available translation files; spell language has thirteen menu entries including Greek. UI and spelling locales are separate contracts.
- README/TUTORIAL promise encrypted cover keys. Code falls back to plaintext storage when Electron encryption is unavailable (`main.js:487–501`). Document and test actual supported host capability rather than repeating an unconditional guarantee.
- TUTORIAL describes email as sending; actual host creates a Gmail compose draft/reveals a PDF or creates a visible macOS Mail message. No automatic transmission is the shipped behaviour.
- README describes local-only manuscripts; cover generation transmits selected manuscript text when invoked and update checking uses network. These are explicit application actions, not manuscript cloud storage.
- Packaged signed/self-updatable builds and source/portable builds have different update behaviour. macOS native menu/font/email services differ from Windows/Linux. Host-platform tests cannot claim verification on another OS.

## Native evidence qualifications

- Keep Electron runners serial for final evidence. Separate process windows can compete for native focus and menu accelerators even when CDP input targets the right renderer. Reproduce shortcut failures with one active fixture before changing the engine.
- Actual `MenuItem.click` dispatch proves the native menu action and resulting IPC/view, not its OS keyboard accelerator. CDP key injection and `webContents.sendInputEvent` have not proved macOS NSMenu accelerator dispatch for Spellcheck Pass.
- Never invoke the generic macOS native context menu in an unattended fixture without a dismissal mechanism: the native modal loop can prevent Electron teardown. The custom flagged-word spelling menu remains accessible through DOM input.
- Emulated forced colors and contrast prove Blink/CSS adaptation on the current host. Record them as emulated media; they do not verify native Windows accessibility settings.
- A combined feature marker is an index into coverage, not evidence of every required subcase. Goals via the progress dialog do not prove cover-context goal removal; font stack names do not prove each alphabet glyph uses the intended face; view toggle flags do not prove caret geometry.
- Bind each final integration report to the built PM bundle, host harness and dependency lock using `evidenceMetadata()`. Store targeted/subset runs separately so they cannot replace full-suite evidence.

## Reference characterizations from the expanded cases

- The reference runs on its declared Electron 43.7.6; the candidate runs on Electron 44.5.1. Both versions belong in report metadata. Earlier reference runs on 44 are development evidence and need a declared-version rerun.
- `app.js` uses `Intl.Segmenter` for Thai, Lao, Myanmar and Khmer counts. Chinese and Japanese follow the shipped whitespace-count policy. Tests exercise all six scripts against their respective policies.
- The chapter container uses normal whitespace; child paragraphs use pre-wrap. Actual reference geometry for a formatted two-paragraph fixture has two 29.75px lines and the existing poetry margin 15.296875px. Root formatting newlines add no visible height. The codec must discard these structural separators while preserving literal spaces/newlines inside paragraphs and unstructured plain Notes.
- A genuine OS accelerator proof uses a separate coordinated suite. Each bounded request identifies the exact Electron app path, process ID and unique visible window title; a native driver observes that window, sends the requested keys, records the action and acknowledges it. Disabled or skipped coordination supplies no accelerator evidence. A locked desktop currently prevents that proof and actual focus-dependent blur/fullscreen cases.

## Compatibility bridge dependency

The codec uses the public ProseMirror parser, serializer and position probes. The current legacy bridge also accesses `EditorView.domObserver` and `docView` internals to coordinate the original renderer's direct DOM changes. That dependency belongs to this pinned-version spike. The eventual MVVM port should route editing commands and selection through public transactions so that the original renderer no longer changes editor DOM directly.
