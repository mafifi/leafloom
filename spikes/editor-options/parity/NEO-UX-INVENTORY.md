# NEO UX parity inventory

This is the executable parity-spec input, mined from the existing NEO implementation and author documentation. Each stable feature ID is a requirement; its scenario describes the fixture/action/assertions needed for an integration test. `feature-inventory.json` is the machine-readable source. No feature is marked implemented or tested by this mining pass.

## Acceptance rules

- Run the original NEO and ProseMirror application against independent copies of identical synthetic libraries. Drive visible controls, real keyboard events, DOM range selection, clipboard paste/drop and Electron menus/host operations. Read document state only for assertions; directly invoking document helpers is a unit test, not UX integration proof.
- Assert content, marks, paragraph/page kinds, chapter ordering, caret/selection, retained references, counts and rendered affordances as applicable. For writing mutations, close and reopen and assert actual library files. History scenarios include mixed typing, formatting and structure, not isolated helper calls.
- Browser tests prove renderer interactions. File/dictionary/clipboard/menu/PDF/OS tests must run a real Electron host with an isolated temporary library. Fake dictionaries/providers may prove wiring and races; real dictionaries and actual exported artifacts separately prove the advertised capability.
- Network side effects use deterministic local fixtures at the provider boundary. Never email anyone, trash personal books or spend API money during acceptance. Native recipient handoff and encrypted secret storage are assertions, not actual transmission.
- Record original NEO shortcomings as observed behaviour and label deliberate improvements. Faithful prose retention takes precedence over reproducing a demonstrated data-loss bug. Roadmap dreams are not implemented parity requirements.
- Every ID needs at least one substantive test mapped to it, with parameterized edge cases expanded where listed. A test that merely checks a button exists cannot close a writing feature. Skipped/conditional tests and JavaScript-dispatched composition events cannot prove native platform behavior. Trusted Chromium CDP IME input proves the actual renderer composition path; physical OS candidate-window interaction remains separately qualified.

## Runtime characterization

Original runs use the declared Electron **43.7.6** through the isolated `electron-reference` dependency; the candidate uses Electron **44.5.1**. Original AppKit filtering leaves a real foreign menu item visible on 43. The original cached native-menu implementation can crash with SIGSEGV on 44. Candidate native filtering is a TypeScript live-menu boundary and is validated against source/output intent, with the upstream defect characterized separately. Physical OS menu accelerators and held-key repeat remain separately qualified.

## Source sweep

Inspected README, TUTORIAL, CONTRIBUTING, index.html, renderer function/event inventory and critical handlers, main-process menus/IPC/import/export/storage/spelling, preload capability list, typography/spelling scripts, cover/art entry points, CSS structure and Pocket documentation/bridge entry points. Rows are grouped by author task rather than file. Sources are baseline line locations, not spike files. Desktop menus, UI event handlers and all preload capability families were cross-checked; Pocket-only work is explicitly separated.

This is a comprehensive source-mined inventory, not a claim that every platform path has been exercised. During baseline integration, add any discovered behavioural cases to the appropriate stable ID or append IDs; never remove an uncovered requirement to improve the pass percentage.

## Code versus documentation distinctions

- README/Tutorial describe prologue/epilogue as first/last roles; current code permits all eleven page kinds via a chapter menu and migrates old roles. Test current kinds plus legacy-library compatibility.
- Styled paste applies a dialogue-dash edit only when its replacement span is contained in one formatting run. A bold hyphen followed by an italic leading space stays literal; a bold hyphen-plus-space prefix converts and keeps its marks.
- Original structural history has ten snapshots and no custom redo stack; native Electron Redo exists. A coordinated ProseMirror structural redo is an intentional improvement, while original undo gesture/caret semantics still need preservation.
- Original search scans each text node, so matches spanning formatting seams are absent. Improving this must not erase tests for ordinary literal scope/wrap/replace/history.
- Darlings restore prefers remembered context and falls back to chapter/manuscript end. Rejecting a missing anchor instead of restoring content is not faithful.
- Pocket README says import/export/spell stay desktop, while renderer contains Pocket export menus. Treat that as code/document divergence requiring separate characterization, not desktop exclusion.
- Chapter version history, submission manuscript format and global endmatter are README roadmap ideas, not current requirements.

## Integration environments

| Host label | Required environment |
|---|---|
| browser | Real Chromium renderer, actual DOM selections and keyboard/pointer input |
| browser-electron | Renderer plus native clipboard/menu activation and reopen |
| browser-clock | Renderer with controlled local timezone/clock and persisted counts |
| browser-layout | Browser layout/caret navigation, wrapped prose at several zooms |
| electron-files | Real Electron with temporary NEO-compatible directories and restart |
| electron-dictionary | Packaged dictionary/worker plus Electron context menu and learn store |
| electron-provider | Real Electron secret/storage API and deterministic external provider |
| electron-files-clock | Real file timestamps, delayed IPC, controlled backup dates and restart |
| electron-provider-native | Real Electron/native capability boundary, deterministic external responses |
| browser-electron-layout | Electron menus with logical key layouts and actual layout assertions |
| capacitor-native | Separate Android/iOS device or simulator coverage; not desktop acceptance |

Baseline commit: `ed090e9988d446daf1ebbde91bcebc13b599909b`. Total requirements: **304**, including 4 separate Pocket variants.

## Proposed proof boundary

Retain original NEO application chrome, author controllers and Electron capabilities in an isolated candidate snapshot; replace manuscript and Notes editing surfaces with actual ProseMirror EditorViews through typed integration contracts. This tests editor feasibility across the full application. A later Svelte/MVVM migration can use the same contracts and acceptance suite. This boundary is proposed and has not been proved by this inventory.

## Characterization corrections

The original has no universal dialog Tab trap: `dialogify` supplies roles/initial focus/return focus, while individual modals own keyboard handling. Tab Left/Right moves tab focus; Enter/Space activates it, and Home/End is not implemented. A placeholder inserted over selection collapses to its end and preserves selected words. Reshelve restores to current author first shelf. Cross-author relocation Undo also accepts Escape; ordinary shelf moves have no move Undo. Simple mouse movement does not reset Enter count; mouse-down does. Backups use UTC date, whereas writing-day goals use local cutoff. These distinctions must not be guessed into test expectations.

## Library and authors

### NEO-001 — First-run name

- Start with empty library; choose name or blank; title pages inherit author or Anonymous; reopening skips onboarding.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-001-A** Given An empty temporary library with no firstRunDone and freshly launched desktop NEO. When Start with empty library. Then choose name or blank; title pages inherit author or Anonymous; reopening skips onboarding. Environment: electron-files

**NEO-001-B** Given Empty writer onboarding with real and pen names. When Create books under each identity, restart under the selected pen and switch back. Then Both identities coexist, each book stores its own attribution and selected identity and visible books survive restart. Environment: electron-files

### NEO-002 — First-run pen name

- Enter real and pen name; shelf identity and new title-page author follow the selected identity.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-002-A** Given An empty temporary library with no firstRunDone and freshly launched desktop NEO. When Enter real and pen name. Then shelf identity and new title-page author follow the selected identity. Environment: electron-files

**NEO-002-B** Given Empty writer onboarding with Real Writer and Pen Writer. When Create books under each and restart. Then Author metadata matches the chosen identity and author shelves remain distinct. Environment: electron-files

### NEO-003 — First-run writing style

- Choose pantser versus plotter; new books open in manuscript versus Outline; menu can change future defaults.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-003-A** Given An empty temporary library with no firstRunDone and freshly launched desktop NEO. When Choose pantser versus plotter. Then new books open in manuscript versus Outline; menu can change future defaults. Environment: electron-files

### NEO-004 — First-run typography preview

- Select body font and drop-cap style; sample visibly updates; Finish persists both.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-004-A** Given An empty temporary library with no firstRunDone and freshly launched desktop NEO. When Select body font and drop-cap style. Then sample visibly updates; Finish persists both. Environment: electron-files

**NEO-004-B** Given Onboarding drop-cap picker with Fantasy selected. When Hover Sci-Fi, leave the picker, commit and restart. Then Live sample changes while hovered, restores the selected Fantasy face on leave and persists that choice. Environment: electron-files

### NEO-005 — Create a book

- Activate shelf +; book directory, metadata and first empty chapter exist; editor opens at title/first story.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-005-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Activate shelf +. Then book directory, metadata and first empty chapter exist; editor opens at title/first story. Environment: electron-files

### NEO-006 — Create and rename shelf

- Shelf labels edit in place. Enter blurs and commits; Escape has no cancellation handler, leaving the draft focused until blur commits. Empty committed labels use the default shelf name.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-006-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Add shelf, rename label, Enter/blur commit. Then Committed labels persist; Escape does not cancel the focused draft and later blur commits it. Environment: electron-files

**NEO-006-B** Given A shelf named Original name with its label editing a Pending name draft. When Press Escape, inspect focus and stored metadata, then blur through the author chip and reload. Then Escape leaves the draft focused and disk name unchanged; blur persists Pending name and reload shows it. Environment: electron-files

### NEO-007 — Move shelves

- Drag shelf grip before/after another shelf; persisted shelf order and visible order agree.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-007-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Drag shelf grip before/after another shelf. Then persisted shelf order and visible order agree. Environment: electron-files

**NEO-007-B** Given Two books First and Second on one shelf. When Drag Second before First through the visible insertion indicator. Then The actual indicator appears and library bookIds persist Second before First. Environment: electron-files

### NEO-008 — Move books within shelf

- Drag a cover between neighbours; insertion indicator and persisted order match.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-008-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Drag a cover between neighbours. Then insertion indicator and persisted order match. Environment: electron-files

**NEO-008-B** Given Two shelves including Second shelf. When Drag its shelf grip before the first shelf through the shelf insertion indicator. Then The insertion indicator appears, rendered labels and persisted shelf order both put Second shelf first. Environment: electron-files

### NEO-009 — Move books between shelves

- Drag cover into empty/populated shelf; no duplicate or lost book; reload preserves placement.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-009-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Drag cover into empty/populated shelf. Then no duplicate or lost book; reload preserves placement. Environment: electron-files

**NEO-009-B** Given Two books on the first shelf and an anchor book on a populated second shelf. When Drag the moving book before the second-shelf anchor and restart. Then Persisted source/destination order is exact and the moved book occurs only once. Environment: electron-files

### NEO-010 — Shelf drag auto-scroll

- Drag near vertical shelf edges; shelf scrolls and drop indicator follows target.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-010-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Drag near vertical shelf edges. Then shelf scrolls and drop indicator follows target. Environment: electron-files

**NEO-010-B** Given A book above twelve shelves extending below the viewport. When Hold a real pointer drag at the bottom edge, scroll to the last destination and drop at its visible indicator. Then Shelf viewport scrolls more than fifty pixels and the last shelf persists the dragged book. Environment: electron-files

### NEO-011 — Move book to another author

- Drag cover over author chip and pen-name rack; destination author shelves own book; original author loses placement.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-011-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Drag cover over author chip and pen-name rack. Then destination author shelves own book; original author loses placement. Environment: electron-files

### NEO-012 — Undo cross-author shelf move

- Move a book to another author via author-rack drag; Cmd/Ctrl+Z or Escape on shelf restores original shelf/index/author. Ordinary within/between shelf drag does not create this lastShelfMove undo record.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-012-A** Given The synthetic original and candidate desktop fixtures are in the state named by this requirement. When Move a book to another author via author-rack drag Then  Cmd/Ctrl+Z or Escape on shelf restores original shelf/index/author. Ordinary within/between shelf drag does not create this lastShelfMove undo record. Environment: electron-files

**NEO-012-B** Given Two pen names and one book under Library Writer. When Drag the book into the other pen slot, then press Escape. Then The original author and original shelf placement are restored. Environment: electron-files

### NEO-013 — Author switching

- Choose another pen name; only corresponding shelves display and newly created books use that author.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-013-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Choose another pen name. Then only corresponding shelves display and newly created books use that author. Environment: electron-files

### NEO-014 — Rename author

- Rename selected author; persisted author identity updates without deleting books.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-014-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Rename selected author. Then persisted author identity updates without deleting books. Environment: electron-files

### NEO-015 — Add pen name

- Add author identity and initial shelves; switch into new identity and create book.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-015-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Add author identity and initial shelves. Then switch into new identity and create book. Environment: electron-files

### NEO-016 — Delete author safely

- Delete identity; shelves move to surviving author; all book files remain accessible.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-016-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Delete identity. Then shelves move to surviving author; all book files remain accessible. Environment: electron-files

### NEO-017 — Remove book from shelf

- Choose Remove from bookshelf; cover disappears while directory remains; Reshelve restores it.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-017-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Choose Remove from bookshelf. Then cover disappears while directory remains; Reshelve restores it. Environment: electron-files

### NEO-018 — Trash book

- Confirm native trash operation; cover removed only on success; cancel/failure leaves book and files intact.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-018-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Confirm native trash operation. Then cover removed only on success; cancel/failure leaves book and files intact. Environment: electron-files

### NEO-019 — Reshelve orphan books

- File Reshelve lists unshelved nonpage book directories sorted by modified time, excluding bound parked pages; choose book, restores to current author first shelf rather than a destination chooser.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-019-A** Given The synthetic original and candidate desktop fixtures are in the state named by this requirement. When File Reshelve lists unshelved nonpage book directories sorted by modified time, excluding bound parked pages Then  choose book, restores to current author first shelf rather than a destination chooser. Environment: electron-files

**NEO-019-B** Given Removed story books with different modified dates and a parked bound Dedication page. When Open Reshelve and restore the older story. Then Chooser sorts stories newest first, excludes parked bound pages and preserves parked page files. Environment: electron-files

### NEO-020 — Change library directory

- Use native folder picker; cancel does nothing; select existing/new folder then restart and inspect its library; no silent copying/deletion.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-020-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Use native folder picker. Then cancel does nothing; select existing/new folder then restart and inspect its library; no silent copying/deletion. Environment: electron-files

**NEO-020-B** Given A populated private destination library distinct from the original. When Select it through actual Library Folder menu/picker, close and relaunch. Then Existing destination author, shelf, book and chapter load without onboarding and source library files retain original data. Environment: electron-files

### NEO-021 — Library map

- Create/rename/move books; regenerated human-readable library map agrees with actual placement.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-021-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Create/rename/move books. Then regenerated human-readable library map agrees with actual placement. Environment: electron-files

**NEO-021-B** Given A book Mapped and a destination shelf. When Move the book into Destination and rename that shelf with Enter. Then Actual _catalog.txt first contains Destination and then Renamed destination for the book. Environment: electron-files

### NEO-022 — Shelf empty affordances

- Empty shelf still offers new book; active author and shelf header remain keyboard reachable.

Sources: app.js:498–625, app.js:1873–2050, TUTORIAL.md:7–25. Status: required.

**NEO-022-A** Given A temporary library with two author identities, two shelves and three books, unless the action requires an empty initial library. When Empty shelf still offers new book. Then active author and shelf header remain keyboard reachable. Environment: electron-files

**NEO-022-B** Given An onboarded bookshelf. When Focus Add shelf and press Enter, fill and commit the focused new label, restart. Then Keyboard activation focuses the label and persisted shelf name reappears. Environment: electron-files


## Covers

### NEO-023 — Seeded abstract covers

- Create several books; deterministic seed generates cover using six art styles and type templates; title/author are real overlay text.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-023-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Create several books. Then deterministic seed generates cover using six art styles and type templates; title/author are real overlay text. Environment: electron-provider

**NEO-023-B** Given A saved book with deterministic cover seed fixtures spanning all seven templates. When Reload each stored seed. Then Each corresponding cover class appears with real title Template proof and author Library Writer. Environment: electron-files

### NEO-024 — Refresh seeded cover

- Cover refresh and New cover selection persist fresh seeded art while retaining title/author. Original refresh icon is mouse-only and aria-hidden; supported keyboard interaction is the real context-modal New cover button after pointer opening. ShiftF10 does not open the original book context menu.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-024-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Hover cover and click refresh or keyboard context-menu New cover. Then seed/type/colors change and persist. Environment: electron-provider

**NEO-024-B** Given A saved cover with title and author and its real context modal opened by pointer. When Focus the New cover button in that modal and press Enter, then restart. Then Supported keyboard button selection persists a fresh seed and retained title/author; icon and ShiftF10 activation are not promised. Environment: electron-files

### NEO-025 — Custom cover picker

- Choose image through native picker; cover stored under book and visible after reopening; cancel preserves old cover.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-025-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Choose image through native picker. Then cover stored under book and visible after reopening; cancel preserves old cover. Environment: electron-provider

### NEO-026 — Custom cover drag drop

- Drop image file onto cover; same stored image and displayed cover as picker path.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-026-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Drop image file onto cover. Then same stored image and displayed cover as picker path. Environment: electron-provider

**NEO-026-B** Given A book and a real PNG fixture. When Drop a File-bearing DataTransfer on the cover and reload. Then Custom-art class and background URL appear, actual copied PNG bytes match and artwork persists after reload. Environment: electron-files

### NEO-027 — Remove custom cover

- Remove cover image; actual stored image removed and abstract/painted fallback displayed.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-027-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Remove cover image. Then actual stored image removed and abstract/painted fallback displayed. Environment: electron-provider

**NEO-027-B** Given A book with a custom cover PNG layered over a completed retained NEO painting. When Remove custom cover art from its menu and inspect chooser and files. Then Only the custom file disappears; the completed painting bytes and abstract-choice state remain available. Environment: electron-files

### NEO-028 — Cover mode switching

- With image/painting available, refresh/mode choices switch presentation without deleting hidden artwork.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-028-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When With image/painting available, refresh/mode choices switch presentation without deleting hidden artwork.. Then With image/painting available, refresh/mode choices switch presentation without deleting hidden artwork. Environment: electron-provider

### NEO-029 — Paint threshold

- Cross from fewer than 1000 story words to at least 1000 with configured provider/auto enabled; exactly one background job starts; typing remains possible.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-029-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Cross from fewer than 1000 story words to at least 1000 with configured provider/auto enabled. Then exactly one background job starts; typing remains possible. Environment: electron-provider

### NEO-030 — Paint explicit request

- Refresh eligible long book with provider configured; request painting from current text; imported already-long books do not auto-paint merely on open.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-030-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Refresh eligible long book with provider configured. Then request painting from current text; imported already-long books do not auto-paint merely on open. Environment: electron-provider

### NEO-031 — Paint controls and provider

- Open Cover Art settings; provider/key/auto choice validated and stored; cancel and invalid key follow original UI.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-031-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Open Cover Art settings. Then provider/key/auto choice validated and stored; cancel and invalid key follow original UI. Environment: electron-provider

**NEO-031-B** Given Saved valid Cover Art model, quality and automatic settings. When Edit valid replacement values then cancel and reopen settings. Then Saved settings remain unchanged and unsaved model names and automatic toggle are absent. Environment: electron-files

### NEO-032 — Secret storage

- Save API key; no key appears in book/library files; app settings encrypt via safeStorage when available, otherwise explicitly characterize current plain app-settings fallback; removal deletes stored secret.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-032-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Save API key. Then no key appears in book/library files; app settings encrypt via safeStorage when available, otherwise explicitly characterize current plain app-settings fallback; removal deletes stored secret. Environment: electron-provider

**NEO-032-B** Given A book and synthetic provider key saved through Cover Art settings. When Inspect actual library JSON/HTML/side files, native encryption availability and private secrets; remove the key. Then No book/library file contains the key, encoding follows actual safeStorage availability and remove clears the private secret. Environment: electron-files

### NEO-033 — Paint job success/failure/stale

- Pending cover art older than ten minutes becomes eligible for an explicit retry. Refresh retries eligible work; there is no automatic stale-pending cleanup timer.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-033-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Fixture provider returns success/error/delay. Then An explicit refresh retries pending work older than ten minutes; no automatic cleanup is assumed. Environment: electron-provider

### NEO-034 — Custom image precedence

- Book with user image and completed painting opens using selected/image precedence without unsolicited overwrite.

Sources: app.js:1541–1873, app.js:6957–7056, covers.js:230–584, art.js:17–163, README.md:39–43. Status: required.

**NEO-034-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Book with user image and completed painting opens using selected/image precedence without unsolicited overwrite.. Then Book with user image and completed painting opens using selected/image precedence without unsolicited overwrite. Environment: electron-provider


## Bound shelves and book pages

### NEO-035 — Bind shelf

- Right-click shelf Bind into one book; cover/page affordances appear; existing books remain constituent books.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-035-A** Given A shelf containing three synthetic books with formatted chapters and no binding. When Right-click shelf Bind into one book. Then cover/page affordances appear; existing books remain constituent books. Environment: electron-files

### NEO-036 — Unbind shelf

- Unbind after adding pages/parts; constituent books remain; ancillary pages park safely and recover on rebind.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-036-A** Given A shelf containing three synthetic books with formatted chapters and no binding. When Unbind after adding pages/parts. Then constituent books remain; ancillary pages park safely and recover on rebind. Environment: electron-files

**NEO-036-B** Given A bound collection with a Part preceding its second story and About page last. When Unbind, restart, rebind and reopen both parked pages. Then Original Part position and back-page order return with both page texts intact. Environment: electron-files

### NEO-037 — Binding title page

