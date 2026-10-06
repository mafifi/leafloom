# Platform catch-up implementation review

Source: immutable `tests/reference/neo-1.3.5`, commit `b742c5f92a5465fe8473e8d10aa05b3f0ea8a5a0`.

## Pocket: implementation work remains

Families 031 and 038 require an actual Pocket runtime. Leafloom currently has `apps/desktop`, its managed Node filesystem host and Tauri desktop composition. There is no Android/iOS app root or provider for the mobile filesystem and native keyboard events.

The existing editor can supply document history, chapter navigation, spelling decorations and suggestion actions. It does not supply the missing runtime. Desktop responsive CSS or injected hardware events cannot qualify Android attachment, keyboard insets or older WebView fallback.

Required composition work:

- Browser Hunspell provider: ordered load/check/suggest/add commands; worker execution and the same direct fallback for older WebViews; dictionaries and original notices packaged locally. Greek remains on desktop and is excluded from Pocket assets. Source: `pocket/www/pocket-spell.js`, `pocket/www/pocket-bridge.js:385`, `scripts/pocket-www.js:59`.
- Native Android provider: initial keyboard query and real configuration-change events; temporary long-press override resets when hardware attachment changes; editable fields retain hardware typing with software input suppressed. Source: `pocket/www/pocket-bridge.js:545`, `pocket/android/app/src/main/java/com/hughhowey/neopocket/MainActivity.java` and `NeoBarsPlugin.java`.
- Mobile views: tap underlined words for suggestions; undo/redo above the software keyboard using the existing document history; navigation Chapters pane with bottom Add Chapter. Android uses its resized viewport; iOS keyboard height owns the inset. Source: `pocket/www/pocket-bridge.js:478`, `pocket/www/pocket.css:109`.
- An admitted mobile storage/composition root preserving the plain-file library contract, provider lifecycle and licenses. The managed Node desktop process cannot simply be assumed available on phones.

031/038 remain implementation gaps, followed by device/WebView qualification. No mobile runtime was added during this desktop review.

## Desktop recovery

The library JSON helper now orders reads, recovery and writes per root within the managed process. A deferred helper-level real-file regression demonstrated an older spare replacing newer acknowledged author preferences when callers overlap. LibraryHost already serializes requests on one instance; this is a helper/multiple-instance invariant, not a reproduced ordinary single-host UI failure. It provides no cross-process lock. `/tmp/leafloom-library-interleave-green.log`: seven targeted checks pass after the helper-level ordering fix. The host keeps opaque JSON-record values; other roots and book operations remain independent.

Source book metadata recovery (`main.js:389–438`) applies to a legacy folder with actual independent `chapters/*.html`, not a missing v2 manuscript. Legacy import must prefer complete main metadata, then temporary metadata, then backup; only otherwise reconstruct lexical chapter order from available HTML. Existing valid metadata with missing references or orphan chapters continues to refuse import. Source bytes and damaged metadata remain recoverable.

The source catalog title is outside a selected book-folder grant. Recovery must use explicit `Untitled` / `Anonymous` defaults rather than read a parent catalog without authority. This is a recorded adaptation; no author text is invented.

## Desktop native qualification

Windows packaging selects current-user NSIS and the existing ICO. The pinned Tauri updater validates signed packages and uses its own executable/package handling; Leafloom does not invent an installer pathname. The signed channel remains unconfigured. Windows installation, artifact publication and installed update execution were not performed on this Mac.

Fullscreen menu visibility follows real state changes on Windows/Linux, with bare Alt revealing the native bar and selection hiding it again. Linux keeps its normal decorated frame. Pure policy and actual Application entry-point checks do not establish Wayland or installed Windows conformance. The macOS SDK check (`cargo check --tests --locked`) passes. Foreground platform execution and installed Windows/Linux qualification remain gaps.

Legacy recovery implementation: `legacy-metadata.ts` and the existing import codec now read complete main → temporary → backup metadata. Otherwise they reconstruct only independent legacy HTML. `/tmp/leafloom-legacy-recovery-red.log`: three missing-behaviour failures; `/tmp/leafloom-legacy-recovery-green.log`: four focused checks pass. Damaged metadata survives as unique destination artifacts; source files remain unchanged. No v2 reconstruction from a catalog is introduced.

## Local Read Aloud author caret

Pinned `app.js:10026–10032` cancels ordinary typing with `stopReadAloud(false)`: the author's original caret stays put. Escape and an explicit toggle use `true`, returning to the reached sentence. The candidate now keeps this distinction through document key capture; intentional caret return synchronously notifies the existing native selection observer before further input. The surface maps DOM positions through its existing view.posAtDOM path; speech does not convert plaintext offsets into model positions.

The mounted local-voice fixture mocks both synthesis and utterances. Chromium's native utterance rejects a plain mock voice because SpeechSynthesisVoice is IDL-branded; the original mixed fixture exercised that rejection rather than speech progress. These fixtures qualify real editor caret, history, rich writing and durable-highlight exclusion, not installed OS voices. Production native voice branding is unchanged.

Notes caret reconciliation: `/tmp/leafloom-readaloud-notes-red.log` demonstrated model offset 16 instead of 17 after an actual hard break or textless inline atom, while the DOM caret was correct. `/tmp/leafloom-readaloud-notes-green.log`: both focused surface cases and five existing speech cases pass. Notes/manuscript HTML stays unchanged. These are provider tests, not a new mounted Notes or installed speech qualification.
