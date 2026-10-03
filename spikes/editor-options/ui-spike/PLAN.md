# Responsive authoring UI spike

Question: can ProseMirror own the editable state while Svelte exposes a small MVVM projection, with one recoverable manuscript file per book?

Approved scope: preserve representative NEO gestures and paper appearance; typed commands and ports; local OpenTelemetry; headless responsiveness tests; ordered saves and recovery. Agents are deferred. This is disposable evidence, not production architecture.

- [x] Define manuscript, UI and storage contracts and executable oracles.
- [x] Implement ProseMirror history with atomic Darlings metadata.
- [x] Build presentation-only Svelte view and command-owning ViewModel.
- [x] Keep typing outside whole-book serialization; measure the existing session pipeline as baseline.
- [x] Exercise real browser typing, formatting, structure, navigation, notes, Darlings, history and reopen.
- [x] Test real files and process interruptions; record results and decisions.

Candidate files: `manuscript.json` retains the existing minimal `neo-spike/v1` contract (book metadata, ordered chapters/blocks/runs, Darlings). `notes.txt` and `outline.txt` are independent documents. Chapters do not own files. Saving each file uses an ordered temporary-write, sync, backup, replace sequence. Recover from a validated previous version if the current manuscript is damaged. No derived research structure is persisted.

Budgets on this machine in headless Chromium: keydown-to-commit p95 ≤ 10 ms; typing-to-next-frame p95 ≤ 50 ms and p99 ≤ 100 ms; representative structural command-to-next-frame ≤ 150 ms. Probe 5 and 500 paragraphs; this is a responsiveness boundary experiment, not a maximum-book claim. Browser frame timing measures rendering readiness, not display photon latency. Each keystroke must cause zero manuscript snapshots. Contract tests verify content, identities, formatting, history and storage independently of timing.

Use standard OpenTelemetry trace and metric SDKs locally. Fixed command/stage names and numeric attributes only; no prose, notes, document titles, IDs or paths. Telemetry errors must not prevent writing. Test collection and save spans separately from UI frame metrics.

Validation: strict TypeScript/Svelte check, node contract and storage tests, production build, headless Chromium integration tests with screenshots. Do not launch Electron or native menus.