- Edit bound cover title/subtitle/author; single-line paste sanitizes and Enter advances focus; save/reopen retains values.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-037-A** Given A shelf containing three synthetic books with formatted chapters and no binding. When Edit bound cover title/subtitle/author. Then single-line paste sanitizes and Enter advances focus; save/reopen retains values. Environment: electron-files

**NEO-037-B** Given A bound collection title sheet. When Edit title, subtitle and author, press Escape, restart and reopen. Then All three edited fields persist. Environment: electron-files

### NEO-038 — Bound front pages

- Add copyright, dedication, epigraph and prologue from ghost slots; empty/filled tiles behave correctly.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-038-A** Given A shelf containing three synthetic books with formatted chapters and no binding. When Add copyright, dedication, epigraph and prologue from ghost slots. Then empty/filled tiles behave correctly. Environment: electron-files

**NEO-038-B** Given A bound shelf with Dedication offered as a ghost page. When Create the empty page, open it, type Stored dedication words, close and reopen after reload. Then The ghost becomes a spine tile, starts empty and subsequently reopens the stored words. Environment: electron-files

### NEO-039 — Bound back pages

- Add epilogue, acknowledgments and about author; placement follows story and persists.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-039-A** Given A shelf containing three synthetic books with formatted chapters and no binding. When Add epilogue, acknowledgments and about author. Then placement follows story and persists. Environment: electron-files

**NEO-039-B** Given A bound shelf with About the Author offered as a ghost page. When Create the empty page, open it, type Stored about words, close and reopen after reload. Then The ghost becomes a spine tile, starts empty and subsequently reopens the stored words. Environment: electron-files

### NEO-040 — Bound parts

- Add part seam before book; roman part label and optional part title display; duplicate adjacent part avoided.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-040-A** Given A shelf containing three synthetic books with formatted chapters and no binding. When Add part seam before book. Then roman part label and optional part title display; duplicate adjacent part avoided. Environment: electron-files

**NEO-040-B** Given A bound shelf with a Part insertion seam. When Create a Part, type its optional movement title, reopen, clear it and reopen again. Then The optional title persists; the Roman Part I tile label survives both filled and empty content. Environment: electron-files

### NEO-041 — Bound page text editing

- Click copyright/dedication/epigraph/part/back page; styled sheet edits content, normalizes pasted HTML and attribution; Escape commits according to original.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-041-A** Given A shelf containing three synthetic books with formatted chapters and no binding. When Click copyright/dedication/epigraph/part/back page. Then styled sheet edits content, normalizes pasted HTML and attribution; Escape commits according to original. Environment: electron-files

**NEO-041-B** Given A bound Dedication page and clipboard HTML containing italic Alpha and an atomic flag. When Paste, add text with a soft break and final empty paragraph, close the page sheet, inspect its actual file and reopen. Then Stored and reopened page content preserves exact paragraph semantics, hard break, emphasis and flag without PM helper artifacts. Environment: electron-files

**NEO-041-C** Given Bound Copyright, Dedication, Part, Acknowledgments and About page sheets. When Paste bold first and italic second paragraphs into each kind, inspect rendered typography, press Escape and reopen. Then Kind-specific sizes, italics and indentation hold; exact emphasis persists without heading or attribution helper markup. Environment: electron-files

### NEO-042 — Bound written pages

- Prologue/epilogue opens normal story editor and participates in content/export without chapter numbering.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-042-A** Given A shelf containing three synthetic books with formatted chapters and no binding. When Prologue/epilogue opens normal story editor and participates in content/export without chapter numbering.. Then Prologue/epilogue opens normal story editor and participates in content/export without chapter numbering. Environment: electron-files

### NEO-043 — Bound page removal and new Part insertion

- Bound-page context menus expose Open and Remove. Page tiles are not draggable; insertion zones create a new Part rather than reorder an existing page. Removal persists binding order without discarding unrelated page text.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-043-A** Given A bound shelf contains front pages, story books and back pages. When Open a bound-page context menu, inspect Open/Remove, remove a page and use a Part insertion zone. Then Open/Remove are the actual menu choices; removal preserves unrelated pages and the insertion zone creates a new Part, without a fictitious reorder operation. Environment: electron-files

**NEO-043-B** Given A bound collection with one filled Part before its first story. When Inspect tile draggable state and exact context menu, then create another Part at the last insertion seam. Then Tile is not draggable, menu is Open/Remove only, both Parts and texts survive at distinct positions and labels renumber I/II. Environment: electron-files

### NEO-044 — Binding settings

- The binding settings switch controls whether chapter numbering restarts for each contained book or continues across the bound shelf.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-044-A** Given A shelf containing three synthetic books with formatted chapters and no binding. When Set continuous/restarted chapter numbers, title pages and anthology options. Then The selected binding numbering policy persists and controls restart versus continuous chapter numbering. Environment: electron-files

### NEO-045 — Bound shelf export

- Bound shelf export offers EPUB, DOCX and PDF with one cover and retained binding page/part order.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-045-A** Given A bound shelf has front/back matter and two story books. When Export the shelf separately as EPUB, DOCX and PDF through the shelf menu. Then Each exported artifact preserves the constituent texts and binding order; the menu advertises exactly the three supported shelf formats. Environment: electron-files

**NEO-045-B** Given Three stories in a bound collection. When Export the bound collection in EPUB, DOCX and PDF through actual three-format menu choices. Then Parsed actual artifacts include all unique story openings/endings in shelf/chapter order. Environment: electron-files

### NEO-046 — Shelf anthology export

- Unbound anthology export asks for the anthology title and EPUB, DOCX or PDF format; it preserves every constituent story.

Sources: app.js:939–1529, app.js:8281–8521, README.md:47–49. Status: required.

**NEO-046-A** Given An unbound shelf contains two story books. When Choose shelf export, set a title, and export each offered format. Then The visible dialog offers title and format; there are no fictitious chapter-number/title-page option controls, and artifacts contain both stories. Environment: electron-files

**NEO-046-B** Given The same three-story collection unbound for anthology export. When Export anthology in EPUB, DOCX and PDF after the title-only prompt. Then Menu lists exactly three formats; parsed artifacts preserve all six ordered story passages. Environment: electron-files


## Manuscript identity and structure

### NEO-047 — Title and subtitle editing

- Edit book title/subtitle on title page; save/reopen retains Unicode/format-independent text; blank title renders Untitled.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-047-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Edit book title/subtitle on title page. Then save/reopen retains Unicode/format-independent text; blank title renders Untitled. Environment: browser

**NEO-047-B** Given A title page with story prose. When Edit subtitle, reopen, clear title, leave to shelf and restart. Then Subtitle persists and blank title becomes Untitled in metadata and actual cover accessibility label. Environment: electron-files

### NEO-048 — Per-book author

- Edit title-page author independently of active pen name; persisted and exported author match.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-048-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Edit title-page author independently of active pen name. Then persisted and exported author match. Environment: browser

### NEO-049 — Title Enter

- Press Enter in title/subtitle; caret enters first story past front pages; missing story gets created before back matter.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-049-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Press Enter in title/subtitle. Then caret enters first story past front pages; missing story gets created before back matter. Environment: browser

**NEO-049-B** Given A book with Dedication before one existing story and About afterward. When Press Enter independently in title and subtitle. Then Existing story receives focus and no extra chapter is created. Environment: electron-files

### NEO-050 — Single-story heading suppression

- One numbered story omits chapter heading/locator; add second story/prologue/part then both headings number correctly.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-050-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When One numbered story omits chapter heading/locator. Then add second story/prologue/part then both headings number correctly. Environment: browser

**NEO-050-B** Given A single story chapter with its heading suppressed. When Insert Prologue then Part through navigation insertion menus. Then Headings become Prologue, Part I and Chapter 1, with no solo suppression remaining. Environment: electron-files

### NEO-051 — Chapter titles

- Editing a custom heading saves on blur; Enter prevents newline and blurs rather than moving focus into body; Shift+Enter inserts poetry; blank title returns default.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-051-A** Given An open story chapter has a custom heading. When Edit the heading and press Enter; separately clear/blur it and use Shift+Enter. Then Enter saves the single-line title and blurs; blank blur restores default heading; Shift+Enter places an editable poetry paragraph before prose. Environment: browser

**NEO-051-B** Given A chapter heading above original prose. When Commit a new title with Enter, clear it and blur, then ShiftEnter from heading and type poetry. Then Enter blurs; empty title restores default numbering; poetry precedes intact original prose and persists. Environment: electron-files

### NEO-052 — All page kinds

- Context-menu converts entry to copyright/dedication/epigraph/contents/prologue/part/chapter/unnumbered/epilogue/acknowledgments/about; headings and page layouts match kind.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-052-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Context-menu converts entry to copyright/dedication/epigraph/contents/prologue/part/chapter/unnumbered/epilogue/acknowledgments/about. Then headings and page layouts match kind. Environment: browser

**NEO-052-B** Given A convertible chapter alongside another story. When Choose each of eleven kinds from actual chapter menus and inspect headings/body layout. Then Each kind has source-defined heading, body visibility, alignment, style or copyright text; unnumbered heading remains hidden. Environment: electron-files

### NEO-053 — Numbering and part resets

- Insert/reorder/remove kinds; only chapters increment Arabic number and parts Roman number; optional restart per part persists.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-053-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Insert/reorder/remove kinds. Then only chapters increment Arabic number and parts Roman number; optional restart per part persists. Environment: browser

**NEO-053-B** Given Two Parts and two story chapters. When Delete first Part and Undo. Then Surviving Part renumbers Part I and Undo restores both Roman labels and Part prose. Environment: electron-files

### NEO-054 — Prologue and epilogue migration

- Open legacy first/last-role metadata; migrate to chapterKinds without prose/order loss; newer kinds need not occupy legacy first/last constraints.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-054-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Open legacy first/last-role metadata. Then migrate to chapterKinds without prose/order loss; newer kinds need not occupy legacy first/last constraints. Environment: browser

**NEO-054-B** Given Modern Epilogue first, Prologue middle and ordinary story last. When Open, leave, restart and reopen. Then Explicit modern kinds remain in arbitrary positions with correct headings and no legacy role migration. Environment: electron-files

### NEO-055 — Unnumbered chapter

- Set unnumbered with title; display title once and exclude from numbered count.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-055-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Set unnumbered with title. Then display title once and exclude from numbered count. Environment: browser

### NEO-056 — Contents safety

- Contents menu disabled when entry contains prose or another contents exists; generated TOC links target story/part headings.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-056-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Contents menu disabled when entry contains prose or another contents exists. Then generated TOC links target story/part headings. Environment: browser

**NEO-056-B** Given Generated Contents, Part and story entries. When Click the Contents Part I entry. Then Actual Part body receives focus and its navigation row becomes current. Environment: electron-files

### NEO-057 — Copyright starter

- Convert empty entry to copyright; generated current year/author rights text appears; nonempty copyright content preserved.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-057-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Convert empty entry to copyright. Then generated current year/author rights text appears; nonempty copyright content preserved. Environment: browser

### NEO-058 — Add chapter at end

- Activate navigation +; new chapter inserted before back matter and caret focuses it.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-058-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Activate navigation +. Then new chapter inserted before back matter and caret focuses it. Environment: browser

### NEO-059 — Insert any entry

- Use insertion plus/menu between nav rows; selected kind placed at requested index; empty story start/end edge works.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-059-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Use insertion plus/menu between nav rows. Then selected kind placed at requested index; empty story start/end edge works. Environment: browser

**NEO-059-B** Given A book with zero story chapters. When Use the sole navigation gap to insert Dedication, then the ending gap to insert Chapter. Then Stored kinds are dedication then chapter and the new story body receives focus. Environment: electron-files

### NEO-060 — Chapter navigation

- Click nav row/TOC; correct body/current chapter highlighted and scrolls into view; Cmd/Ctrl+Alt arrows step/clamp.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-060-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Click nav row/TOC. Then correct body/current chapter highlighted and scrolls into view; Cmd/Ctrl+Alt arrows step/clamp. Environment: browser

**NEO-060-B** Given A long eighty-paragraph first chapter and a distant second chapter. When Click the second navigation row. Then The destination body receives focus, its heading enters the manuscript viewport and its navigation row is current. Environment: browser-layout

### NEO-061 — Chapter drag reorder

- Dragging a chapter insertion row persists chapter order, preserves full prose and synchronizes Outline order. Original rendering rebuilds chapter bodies and does not restore the previous DOM selection.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-061-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Drag nav row across entries. Then Chapter order persists, all prose survives and navigation and Outline follow the new order. Environment: browser

**NEO-061-B** Given Two titled chapters with a range selected in the first. When Drag the second navigation row before the first, then open Outline. Then Full selected prose survives, disk chapter order is reversed and Outline follows that order; no selection-restoration promise is inferred. Environment: electron-files

### NEO-062 — Chapter notes in nav

- Edit note field and blur; note persists and synchronizes Outline chapter line.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-062-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Edit note field and blur. Then note persists and synchronizes Outline chapter line. Environment: browser

**NEO-062-B** Given Navigation note and matching Outline chapter. When Edit navigation note and blur into manuscript, then open Outline. Then Metadata writes the note and the matching Outline line shows it. Environment: electron-files

### NEO-063 — Delete chapter recoverably

- Delete nonempty chapter from heading/nav/Outline menu; full HTML goes to Darlings, numbering updates; Undo resurrects files and metadata.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-063-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Delete nonempty chapter from heading/nav/Outline menu. Then full HTML goes to Darlings, numbering updates; Undo resurrects files and metadata. Environment: browser

**NEO-063-B** Given Three numbered story chapters. When Delete the middle chapter from its actual menu, then Undo. Then The survivor renumbers Chapter 2 before Undo restores all three original chapter headings. Environment: electron-files

**NEO-063-C** Given Two chapters including bold prose. When Delete through heading and Outline context menus independently, then Undo each. Then Deletion archives marked prose in Darlings; Undo restores exact order and bold content. Environment: electron-files

### NEO-064 — Delete empty chapter

- Delete empty chapter safely; minimum valid chapter/story affordance retained; current caret lands according to original.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-064-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Delete empty chapter safely. Then minimum valid chapter/story affordance retained; current caret lands according to original. Environment: browser

### NEO-065 — Chapter export menu

- Story entry with words offers export formats; front page/empty entry does not; output contains only that story with its title.

Sources: app.js:61–175, app.js:2121–2407, app.js:3890–3918, app.js:4438–4754. Status: required.

**NEO-065-A** Given An open synthetic book containing story chapters, one front page, one back page and a part with stable entry IDs. When Story entry with words offers export formats. Then front page/empty entry does not; output contains only that story with its title. Environment: browser

**NEO-065-B** Given Dedication, selected titled chapter and another story. When Export only selected chapter as PDF. Then Parsed PDF contains selected heading/prose and excludes front matter and other story. Environment: electron-files


## Typing and structural gestures

### NEO-066 — Native text entry

- Type, select, replace and delete Unicode text across styled runs; caret, bold/italic and persisted HTML remain coherent.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-066-A** Given An open story chapter containing two paragraphs: Alpha beta. and Gamma delta., with beta italic and caret in the first paragraph. When Type, select, replace and delete Unicode text across styled runs. Then caret, bold/italic and persisted HTML remain coherent. Environment: browser

### NEO-067 — IME composition guard

- Composition start and isComposing/keyCode229 suppress smart/structural shortcuts; committed composition persists exactly once without losing characters.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-067-A** Given An open story chapter containing two paragraphs: Alpha beta. and Gamma delta., with beta italic and caret in the first paragraph. When Composition start and isComposing/keyCode229 suppress smart/structural shortcuts. Then committed composition persists exactly once without losing characters. Environment: browser

**NEO-067-B** Given Existing Alpha manuscript after actual heading Enter or help Escape stops event propagation. When Mouse focus manuscript, native Chromium composition updates and commits Japanese, then real native Undo and Redo; leave and reopen. Then Visible prose and caret show one committed composition; Undo and Redo work and disk/reopened prose retain exact committed text. Environment: Real isolated Electron native CDP IME input and native menu editing commands; no private editor mutations.

**NEO-067-C** Given Existing manuscript caret after Alpha. When Native CDP trusted Quote keydown carries actual229 keyCode and plain apostrophe text, then native Undo/Redo. Then Recorded event is trusted/keyCode229; literal apostrophe stays unsmartened and native history roundtrip exact. Environment: Isolated real Electron with observed trusted native events, native APIs and private persistence. Host fault boundaries explicitly recorded.

**NEO-067-D** Given Manuscript empty tail with actual native composition pending. When Native IME first update then actual trusted Enter key while composition active and commit Japanese. Then Observed Enter is trusted/isComposing true; one chapter remains; exact original prose and committed Japanese persist. Environment: Isolated real Electron with observed trusted native events, native APIs and private persistence. Host fault boundaries explicitly recorded.

### NEO-068 — Single Enter split

- At start/middle/end of prose, Enter creates native paragraph split preserving inline marks and text; caret begins right-hand paragraph.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-068-A** Given The caret is inside Alpha| beta. where beta is italic. When Press Enter once. Then Two prose paragraphs contain Alpha and beta.; beta remains italic and caret is at beginning of the second paragraph. Environment: browser

**NEO-068-B** Given The caret is at the beginning/end of Alpha beta. When Press Enter once at each boundary in separate fixture copies. Then An empty prose paragraph appears before/after respectively; no text or formatting is lost. Environment: browser

### NEO-069 — Double Enter scene

- Two consecutive Enter at start/middle/end produce centred *** between correct prose fragments; following caret is editable prose.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-069-A** Given The caret is at Alpha| beta. in a story with two paragraphs. When Press Enter twice consecutively without intervening input. Then Alpha and beta. are separate prose fragments with one centred scene marker between; second original paragraph follows and caret starts beta. Environment: browser

**NEO-069-B** Given The caret is at the end of the last nonempty story paragraph. When Press Enter twice. Then Original prose is followed by one scene marker and one empty editable prose paragraph; no extra scene is created. Environment: browser

### NEO-070 — Triple Enter chapter

- Three consecutive Enter split chapter at current location; following siblings move into new numbered chapter; preceding break removed and caret starts new chapter.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-070-A** Given The caret is at Alpha| beta. in chapter1 followed by Gamma delta. When Press Enter three times consecutively. Then Chapter1 ends with Alpha; new chapter2 starts beta. then Gamma delta.; scene marker is removed; later chapters renumber and caret starts new chapter. Environment: browser

### NEO-071 — Enter sequence interruption

- Any non-Enter key or mouse down resets consecutive Enter count; simple pointer movement alone does not reset original counter; typing resets breakRun so native Undo takes over.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-071-A** Given The synthetic original and candidate desktop fixtures are in the state named by this requirement. When Any non-Enter key or mouse down resets consecutive Enter count Then  simple pointer movement alone does not reset original counter; typing resets breakRun so native Undo takes over. Environment: browser

### NEO-072 — Enter on scene

- Enter on *** line does nothing and cannot create styled prose inside marker.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-072-A** Given Caret is on the nonprose *** marker between Alpha and Gamma. When Press Enter. Then Document, number of paragraphs and chapter order remain unchanged. Environment: browser

### NEO-073 — Enter on nonstory page

- Repeated Enter in ordinary copyright/dedication/part page creates lines only; never creates scene or chapter.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-073-A** Given A dedication entry has one paragraph and its caret at end. When Press Enter three consecutive times then type Zeta. Then All content stays within dedication as ordinary lines/paragraphs; no scene or new story chapter appears. Environment: browser

### NEO-074 — Scene Backspace boundary

- Backspace at beginning of paragraph below scene removes marker only; prose paragraphs remain separate; Undo returns break.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-074-A** Given Alpha, scene marker and Gamma occupy three consecutive blocks; caret is at Gamma start. When Press Backspace, then Undo. Then First action removes only scene without joining prose; Undo restores marker and caret boundary. Environment: browser

### NEO-075 — Scene Delete boundary

- Delete at end of paragraph above scene removes marker only; prose never merges into scene style.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-075-A** Given Alpha, scene marker and Gamma occupy three blocks; caret is at Alpha end. When Press Delete. Then Only scene disappears; Alpha and Gamma remain separate unstyled prose paragraphs. Environment: browser

### NEO-076 — Empty chapter Backspace

- Backspace in empty first/middle/last chapter removes it if others exist; caret lands next-start or previous-end; Undo restores.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-076-A** Given A two-chapter book has an empty first chapter and nonempty second. When Backspace in empty first chapter; then Undo. Then First action dissolves chapter1 and focuses start of surviving story; Undo restores empty entry/order/caret. Environment: browser

**NEO-076-B** Given A book has nonempty chapter1 and empty chapter2. When Backspace in empty chapter2. Then Chapter2 dissolves and caret goes to chapter1 end. Environment: browser

### NEO-077 — Chapter-start merge

- Backspace at first character of nonempty story merges into preceding nonempty story as separate paragraphs; stickies/darlings/outline section refs migrate.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-077-A** Given Chapter1 ends Alpha.; chapter2 starts beta. then Gamma.; chapter2 owns one flag/note, Darling and section note. When Backspace at chapter2 first character; Undo. Then Merge retains separate Alpha./beta./Gamma. paragraphs in chapter1 and migrates refs; Undo restores original two chapters and all metadata. Environment: browser

