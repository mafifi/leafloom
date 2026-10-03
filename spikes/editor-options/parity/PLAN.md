# Full desktop NEO parity in ProseMirror

## Goal and acceptance

User request, 2 October 2026: mine every author-facing NEO feature from code and documentation, write valid integration coverage for every feature, and faithfully implement those interactions using ProseMirror. The existing three-provider comparison is not a parity proof.

Baseline: NEO 1.2.4 at the current root commit. Original production sources stay unchanged. All experimental implementation, fixtures, tests and evidence live under `spikes/editor-options/`. Standalone Svelte/TypeScript Electron remains the target. No commit, push, merge, real email, live paid art request or production library access is part of the probe.

Desktop shipping behaviour is required. Roadmap wishes are documented separately. Pocket/mobile variants are classified explicitly rather than silently counted as desktop coverage. Original host-dependent features retain real host integration checks where possible; external service requests are intercepted at the service boundary with recorded payloads/results. A fabricated document/model assertion does not establish UX parity.

## Execution order

1. Source-and-doc inventory worker records feature IDs, sources, requirements, scenarios and host/platform requirements. Independent audit checks menus, event handlers, settings and documentation against that inventory.
2. Reference harness runs unchanged NEO in an explicitly isolated Electron environment. Pin baseline fixtures and record author-visible outcomes. Never point the original app at real user settings, library, secrets or system preferences.
3. Root turns the inventory into a versioned parity specification and scenario registry. Each required scenario identifies a runnable integration test, its driver actions, observable assertions and reference evidence. A coverage gate fails for missing, skipped, excluded or unexecuted requirements.
4. Implement ProseMirror editing foundations: multi-block selections, coordinated native/structural history, paragraph/scene/chapter/poetry rules, smart typography, formatting, paste and destructive selection healing.
5. Implement manuscript workflows: titles/numbering/roles/reorder, sticky notes/placeholders, Darlings, outline/ghost paragraphs, notes, search/replace and Vim/navigation.
6. Implement presentation and application workflows: panels/tabs, focus/typewriter/zoom/fonts/dropcaps/themes, first-run and library/authors/shelves/covers/goals/sprints/collections.
7. Implement host contracts and persistence: NEO-compatible readable files, autosave/flush/conflicts, dictionaries/learning, import/export/print, backups and service-boundary email/art/update flows.
8. Run the same valid author-action scenarios against baseline and ProseMirror. Fix differences; review complete source-to-feature and feature-to-test traceability. Preserve agent-proposal tests from the first spike.
9. Complete only when every required feature has passed its valid integration coverage on the specified environment. Publish a discussion summary with actual evidence and remaining platform-specific verification explicitly identified.

## Review focus

- Undo/redo must restore text, structure, marks, IDs, notes/Darlings and caret in the same author-visible steps as NEO.
- Range deletion, paste, native composition and scene/chapter boundaries must not lose or duplicate prose.
- Ghost text, placeholders and annotations must survive structural moves and saved-file round trips.
- Spellcheck is opt-in and its real provider must support suggestions, ignore/learn and language changes.
- Tests must exercise UI/native commands and read real output; they cannot mark a feature covered merely by calling a private implementation helper.
- Reference and target must never read/write production data or make paid/outbound service calls during automated parity checks.

## Status

Active, 2 October 2026. The source ledger contains **304 features and 448 scenarios**: **444 required desktop scenarios** and **four Pocket variants**. Every required scenario has a registry mapping; supplemental references are validated. Original NEO uses declared Electron 43.7.6 and the candidate uses Electron 44.5.1.

The proof uses visible ProseMirror EditorViews inside the retained original application controllers. It establishes engine compatibility; the complete Svelte/TypeScript/MVVM controller migration remains the next architectural phase. Original defects receive separate baseline characterizations and source-derived candidate output contracts.

Native verification now includes all ten physical shortcut test cases: eight passed in the complete native report and the two corrected candidate fullscreen cases passed in the targeted final report. The signed-host Keychain lifecycle performed genuine encryption/decryption across **43 → 44 → 43**. Real native focus, blur and fullscreen checks pass after disabling CDP focus emulation. Dedicated signing identity and actual foreground ownership form part of the host evidence.

Vim half-page motion passes the strict actual caret-centre assertion after the preceding chapter jump completes. Rapid-motion tests separately preserve genuine midpoint hit-testing and its noneditor guard. The earlier failure came from measuring while source smooth scrolling was still running.

The **fresh complete 444-scenario gate remains pending**. The current books suite passed all 94 tests. The full persistence suite is running. A new full master run is deferred at the user’s time boundary; remaining reports must be refreshed before the gate can pass. A passing subset, stale report, skipped case or inventory mapping cannot complete this goal. The gate binds source, integration tests, host boundary, dependency lock and compiled candidate. Final reports must match the frozen inputs.

Discussion and the four production architecture decisions are in [DISCUSSION.md](DISCUSSION.md). Current native evidence is in [native-shortcuts-results.json](native-shortcuts-results.json) and [native-shortcuts-final-results.json](native-shortcuts-final-results.json); host identity is documented in [MACOS-TEST-HOSTS.md](MACOS-TEST-HOSTS.md). The native lifecycle probe is [check-macos-keychain.ts](scripts/check-macos-keychain.ts), with its generated observation record at `/tmp/neo-signed-keychain-lifecycle.json`.

## Discussion cutoff

Paused at the user's 09:06 UTC cutoff on 2 October 2026. Final book suite: 94 passed. Final persistence run: 35 passed, periodic polling interrupted, two cases not run. Fresh gate: 70/444 required scenarios verified; all 444 mapped. Other suite evidence predates the final source freeze. No full-completion claim. UI runs stopped.
