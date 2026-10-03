# Three editor options — spike plan

> For agentic workers: execute the shared foundation first, then use the parallel-agent workflow for the three file-owned adapters. This is a disposable experiment, not a production migration.

**Goal:** Compare an extraction of NEO's browser editor, direct ProseMirror, and Lexical while preserving author-facing interaction, using compiled Svelte and strict TypeScript.

**Architecture:** A shared manuscript contract and author-workflow service define book structure, stable block identities, structural history, persistence and agent proposals. Three independently implemented adapters own editable DOM, native text input, formatting, selection and paste. A Svelte rune ViewModel projects state and commands to a common NEO-derived writing surface. Host services are separately replaceable.

**Tech stack:** Svelte 5, Vite, TypeScript, Zod 4, ProseMirror, Lexical, Vitest, Playwright, Electron. Dependencies and commands live exclusively inside this spike.

**Spec:** The user-approved scope in this conversation: all three options, identical manuscript/scenarios, preservation of author UX, filesystem round-trip, asynchronous agent proposals with intervening edits, and discussion-ready findings.

## Constraints

- All experiment files belong in `spikes/editor-options/`; production NEO files stay unchanged.
- No private Drawloom package dependencies. Apply its capability/interface, schema, provider and conformance principles with local contracts.
- The browser editor retains NEO's native `contenteditable`/`execCommand` mechanics and extracted behaviour where feasible; record any deliberately rebuilt behaviour.
- Each rich editor uses its real editing library. Shared author-workflow operations must not be presented as independent library capabilities.
- One shared, versioned canonical document is an experiment, not an approved migration format.
- Agent output is a proposal tied to exact source text and stable block identity; changed targets fail closed. Unrelated edits may permit a proposal to apply after revalidation.
- Use a deterministic agent for repeatable races. Do not imply live model integration or completed writing research.
- Evidence must distinguish browser automation, Electron/filesystem proof and synthetic composition from real OS IME/device tests.

## Review focus

- Text and inline formatting survive native edits and restart.
- Chapter/scene gestures preserve the split point and restore the caret on undo.
- Darlings retain formatting and restore around an intervening edit without guessing ambiguous anchors.
- A delayed proposal never overwrites changed target text or resurrects a deleted target.
- Switching engines disposes listeners and preserves manuscript/selection without duplicate events.

## Tasks

- [x] 1. Define schemas, editor/persistence/agent interfaces and fixtures. Write core tests for stale proposals, darling anchors and structural Enter/Backspace before implementation; observe failing tests. Add disk round-trip coverage.
- [x] 2. Implement manuscript operations, typed events, structural snapshots, strict boundary parsing, reversible proposals, and isolated disk persistence.
- [x] 3. Implement extracted NEO adapter (`src/editors/neo/`), including source provenance and extraction boundaries.
- [x] 4. Implement direct ProseMirror adapter (`src/editors/prosemirror/`) with custom stable-ID nodes and native transaction/selection translation.
- [x] 5. Implement Lexical adapter (`src/editors/lexical/`) with persistent block identities and native state/selection translation.
- [x] 6. Build common Svelte shell, rune ViewModel, NEO typography/theme, chapter navigation, Darlings and agent-review controls; add an isolated Electron host.
- [x] 7. Run identical real-browser workflows for all three; verify typed editing, gestures, undo, formatting, paste, composition guard, switching and delayed proposals. Capture comparison screenshots and check runtime errors. Inspect original NEO source as the behaviour reference.
- [x] 8. Run real Electron disk save/reopen proof. Run typecheck, unit/conformance/browser tests and production build. Review integrated code and repair material issues.
- [x] 9. Record observations, remaining gaps, representation tradeoffs and decision questions in `FINDINGS.md`; open the runnable comparison, complete the goal and report.

## File ownership

- Root operator: package/build config, `src/contracts.ts`, `src/document.ts`, `src/session.ts`, ViewModel/Views, host, shared tests, integration, findings.
- Adapter workers: only their own `src/editors/<name>/` directory and adjacent provider tests/notes. Shared contracts change through the root operator.

## Evidence ledger

- Initial checkout: clean `main`, NEO 1.2.4, HEAD `ed090e9`; created `feature/editor-options-spike` in the user-requested checkout.
- Drawloom reference refreshed from accepted ADR 0004 and plugin/agent source. No Drawloom files will be changed.
- Browser plugin is not available; use local Playwright for repeatable browser and Electron validation.

- Final integrated check/build: passed; Svelte zero diagnostics and strict host/renderer TypeScript passed.
- Final Vitest: 22/22 tests in 6 files passed. Core tests observed red before implementation; disk tests were added to the completed provider. Two scene-related data-loss cases were reproduced red and repaired.
- Final Playwright browser: 30/30 passed, with actual clipboard transfer and synthetic composition guard. Final real Electron: 3/3 passed, each with save/restart and immediate window-close flush/reopen.
- Original app reference is source inspection, not an automated original-app baseline; exact UX parity remains a separate production requirement documented in FINDINGS.
- Independent integrated review performed by the NEO worker; material fixes verified by targeted and final suites.
- User explicitly requested spikes here; this overrides the remembered central monorepo spike location. Production files remain unchanged. No commit or push requested or performed.

## 2 October: native stability interruption

User reported repeated Keychain approval prompts and many crashes. Electron
integration launches stopped. Eleven retained crash reports confirm genuine
AppKit/Koffi SIGSEGVs, not intentional test kills; see
`parity/CRASH-INVESTIGATION.md`. Candidate menu shutdown now removes its observer
and unregisters its callback. Dedicated development-signed hosts share a stable
certificate requirement and bundle ID; macOS harness refuses generic unsigned
fallback. See `parity/MACOS-TEST-HOSTS.md`. Both seals verified without launching.
Native encryption/relaunch and menu lifecycle checks must precede any next full
matrix. Full parity goal remains active and incomplete.