### NEO-078 — Chapter-start page boundary

- Nonempty front/back page cannot merge into story via Backspace; empty preceding entry may dissolve; contents protected.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-078-A** Given An open story chapter containing two paragraphs: Alpha beta. and Gamma delta., with beta italic and caret in the first paragraph. When Nonempty front/back page cannot merge into story via Backspace. Then empty preceding entry may dissolve; contents protected. Environment: browser

### NEO-079 — Tab spacing

- Tab inserts two em spaces; Shift+Tab removes at most two immediately preceding em spaces and preserves other text.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-079-A** Given An open story chapter containing two paragraphs: Alpha beta. and Gamma delta., with beta italic and caret in the first paragraph. When Tab inserts two em spaces. Then Shift+Tab removes at most two immediately preceding em spaces and preserves other text. Environment: browser

### NEO-080 — Space-safe deletion

- Delete range/character between spaces removes duplicate seam spaces; styled-node seams behave identically.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-080-A** Given An open story chapter containing two paragraphs: Alpha beta. and Gamma delta., with beta italic and caret in the first paragraph. When Delete range/character between spaces removes duplicate seam spaces. Then styled-node seams behave identically. Environment: browser

### NEO-081 — Inline marker deletion

- Backspace/Delete adjacent placeholder removes mark and its note; next-to-marker character deletion preserves neighbouring text/format.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-081-A** Given An open story chapter containing two paragraphs: Alpha beta. and Gamma delta., with beta italic and caret in the first paragraph. When Backspace/Delete adjacent placeholder removes mark and its note. Then next-to-marker character deletion preserves neighbouring text/format. Environment: browser

### NEO-082 — Paragraph cleanup

- Repeated native splits/merges remove junk style spans while keeping inline NEO placeholders and marks.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-082-A** Given An open story chapter containing two paragraphs: Alpha beta. and Gamma delta., with beta italic and caret in the first paragraph. When Repeated native splits/merges remove junk style spans while keeping inline NEO placeholders and marks.. Then Repeated native splits/merges remove junk style spans while keeping inline NEO placeholders and marks. Environment: browser

### NEO-083 — Poetry ShiftEnter start

- Shift+Enter at empty paragraph or paragraph beginning converts whole paragraph to indented italic poetry without text loss.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-083-A** Given Caret starts prose Alpha beta. or an empty paragraph. When Press Shift+Enter. Then Same paragraph becomes poetry, all existing text retained and italic, caret begins paragraph. Environment: browser

### NEO-084 — Poetry ShiftEnter mid/end

- Shift+Enter extracts trailing prose into new italic poetry paragraph; source stays prose; end creates empty poetry line.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-084-A** Given Caret sits after Alpha and beta. is remaining prose tail. When Press Shift+Enter. Then Alpha remains prose; beta. moves to new indented italic poetry paragraph and caret starts beta. Environment: browser

**NEO-084-B** Given Caret sits at end of a prose paragraph. When Press Shift+Enter. Then One empty italic poetry paragraph appears after prose and accepts subsequent text as poetry. Environment: browser

### NEO-085 — Poetry continuation

- Shift+Enter inside poetry creates another poetry paragraph retaining indentation and suitable italic typing state.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-085-A** Given Caret is midway through indented italic poetry. When Press Shift+Enter, then type Verse. Then New line remains poetry and typing has appropriate italic state; existing trailing verse is retained. Environment: browser

### NEO-086 — Poetry plain Enter

- Enter in nonempty poetry splits tail into normal nonitalic prose; Enter in empty poetry converts in place; Undo restores.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-086-A** Given Caret is inside nonempty poetry Alpha| beta. When Press Enter. Then Alpha stays poetry; beta. becomes ordinary nonitalic prose and caret begins it. Environment: browser

**NEO-086-B** Given Caret is in empty poetry. When Press Enter then Undo. Then Empty line converts in place to prose; Undo returns poetry without introducing duplicate paragraphs. Environment: browser

### NEO-087 — Poetry Backspace

- Backspace at poetry start first converts to prose, second merges normally; body at chapter boundary follows original handler precedence.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-087-A** Given Poetry beta. follows prose Alpha.; caret is at beta. start. When Press Backspace once, then again. Then First press converts beta. to plain prose without merging; second performs ordinary prose paragraph merge. Environment: browser

### NEO-088 — Poetry heading insertion

- Shift+Enter at chapter heading inserts poetry before opening paragraph; chapter drop-cap skips poetry appropriately.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-088-A** Given A visible chapter heading precedes opening prose Alpha. When Focus heading and press Shift+Enter. Then An italic poetry paragraph appears before Alpha. and takes caret; heading and opening prose remain. Environment: browser

### NEO-089 — Poetry menu selection

- Format Poetry toggles every touched nonscene paragraph; all-on selection turns off, mixed selection turns all on; caret moves first paragraph.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-089-A** Given An open story chapter containing two paragraphs: Alpha beta. and Gamma delta., with beta italic and caret in the first paragraph. When Format Poetry toggles every touched nonscene paragraph. Then all-on selection turns off, mixed selection turns all on; caret moves first paragraph. Environment: browser

### NEO-090 — Poetry italic override

- Cmd/Ctrl+I permits nonitalic poetry without losing paragraph kind; save/reopen/export preserves choice.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-090-A** Given An open story chapter containing two paragraphs: Alpha beta. and Gamma delta., with beta italic and caret in the first paragraph. When Cmd/Ctrl+I permits nonitalic poetry without losing paragraph kind. Then save/reopen/export preserves choice. Environment: browser

### NEO-091 — Typing visibility

- Typing/Enter near viewport edge reveals caret with room below and no jump to document start; format shortcuts preserve scroll.

Sources: app.js:2407–3331, TUTORIAL.md:31–51. Status: required.

**NEO-091-A** Given An open story chapter containing two paragraphs: Alpha beta. and Gamma delta., with beta italic and caret in the first paragraph. When Typing/Enter near viewport edge reveals caret with room below and no jump to document start. Then format shortcuts preserve scroll. Environment: browser


## History and clipboard

### NEO-092 — Typing undo redo

- Type grouped text and invoke keyboard and native Edit Undo/Redo; correct text, selection and marks return; new typing invalidates redo.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490, main.js:1481–1490. Status: required.

**NEO-092-A** Given Fresh history and empty prose paragraph. When Type Alpha beta.; press keyboard Undo, Redo; then native Edit Undo, Redo. Then Each route restores/removes corresponding typing group and caret/marks; redo after new replacement typing no longer replays old branch. Environment: browser-electron

**NEO-092-B** Given Existing native-typed manuscript prose and caret. When Use actual Format Align Center, then native Undo and Redo of preceding typing. Then Alignment synchronization preserves prior native typing history; exact intermediate text and persisted redo are observed. Environment: Isolated actual Electron UI and persistence; original defects explicitly characterized where present.

### NEO-093 — Structural undo routing

- Consecutive latest breaks route Cmd/Ctrl+Z through structural history; subsequent typing restores native route; outside editor undo targets structure.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-093-A** Given An open story chapter with editable formatted prose and a fresh undo history. When Consecutive latest breaks route Cmd/Ctrl+Z through structural history. Then subsequent typing restores native route; outside editor undo targets structure. Environment: browser-electron

### NEO-094 — DoubleEnter undo grouping

- Immediately Undo double Enter scene restores pregesture prose and heals initial split at seam, not merely removes marker.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-094-A** Given Caret sits at Alpha| beta. with clean structural history. When Press Enter twice then Cmd/Ctrl+Z immediately. Then Scene and initial paragraph split are both undone; original Alpha beta. paragraph and seam caret return. Environment: browser-electron

### NEO-095 — TripleEnter undo sequence

- Undo chapter split returns scene state; subsequent Undo scene rejoins original paragraph; caret and metadata match original.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-095-A** Given Caret sits at Alpha| beta. followed by Gamma. When Press Enter three times, Undo twice. Then First Undo restores preceding scene/chapter arrangement; second removes scene gesture and rejoins original Alpha beta. with caret at seam. Environment: browser-electron

### NEO-096 — Structural snapshot scope

- Undo chapter type/delete/reorder, poetry, darling cut/restore and replace-all restores chapter order/kinds/titles/notes/sections/stickies/darlings and files.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-096-A** Given An open story chapter with editable formatted prose and a fresh undo history. When Undo chapter type/delete/reorder, poetry, darling cut/restore and replace-all restores chapter order/kinds/titles/notes/sections/stickies/darlings and files.. Then Undo chapter type/delete/reorder, poetry, darling cut/restore and replace-all restores chapter order/kinds/titles/notes/sections/stickies/darlings and files. Environment: browser-electron

### NEO-097 — Structural redo distinction

- Original structural stack has no explicit redo stack and resets native history; characterize native Edit Redo after structure separately. Improved coherent redo is desired but must be labelled intentional enhancement.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-097-A** Given Original and candidate apps have separate clean fixture copies. When Create a scene/chapter, Undo structure, then invoke native Edit Redo. Then Record original no-custom-structural-redo result; candidate coordinated structural redo may improve behaviour but is labelled enhancement, not falsely as original parity. Environment: browser-electron

### NEO-098 — Undo capacity

- Original structural stack caps at 10; more actions retain most recent ten; typing native capacity characterized independently.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-098-A** Given An open story chapter with editable formatted prose and a fresh undo history. When Original structural stack caps at 10. Then more actions retain most recent ten; typing native capacity characterized independently. Environment: browser-electron

**NEO-098-B** Given Sixteen actual paragraphs, each with its own caret-separated native typing run. When Type one distinct letter per paragraph, undo every run with native menu, redo every run and reopen. Then Every intermediate paragraph array matches exactly; native typing history preserves sixteen runs beyond ten structural snapshots; reopened text matches full redo. Environment: Isolated real Electron native typing/menu history and actual disk persistence.

### NEO-099 — Cut copy select-all

- Native keyboard/menu cut/copy/select-all work in manuscript and auxiliary editors; clipboard includes safe styled text and current selection remains correct.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-099-A** Given An open story chapter with editable formatted prose and a fresh undo history. When Native keyboard/menu cut/copy/select-all work in manuscript and auxiliary editors. Then clipboard includes safe styled text and current selection remains correct. Environment: browser-electron

### NEO-100 — Plain paste paragraphs

- Paste CRLF/newline text; trim/drop empty lines, create appropriate paragraphs and preserve surrounding paragraph fragments.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-100-A** Given Caret is inside Alpha| beta. and native clipboard contains One

Two. When Paste through native menu/shortcut. Then CR removed, empty lines trimmed, One/Two survive as correct paragraph content with original prefix/suffix preserved. Environment: browser-electron

### NEO-101 — Styled HTML paste

- Paste Word/Google Docs spans/b/strong/i; keep actual bold/italic, unwrap normal-weight Google b, strip foreign styling.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-101-A** Given An open story chapter with editable formatted prose and a fresh undo history. When Paste Word/Google Docs spans/b/strong/i. Then keep actual bold/italic, unwrap normal-weight Google b, strip foreign styling. Environment: browser-electron

### NEO-102 — Unsafe clipboard sanitation

- Paste script/style/meta/link/img/table plus headings/lists/blockquote/br; no resource load/execution; remaining prose becomes clean paragraphs.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-102-A** Given Clipboard HTML contains prose plus script, external image, table, style and normal-weight Google Docs b wrapper. When Paste at manuscript caret and observe resource requests/document. Then No script executes or image/resource loads; unsafe elements removed; actual bold/italic prose remains clean with no foreign styles. Environment: browser-electron

### NEO-103 — Inline paste

- Single pasted block remains inline at caret; multiple pasted blocks become paragraphs; surrounding marks/caret preserved.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-103-A** Given An open story chapter with editable formatted prose and a fresh undo history. When Single pasted block remains inline at caret. Then multiple pasted blocks become paragraphs; surrounding marks/caret preserved. Environment: browser-electron

### NEO-104 — Paste placeholders

- Copy/paste flag with text; unique new sticky ID cloned note; cross-chapter move updates sticky chapter and red dot.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-104-A** Given An open story chapter with editable formatted prose and a fresh undo history. When Copy/paste flag with text. Then unique new sticky ID cloned note; cross-chapter move updates sticky chapter and red dot. Environment: browser-electron

### NEO-105 — Paste match style

- Native Cmd+Alt+Shift+V on Mac or Ctrl+Shift+V on PC follows match-style route; no imported typeface/color/background.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-105-A** Given An open story chapter with editable formatted prose and a fresh undo history. When Native Cmd+Alt+Shift+V on Mac or Ctrl+Shift+V on PC follows match-style route. Then no imported typeface/color/background. Environment: browser-electron

### NEO-106 — Markdown emphasis typing

- Type paired *, **, ***, _, __ around words; italic/bold combinations applied; numeric multiplication/snake_case/lone stars stay literal.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-106-A** Given Empty manuscript paragraph and Markdown enabled. When Type *word*, **word**, ***word*** and _word_ in separate fixture copies; also type 2 * 3 and snake_case. Then Paired delimiters become correct italic/bold combinations; multiplication and snake_case remain literal. Environment: browser-electron

### NEO-107 — Markdown immediate undo

- Cmd/Ctrl+Z immediately after automatic emphasis restores typed delimiter characters, with caret after closing delimiter.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-107-A** Given Empty manuscript paragraph and Markdown enabled. When Type *word* then immediately Undo. Then Literal *word* returns, with caret after closing delimiter and no italic formatting. Environment: browser-electron

### NEO-108 — Markdown preference

- Turn Markdown Emphasis off; typed/pasted delimiters remain literal across reopen; turn on restores conversion in manuscript and Notes only.

Sources: app.js:2449–2505, app.js:3354–3530, app.js:6106–6229, main.js:1481–1490. Status: required.

**NEO-108-A** Given An open story chapter with editable formatted prose and a fresh undo history. When Turn Markdown Emphasis off. Then typed/pasted delimiters remain literal across reopen; turn on restores conversion in manuscript and Notes only. Environment: browser-electron


## Language typography

### NEO-109 — Em dash typing

- Type -- in manuscript/title/notes/outline/shelf label; becomes em dash immediately, retaining previous styling; modifier and composition input bypass conversion.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-109-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When Type -- in manuscript/title/notes/outline/shelf label. Then becomes em dash immediately, retaining previous styling; modifier and composition input bypass conversion. Environment: browser

### NEO-110 — Ellipsis typing

- Type ...; replaces preceding dots with U+2026; undo/caret/marks coherent.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-110-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When Type .... Then replaces preceding dots with U+2026; undo/caret/marks coherent. Environment: browser

### NEO-111 — Smart double quotes

- Type quotes at start, after spaces/brackets, after prose and after dialogue dashes; opening/closing choice follows current paragraph quotation balance.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-111-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When Type quotes at start, after spaces/brackets, after prose and after dialogue dashes. Then opening/closing choice follows current paragraph quotation balance. Environment: browser

### NEO-112 — Single quotes apostrophes

- English/Dutch/Brazilian Portuguese support opening single quote; apostrophes use right quote; other language single-quote input stays apostrophe.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-112-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When English/Dutch/Brazilian Portuguese support opening single quote. Then apostrophes use right quote; other language single-quote input stays apostrophe. Environment: browser

### NEO-113 — Locale quote styles

- Parameterize en,nl,pt,pt-PT,fr,es,it,de,pl,ro,ru,el; exact opening/closing glyphs follow language fallback and spell-language preference.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-113-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When Parameterize en,nl,pt,pt-PT,fr,es,it,de,pl,ro,ru,el. Then exact opening/closing glyphs follow language fallback and spell-language preference. Environment: browser

### NEO-114 — Manuscript quote inference

- Existing »…« or «…» dominates local chapter, then book; newly typed quotes follow established manuscript style when count wins.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-114-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When Existing »…« or «…» dominates local chapter, then book. Then newly typed quotes follow established manuscript style when count wins. Environment: browser

### NEO-115 — French spacing

- French ; : ! ? after ordinary/NBSP space replace it with narrow no-break space; fr-CA only colon; French guillemets have inner narrow spaces.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-115-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When French . Then : ! ? after ordinary/NBSP space replace it with narrow no-break space; fr-CA only colon; French guillemets have inner narrow spaces. Environment: browser

### NEO-116 — Dialogue opening dashes

- Portuguese/Russian -speech becomes em dash plus space; Spanish em dash without space; other languages preserve typed spacing.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-116-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When Portuguese/Russian -speech becomes em dash plus space. Then Spanish em dash without space; other languages preserve typed spacing. Environment: browser

### NEO-117 — Dialogue middle dashes

- Standalone hyphen after space transforms language mid-dash when following punctuation/space/quote/end establishes dialogue.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-117-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When Standalone hyphen after space transforms language mid-dash when following punctuation/space/quote/end establishes dialogue.. Then Standalone hyphen after space transforms language mid-dash when following punctuation/space/quote/end establishes dialogue. Environment: browser

### NEO-118 — Hyphen exclusions

- Negative number, word hyphen, suspended prefix/suffix and all-dash scene stay unchanged; fragment paste uses paragraph start/end context.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-118-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When Negative number, word hyphen, suspended prefix/suffix and all-dash scene stay unchanged. Then fragment paste uses paragraph start/end context. Environment: browser

### NEO-119 — Dialogue immediate undo

- Undo immediately after automatic dash conversion restores original hyphen and just-typed following character/caret.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-119-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When Undo immediately after automatic dash conversion restores original hyphen and just-typed following character/caret.. Then Undo immediately after automatic dash conversion restores original hyphen and just-typed following character/caret. Environment: browser

### NEO-120 — Notes list hyphens

- Opening Notes/Outline list - stays list hyphen while manuscript opening speech dash transforms.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-120-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When Opening Notes/Outline list - stays list hyphen while manuscript opening speech dash transforms.. Then Opening Notes/Outline list - stays list hyphen while manuscript opening speech dash transforms. Environment: browser

### NEO-121 — Typography in paste/import

- Pasted styled runs and imported manuscript use appropriate dialogue context; bold/italic boundaries cannot drop replacement.

Sources: app.js:3530–3890, scripts/dashes.test.js:1–80. Status: required.

**NEO-121-A** Given An open manuscript with an empty paragraph, configured writing language and automatic Markdown emphasis enabled. When Pasted styled runs and imported manuscript use appropriate dialogue context. Then bold/italic boundaries cannot drop replacement. Environment: browser


## Placeholders and margin notes

### NEO-122 — Insert placeholder

- Cmd/Ctrl+Shift+X at caret inserts noneditable flag and unresolved margin note; chapter gets red dot; side pane opens to note.

Sources: app.js:4235–4438, app.js:4365–4425. Status: required.

**NEO-122-A** Given An open story chapter containing Alpha beta. with no unresolved notes. When Cmd/Ctrl+Shift+X at caret inserts noneditable flag and unresolved margin note. Then chapter gets red dot; side pane opens to note. Environment: browser-electron

### NEO-123 — Selected placeholder insertion

- With selected prose, Cmd/Ctrl+Shift+X collapses selection to its end, inserts flag plus following space without deleting selected words, then focuses new margin note.

Sources: app.js:4235–4438, app.js:4365–4425. Status: required.

**NEO-123-A** Given The synthetic original and candidate desktop fixtures are in the state named by this requirement. When With selected prose, Cmd/Ctrl+Shift+X collapses selection to its end, inserts flag plus following space without deleting selected words, then focuses new margin note. Then With selected prose, Cmd/Ctrl+Shift+X collapses selection to its end, inserts flag plus following space without deleting selected words, then focuses new margin note. Environment: browser-electron

### NEO-124 — Edit sticky note

- Type multiline note; 600ms debounce persists; immediate shelf switch/blur/close flushes same book.

Sources: app.js:4235–4438, app.js:4365–4425. Status: required.

**NEO-124-A** Given An open story chapter containing Alpha beta. with no unresolved notes. When Type multiline note. Then 600ms debounce persists; immediate shelf switch/blur/close flushes same book. Environment: browser-electron

### NEO-125 — Return from sticky

- Enter in note returns caret just after flag, closes only auto-open unpinned pane; Shift+Enter inserts note newline.

Sources: app.js:4235–4438, app.js:4365–4425. Status: required.

**NEO-125-A** Given An open story chapter containing Alpha beta. with no unresolved notes. When Enter in note returns caret just after flag, closes only auto-open unpinned pane. Then Shift+Enter inserts note newline. Environment: browser-electron

### NEO-126 — Go to placeholder

- Click Go to; switches manuscript and scrolls only if needed, focuses owning chapter and caret after flag.

Sources: app.js:4235–4438, app.js:4365–4425. Status: required.

**NEO-126-A** Given An open story chapter containing Alpha beta. with no unresolved notes. When Click Go to. Then switches manuscript and scrolls only if needed, focuses owning chapter and caret after flag. Environment: browser-electron

### NEO-127 — Resolve placeholder

- Resolve removes flag and note, normalizes seam spaces/NBSP and red dot; subsequent save/export omit flag.

Sources: app.js:4235–4438, app.js:4365–4425. Status: required.

**NEO-127-A** Given An open story chapter containing Alpha beta. with no unresolved notes. When Resolve removes flag and note, normalizes seam spaces/NBSP and red dot. Then subsequent save/export omit flag. Environment: browser-electron

