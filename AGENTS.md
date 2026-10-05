# Leafloom agent guide

Read `ARCHITECTURE.md`, `DESIGN.md`, the relevant ADR and the closest area guide before changing that boundary. Follow `WRITING.md`.

- Work in this repository. Drawloom and the projects monorepo inform the design; neither is a runtime dependency.
- Define behaviour and conformance before a provider. Contracts import no provider or host SDK. Composition roots choose implementations.
- Package metadata declares `leafloom.role` and `leafloom.runtime`. Portable packages use no Node, Tauri, Electron or browser ambient APIs.
- Svelte Views receive narrow `{presentation, actions}` props. ViewModels own operation state; contracts own domain state; the editor owns author history.
- Route all author document mutations, including accepted agent proposals, through the same editor command/history boundary.
- Validate persisted, plugin, host and agent values at their boundary. Preserve unknown or unsupported author material with an explicit recovery path.
- `tests/reference/neo` is the pinned upstream oracle. Never edit it. `spikes/` and the copied legacy parity bridge are evidence, not production dependencies.
- Preserve author actions and semantic assertions when porting NEO tests. Old bridge reports never count as Leafloom evidence. A missing, skipped, retried or stale required case keeps the parity gate failing.
- Native foreground tests are explicitly enabled and use private temporary fixtures. Stop after a crash; retain evidence before another launch. Signing identity is stable across native test runs.
- Keep secrets and private writing out of logs, fixtures and committed receipts. Public CI uses synthetic books and no private services.
- Run the relevant targeted tests, repository policy, strict typing and UI checks. Report remaining gaps in the execution ledger; a scaffold or passing subset does not complete the rewrite.

Local guides: `.agents/skills/neo-migration/SKILL.md`, `.agents/skills/contract-change/SKILL.md`, `.agents/skills/writing-performance/SKILL.md`. User-authorized work proceeds without additional confirmation gates.

- Owned source warns above 400 lines (300 for `content.ts`) and fails at 1,000. Run `pnpm check:size`; split by responsibility. The check includes tests, CSS and Rust and excludes immutable references and generated bundle resources. Do not introduce a size exemption to grow an existing owner.
- Application/editor command facades bind feature operations to one live owner through typed ports. Keep host method lookup live so host replacement and race instrumentation use the current provider.
- Manuscript v2 and screenplay exchange decisions live in ADR 0004. Scene/speaker/research indexes are projections; keep them out of the persisted manuscript.
