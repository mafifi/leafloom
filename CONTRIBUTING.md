# Contributing

Start with the affected contract, its conformance cases and the nearest `AGENTS.md`. Keep changes attributable to one behaviour or boundary.

1. Describe the author action and observable result.
2. Amend the contract or migration acceptance case.
3. Add a failing meaningful test.
4. Implement the provider or presentation change.
5. Run targeted checks and the repository gate.
6. Update the decision or execution record when its truth changes.

Use exact external versions from the root pnpm catalog and `workspace:*` for local packages. Keep runtime-only imports in their providers. Select providers in the application composition root. Preserve the MIT notice and asset-specific notices when reusing code or assets.

Tests use synthetic writing and disposable private directories. Native foreground tests require explicit opt-in and a stable signed application identity. Never repeat native launches after a crash-stop receipt without investigating it. External service fixtures drive real application paths; they cannot fabricate the resulting document or UI.

Repository policy and source provenance run through `node scripts/check-repository.mjs`. Full NEO acceptance runs through `node scripts/check-neo-parity.mjs`. The latter verifies actual candidate evidence and remains failing while required migration cases are unmet.

Do not copy private prompts, research, fixtures or assets into this repository. Drawloom's contract principles are design references; Leafloom builds without a checkout of Drawloom or the projects monorepo.

GitHub checks run repository policy, strict TypeScript/Svelte checks, contract tests, a production build and the complete headless author-journey suite. Linux and Windows jobs compile the Tauri host with the committed Cargo lockfile. They do not launch a desktop window or sign a release. Browser reports and retained failure traces are workflow artifacts.

`pnpm check:parity` is the full migration acceptance gate. Keep it separate from bootstrap CI until every required scenario has the current production and reference evidence specified by the migration ledger. Passing repository checks never promotes an unported scenario.