### NEO-128 — Placeholder direct click

- Click manuscript flag focuses corresponding note without replacing manuscript text.

Sources: app.js:4235–4438, app.js:4365–4425. Status: required.

**NEO-128-A** Given An open story chapter containing Alpha beta. with no unresolved notes. When Click manuscript flag focuses corresponding note without replacing manuscript text.. Then Click manuscript flag focuses corresponding note without replacing manuscript text. Environment: browser-electron

### NEO-129 — Placeholder reconciliation

- Orphan flag gets new empty note; duplicated pasted flag gets new ID and copied text; moved flag adopts new chapter.

Sources: app.js:4235–4438, app.js:4365–4425. Status: required.

**NEO-129-A** Given An open story chapter containing Alpha beta. with no unresolved notes. When Orphan flag gets new empty note. Then duplicated pasted flag gets new ID and copied text; moved flag adopts new chapter. Environment: browser-electron

### NEO-130 — Placeholder deletion undo characterization

- Deleting an adjacent placeholder calls resolveSticky without a native/structural undo transaction. Original Undo cannot recover that deletion. A candidate may improve this only if restored marks retain the original note text and stable pairing; never restore an orphan that loses the note.

Sources: app.js:4235–4438, app.js:4365–4425. Status: required.

**NEO-130-A** Given An open story chapter containing Alpha beta. with no unresolved notes. When Delete flag/note then Undo. Then Deleting an adjacent placeholder calls resolveSticky without a native/structural undo transaction. Original Undo cannot recover that deletion. A candidate may improve this only if restored marks retain the original note text and stable pairing; never restore an orphan that loses the note. Environment: browser-electron

### NEO-131 — Placeholder export suppression

- Export excludes flags and margin note content from manuscript prose; TODO presence does not add word count.

Sources: app.js:4235–4438, app.js:4365–4425. Status: required.

**NEO-131-A** Given An open story chapter containing Alpha beta. with no unresolved notes. When Export excludes flags and margin note content from manuscript prose. Then TODO presence does not add word count. Environment: browser-electron


## Darlings

### NEO-132 — Darling drag cut

- Drag selected prose to Darlings tab; source is removed, safe styled content/date/chapter label saved; blank drag ignored.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-132-A** Given An open story chapter containing Alpha beta. and Gamma delta., with beta italic and an empty Darling list. When Drag selected prose to Darlings tab. Then source is removed, safe styled content/date/chapter label saved; blank drag ignored. Environment: browser-electron

### NEO-133 — Darling keyboard cut

- Cmd/Ctrl+Shift+D on selection performs same cut; collapsed selection gives nonblocking selection hint.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-133-A** Given An open story chapter containing Alpha beta. and Gamma delta., with beta italic and an empty Darling list. When Cmd/Ctrl+Shift+D on selection performs same cut. Then collapsed selection gives nonblocking selection hint. Environment: browser-electron

### NEO-134 — Darling multi-paragraph cut

- Selection across paragraphs preserves full cleaned HTML/paragraphs and meaningful caret; empty source shell removed when siblings remain.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-134-A** Given An open story chapter containing Alpha beta. and Gamma delta., with beta italic and an empty Darling list. When Selection across paragraphs preserves full cleaned HTML/paragraphs and meaningful caret. Then empty source shell removed when siblings remain. Environment: browser-electron

### NEO-135 — Darling context anchor

- Store last/next 60 characters at cut point rather than noneditable marker; intervening edits before/after still resolve matching context.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-135-A** Given An open story chapter containing Alpha beta. and Gamma delta., with beta italic and an empty Darling list. When Store last/next 60 characters at cut point rather than noneditable marker. Then intervening edits before/after still resolve matching context. Environment: browser-electron

### NEO-136 — Darling exact inline restore

- Restore unchanged source inserts original styled runs at cut point, removes shelf entry and scrolls to passage.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-136-A** Given An open story chapter containing Alpha beta. and Gamma delta., with beta italic and an empty Darling list. When Restore unchanged source inserts original styled runs at cut point, removes shelf entry and scrolls to passage.. Then Restore unchanged source inserts original styled runs at cut point, removes shelf entry and scrolls to passage. Environment: browser-electron

### NEO-137 — Darling block restore

- Restore whole/multiple paragraphs after context host paragraph, preserving paragraphs/marks and prose around them.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-137-A** Given An open story chapter containing Alpha beta. and Gamma delta., with beta italic and an empty Darling list. When Restore whole/multiple paragraphs after context host paragraph, preserving paragraphs/marks and prose around them.. Then Restore whole/multiple paragraphs after context host paragraph, preserving paragraphs/marks and prose around them. Environment: browser-electron

### NEO-138 — Darling fallback restore

- When original location gone, append to owning chapter; when chapter gone append to final/new chapter; communicate fallback and retain all words.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-138-A** Given A saved Darling points to a cut location whose owning text was removed. When Click Restore; repeat with owning chapter also removed. Then Content appends to original chapter end or final/new chapter respectively; Darling entry is removed only after restoration and fallback notice identifies result. Environment: browser-electron

### NEO-139 — Darling delete

- Click Delete forever; original deletes immediately without confirmation, saves a structural snapshot and persists removal; Undo outside editor restores it.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-139-A** Given An open story chapter containing Alpha beta. and Gamma delta., with beta italic and an empty Darling list. When Click Delete forever. Then original deletes immediately without confirmation, saves a structural snapshot and persists removal; Undo outside editor restores it. Environment: browser-electron

### NEO-140 — Darling history

- Undo cut resurrects source and removes darling; Undo restore returns darling and removes inserted content; caret and metadata coherent.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-140-A** Given An open story chapter containing Alpha beta. and Gamma delta., with beta italic and an empty Darling list. When Undo cut resurrects source and removes darling. Then Undo restore returns darling and removes inserted content; caret and metadata coherent. Environment: browser-electron

### NEO-141 — Legacy Darling anchor characterization

- Legacy darling-anchor spans are stripped by renderChapters stripJunkSpans before migrateDarlingAnchors runs. Original removes the span and retains prose but leaves null contexts unchanged; restoring such a Darling uses the existing fallback. A deliberate migration improvement must be labelled separately.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-141-A** Given An open story chapter containing Alpha beta. and Gamma delta., with beta italic and an empty Darling list. When Open old invisible darling-anchor span. Then Legacy darling-anchor spans are stripped by renderChapters stripJunkSpans before migrateDarlingAnchors runs. Original removes the span and retains prose but leaves null contexts unchanged; restoring such a Darling uses the existing fallback. A deliberate migration improvement must be labelled separately. Environment: browser-electron

### NEO-142 — Deleted chapter Darling

- Chapter deletion retains full HTML even though displayed summary text truncates to 2000; restore reproduces all content.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-142-A** Given An open story chapter containing Alpha beta. and Gamma delta., with beta italic and an empty Darling list. When Chapter deletion retains full HTML even though displayed summary text truncates to 2000. Then restore reproduces all content. Environment: browser-electron

### NEO-143 — Darling list presentation

- Newest selection cut appears first with original chapter/date, styled readable passage and restore controls; list search finds its displayed text.

Sources: app.js:4848–5055, app.js:5436–5532, README.md:29–31. Status: required.

**NEO-143-A** Given An open story chapter containing Alpha beta. and Gamma delta., with beta italic and an empty Darling list. When Newest selection cut appears first with original chapter/date, styled readable passage and restore controls. Then list search finds its displayed text. Environment: browser-electron


## Outline and Notes

### NEO-144 — Tab identity and rename

- Switch Manuscript/Notes/Outline/Darlings; active ARIA state and scroll/caret preserved; double-click Notes/Outline rename persists.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-144-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Switch Manuscript/Notes/Outline/Darlings. Then active ARIA state and scroll/caret preserved; double-click Notes/Outline rename persists. Environment: browser-electron

### NEO-145 — Notes authoring

- Type/format/paste multiline auxiliary Notes; smart typography and Markdown apply, autosave/reopen retains content.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-145-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Type/format/paste multiline auxiliary Notes. Then smart typography and Markdown apply, autosave/reopen retains content. Environment: browser-electron

**NEO-145-B** Given Notes starting with an empty paragraph and clipboard HTML containing italic Alpha and an atomic flag. When Paste, type a second paragraph with a soft break, append an empty paragraph, switch tabs to flush and reopen. Then Stored and reopened Notes preserve exact paragraphs, one semantic hard break, emphasis and noneditable flag without PM helper artifacts. Environment: electron-files

### NEO-146 — Outline chapter lines

- Every story chapter has note line; edit syncs nav chapter note; nonstory entries/parts render their proper outline roles.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-146-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Every story chapter has note line. Then edit syncs nav chapter note; nonstory entries/parts render their proper outline roles. Environment: browser-electron

### NEO-147 — Outline section lines

- Section labels cycle A through Z then repeat A/B; stable section IDs and metadata order remain independent of repeating labels.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-147-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Add section notes alphabetically labelled A..Z wrapping. Then Section labels cycle A through Z then repeat A/B; stable section IDs and metadata order remain independent of repeating labels. Environment: browser-electron

### NEO-148 — Outline Enter direction

- Enter at beginning of nonempty chapter/section line creates line above; elsewhere creates below; new line receives caret.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-148-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Enter at beginning of nonempty chapter/section line creates line above. Then elsewhere creates below; new line receives caret. Environment: browser-electron

### NEO-149 — Outline arrow navigation

- Up/Down moves focus through lines and places caret at line end; boundary clamps.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-149-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Up/Down moves focus through lines and places caret at line end. Then boundary clamps. Environment: browser-electron

### NEO-150 — Outline indent

- Tab turns empty nonfirst chapter into prior story section; first chapter/nonempty chapter denied with hint and prose retained.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-150-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Tab turns empty nonfirst chapter into prior story section. Then first chapter/nonempty chapter denied with hint and prose retained. Environment: browser-electron

### NEO-151 — Outline outdent

- Shift+Tab section becomes new chapter after owner with section text as chapter note; ghost reconciliation follows.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-151-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Shift+Tab section becomes new chapter after owner with section text as chapter note. Then ghost reconciliation follows. Environment: browser-electron

### NEO-152 — Outline empty Backspace

- Empty section removal focuses neighbour/owner; empty story chapter removal allowed only when another story exists.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-152-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Empty section removal focuses neighbour/owner. Then empty story chapter removal allowed only when another story exists. Environment: browser-electron

### NEO-153 — Outline context deletion

- Deleting section removes only still-gray ghost and section-owned break; written prose never touched; chapter deletion routes Darlings.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-153-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Deleting section removes only still-gray ghost and section-owned break. Then written prose never touched; chapter deletion routes Darlings. Environment: browser-electron

### NEO-154 — Ghost rendering

- A nonempty section note is painted as a gray ghost when outline section blur/creation/restructure invokes syncGhosts; loading metadata alone does not generate ghosts. Existing persisted ghosts load normally, and section-owned scene breaks separate preceding content. Word counts exclude ghosts.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-154-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Nonempty section notes create gray ghost paragraphs with real scene breaks separating prior prose/sections. Then A nonempty section note is painted as a gray ghost when outline section blur/creation/restructure invokes syncGhosts; loading metadata alone does not generate ghosts. Existing persisted ghosts load normally, and section-owned scene breaks separate preceding content. Word counts exclude ghosts. Environment: browser-electron

### NEO-155 — Ghost overwrite

- Focus/input replaces ghost content and removes gray status; section ID stays linked to written prose.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-155-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Focus/input replaces ghost content and removes gray status. Then section ID stays linked to written prose. Environment: browser-electron

### NEO-156 — Ghost rename/reorder/delete

- Untouched ghosts mirror changed outline order/text; written-over paragraphs stay untouched on outline edits/removal.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-156-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Untouched ghosts mirror changed outline order/text. Then written-over paragraphs stay untouched on outline edits/removal. Environment: browser-electron

### NEO-157 — Outline persistence

- Immediate tab/shelf switch/close flushes chapter and section notes; reopen original order and ghosts.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-157-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Immediate tab/shelf switch/close flushes chapter and section notes. Then reopen original order and ghosts. Environment: browser-electron

### NEO-158 — Tab caret/scroll memory

- Scroll/write each tab, switch away and back; manuscript selection/caret and each tab scroll restore independently.

Sources: app.js:5055–5475, app.js:2179–2280. Status: required.

**NEO-158-A** Given An open two-chapter book with one chapter note and two section notes, one untouched ghost and one written-over section. When Scroll/write each tab, switch away and back. Then manuscript selection/caret and each tab scroll restore independently. Environment: browser-electron


## Search and replace

### NEO-159 — Find selected preset

- Cmd/Ctrl+F with selection pre-fills up to 80 trimmed characters; no book yields hint.

Sources: app.js:6229–6406. Status: required.

**NEO-159-A** Given An open book with Alpha alpha in two chapters, bold and ordinary text runs, populated Notes, Outline and Darlings. When Cmd/Ctrl+F with selection pre-fills up to 80 trimmed characters. Then no book yields hint. Environment: browser

### NEO-160 — Find literal case insensitive

- Search literal punctuation/metacharacter text case-insensitively; original searches within text nodes and counts nonoverlapping matches.

Sources: app.js:6229–6406. Status: required.

**NEO-160-A** Given An open book with Alpha alpha in two chapters, bold and ordinary text runs, populated Notes, Outline and Darlings. When Search literal punctuation/metacharacter text case-insensitively. Then original searches within text nodes and counts nonoverlapping matches. Environment: browser

### NEO-161 — Search cross-style boundary characterization

- Query spanning adjacent bold/normal text nodes does not match original node-local search; desired enhancement labelled separately.

Sources: app.js:6229–6406. Status: required.

**NEO-161-A** Given An open book with Alpha alpha in two chapters, bold and ordinary text runs, populated Notes, Outline and Darlings. When Query spanning adjacent bold/normal text nodes does not match original node-local search. Then desired enhancement labelled separately. Environment: browser

### NEO-162 — Search tab scopes

- Search entire manuscript in chapter order, current Notes, outline lines or Darling excerpts; auxiliary tabs hide/disable Replace.

Sources: app.js:6229–6406. Status: required.

**NEO-162-A** Given An open book with Alpha alpha in two chapters, bold and ordinary text runs, populated Notes, Outline and Darlings. When Search entire manuscript in chapter order, current Notes, outline lines or Darling excerpts. Then auxiliary tabs hide/disable Replace. Environment: browser

### NEO-163 — Search debounce highlights

- Typing query updates after 250ms; CSS highlight ranges do not modify persisted HTML or selection.

Sources: app.js:6229–6406. Status: required.

**NEO-163-A** Given An open book with Alpha alpha in two chapters, bold and ordinary text runs, populated Notes, Outline and Darlings. When Typing query updates after 250ms. Then CSS highlight ranges do not modify persisted HTML or selection. Environment: browser

### NEO-164 — Search next previous wrap

- Enter/Shift+Enter and arrows cycle/wrap matches; count and scroller align current result without selecting prose.

Sources: app.js:6229–6406. Status: required.

**NEO-164-A** Given An open book with Alpha alpha in two chapters, bold and ordinary text runs, populated Notes, Outline and Darlings. When Enter/Shift+Enter and arrows cycle/wrap matches. Then count and scroller align current result without selecting prose. Environment: browser

### NEO-165 — Search Tab jump

- Tab from search focuses editable owner at end of current match; subsequent typing works.

Sources: app.js:6229–6406. Status: required.

**NEO-165-A** Given An open book with Alpha alpha in two chapters, bold and ordinary text runs, populated Notes, Outline and Darlings. When Tab from search focuses editable owner at end of current match. Then subsequent typing works. Environment: browser

### NEO-166 — Replace one

- Replace field Enter/button modifies current/first manuscript match, preserving surrounding marks and updating counts; no match hints.

Sources: app.js:6229–6406. Status: required.

**NEO-166-A** Given An open book with Alpha alpha in two chapters, bold and ordinary text runs, populated Notes, Outline and Darlings. When Replace field Enter/button modifies current/first manuscript match, preserving surrounding marks and updating counts. Then no match hints. Environment: browser

### NEO-167 — Replace all undo

- All replaces literal case-insensitive occurrences across chapter text nodes in single structural undo; no matches add no undo snapshot.

Sources: app.js:6229–6406. Status: required.

**NEO-167-A** Given An open book with Alpha alpha in two chapters, bold and ordinary text runs, populated Notes, Outline and Darlings. When All replaces literal case-insensitive occurrences across chapter text nodes in single structural undo. Then no matches add no undo snapshot. Environment: browser

### NEO-168 — Search close

- Escape/close clears highlights and search state; typing/open another tab refreshes stale match state safely.

Sources: app.js:6229–6406. Status: required.

**NEO-168-A** Given An open book with Alpha alpha in two chapters, bold and ordinary text runs, populated Notes, Outline and Darlings. When Escape/close clears highlights and search state. Then typing/open another tab refreshes stale match state safely. Environment: browser


## Spellcheck

### NEO-169 — Spellcheck initially off

- Open and type incorrect words; no native/custom squiggles until deliberate pass; no distracting automatic popup.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-169-A** Given Book contains misspelt tekst and normal prose; app just opened. When Type another incorrect word and wait beyond debounce. Then No native/custom underline or spelling popup appears until explicit spell pass. Environment: electron-dictionary

### NEO-170 — Toggle spell pass

- Cmd/Ctrl+; and layout fallbacks toggle current editor pass; off clears highlights and suggestion menu immediately, including pending asynchronous scan.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-170-A** Given Book contains a misspelling in current chapter and no pass enabled. When Press Cmd/Ctrl+; via native accelerator, then toggle off while dictionary response is delayed. Then Pass initially highlights current misspelling; disabling removes ranges/menu and late dictionary result cannot restore highlights. Environment: electron-dictionary

**NEO-170-B** Given A manuscript with real spelling highlights and trusted native key-event capture. When Dispatch modified ShiftSemicolon twice through webContents native events, including Alt-modified exclusion. Then Renderer logical fallback toggles spell pass exactly once per supported gesture, captures trusted Semicolon/Shift, ignores Alt and clears without changing prose. This does not prove physical OS Cmd-semicolon accelerator routing. Environment: browser-electron-layout

**NEO-170-C** Given Actual native macOS writing app in foreground with spelling initially off and misspelled prose. When Press physical Cmd+Semicolon twice through the native OS menu accelerator. Then Real spelling pass turns on once with actual dictionary highlight, then turns off with highlights cleared and exact prose preserved. Environment: Unlocked real macOS native foreground application and physical OS keyboard automation; disabled or locked-host runs remain unproved, not passing menu-callback substitutes.

### NEO-171 — Lazy chapter scans

- With pass enabled, entering chapter/tab checks current editor; editing schedules 600ms rescan without scanning entire novel each keystroke.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-171-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When With pass enabled, entering chapter/tab checks current editor. Then editing schedules 600ms rescan without scanning entire novel each keystroke. Environment: electron-dictionary

### NEO-172 — Unicode tokenization

- Accented/non-Latin apostrophe words reach dictionary intact; skip short single-letter words, uppercase acronyms/shouting, scene/ghost/flag text.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-172-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When Accented/non-Latin apostrophe words reach dictionary intact. Then skip short single-letter words, uppercase acronyms/shouting, scene/ghost/flag text. Environment: electron-dictionary

### NEO-173 — Hyphen whole-word pass

- Accepted compound underlines no pieces; rejected compound underlines invalid pieces or whole when pieces all valid.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-173-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When Accepted compound underlines no pieces. Then rejected compound underlines invalid pieces or whole when pieces all valid. Environment: electron-dictionary

### NEO-174 — Stammer treatment

- E-eu/N-não/Wh-what judges final word only when preceding short pieces prefix next segment; regular hyphenated words still checked.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-174-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When E-eu/N-não/Wh-what judges final word only when preceding short pieces prefix next segment. Then regular hyphenated words still checked. Environment: electron-dictionary

### NEO-175 — Suggestion menu

- Right-click only flagged word opens native-like suggestions positioned inside viewport; no suggestions shows disabled row plus learn action.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-175-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When Right-click only flagged word opens native-like suggestions positioned inside viewport. Then no suggestions shows disabled row plus learn action. Environment: electron-dictionary

### NEO-176 — Spelling replacement

- Choose suggestion; replace exact flagged range with selected term, preserve run styling and rescan; Undo returns misspelling.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-176-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When Choose suggestion. Then replace exact flagged range with selected term, preserve run styling and rescan; Undo returns misspelling. Environment: electron-dictionary

### NEO-177 — Learn word persistently

- Add invented name to dictionary; persists customWords, clears cached failures and equivalent Unicode variants across editors/restart.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-177-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When Add invented name to dictionary. Then persists customWords, clears cached failures and equivalent Unicode variants across editors/restart. Environment: electron-dictionary

### NEO-178 — Spell language selection

- Parameterize every SPELL_LANGUAGES menu entry including English regions and Romanian/Portuguese providers; persist successful dictionary choice.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-178-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When Parameterize every SPELL_LANGUAGES menu entry including English regions and Romanian/Portuguese providers. Then persist successful dictionary choice. Environment: electron-dictionary

### NEO-179 — Spell language failure

- Fail dictionary load through native language menu; actual previous dictionary and persisted selection remain with failure hint. Original native radio tick may stay on failed choice because automatic menu check precedes failed handler; characterize this UI bug separately from provider state.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-179-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When Fail dictionary load through native language menu Then  actual previous dictionary and persisted selection remain with failure hint. Original native radio tick may stay on failed choice because automatic menu check precedes failed handler; characterize this UI bug separately from provider state. Environment: electron-dictionary

### NEO-180 — Dictionary asynchronous races

- Change text/chapter/toggle while worker in flight; stale ranges cannot underline wrong disconnected content and typed text unaffected.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-180-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When Change text/chapter/toggle while worker in flight. Then stale ranges cannot underline wrong disconnected content and typed text unaffected. Environment: electron-dictionary

**NEO-180-B** Given A real bundled spelling worker with a queued one-hundred-thousand-word request and two chapters. When While that actual request remains pending, activate Spellcheck Pass, replace first-chapter text with hello and click a second-chapter misspelling, then await worker completion. Then Only current second-chapter wrong text is highlighted, all highlight range endpoints remain connected and both exact prose texts survive stale worker replies. Environment: electron-dictionary

### NEO-181 — Romanian Unicode spellings

- Composed/decomposed and comma/cedilla orthographies handled by native worker equivalence policy; real packaged dictionary integration required.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-181-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When Composed/decomposed and comma/cedilla orthographies handled by native worker equivalence policy. Then real packaged dictionary integration required. Environment: electron-dictionary

### NEO-182 — Portuguese compounds

- Real packaged Portuguese dictionary accepts intended accented/hyphen compounds and returns suggestions; fixture word-provider tests alone insufficient.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-182-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When Real packaged Portuguese dictionary accepts intended accented/hyphen compounds and returns suggestions. Then fixture word-provider tests alone insufficient. Environment: electron-dictionary

### NEO-183 — Notes spellcheck

- Spell pass applies Notes auxiliary editor and rescans learned words across already-scanned chapters/Notes.

Sources: app.js:6473–6712, main.js:1214–1345, spell-worker.js:1–91, spell-ro.js:1–13, scripts/spellcheck.test.js:1–80. Status: required.

**NEO-183-A** Given An open synthetic book with native spellcheck disabled, incorrect words and a real packaged dictionary ready. When Spell pass applies Notes auxiliary editor and rescans learned words across already-scanned chapters/Notes.. Then Spell pass applies Notes auxiliary editor and rescans learned words across already-scanned chapters/Notes. Environment: electron-dictionary


## Counters and goals

### NEO-184 — Story word counting

- Only story kinds count toward book; scene/ghost/markers excluded; Intl.Segmenter paths count non-space scripts appropriately.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-184-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When Only story kinds count toward book. Then scene/ghost/markers excluded; Intl.Segmenter paths count non-space scripts appropriately. Environment: browser-clock

**NEO-184-B** Given A synthetic library with all story and auxiliary roles, scene and ghost paragraphs, flags, and nonspace-script prose. When Open the book and read actual rendered count modes. Then Actual Thai, Lao, Myanmar and Khmer use Intl.Segmenter; Chinese/Japanese remain source-defined whitespace counts. Story roles count; auxiliary roles, scenes, ghosts and flags are excluded. Environment: browser-electron-layout

### NEO-185 — Book/chapter count toggle

- Click bottom word count cycles whole-book/current-chapter count; special entry name and chapter locator rendered correctly.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-185-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When Click bottom word count cycles whole-book/current-chapter count. Then special entry name and chapter locator rendered correctly. Environment: browser-clock

### NEO-186 — Selected passage count

- Select prose; bottom count reports selection word count; collapsed selection restores configured count mode.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-186-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When Select prose. Then bottom count reports selection word count; collapsed selection restores configured count mode. Environment: browser-clock

### NEO-187 — Scroll current chapter

- Scroll viewport across chapters with no focused caret change; current chapter highlight/position counter follows visible story.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-187-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When Scroll viewport across chapters with no focused caret change. Then current chapter highlight/position counter follows visible story. Environment: browser-clock

**NEO-187-B** Given Long three-chapter manuscript with caret in chapter one. When Native mousewheel in150px steps until chapter two passes forty-percent viewport threshold. Then Counter and nav current become chapter two while original caret/focus and every chapter text remain intact. Environment: Isolated real Electron on current macOS; native input/API boundaries. Physical keyboard hardware and alternate OS UI remain qualified.

### NEO-188 — Book word goal

- Set/remove goal from cover context or Goals; progress cover/chart percent clamped and persisted.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-188-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When Set/remove goal from cover context or Goals. Then progress cover/chart percent clamped and persisted. Environment: browser-clock

**NEO-188-B** Given A book has20words and a visible shelf cover. When Set word goal100, cancel the next edit, set goal10, inspect manuscript progress, then clear and reload. Then Metadata stores100 aftercancel, coverprogress20percent, clamps100percent atgoal10, clear stores0 andhidesprogress afterreload. Environment: electron-files

**NEO-188-C** Given A cover goal dialog and book with known story word count. When Set a cover goal, exceed it then clear the goal field. Then Progress clamps at one hundred percent and clearing removes the goal. Environment: browser-electron-layout

### NEO-189 — Daily goal

- Set daily goal even without open book; goal counter shows net daily delta and met indicator, no duplicate initial count.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-189-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When Set daily goal even without open book. Then goal counter shows net daily delta and met indicator, no duplicate initial count. Environment: browser-clock

**NEO-189-B** Given A bookshelf without an open book and a daily goal. When Set daily target, open a book, type two words and reopen. Then Actual two-word gain meets target and reopening does not count the words twice. Environment: browser-electron-layout

### NEO-190 — Writing day cutoff

- Change day-ends hour; controlled local clock before/after midnight/cutoff attributes counts to correct day.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-190-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When Change day-ends hour. Then controlled local clock before/after midnight/cutoff attributes counts to correct day. Environment: browser-clock

### NEO-191 — Thirty-day progress chart

- Seed dailyCounts; chart shows thirty-day values, goal and appropriate empty state without altering counts.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-191-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When Seed dailyCounts. Then chart shows thirty-day values, goal and appropriate empty state without altering counts. Environment: browser-clock

**NEO-191-B** Given Thirty seeded writing days including negative totals and missing days. When Open activity chart and inspect bars, goal and cumulative path. Then Negative daily values clamp to zero, empty days remain represented and chart keeps seeded history. Environment: browser-electron-layout

### NEO-192 — Sprint start

- Start target word sprint; counter reports words since start and target, typing remains uninterrupted.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-192-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When Start target word sprint. Then counter reports words since start and target, typing remains uninterrupted. Environment: browser-clock

### NEO-193 — Sprint completion

- Cross target exactly once; completion notice and daily counter state correct; deletion/retyping does not repeat completed sprint.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-193-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When Cross target exactly once. Then completion notice and daily counter state correct; deletion/retyping does not repeat completed sprint. Environment: browser-clock

**NEO-193-B** Given A completed sprint with daily activity recorded. When Delete and retype sprint prose, then start a fresh sprint. Then Daily activity remains recorded while fresh sprint baseline resets progress to zero. Environment: browser-electron-layout

### NEO-194 — Sprint end

- End early reports net words and elapsed rounded minutes; new sprint resets baseline.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-194-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When End early reports net words and elapsed rounded minutes. Then new sprint resets baseline. Environment: browser-clock

### NEO-195 — Goals modal close

- Done/Escape/backdrop retains edited goals/cutoff and no stacked modal; book and library settings save separately.

Sources: app.js:438–489, app.js:5532–5658, app.js:6903–6957, app.js:7056–7146. Status: required.

**NEO-195-A** Given An open book with story prose, nonstory pages, ghosts and placeholders, and controlled local writing-day clock. When Done/Escape/backdrop retains edited goals/cutoff and no stacked modal. Then book and library settings save separately. Environment: browser-clock

**NEO-195-B** Given Goal dialog with edited library and book values. When Dismiss through backdrop and reopen. Then Backdrop closes without losing persisted library or book goal edits. Environment: browser-electron-layout


## Presentation and navigation

### NEO-196 — Hover chapter pane

- Left-edge hover reveals nav; leaving hides unpinned pane; move into pane keeps it open.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-196-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Left-edge hover reveals nav. Then leaving hides unpinned pane; move into pane keeps it open. Environment: browser-electron

### NEO-197 — Hover sticky pane

- Right-edge hover reveals notes; leaving/blur/document exit closes unpinned pane without losing note edits.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-197-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Right-edge hover reveals notes. Then leaving/blur/document exit closes unpinned pane without losing note edits. Environment: browser-electron

**NEO-197-B** Given Actual unpinned side pane with an edited sticky while native writing window owns focus. When Blur the actual native BrowserWindow, then return and reopen the side pane. Then Native window blur closes the unpinned pane and keeps edited sticky persisted and visible on reopen. Environment: Real unlocked macOS native BrowserWindow focus transition; locked-host inability to activate/blur cannot count as passing proof.

### NEO-198 — Pane pinning

- Pin/unpin each panel; persisted/current pin state and page width/scroll maintained; Escape keyboard return follows original.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-198-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Pin/unpin each panel. Then persisted/current pin state and page width/scroll maintained; Escape keyboard return follows original. Environment: browser-electron

**NEO-198-B** Given A manuscript at zoom one hundred ten percent with nonzero scroll, caret and navigation/side panes. When Pin and unpin both pane regions. Then Exact caret and vertical reading anchor survive and localStorage pin values and ARIA state follow controls. Environment: browser-electron-layout

### NEO-199 — Faded controls

- Shelf/editor controls fade until hovered/focused; Brighter Interface raises visibility globally; keyboard focus still visible.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-199-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Shelf/editor controls fade until hovered/focused. Then Brighter Interface raises visibility globally; keyboard focus still visible. Environment: browser-electron

**NEO-199-B** Given Bookshelf with initially quiet shelf grip. When Move pointer away, hover shelf, then keyboard focus shelf label and cover. Then Grip opacity changes from zero to one on hover and .6 on keyboard focus; cover has visible focus outline. Environment: Isolated real Electron on current macOS; native input/API boundaries. Physical keyboard hardware and alternate OS UI remain qualified.

### NEO-200 — Page themes

- Select Night/Paper/Light; page, room, shelf/window background update and reopen retains choice.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-200-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Select Night/Paper/Light. Then page, room, shelf/window background update and reopen retains choice. Environment: browser-electron

### NEO-201 — Body fonts

- Choose bundled/platform fonts; actual font stack and CSS update preserving reading place; all expected Mac/Linux/Windows choices tested.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-201-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Choose bundled/platform fonts. Then actual font stack and CSS update preserving reading place; all expected Mac/Linux/Windows choices tested. Environment: browser-electron

**NEO-201-B** Given A macOS manuscript scrolled to a mid-book paragraph with a caret anchor. When Choose a different font from the actual native font menu. Then Font changes while preserving the mid-book visible paragraph and logical caret anchor. Environment: browser-electron-layout

### NEO-202 — Other local font picker

- Open font picker, preview on hover, accept/cancel; chosen local font persisted, cancel restores prior style.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-202-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Open font picker, preview on hover, accept/cancel. Then chosen local font persisted, cancel restores prior style. Environment: browser-electron

### NEO-203 — Dropcap styles

- Literary/Fantasy/Sci-Fi/Off; first eligible chapter prose letter and dialogue-opening spacing match original.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-203-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Literary/Fantasy/Sci-Fi/Off. Then first eligible chapter prose letter and dialogue-opening spacing match original. Environment: browser-electron

**NEO-203-B** Given An open drop-cap paragraph with a real caret and a following prose paragraph. When Move and type repeatedly in the first paragraph, move to the next, then return. Then Drop cap stays suppressed during first-paragraph editing, returns when editing the next paragraph and suppresses again on return. Environment: browser-electron-layout

**NEO-203-C** Given Chapter openings with leading poetry, em-dash dialogue and ordinary prose. When Render each opening style, inspect actual first-letter size/dialogue indent and save. Then Poetry skips ordinary opening decoration, prose cap and dialogue indentation use source metrics and runtime speech/cap attributes never leak to disk. Environment: browser-electron-layout

### NEO-204 — Text size bounds

- Cmd/Ctrl plus/minus clamps 14..22 from default17; keeps reading place; logical non-US layout shortcuts trigger once.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-204-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Cmd/Ctrl plus/minus clamps 14..22 from default17. Then keeps reading place; logical non-US layout shortcuts trigger once. Environment: browser-electron

**NEO-204-B** Given A macOS writing page at a known text size and zoom. When Use native plus/minus and alternate logical/layout chords repeatedly including limits. Then Each gesture changes once, preserving expected clamping at supported bounds. Environment: browser-electron-layout

**NEO-204-C** Given A manuscript with a mid-book anchor. When Adjust native font size and perform one Ctrl-wheel zoom event. Then Font-size change preserves anchor; wheel applies one exponential zoom step with retained caret and persisted state. Environment: browser-electron-layout

### NEO-205 — Reset typography zoom

- Cmd/Ctrl+0 resets text17 and page zoom1 without discarding interface size/body font.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-205-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Cmd/Ctrl+0 resets text17 and page zoom1 without discarding interface size/body font.. Then Cmd/Ctrl+0 resets text17 and page zoom1 without discarding interface size/body font. Environment: browser-electron

**NEO-205-B** Given A writing page with customized interface scale and body font and changed text/page zoom. When Activate the actual native Reset menu item. Then Page/text scale reset while interface scale and selected body font persist. Environment: browser-electron-layout

**NEO-205-C** Given Native manuscript uses Jost body font, interface150 percent, text size changed and page zoom enlarged. When Physical Cmd+0 invokes actual native Reset Text Size accelerator. Then Actual text size becomes17 and page zoom1 while Jost/interface150 percent and prose/caret remain preserved. Environment: Unlocked real macOS native foreground application and physical OS keyboard automation; disabled or locked-host runs remain unproved, not passing menu-callback substitutes.

### NEO-206 — Page zoom controls

- Buttons +/-0.1, percentage reset, zoom-control wheel and Ctrl/pinch wheel scale page independently, clamp0.75..3, preserve visible reading/caret anchor, and persist after600ms.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-206-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Buttons +/-0.1, percentage reset, zoom-control wheel and Ctrl/pinch wheel scale page independently, clamp0.75..3, preserve visible reading/caret anchor, and persist after600ms.. Then Buttons +/-0.1, percentage reset, zoom-control wheel and Ctrl/pinch wheel scale page independently, clamp0.75..3, preserve visible reading/caret anchor, and persist after600ms. Environment: browser-electron

**NEO-206-B** Given A manuscript at known zoom with a real caret. When Send one Ctrl-wheel step with delta producing exponent point two. Then Page zoom follows exp(0.2) once and persists while preserving logical caret. Environment: browser-electron-layout

### NEO-207 — Interface zoom

- Menu 100/125/150/200/250/300 percent scales controls separately from manuscript page and persists menu tick.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-207-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Menu 100/125/150/200/250/300 percent scales controls separately from manuscript page and persists menu tick.. Then Menu 100/125/150/200/250/300 percent scales controls separately from manuscript page and persists menu tick. Environment: browser-electron

### NEO-208 — Paragraph alignment

- Format menu/shortcut sets every selected paragraph left/center/right/justify; style persists and exports; scene/poetry edge follows original.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-208-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Format menu/shortcut sets every selected paragraph left/center/right/justify. Then style persists and exports; scene/poetry edge follows original. Environment: browser-electron

### NEO-209 — Typewriter scrolling

- Toggle; keyboard selection/input centers caret, mouse selection avoids involuntary recenter; final page has only needed trailing space.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-209-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Toggle. Then keyboard selection/input centers caret, mouse selection avoids involuntary recenter; final page has only needed trailing space. Environment: browser-electron

### NEO-210 — Focus paragraph

- Paragraph focus dims surrounding manuscript and tracks the caret. Switching to auxiliary tabs or a selection without a paragraph leaves the previous focus state because updateFocus returns early; do not assert a nonexistent automatic clear.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-210-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Paragraph focus dims surrounding manuscript, tracks caret and skips break lines. Then Paragraph focus dims surrounding manuscript and tracks the caret. Switching to auxiliary tabs or a selection without a paragraph leaves the previous focus state because updateFocus returns early; do not assert a nonexistent automatic clear. Environment: browser-electron

**NEO-210-B** Given Focus mode Off in an open manuscript with multiple sentences and a Notes tab. When Cycle actual native menu Off→Paragraph→Sentence→Off, switching to Notes while Sentence is active. Then Paragraph then sentence highlights and checked menu values match the source order; Notes retains manuscript sentence focus until Off clears it. Environment: browser-electron-layout

### NEO-211 — Focus sentence

- Sentence focus tracks manuscript sentence punctuation/caret; switching to auxiliary tabs retains previous manuscript focus because updateFocus returns early. Cycling Off/Paragraph/Sentence and native menu ticks agree.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-211-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Sentence focus range tracks current sentence punctuation/caret. Then Sentence focus tracks manuscript sentence punctuation/caret; switching to auxiliary tabs retains previous manuscript focus because updateFocus returns early. Cycling Off/Paragraph/Sentence and native menu ticks agree. Environment: browser-electron

**NEO-211-B** Given Focus mode Off in an open manuscript with multiple sentences and a Notes tab. When Cycle actual native menu Off→Paragraph→Sentence→Off, switching to Notes while Sentence is active. Then Paragraph then sentence highlights and checked menu values match the source order; Notes retains manuscript sentence focus until Off clears it. Environment: browser-electron-layout

### NEO-212 — Fullscreen

- Cmd+Shift+F/Ctrl+Shift+F and Cmd/Ctrl+Enter toggle; Escape exits fullscreen first, then shelf if already windowed.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660, app.js:2448–2457, app.js:2918–2926, app.js:3007–3040, app.js:4171–4177, main.js:555–561. Status: required.

**NEO-212-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Cmd+Shift+F/Ctrl+Shift+F and Cmd/Ctrl+Enter toggle. Then Escape exits fullscreen first, then shelf if already windowed. Environment: browser-electron

**NEO-212-B** Given Actual macOS BrowserWindow with editable manuscript owns native foreground focus. When Physical Cmd+Shift+F toggles native fullscreen; Escape exits; physical Cmd+Enter toggles fullscreen on and off. Then Actual BrowserWindow fullscreen flags follow each source shortcut, caret/prose remain intact, and window returns from native fullscreen. Environment: Unlocked real macOS native foreground application and physical OS keyboard automation; disabled or locked-host runs remain unproved, not passing menu-callback substitutes.

**NEO-212-D** Given An actual foreground native writing window with one Original prose. paragraph and author caret at its end. When Use real platform Meta/Ctrl+Enter twice and observe actual BrowserWindow fullscreen flags and manuscript structure; candidate then types X, performs native Undo/Redo and saves. Then Original modified Enter is handled as author input before the later fullscreen shortcut: first press splits into two paragraphs, second creates three paragraphs with a *** scene. This defect is explicitly characterized. Candidate toggles genuine fullscreen on/off while preserving one paragraph and zero scenes; subsequent Original prose.X typing, Undo/Redo and exact persisted HTML remain independent and correct. Environment: Real isolated signed Electron native foreground/fullscreen state and trusted keyboard input. Contract-output source defect characterization; physical OS accelerator proof remains separately required by B.

### NEO-213 — Fullscreen focus bottom bar

- Fullscreen with focus hides the bottom bar until pointer hover. Characterize the original CSS specificity defect that keeps keyboard-focused tabs invisible; candidate must wake the bar on actual focus-visible keyboard navigation while preserving pointer hide/hover, prose and Escape behavior.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660, styles.css:1016–1020, styles.css:1196–1199. Status: required.

**NEO-213-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Combine source fullscreen/focus presentation and move pointer outside and over bottom bar. Then Pointer-away bar hides and hover restores it without changing author prose. Actual keyboard focus visibility defect and its candidate correction are separately exercised by B. Environment: browser-electron

**NEO-213-B** Given Actual signed native writing window owns focus with native fullscreen active and native Paragraph focus mode; pointer is away from bottom bar and no attention state is present. When Click actual manuscript, use genuine F6 three times to focus the active bottom-bar tab, observe actual focus-visible and opacity, then Escape to manuscript and out of actual fullscreen. Then Original CSS specificity leaves genuinely keyboard-focused bar at opacity0; source defect is separately characterized. Candidate bar opacity is1 while tab remains focus-visible without hover or attention. Actual manuscript focus, native fullscreen exit, editor visibility and exact prose remain intact; pointer hide/hover is separately preserved by A. Environment: Real isolated signed macOS Electron foreground window; native menu/main fullscreen state, CDP focus emulation disabled, actual keyboard/pointer interaction and source contract-output oracle.

### NEO-214 — Escape route

- Visible search closes first; visible modal owns Escape; Vim navigation Escape stays put; ordinary editor returns bookshelf after save.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-214-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Visible search closes first. Then visible modal owns Escape; Vim navigation Escape stays put; ordinary editor returns bookshelf after save. Environment: browser-electron

**NEO-214-B** Given Actual native writing window with retained caret and fullscreen/help context. When Use physical OS help/fullscreen keys and Escape through the active native application. Then Escape follows source-specific help or fullscreen route while retained author caret/prose remain exact. Environment: Unlocked real macOS native foreground application and physical OS keyboard automation; disabled or locked-host runs remain unproved, not passing menu-callback substitutes.

### NEO-215 — Resume reading position

- Leave/reopen book; chapter/paragraph/text offset/scroll restored with clamping for edited/deleted content.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-215-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Leave/reopen book. Then chapter/paragraph/text offset/scroll restored with clamping for edited/deleted content. Environment: browser-electron

**NEO-215-B** Given A stored reading position with out-of-range paragraph/offset and a legacy scroll-only variant. When Open each saved book, inspect restored caret/scroll and type at the clamped caret. Then Invalid indices clamp to final paragraph/end, legacy scroll does not corrupt text and typing enters the actual restored location. Environment: browser-electron-layout

### NEO-216 — Keyboard shortcut help

- Cmd/Ctrl+/ and alternative layouts open dynamic localized help; Escape/click closes, restores selection/focus, repeated shortcut avoids overlays.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-216-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Cmd/Ctrl+/ and alternative layouts open dynamic localized help. Then Escape/click closes, restores selection/focus, repeated shortcut avoids overlays. Environment: browser-electron

**NEO-216-B** Given A manuscript with a known caret and unchanged prose. When Dispatch modified question-mark native input repeatedly, then Escape. Then Logical fallback opens one shortcut-help dialog and Escape restores exact caret and prose; physical OS NSMenu invocation remains separately qualified. Environment: browser-electron-layout

**NEO-216-C** Given Actual macOS writing app owns foreground focus and a retained author caret. When Physical Cmd+/ opens shortcut help; native Escape dismisses; native X types at restored caret. Then One actual help dialog opens, closes and returns exact caret so visible/disk prose contains X at the original insertion location. Environment: Unlocked real macOS native foreground application and physical OS keyboard automation; disabled or locked-host runs remain unproved, not passing menu-callback substitutes.

### NEO-217 — Dialog keyboard ownership

- Dialog keyboard ownership, initial focus, closing and focus return follow each source-defined family. Characterize ordinary Tab order and the explicit shortcuts two-control trap; no universal Enter-submit or Escape-cancel rule is presumed. Original unnamed update notices and onboarding autofocus timing are separately characterized.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660, app.js:7250–7260, app.js:3883–3891. Status: required.

**NEO-217-A** Given The synthetic original and candidate desktop fixtures are in the state named by this requirement. When Visible dialogs consume their Escape/Enter and suppress ordinary editor/global commands Then  proper dialog role, initial focus and focus-return behaviour provided, while actual Tab wrap must be characterized per dialog rather than assumed globally. Environment: browser-electron

**NEO-217-B** Given Actual choice and ask-input workflow dialogs. When Native Tab and Escape operate while dialogs own focus. Then Dialog controls receive input and modal closes without activating writing shortcuts. Environment: Isolated real Electron on current macOS; native input/API boundaries. Physical keyboard hardware and alternate OS UI remain qualified.

**NEO-217-C** Given Actual onboarding, input, choices, content/title sheets, cover settings, goals/sprint, installed fonts, shortcuts, email-method, update-release and About workflows. When Drive each source-defined initial focus, ordinary Tab/ShiftTab path, focused-button Enter and its own cancel/save/dismiss action. Then Source keyboard semantics remain exact: ordinary dialogs have no universal Tab trap or Enter submit; shortcuts explicitly cycle reference/Done; email-method Escape leaves chooser open; Goals Escape saves; Cover settings Escape cancels. First-run initial autofocus race is characterized, not an unconditional focus guarantee. Update notices are handled separately by scenario D. Environment: Real isolated Electron and installed-font API; source-defined HTTP/updater host boundaries; no mail or credential mutations.

**NEO-217-D** Given Actual current-version or error update notice with explicit dialog role and visible heading; original generic dialogify skips name derivation because role exists. When Characterize original empty accessible name and actual OK focus/Enter/Escape/draft retention; exercise candidate notice naming through its existing heading. Then Original empty-name defect is preserved as separate baseline characterization. Candidate assigns its visible heading as accessible name and retains exact dismissal/focus/draft behavior, proved with a source-derived contract-output oracle. Environment: Real isolated Electron update handler and deterministic HTTP boundary; original source-name defect explicitly distinguished from target improvement.

**NEO-217-E** Given Genuine installed-font chooser search is focused over an open manuscript, with Georgia filtering and actual native fullscreenEscape replies. When Press font search Escape and await a deliberate later genuine fullscreenEscape IPC barrier. Observe actual call counts, native replies, displayed view, focus and persisted prose. Then Original input Escape removes font dialog but bubbles to global Escape: two genuine false replies including the barrier and actual shelf fallthrough are characterized. Candidate consumes font-dialog Escape, makes only the barrier request, retains editor/focus/prose and saved Georgia. This is a contract-output improvement, not a claim that original retained the editor. Environment: Real isolated Electron native input, real renderer layout/installed fonts, actual callback/IPC timing boundaries; no fabricated document, caret or postcondition.

### NEO-218 — High contrast and reduced motion

- System contrast boosts readability; reduced-motion uses instant scrolling/transitions; preference changes apply without restart.

Sources: app.js:4754–4848, app.js:6712–6893, app.js:7146–7357, styles.css:1–160, main.js:1530–1660. Status: required.

**NEO-218-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When System contrast boosts readability. Then reduced-motion uses instant scrolling/transitions; preference changes apply without restart. Environment: browser-electron


## Vim mode

### NEO-219 — Vim preference/modes

- Enable View Vim Keys; Escape enters gold navigation, repeated Escape stays; i returns insert; disable clears navigation/visual state.

Sources: app.js:4000–4209, app.js:3918–4214. Status: required.

**NEO-219-A** Given An open long chapter with wrapped paragraphs and punctuation, plus Notes; Vim is initially disabled. When Enable View Vim Keys. Then Escape enters gold navigation, repeated Escape stays; i returns insert; disable clears navigation/visual state. Environment: browser-layout

### NEO-220 — Vim character/line motions

- h/l/space/Backspace and j/k/Enter move without typing; cannot move across noneditable protected page unexpectedly.

Sources: app.js:4000–4209, app.js:3918–4214. Status: required.

**NEO-220-A** Given An open long chapter with wrapped paragraphs and punctuation, plus Notes; Vim is initially disabled. When h/l/space/Backspace and j/k/Enter move without typing. Then cannot move across noneditable protected page unexpectedly. Environment: browser-layout

**NEO-220-B** Given A Vim-enabled manuscript in normal mode. When Use aliases and counts exceeding the cap, send an unknown key and repeat Escape. Then Supported aliases work, counts clamp to the implemented limit, unknown keys do not mutate prose and Escape consistently resets command state. Environment: browser-electron-layout

**NEO-220-C** Given A Vim manuscript with protected generated Contents between story chapters and caret at start of the third. When Use backward k and paragraph movement across the Contents edge. Then Caret never enters editable hidden Contents; actual author caret, generated TOC and story prose stay intact. Environment: browser-electron-layout

### NEO-221 — Vim word motions

- w/b/e treat letters/numbers/underscore/apostrophe, punctuation and whitespace classes appropriately; cross-paragraph edge preserved.

Sources: app.js:4000–4209, app.js:3918–4214. Status: required.

**NEO-221-A** Given An open long chapter with wrapped paragraphs and punctuation, plus Notes; Vim is initially disabled. When w/b/e treat letters/numbers/underscore/apostrophe, punctuation and whitespace classes appropriately. Then cross-paragraph edge preserved. Environment: browser-layout

**NEO-221-B** Given Vim prose containing Alpha_2, apostrophized words, ellipsis punctuation and a Unicode next paragraph. When Use w, b and e commands from known offsets across words and paragraph seams. Then Caret reaches exact source-defined word edges across identifiers, apostrophes, punctuation and Unicode without mutating prose. Environment: browser-electron-layout

### NEO-222 — Vim line/sentence/paragraph motions

- 0/^/$, (,),{,} move caret by correct browser layout units; paragraph/line edge enters next/previous chapter.

Sources: app.js:4000–4209, app.js:3918–4214. Status: required.

**NEO-222-A** Given An open long chapter with wrapped paragraphs and punctuation, plus Notes; Vim is initially disabled. When 0/^/$, (,),{,} move caret by correct browser layout units. Then paragraph/line edge enters next/previous chapter. Environment: browser-layout

**NEO-222-B** Given Vim prose with several sentences, paragraphs and chapter edges. When Use sentence and paragraph movement commands through actual native key events including chapter boundaries. Then Caret follows source-defined sentence/paragraph destinations and chapter-edge fallback without changing text. Environment: browser-electron-layout

### NEO-223 — Vim chapter motions

- gg/G moves beginning/end chapter; [[/]] previous/next chapter; boundaries clamp.

Sources: app.js:4000–4209, app.js:3918–4214. Status: required.

**NEO-223-A** Given An open long chapter with wrapped paragraphs and punctuation, plus Notes; Vim is initially disabled. When gg/G moves beginning/end chapter. Then [[/]] previous/next chapter; boundaries clamp. Environment: browser-layout

### NEO-224 — Vim counts

- 3w/12j and pending g/[ sequences repeat up to cap999; bare0 remains line start; unknown key does not type.

Sources: app.js:4000–4209, app.js:3918–4214. Status: required.

**NEO-224-A** Given An open long chapter with wrapped paragraphs and punctuation, plus Notes; Vim is initially disabled. When 3w/12j and pending g/[ sequences repeat up to cap999. Then bare0 remains line start; unknown key does not type. Environment: browser-layout

### NEO-225 — Vim half-page

- Ctrl+d/Ctrl+u scrolls half paper viewport; caret follows centre hit-tested position; normal Cmd/Ctrl app shortcuts retain their roles.

Sources: app.js:4000–4209, app.js:3918–4214, app.js:4037–4059. Status: required.

**NEO-225-A** Given A long wrapped manuscript with Vim enabled; any preceding ]] chapter-jump smooth scrolling has completed and ten consecutive actual animation-frame scroll positions are stable before gg and half-page motion. When Use actual Vim gg then native Ctrl+d/Ctrl+u against settled manuscript layout; wait for completed motion before reading final geometry. Then Caret follows the actual centre hit-tested editor position with final vertical centre distance under40px; exact manuscript prose stays intact. Rapid/noneditor midpoint guard behavior is separately characterized by B. Environment: browser-layout

**NEO-225-B** Given Short and long actual Vim manuscripts with rapid half-page native inputs. When Drive native Ctrl+d/u and observe the actual unmodified document.caretRangeFromPoint midpoint hit and pre/post native selection. Then Each command queries midpoint once. If browser returns an editor hit, actual author selection equals that hit; if null or noneditor, original selection stays unchanged. Exact manuscript text remains intact. Ordinary settled half-page centering is separately tested by A. Environment: Real isolated Electron native input, real renderer layout/installed fonts, actual callback/IPC timing boundaries; no fabricated document, caret or postcondition.

### NEO-226 — Vim insertion positions

- i/a/I/A resume typing here/after/start/end line; o/O create normal paragraph below/above.

Sources: app.js:4000–4209, app.js:3918–4214. Status: required.

**NEO-226-A** Given An open long chapter with wrapped paragraphs and punctuation, plus Notes; Vim is initially disabled. When i/a/I/A resume typing here/after/start/end line. Then o/O create normal paragraph below/above. Environment: browser-layout

**NEO-226-B** Given A Vim normal-mode manuscript with a known caret in prose. When Independently execute i, a, I, A, o and O, type text and leave insertion mode. Then Each command inserts at its intended character or paragraph position with exact prose and caret results. Environment: browser-electron-layout

### NEO-227 — Vim visual selection

- v toggles visual; motions extend inclusively; y copies then collapses start, d/x cuts and exits visual with recoverable native undo.

Sources: app.js:4000–4209, app.js:3918–4214. Status: required.

**NEO-227-A** Given An open long chapter with wrapped paragraphs and punctuation, plus Notes; Vim is initially disabled. When v toggles visual. Then motions extend inclusively; y copies then collapses start, d/x cuts and exits visual with recoverable native undo. Environment: browser-layout

**NEO-227-B** Given Vim normal mode with a passage spanning a reversible real selection. When Create reverse visual selection and yank, toggle or cancel visual mode, then cut with x/Delete and Undo. Then Clipboard contains exact selection, mode transitions clear visual state and destructive edits restore through history. Environment: browser-electron-layout

### NEO-228 — Vim delete/find

- x/Delete removes next character or counted characters; plain d without visual does not unexpectedly delete; / opens search and exits navigation.

Sources: app.js:4000–4209, app.js:3918–4214. Status: required.

**NEO-228-A** Given An open long chapter with wrapped paragraphs and punctuation, plus Notes; Vim is initially disabled. When x/Delete removes next character or counted characters. Then plain d without visual does not unexpectedly delete; / opens search and exits navigation. Environment: browser-layout

**NEO-228-B** Given Vim manuscript with emoji, combining marks and joined glyphs. When Use actual Vim x on a rendered grapheme, Undo/Redo and persisted reopen. Then Native forward-delete removes one complete grapheme without malformed Unicode, preserves exact Undo/Redo and persisted output. Original Chromium execCommand forwardDelete and candidate deletion are independently exercised. Environment: Isolated actual Electron UI and persistence; original defects explicitly characterized where present.

### NEO-229 — Vim Notes and IME

- Same supported movement in Notes; composition bypasses Vim; native modified shortcuts not swallowed.

Sources: app.js:4000–4209, app.js:3918–4214. Status: required.

**NEO-229-A** Given An open long chapter with wrapped paragraphs and punctuation, plus Notes; Vim is initially disabled. When Same supported movement in Notes. Then composition bypasses Vim; native modified shortcuts not swallowed. Environment: browser-layout

**NEO-229-B** Given Vim normal mode active in Notes containing Note. When Drive actual Chromium composition and commit of かな, then use 0, a and native X insertion before disabling Vim. Then Composition yields Noteかな once without losing vim-nav; navigation/insertion gives NXoteかな and disabling clears Vim mode. Physical OS candidate UI remains separately qualified. Environment: browser-electron-layout


## Persistence and synchronization

### NEO-230 — Plain-file layout

- Actual library/book metadata JSON, chapter HTML, notes aux HTML and darlings/stickies JSON are readable and compatible with existing NEO libraries.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-230-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Actual library/book metadata JSON, chapter HTML, notes aux HTML and darlings/stickies JSON are readable and compatible with existing NEO libraries.. Then Actual library/book metadata JSON, chapter HTML, notes aux HTML and darlings/stickies JSON are readable and compatible with existing NEO libraries. Environment: electron-files-clock

### NEO-231 — Continuous autosave

- Type/edit metadata/Notes/stickies; debounce writes correct book/chapter; immediate shelf switch, window blur, visibility hidden and close flush all pending saves.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67, app.js:2156–2171, app.js:6069–6106. Status: required.

**NEO-231-A** Given Real temporary library open and separate Notes/sticky text editable. When Type draft and notes, then immediately switch shelf/blur/close in separate cases; reopen app. Then Every just-typed character exists in correct chapter/auxiliary/sticky file of original book; no pending save writes into newly selected book. Environment: electron-files-clock

**NEO-231-B** Given A chapter with an empty paragraph, italic Alpha and an atomic flag connected to Original note. When Type into the empty paragraph, press Enter, leave to the shelf, inspect the actual chapter file and reopen. Then Disk and reopened paragraphs are Typed, empty, Alpha⚑; emphasis, flag ID, noneditable status and note association survive without PM helper artifacts. Environment: electron-files

**NEO-231-C** Given An open story with its caret at the end. When Type a tail and close the host immediately, restart and reopen. Then Actual chapter file and reopened manuscript include the just-typed tail. Environment: electron-files

**NEO-231-D** Given Existing saved position at offset2; book open queues actual native frame callbacks while author types X at offset9 before resume delivery. When Hold actual native requestAnimationFrame callbacks, type X, then deliver callbacks in registration order, observe actual caret and type Y; save and exercise Undo/Redo. Then Original source moves author caret10 back to saved2 and yields InYitial. X. Candidate cancels stale queued open resume after actual author input and keeps caret10 and contiguous Initial. XY with exact disk/history. Original defect characterization and candidate contract-output proof stay separate. Environment: Real isolated Electron native input, real renderer layout/installed fonts, actual callback/IPC timing boundaries; no fabricated document, caret or postcondition.

### NEO-232 — Serialized chapter writes

- Delay older host writes then newer writes; final disk content newest; stale async result cannot overwrite saved baseline.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-232-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Delay older host writes then newer writes. Then final disk content newest; stale async result cannot overwrite saved baseline. Environment: electron-files-clock

### NEO-233 — Daily ZIP backups

- Launch with controlled UTC date; one ZIP per UTC day, latest14 retained, Backups/Exports excluded along with Finder/iCloud placeholders; inspect archive prose and metadata.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-233-A** Given The synthetic original and candidate desktop fixtures are in the state named by this requirement. When Launch with controlled UTC date Then  one ZIP per UTC day, latest14 retained, Backups/Exports excluded along with Finder/iCloud placeholders; inspect archive prose and metadata. Environment: electron-files-clock

**NEO-233-B** Given A real library at controlled UTC late day with first-day prose. When Launch to back up, alter prose, relaunch same day, then launch after UTC rollover. Then One real first-day ZIP remains unchanged and a second-day ZIP captures changed prose exactly once. Environment: electron-files

### NEO-234 — Partial backup failure

- Make one input unreadable; backup retains readable books and missed-file report rather than abandoning entire daily backup.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-234-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Make one input unreadable. Then backup retains readable books and missed-file report rather than abandoning entire daily backup. Environment: electron-files-clock

### NEO-235 — Single-instance safety

- Start second desktop process; first focuses and second cannot independently edit shared library.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-235-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Start second desktop process. Then first focuses and second cannot independently edit shared library. Environment: electron-files-clock

**NEO-235-B** Given A minimized original native writer with a loaded book. When Start a second isolated Electron process using the same private profile. Then Second process exits zero, the original window restores/focuses and only one editor retains its prose. Environment: Real isolated macOS second-instance launch and native restore/focus; locked host cannot satisfy focus proof.

### NEO-236 — Read errors preserve words

- Missing or unreadable chapter reads return empty through the main-process catch without a promised log. Refresh guards keep incoming empty/unreadable content from replacing a nonempty draft; refresh exceptions use console.error rather than a guaranteed neo-errors.log record.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-236-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Missing/unreadable/downloading-empty files never silently replace nonempty current draft. Then Incoming empty/unreadable content does not silently overwrite a nonempty draft. Read failure and refresh error behavior are characterized without inventing file-log or repeated-notice guarantees. Environment: electron-files-clock

### NEO-237 — External text adoption

- Externally change saved unmodified chapter then focus/periodic refresh; adopt disk text, maintain caret/scroll and notify once.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-237-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Externally change saved unmodified chapter then focus/periodic refresh. Then adopt disk text, maintain caret/scroll and notify once. Environment: electron-files-clock

**NEO-237-B** Given A hundred-paragraph manuscript with distant caret and nonzero scroll. When Externally change an early paragraph and request refresh twice while observing adoption messages. Then Changed text is adopted once, exact distant caret/scroll survive and only one adoption toast occurs. Environment: electron-files

### NEO-238 — External drops recovery

- External copy only removes prose; adopt it but full replaced local chapter retained as Darling.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-238-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When External copy only removes prose. Then adopt it but full replaced local chapter retained as Darling. Environment: electron-files-clock

### NEO-239 — Concurrent text conflict

- Unsaved local and disk edits differ; retain local chapter, append incoming conflict chapter after it with timestamp title; persist both.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-239-A** Given Saved Alpha chapter has unsaved local Beta and externally written Gamma. When Trigger window focus refresh with controlled delayed reads. Then Local Beta remains; incoming Gamma becomes a persisted adjacent conflict chapter with explanatory title; neither text lost. Environment: electron-files-clock

### NEO-240 — External structure adoption

- Add/rename/reorder/remove chapters on disk; safe adopt order/kinds/title/side metadata; unsaved local text chapter preserved.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-240-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Add/rename/reorder/remove chapters on disk. Then safe adopt order/kinds/title/side metadata; unsaved local text chapter preserved. Environment: electron-files-clock

**NEO-240-B** Given An open Outline tab and external metadata/stickies/Darlings fixtures. When Externally change title, subtitle, author, tab labels, chapter note and side datasets, then refresh. Then Actual fields, labels, Outline and side datasets adopt remote values while manuscript file remains intact. Environment: electron-files

### NEO-241 — Concurrent structure merge

- Local and disk structures change; merge incoming nonempty chapters without dropping local content; stale structural undo cleared.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-241-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Local and disk structures change. Then merge incoming nonempty chapters without dropping local content; stale structural undo cleared. Environment: electron-files-clock

### NEO-242 — Refresh/write crossing race

- Local library/chapter save crosses async read; discard stale incoming read; author typing during refresh never lost.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-242-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Local library/chapter save crosses async read. Then discard stale incoming read; author typing during refresh never lost. Environment: electron-files-clock

### NEO-243 — Changed-book refresh race

- Switch book during delayed refresh; incoming chapter/side data from old book cannot attach to new book.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-243-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Switch book during delayed refresh. Then incoming chapter/side data from old book cannot attach to new book. Environment: electron-files-clock

**NEO-243-B** Given Two books with distinct side files and an external first-book metadata change. When Delay actual json:read reply while refreshing first book, then immediately open second book. Then Delayed first-book stickies/Darlings never replace second-book own data in DOM or files. Environment: electron-files

### NEO-244 — Remote resume position

- Newer other-device caret only adopted after local inactivity and incoming paragraph arrival or timeout; active local typing/modal blocks jump.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-244-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Newer other-device caret only adopted after local inactivity and incoming paragraph arrival or timeout. Then active local typing/modal blocks jump. Environment: electron-files-clock

### NEO-245 — Focus/visibility polling

- Window focus and visibility/periodic refresh invoke safe sync while preserving shelf scroll and open book identity.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-245-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Window focus and visibility/periodic refresh invoke safe sync while preserving shelf scroll and open book identity.. Then Window focus and visibility/periodic refresh invoke safe sync while preserving shelf scroll and open book identity. Environment: electron-files-clock

**NEO-245-B** Given Ten shelves with nonzero bookshelf scroll and a stable last-shelf ID. When Externally rename the last shelf in library.json and refresh. Then New name appears while exact nonzero scroll and shelf identity remain stable. Environment: electron-files

### NEO-246 — Legacy HTML cleanup

- Open old NBSP/marker/spelling wrappers and normalize saved content without corrupting actual spaces/poetry/marks.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-246-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Open old NBSP/marker/spelling wrappers and normalize saved content without corrupting actual spaces/poetry/marks.. Then Open old NBSP/marker/spelling wrappers and normalize saved content without corrupting actual spaces/poetry/marks. Environment: electron-files-clock

**NEO-246-B** Given Stored formatted paragraph HTML has structural formatting whitespace and author inline whitespace. When Open manuscript, edit and save then reopen. Then Formatting between paragraph tags creates no extra visible paragraphs; intentional inline author whitespace is preserved exactly. Environment: Isolated actual Electron UI and persistence; original defects explicitly characterized where present.

### NEO-247 — Error notification/log

- Renderer/runtime/write error reaches neo-errors.log; first error hint avoids repeated disruption and no successful save claim on failed write.

Sources: app.js:5658–6106, main.js:186–418, main.js:1057–1127, CONTRIBUTING.md:22–32, README.md:59–67. Status: required.

**NEO-247-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Renderer/runtime/write error reaches neo-errors.log. Then first error hint avoids repeated disruption and no successful save claim on failed write. Environment: electron-files-clock


## Import and export

### NEO-248 — Import picker and drop

- Import multiple .docx/.txt/.md via native picker or file drop; cancel/no files safe; each valid book added first shelf of the active author for picker imports; explicit target shelf for file drops.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-248-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Import multiple .docx/.txt/.md via native picker or file drop. Then cancel/no files safe; each valid book added selected shelf. Environment: electron-files

**NEO-248-B** Given An existing book and isolated .txt/.md/.docx fixtures are on disk. When Cancel nativepicker; pick allthreefiles; create second shelf and drop the disk-backed files there; tryunsupportedPNG. Then Cancel createsnone; picker usesfirstactiveauthorshelf; explicitdrop targetgets3; inputbytesremainunchanged; unsupportedfilehint and reloadplacementpersist. Environment: electron-files

### NEO-249 — Import rich DOCX

- Read word/document.xml and inherited styles; bold/italic runs/headings/title/page breaks translated without phantom formatting.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-249-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Read word/document.xml and inherited styles. Then bold/italic runs/headings/title/page breaks translated without phantom formatting. Environment: electron-files

**NEO-249-B** Given A DOCX contains inherited italicstyle, explicititalic-off run, Title/Heading1 lines and pagebreakBefore. When Importthroughnativepicker andopenresult. Then Adjacent inheriteditalicrunsmerge, explicititalic-off remainsplain; chapter/pagebreak/title tabsbecome threecorrectentries andoriginalinputbytesunchanged. Environment: electron-files

### NEO-250 — Import text Markdown

- Paragraph blank-line splitting and Markdown emphasis translate; text title/byline harvested only when heuristic matches.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-250-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Paragraph blank-line splitting and Markdown emphasis translate. Then text title/byline harvested only when heuristic matches. Environment: electron-files

### NEO-251 — Import chapter headings

- Localized chapter/prologue/epilogue, Markdown headings and repeated Arabic/Roman/spelled numeral ladders detected; sentence-like Part of me stays prose.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-251-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Localized chapter/prologue/epilogue, Markdown headings and repeated Arabic/Roman/spelled numeral ladders detected. Then sentence-like Part of me stays prose. Environment: electron-files

**NEO-251-B** Given Plain-textfixtures containArabic,spelled andlocalizedheadingladders plusisolatednumber/sentencefalsepositives. When Importallfixtures throughnativepicker andopeneach. Then Localizedheadings splitcomplete first/lastchapters; isolatedSeven,Partofme,RussianЧастьsentence,CapitolHill remainordinaryprose. Environment: electron-files

### NEO-252 — Import heading refinement

- Consecutive headings without prose refine chapter title, not empty chapters; genuine paragraph/page boundary retained.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-252-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Consecutive headings without prose refine chapter title, not empty chapters. Then genuine paragraph/page boundary retained. Environment: electron-files

### NEO-253 — Import scene markers

- Supported star/hash/bullet/tilde/fleuron/dash marker-only lines become scene breaks, no extra body words.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-253-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Supported star/hash/bullet/tilde/fleuron/dash marker-only lines become scene breaks, no extra body words.. Then Supported star/hash/bullet/tilde/fleuron/dash marker-only lines become scene breaks, no extra body words. Environment: electron-files

**NEO-253-B** Given A plaintextfixture hasmarker-onlystar/hash/bullet/tilde/fleuron/em/en/hyphenseparators betweenrealparagraphs. When Importfixture andopenitsmanuscript. Then Every supportedmarkerbecomes exactlyone actualscene-breakparagraph withliteral***; allinterveningprose staysordered. Environment: electron-files

### NEO-254 — Import page-break heuristic

- Many tiny chapters from overused DOCX page breaks rerun heading-only; meaningful headings/prose all survive.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-254-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Many tiny chapters from overused DOCX page breaks rerun heading-only. Then meaningful headings/prose all survive. Environment: electron-files

**NEO-254-B** Given A real DOCX fixture with ten page-break-before paragraphs and two Heading1 paragraphs. When Import through the native picker and open the resulting book. Then Heading-only fallback retains Opening heading and Closing heading as chapter titles with all eight prose sentences in order. Environment: electron-files

### NEO-255 — Import title author Unicode

- NFC-insensitive filename/title and multilingual bylines recognized; ordinary sentences/title names not falsely removed.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-255-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When NFC-insensitive filename/title and multilingual bylines recognized. Then ordinary sentences/title names not falsely removed. Environment: electron-files

**NEO-255-B** Given FixtureshaveSpanish,German,Italian,Dutch,Romanian,Russianbylines andordinaryopeninglanguagewords. When Importallfiles andinspectbookmetadata/manuscript. Then Genuinebylines becomeauthornames; ordinaryPar/Von/De openingproseandcapitalDeProfundistitle remain; no inferredbyline deletesrealprose. Environment: electron-files

### NEO-256 — Import prologue epilogue roles

- Only valid first/last positions get legacy role; single chapter avoids invalid role; title/body survives.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-256-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Only valid first/last positions get legacy role. Then single chapter avoids invalid role; title/body survives. Environment: electron-files

**NEO-256-B** Given Plaintextfixtures havesinglePrologue,singleEpilogue andmisplacedmiddlelegacyroles. When Importthem throughnativepicker andopenbooks. Then Single/misplaced headingsneverreceivelegacyprologue/epilogueflags; fullbodyparagraphs survive. Environment: electron-files

### NEO-257 — Import failure isolation

- Bad DOCX/unreadable file reports error while other selected valid files import; original source never modified.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-257-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Bad DOCX/unreadable file reports error while other selected valid files import. Then original source never modified. Environment: electron-files

### NEO-258 — TXT export

- Save text with ordered visible headings/title/author/scene markers and all prose, excluding ghosts/flags; chapter-only export matches scope.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-258-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Save text with ordered visible headings/title/author/scene markers and all prose, excluding ghosts/flags. Then chapter-only export matches scope. Environment: electron-files

### NEO-259 — Markdown export

- Serialize inline bold/italic, scenes, poetry and chapter/part headings without duplicated titles or ghost notes.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-259-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Serialize inline bold/italic, scenes, poetry and chapter/part headings without duplicated titles or ghost notes.. Then Serialize inline bold/italic, scenes, poetry and chapter/part headings without duplicated titles or ghost notes. Environment: electron-files

**NEO-259-B** Given An edition hasfrontmatter,parts,poetry andspecialMarkdown punctuationintitle. When ExportactualMarkdown file. Then Titleescaped,eachpartheading appearsonce,poetryblockquotesretained andfront/story/back order correct. Environment: electron-files

### NEO-260 — HTML export

- Safe standalone book HTML carries body/dropcap typography, frontmatter, TOC links, paragraph alignment/poetry and all Unicode text.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-260-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Safe standalone book HTML carries body/dropcap typography, frontmatter, TOC links, paragraph alignment/poetry and all Unicode text.. Then Safe standalone book HTML carries body/dropcap typography, frontmatter, TOC links, paragraph alignment/poetry and all Unicode text. Environment: electron-files

**NEO-260-B** Given An edition hasfrontmatter,contents,parts,alignedprose,poetryanddropcapsetting. When ExportstandaloneHTML andparseactualfile. Then SafeHTMLtitle andnoscripts,realTOCdestinations,correctsectionclasses/order,alignedparagraphs,poetry anddropcapCSS retained. Environment: electron-files

### NEO-261 — DOCX export

- Open generated ZIP/XML; runs preserve bold/italic/poetry/alignment; proper chapter page breaks/title/frontmatter/styles and text.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-261-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Open generated ZIP/XML. Then runs preserve bold/italic/poetry/alignment; proper chapter page breaks/title/frontmatter/styles and text. Environment: electron-files

**NEO-261-B** Given An edition hasfrontmatter,parts,center/rightalignment,poetry andordinaryprose. When ExportDOCX andinspectzip document/stylesXML. Then Actualparagraph XMLretainscenter/right alignment,poetryleft/rightindentsanditalic,ordinaryfirstLineindent,meaningfulpagebreaks andheadingstyles/order. Environment: electron-files

### NEO-262 — EPUB export

- Generated EPUB3 ZIP has mimetype first/uncompressed, OPF/nav/TOC/spine/chapter XHTML, eligible cover/fonts and correct front/body/back order; generated painted covers never appear in exports.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-262-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Generated EPUB3 ZIP has mimetype first/uncompressed, OPF/nav/TOC/spine/chapter XHTML, eligible cover/fonts and correct front/body/back order. Then generated painted covers never appear in exports. Environment: electron-files

**NEO-262-B** Given An edition withfrontmatter/contents/body/backmatter usesa pickedcustomcoverPNG. When ExportEPUB,inspectOPF/spine/nav/archivebytes; exportagain. Then Exactcustomcoverbytespackaged,allspine/nav destinationsresolve,front/story/backordercorrect,poetryCSSpresent andstoredUUIDstable. Environment: electron-files

### NEO-263 — PDF export

- Real Electron prints PDF with title/body pagination, page numbers, bookmarks/TOC and poetry styling; inspect PDF actual content, not just filename.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-263-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Real Electron prints PDF with title/body pagination, page numbers, bookmarks/TOC and poetry styling. Then inspect PDF actual content, not just filename. Environment: electron-files

**NEO-263-B** Given An edition containsfrontmatter/TOC/bodychapters,alignmentandpoetry. When ExportactualPDF andreadwithpdfjs. Then Realbookmarks pointtobodypages,TOClink/countpagesagree,firstfrontpagehasnofooter1,bodyfootersmatchrealpage numbers andpoetryindent/fontdiffersfromordinarytext. Environment: electron-files

### NEO-264 — Export custom chapter titles

- Toggle preference; export replaces ChapterN with custom title where configured, not duplicated unnumbered heading.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-264-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Toggle preference. Then export replaces ChapterN with custom title where configured, not duplicated unnumbered heading. Environment: electron-files

### NEO-265 — Export cancel/errors

- Native save cancel writes nothing; failure keeps manuscript intact and reports error; successful export does not mutate draft.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-265-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Native save cancel writes nothing. Then failure keeps manuscript intact and reports error; successful export does not mutate draft. Environment: electron-files

### NEO-266 — Export chosen font assets

- HTML and PDF embed bundled fonts for offline output; original EPUB uses a reader serif fallback and does not package those fonts. Verify the actual output-specific resources rather than claiming identical embedding.

Sources: app.js:6406–6473, main.js:744–1057, app.js:7488–8569, main.js:565–706. Status: required.

**NEO-266-A** Given A temporary library and prepared text, Markdown and DOCX fixtures containing Unicode, headings, formatted prose and scene breaks. When Bundled/local font embedding/fallback follows output-specific rules. Then HTML and PDF embed bundled fonts for offline output; original EPUB uses a reader serif fallback and does not package those fonts. Verify the actual output-specific resources rather than claiming identical embedding. Environment: electron-files

**NEO-266-B** Given The manuscript usesbundledJost upright/italic bodyfont. When ExportrealPDF andreadbytes/textresources. Then FontFileprogramembedded,actualJostresource andtextpresent,andupright/italic runsuse distinctPDFfonts. Environment: electron-files


## Email, update and application

### NEO-267 — Email settings

- Choose recipient and native email method from dialog; retain settings and offer configure/cancel for missing address.

Sources: app.js:8569–8894, main.js:706–744, main.js:1844–2070, preload.js:1–60. Status: required.

**NEO-267-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When Choose recipient and native email method from dialog. Then retain settings and offer configure/cancel for missing address. Environment: electron-provider-native

**NEO-267-B** Given Actual macOS writing app has no saved email address and owns native foreground focus. When Physical Cmd+E invokes actual native email accelerator; native Escape cancels address setup. Then Actual address dialog opens and closes; no mail/provider send occurs, manuscript remains exact. Environment: Unlocked real macOS native foreground application and physical OS keyboard automation; disabled or locked-host runs remain unproved, not passing menu-callback substitutes.

### NEO-268 — Email draft snapshot

- Cmd/Ctrl+E creates timestamped PDF under Exports, SHA256 of manuscript text in body and host draft handoff; deterministic fixture verifies attachment/hash/subject.

Sources: app.js:8569–8894, main.js:706–744, main.js:1844–2070, preload.js:1–60. Status: required.

**NEO-268-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When Cmd/Ctrl+E creates timestamped PDF under Exports, SHA256 of manuscript text in body and host draft handoff. Then deterministic fixture verifies attachment/hash/subject. Environment: electron-provider-native

**NEO-268-B** Given An edited twochapterUnicodebook hasconfiguredtestrecipient andMaildraftmethod. When Activatekeyboardemail handoff throughsafeMailhostboundary. Then ActualtimestampedPDF containsbothchapters+provenance; hostscriptattachesthatfile withcorrectrecipient,subject andSHA256prosehash; manuscriptunchanged. Environment: electron-provider-native

### NEO-269 — Email cancel/failure

- Cancelled address/dialog or unavailable mail client preserves snapshot/manuscript and communicates result without falsely claiming delivery.

Sources: app.js:8569–8894, main.js:706–744, main.js:1844–2070, preload.js:1–60. Status: required.

**NEO-269-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When Cancelled address/dialog or unavailable mail client preserves snapshot/manuscript and communicates result without falsely claiming delivery.. Then Cancelled address/dialog or unavailable mail client preserves snapshot/manuscript and communicates result without falsely claiming delivery. Environment: electron-provider-native

**NEO-269-B** Given A two-paragraphbook hasMaildraftconfigured whileisolatedhostMailfails. When InvokeEmailDrafttoMyself andinspectExports. Then Mailunavailable toastdoesnotclaimsent; readablePDFsnapshotretainsallprose andmanuscriptunchanged. Environment: electron-provider-native

### NEO-270 — About

- About dialog shows NEO, actual Version, “a word processor for authors”, and Back to writing. It does not expose credits/license/link controls. Escape and focus restoration follow the modal contract.

Sources: app.js:8569–8894, main.js:706–744, main.js:1844–2070, preload.js:1–60. Status: required.

**NEO-270-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When About dialog shows actual version/credits/license and links. Then About dialog shows NEO, actual Version, “a word processor for authors”, and Back to writing. It does not expose credits/license/link controls. Escape and focus restoration follow the modal contract. Environment: electron-provider-native

### NEO-271 — Check update

- Manual check reports available/current/unavailable/error correctly; asynchronous background update events update one modal/notice.

Sources: app.js:8569–8894, main.js:706–744, main.js:1844–2070, preload.js:1–60. Status: required.

**NEO-271-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When Manual check reports available/current/unavailable/error correctly. Then asynchronous background update events update one modal/notice. Environment: electron-provider-native

**NEO-271-B** Given Private app with pending prose and deterministic native HTTP responses for current, unavailable, future release. When Repeatedly invoke actual native Check for Updates and press Enter in notices/release dialog. Then Current version reports up-to-date;503 shows unavailable; future unpackaged release opens fetched URL without installation; dialogs singular; prose retained. Environment: Isolated real Electron on current macOS; native input/API boundaries. Physical keyboard hardware and alternate OS UI remain qualified.

### NEO-272 — Install/open release

- Available update downloads/installs through supported platform or opens release page; explicit user control retained and pending draft flushed.

Sources: app.js:8569–8894, main.js:706–744, main.js:1844–2070, preload.js:1–60. Status: required.

**NEO-272-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When Available update downloads/installs through supported platform or opens release page. Then explicit user control retained and pending draft flushed. Environment: electron-provider-native

**NEO-272-B** Given Unpackaged source app with three actual main-process update responses. When Run actual update handler and keyboard-activate notice/release control. Then Each expected status and native external release effect is observed; no installer event; pending manuscript survives leave. Environment: Isolated real Electron on current macOS; native input/API boundaries. Physical keyboard hardware and alternate OS UI remain qualified.

### NEO-273 — Window state/platform menus

- Platform native close/quit/hide/fullscreen behaviours and menu labels/accelerators supported; restore useful window position/bounds.

Sources: app.js:8569–8894, main.js:706–744, main.js:1844–2070, preload.js:1–60. Status: required.

**NEO-273-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When Platform native close/quit/hide/fullscreen behaviours and menu labels/accelerators supported. Then restore useful window position/bounds. Environment: electron-provider-native

### NEO-274 — Menu state synchronization

- Poetry/typewriter/Vim/zoom/focus/theme/style choices update native menu checked/radio state and reflected renderer state.

Sources: app.js:8569–8894, main.js:706–744, main.js:1844–2070, preload.js:1–60. Status: required.

**NEO-274-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When Poetry/typewriter/Vim/zoom/focus/theme/style choices update native menu checked/radio state and reflected renderer state.. Then Poetry/typewriter/Vim/zoom/focus/theme/style choices update native menu checked/radio state and reflected renderer state. Environment: electron-provider-native

### NEO-275 — Interface localization

- Choose each current locale including Greek/Turkish and regional French/Portuguese; localized menu/static/dynamic strings and numbers update; saves pending prose then reloads to bookshelf. Original writes neo-reopen session key but never reads it; click book to reopen and assert saved content.

Sources: app.js:8569–8894, main.js:706–744, main.js:1844–2070, preload.js:1–60. Status: required.

**NEO-275-A** Given The synthetic original and candidate desktop fixtures are in the state named by this requirement. When Choose each current locale including Greek/Turkish and regional French/Portuguese Then  localized menu/static/dynamic strings and numbers update; saves pending prose then reloads to bookshelf. Original writes neo-reopen session key but never reads it; click book to reopen and assert saved content. Environment: electron-provider-native

### NEO-276 — Offline baseline

- Disconnect network; bookshelf, writing, spelling dictionaries, persistence/import/export remain functional; only explicit provider/update requests need network.

Sources: app.js:8569–8894, main.js:706–744, main.js:1844–2070, preload.js:1–60. Status: required.

**NEO-276-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When Disconnect network. Then bookshelf, writing, spelling dictionaries, persistence/import/export remain functional; only explicit provider/update requests need network. Environment: electron-provider-native

### NEO-277 — Mac native edit menu polish

- Native macOS menu filtering is intended to suppress injected Writing Tools/AutoFill while retaining normal Edit roles. On declared Electron43.7.6 the original stale cached NSMenu leaves an actual inserted foreign item visible; on Electron44 the same native lifecycle hazard can SIGSEGV during book/menu rebuild. ProseMirror uses a TypeScript live-menu boundary to satisfy intended filtering and responsive author editing. Original defect characterization is separate from target source/output-contract proof.

Sources: app.js:8569–8894, main.js:706–744, main.js:1844–2070, preload.js:1–60. Status: required.

**NEO-277-A** Given The macOS candidate with actual native AppKit menu filtering; original Electron43 foreign-item failure is separately characterized. When Insert a real foreign AppKit item and a known native copy action, then copy an actual shelf label. Then The candidate hides the foreign item, preserves native copy actions and normal visible menu roles, copies Native and remains alive. This uses source/output oracle, not a fabricated passing original filter test. Environment: electron-provider-native

**NEO-277-B** Given The ProseMirror macOS candidate with TypeScript live-menu filtering; original Electron43 fails filtering and Electron44 rebuild was observed to SIGSEGV before driver FFI. When Open a book, copy actual prose, change font to rebuild native menus, inject a foreign item, type and reopen. Then Target fixes the upstream stale-menu hazard while preserving filtering, native Copy and exact writing persistence; this is a deliberate safety improvement using source/output oracle rather than pretending original crash passes. Environment: browser-electron-layout


## Keyboard access

### NEO-278 — Pressable shelf controls

- Author chip, counters, book covers and tabs reachable by Tab; Enter/Space perform same activation as click with accessible labels.

Sources: app.js:8956–9136, index.html:15–145, styles.css:1189–1290. Status: required.

**NEO-278-A** Given An open desktop application with representative shelf, long manuscript, sticky note, dialogs and visible keyboard focus. When Author chip, counters, book covers and tabs reachable by Tab. Then Enter/Space perform same activation as click with accessible labels. Environment: browser-electron-layout

**NEO-278-B** Given A private library with author, cover and manuscript counters. When Use native Enter and Space on focused author, cover, word and zoom controls. Then Author choice dialog opens and returns focus; cover opens; counters toggle twice and restore; zoom resets; prose stays exact. Environment: Isolated real Electron on current macOS; native input/API boundaries. Physical keyboard hardware and alternate OS UI remain qualified.

### NEO-279 — Region cycle

- F6/Ctrl+Tab and reverse Shift cycle paper, navigation, side and bottom regions modulo four; shelf cycles books/header modulo two. Source does not filter hidden regions. Escape from chrome restores retained editing range where it remains connected.

Sources: app.js:8956–9136, index.html:15–145, styles.css:1189–1290. Status: required.

**NEO-279-A** Given An open desktop application with representative shelf, long manuscript, sticky note, dialogs and visible keyboard focus. When F6/Ctrl+Tab and reverse Shift cycle manuscript/nav/notes/bottom bar. Then shelf cycles books/header; hidden region skipped. Environment: browser-electron-layout

**NEO-279-B** Given Manuscript caret at Alpha offset five. When Shift F6 then repeated Ctrl Shift Tab; on shelf cycle reversed keys. Then Editor follows bottom, side, nav, paper and restores caret; shelf alternates author and first cover. No source-defined hidden-region skipping is presumed. Environment: Isolated real Electron on current macOS; native input/API boundaries. Physical keyboard hardware and alternate OS UI remain qualified.

### NEO-280 — Return to page

- Escape from keyboard-open pane returns stored selection/caret to page without leaving book; pane closes when focus leaves if unpinned.

Sources: app.js:8956–9136, index.html:15–145, styles.css:1189–1290. Status: required.

**NEO-280-A** Given An open desktop application with representative shelf, long manuscript, sticky note, dialogs and visible keyboard focus. When Escape from keyboard-open pane returns stored selection/caret to page without leaving book. Then pane closes when focus leaves if unpinned. Environment: browser-electron-layout

### NEO-281 — Tab arrow navigation

- Arrow Left/Right wraps keyboard focus among bottom tabs; Enter/Space activates focused tab and updates ARIA selected state; Home/End not implemented by original.

Sources: app.js:8956–9136, index.html:15–145, styles.css:1189–1290. Status: required.

**NEO-281-A** Given The synthetic original and candidate desktop fixtures are in the state named by this requirement. When Arrow Left/Right wraps keyboard focus among bottom tabs Then  Enter/Space activates focused tab and updates ARIA selected state; Home/End not implemented by original. Environment: browser-electron-layout

### NEO-282 — Nav arrow navigation

- Up/Down chapter keyboard traversal focuses correct row and Enter activates chapter; menus reachable via keyboard/context key.

Sources: app.js:8956–9136, index.html:15–145, styles.css:1189–1290. Status: required.

**NEO-282-A** Given An open desktop application with representative shelf, long manuscript, sticky note, dialogs and visible keyboard focus. When Up/Down chapter keyboard traversal focuses correct row and Enter activates chapter. Then menus reachable via keyboard/context key. Environment: browser-electron-layout

**NEO-282-B** Given Three actual chapters and keyboard-open navigation. When Arrow Up/Down beyond bounds, Enter last chapter, pointer-open chapter context then ArrowDown and Escape. Then Focus clamps to rows, Enter puts caret in chapter three; context focus stays inside menu then closes; prose retained. Environment: Isolated real Electron on current macOS; native input/API boundaries. Physical keyboard hardware and alternate OS UI remain qualified.

### NEO-283 — Dialog roles and focus characterization

- Exercise every custom dialog constructor family and its contextual variants: observe actual dialog role/modal/name, initial focus, Tab/ShiftTab traversal, family-specific close/commit and focus return. Preserve native source behavior; record original empty-name update-notice defect and candidate heading-label improvement separately.

Sources: app.js:8956–9136, index.html:15–145, styles.css:1189–1290, app.js:7250–7260, app.js:3883–3891. Status: required.

**NEO-283-A** Given The synthetic original and candidate desktop fixtures are in the state named by this requirement. When Open every modal and assert dialog role/aria-modal/name, initial focus and keyboard closing/return focus Then  explicitly characterize Tab/Shift+Tab wrapping because dialogify alone does not install universal Tab trap. Environment: browser-electron-layout

**NEO-283-B** Given Bookshelf cover and author controls. When Open actual choice modal and author Add a pen name input, use Tab and Escape. Then Actual dialogs have role, aria-modal and labelled heading, initial focus inside/input; Tab follows actual controls; Escape cancels without a new book. Environment: Isolated real Electron on current macOS; native input/API boundaries. Physical keyboard hardware and alternate OS UI remain qualified.

**NEO-283-C** Given Actual onboarding, input, choices, content/title sheets, cover settings, goals/sprint, installed fonts, shortcuts, email-method, update-release and About workflows. When Drive each source-defined initial focus, ordinary Tab/ShiftTab path, focused-button Enter and its own cancel/save/dismiss action. Then Source keyboard semantics remain exact: ordinary dialogs have no universal Tab trap or Enter submit; shortcuts explicitly cycle reference/Done; email-method Escape leaves chooser open; Goals Escape saves; Cover settings Escape cancels. First-run initial autofocus race is characterized, not an unconditional focus guarantee. Update notices are handled separately by scenario D. Environment: Real isolated Electron and installed-font API; source-defined HTTP/updater host boundaries; no mail or credential mutations.

**NEO-283-D** Given Actual current-version or error update notice with explicit dialog role and visible heading; original generic dialogify skips name derivation because role exists. When Characterize original empty accessible name and actual OK focus/Enter/Escape/draft retention; exercise candidate notice naming through its existing heading. Then Original empty-name defect is preserved as separate baseline characterization. Candidate assigns its visible heading as accessible name and retains exact dismissal/focus/draft behavior, proved with a source-derived contract-output oracle. Environment: Real isolated Electron update handler and deterministic HTTP boundary; original source-name defect explicitly distinguished from target improvement.

**NEO-283-E** Given Genuine installed-font chooser search owns focus; its accessible heading and real font results are present. When Press search Escape and wait for actual native fullscreenEscape completion before asserting dialog/view/focus state. Then Original asynchronous Escape propagation reaches bookshelf after native false reply. Candidate closes only font chooser and retains manuscript focus, exact prose and stored font; source fallthrough remains a separate baseline defect characterization. Environment: Real isolated Electron native input, real renderer layout/installed fonts, actual callback/IPC timing boundaries; no fabricated document, caret or postcondition.

### NEO-284 — Pointer selection persistence

- Mouse activation of quiet chrome blurs non-keyboard button/tab focus so subsequent Space does not reactivate that control. The handler does not restore editor focus/caret. Keyboard focus remains visible and survives activation; text fields/modal focus are excluded from the blur rule.

Sources: app.js:8956–9136, index.html:15–145, styles.css:1189–1290. Status: required.

**NEO-284-A** Given An open book with a manuscript caret and visible quiet chrome controls. When Click the word counter then press Space; separately focus it through keyboard navigation and activate with Space. Then Pointer activation leaves the counter unfocused and Space does not cycle it again; keyboard activation retains focus-visible. This does not promise automatic manuscript focus/caret restoration. Environment: browser-electron-layout

**NEO-284-B** Given Goals dialog opened over manuscript. When Pointer click and edit numeric input, move caret and activate Done. Then Text input remains focused; modal keeps focus until Done; manuscript remains exact. Environment: Isolated real Electron on current macOS; native input/API boundaries. Physical keyboard hardware and alternate OS UI remain qualified.

### NEO-285 — Zoomed accessibility

- Large interface300 percent and manuscript zoom preserve reachable panels/counters/menus at small window; no critical action inaccessible.

Sources: app.js:8956–9136, index.html:15–145, styles.css:1189–1290. Status: required.

**NEO-285-A** Given An open desktop application with representative shelf, long manuscript, sticky note, dialogs and visible keyboard focus. When Large interface300 percent and manuscript zoom preserve reachable panels/counters/menus at small window. Then no critical action inaccessible. Environment: browser-electron-layout

**NEO-285-B** Given Actual native window resized to 800 by 600. When Set interface300 percent, actual wheel zoom to300 percent, keyboard-cycle panels and open help. Then Navigation, side and bottom remain keyboard accessible; help opens/closes and exact prose remains after restoring interface size. Environment: Isolated real Electron on current macOS; native input/API boundaries. Physical keyboard hardware and alternate OS UI remain qualified.


## Pocket variants

### NEO-286 — Touch pane gestures

- Swipe left/right edge opens chapters/notes; touch no-hover path uses menu actions and long press context; desktop primary parity suite does not claim this.

Sources: pocket/README.md:1–99, pocket/www/pocket-bridge.js:1–100, app.js:209–262. Status: platform-variant.

**NEO-286-A** Given A separate Capacitor Android or iOS test environment with a synthetic shared NEO library. When Swipe left/right edge opens chapters/notes. Then touch no-hover path uses menu actions and long press context; desktop primary parity suite does not claim this. Environment: capacitor-native

### NEO-287 — Pocket overflow menu

- Touch overflow replaces desktop Format/View/Goals/export/menu entry points; separate Capacitor integration required.

Sources: pocket/README.md:1–99, pocket/www/pocket-bridge.js:1–100, app.js:209–262. Status: platform-variant.

**NEO-287-A** Given A separate Capacitor Android or iOS test environment with a synthetic shared NEO library. When Touch overflow replaces desktop Format/View/Goals/export/menu entry points. Then separate Capacitor integration required. Environment: capacitor-native

### NEO-288 — Pocket shared storage

- Android public Documents and iOS iCloud/on-device library locate/read/download compatibility; native sync races require device tests.

Sources: pocket/README.md:1–99, pocket/www/pocket-bridge.js:1–100, app.js:209–262. Status: platform-variant.

**NEO-288-A** Given A separate Capacitor Android or iOS test environment with a synthetic shared NEO library. When Android public Documents and iOS iCloud/on-device library locate/read/download compatibility. Then native sync races require device tests. Environment: capacitor-native

### NEO-289 — Pocket keyboard/system bars

- Android hides OS keyboard until requested and back returns shelf; iPad keyboard behaves normally with hardware attachment; mobile variants tracked separately.

Sources: pocket/README.md:1–99, pocket/www/pocket-bridge.js:1–100, app.js:209–262. Status: platform-variant.

**NEO-289-A** Given A separate Capacitor Android or iOS test environment with a synthetic shared NEO library. When Android hides OS keyboard until requested and back returns shelf. Then iPad keyboard behaves normally with hardware attachment; mobile variants tracked separately. Environment: capacitor-native


## Covers

### NEO-290 — Generated painting export exclusion

- Paint a book and export all formats; painted image excluded from exports while seeded/custom eligible cover follows exportCover policy.

Sources: app.js:8055–8065, art.js:1–15. Status: required.

**NEO-290-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Paint a book and export all formats. Then painted image excluded from exports while seeded/custom eligible cover follows exportCover policy. Environment: electron-provider

**NEO-290-B** Given A book showing a one-pixel generated painting fixture. When Export actual PDF and inspect PDF image resources and manuscript text. Then PDF includes real seeded cover image resources larger than one pixel, excludes the painting fixture and leaves its original bytes intact. Environment: electron-files

### NEO-291 — Provider model fallback

- Deterministic provider returns model-unavailable then valid model; fallback succeeds. Authentication/quota/content errors do not silently retry alternate models.

Sources: art.js:42–155. Status: required.

**NEO-291-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Deterministic provider returns model-unavailable then valid model. Then fallback succeeds. Authentication/quota/content errors do not silently retry alternate models. Environment: electron-provider

### NEO-292 — Painting brief excerpt

- Long manuscript supplies opening4500 plus ending1500 words to brief provider; generated image remains textless with real title/author overlay.

Sources: art.js:17–40. Status: required.

**NEO-292-A** Given A synthetic book on a shelf with deterministic seed, representative title/author and controllable cover provider. When Long manuscript supplies opening4500 plus ending1500 words to brief provider. Then generated image remains textless with real title/author overlay. Environment: electron-provider


## Keyboard access

### NEO-293 — Mac held key repeating

- Hold manuscript letter on macOS; letter repeat works without phantom accent-picker duplicate or invisible swallowed text.

Sources: main.js:2028–2044. Status: required.

**NEO-293-A** Given An open desktop application with representative shelf, long manuscript, sticky note, dialogs and visible keyboard focus. When Hold manuscript letter on macOS. Then letter repeat works without phantom accent-picker duplicate or invisible swallowed text. Environment: electron-provider-native


## Email, update and application

### NEO-294 — Background packaged update schedule

- Packaged app checks after8 seconds, hourly and15 seconds afterwake; source build does not; offline errors log without interrupting writing.

Sources: main.js:1986–2000. Status: required.

**NEO-294-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When Packaged app checks after8 seconds, hourly and15 seconds afterwake. Then source build does not; offline errors log without interrupting writing. Environment: electron-provider-native

### NEO-295 — Update progress lifecycle

- Fixture updater downloading/progress/downloaded/error transitions update same notice; install-on-quit obeys platform provider and pending saves survive restart.

Sources: main.js:1850–1965, app.js:8647–8755. Status: required.

**NEO-295-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When Fixture updater downloading/progress/downloaded/error transitions update same notice. Then install-on-quit obeys platform provider and pending saves survive restart. Environment: electron-provider-native

### NEO-296 — Localization plurals/fallback

- Switch locales; missing translation falls back English with correct Englishplural while numeric variables/date format use selected locale; parameterize1/2/many in available languages.

Sources: i18n.js:31–70, main.js:39–136. Status: required.

**NEO-296-A** Given An isolated Electron application with deterministic email/update provider boundary, no external transmission and synthetic draft. When Switch locales. Then missing translation falls back English with correct Englishplural while numeric variables/date format use selected locale; parameterize1/2/many in available languages. Environment: browser-electron

**NEO-296-B** Given A private locale fixture with selected known keys absent and a non-English locale active. When Open actual renderer controls and native menus using missing keys and display plural/number text. Then Missing keys fall back to English while locale plural and numeric formatting remain correct. Environment: electron-files


## Presentation and navigation

### NEO-297 — Local font filtering/fallback

- Font picker filters case-insensitively, removes hidden dot fonts, Enter chooses firstresult, Escape cancels; missingfont on anothermachine gracefully usesGeorgia.

Sources: app.js:7200–7268. Status: required.

**NEO-297-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Font picker filters case-insensitively, removes hidden dot fonts, Enter chooses firstresult, Escape cancels. Then missingfont on anothermachine gracefully usesGeorgia. Environment: browser-electron

**NEO-297-B** Given A selected font unavailable on the local host. When Render actual prose and inspect canvas or Chromium selected glyph font. Then Georgia fallback supplies actual rendered glyphs rather than an unverified CSS font-family string. Environment: browser-electron-layout


## Persistence and synchronization

### NEO-298 — Startup fault resilience

- Fail locale/library/spell/menu/backup/update init individually; visible window still opens wherever possible; catastrophicstartup yields native error plus log.

Sources: main.js:2002–2070. Status: required.

**NEO-298-A** Given An isolated real NEO library on disk with saved baseline chapters/metadata and controllable timestamps, writes and reads. When Fail locale/library/spell/menu/backup/update init individually. Then visible window still opens wherever possible; catastrophicstartup yields native error plus log. Environment: electron-files

**NEO-298-B** Given Private library with each individually failing backup directory, packaged updater, locale read and spell fork host boundary. When Launch source app, observe actual source recovery/logging and edit then persist/reopen manuscript. Then Error effects/logs name real source failure; native window remains visible and exact native-typed prose persists. Environment: Isolated real Electron with observed trusted native events, native APIs and private persistence. Host fault boundaries explicitly recorded.


## Presentation and navigation

### NEO-299 — Pin without reading jump

- Pin/unpin navigation/notes while pagezoomed and scrolled; page/caret stays at same readingplace and controls reflect pinstate.

Sources: app.js:4802–4830. Status: required.

**NEO-299-A** Given An open long synthetic book scrolled midway with known caret position and default typography/settings. When Pin/unpin navigation/notes while pagezoomed and scrolled. Then page/caret stays at same readingplace and controls reflect pinstate. Environment: browser-layout

**NEO-299-B** Given The same zoomed and scrolled manuscript with visible logical reading anchor. When Toggle navigation and side-pane pins. Then Reading position and caret stay stable across both pin controls. Environment: browser-electron-layout

### NEO-300 — Alphabet font companions

- Preserve rendered Latin and Cyrillic glyph selection for bundled font faces and their companions in writing and cover contexts. The source does not provide a Cyrillic companion for NEO Baskerville; actual macOS baseline NEO Playfair 700 normal Cyrillic uses Times-Bold fallback. Record and compare original glyph signatures rather than invent universal bundled glyph coverage.

Sources: TRANSLATING.md:75–78, styles.css:126–203. Status: required.

**NEO-300-A** Given An isolated macOS Electron application rendering accented Latin and Cyrillic test text for every unique bundled CSS font face. When Load the real fonts and inspect Chromium platform glyph selection for every family, weight and style. Then All glyphs render; the complete target glyph signature matches the captured original, including observed Playfair 700 Times-Bold and Baskerville fallback. Separate writing/cover context and visual checks remain explicit requirements. Environment: browser-layout

**NEO-300-B** Given Actual cover and manuscript with Latin/Cyrillic title, subtitle, chapter heading, body and Didot first-letter. When Capture actual Chromium platform glyph fonts in each real context; expose first-letter by moving caret to second chapter; compare original golden. Then Each actual context has rendered glyphs; first-letter CSS size and Didot/Bodoni glyphs are observed in actual paragraph rendering; target equals original recorded glyph/style signatures with source CSS and font manifest hashes. Environment: Isolated real Electron with observed trusted native events, native APIs and private persistence. Host fault boundaries explicitly recorded.


## Spellcheck

### NEO-301 — Spell interface defaults

- Launch Romanian interface without saved dictionary; Romanian is checked in menu but default selection alone does not persist library.spellLanguage; pass remains off and quotes use interface language. Explicit dictionary choice persists across later interface-language changes.

Sources: TRANSLATING.md:20–26. Status: required.

**NEO-301-A** Given The stated platform/locale-specific synthetic library fixture is open. When Launch Romanian interface without saved dictionary Then  Romanian is checked in menu but default selection alone does not persist library.spellLanguage; pass remains off and quotes use interface language. Explicit dictionary choice persists across later interface-language changes. Environment: electron-dictionary


## Email, update and application

### NEO-302 — Regional locale resolution

- System fr_CA spelling normalizes to fr-CA and merges regional/base/English; absent fr-BE/fr-CH resolves French base while number/date region behaviour follows resolver.

Sources: main.js:70–108. Status: required.

**NEO-302-A** Given The stated platform/locale-specific synthetic library fixture is open. When System fr_CA spelling normalizes to fr-CA and merges regional/base/English Then  absent fr-BE/fr-CH resolves French base while number/date region behaviour follows resolver. Environment: browser-electron


## Covers

### NEO-303 — Cover title language connectors

- Render long multi-line Unicode cover titles for each writing/interface language; short connector words break according to CONNECTORS and actual title/author remain readable.

Sources: covers.js:270–399. Status: required.

**NEO-303-A** Given The stated platform/locale-specific synthetic library fixture is open. When Render long multi-line Unicode cover titles for each writing/interface language Then  short connector words break according to CONNECTORS and actual title/author remain readable. Environment: browser-layout

**NEO-303-B** Given A saved cover with titles containing German, Italian, Dutch, Polish, Romanian, Greek and French connectors. When Choose deterministic stack seeds and reload each saved title. Then Complete Unicode titles and real author survive; connector lines match expected words and render smaller than main lines. Environment: electron-files


## Keyboard access

### NEO-304 — Forced-colors system theme

- Enable Windows forced-colors/high-contrast; system controls/text colors remain legible and manuscript selection/outline/navigation visible.

Sources: styles.css:1262–1290. Status: required.

**NEO-304-A** Given The stated platform/locale-specific synthetic library fixture is open. When Enable Windows forced-colors/high-contrast Then  system controls/text colors remain legible and manuscript selection/outline/navigation visible. Environment: browser-electron-layout

