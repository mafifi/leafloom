# Document identity and fidelity spike

A disposable proof of passage identity, faithful NEO content and review contracts over ProseMirror. A Svelte View consumes ViewModel state and commands. Review output comes from deterministic fixtures; no agent runs.

Read [FINDINGS.md](FINDINGS.md) for the verdict and [CONTRACTS.md](CONTRACTS.md) for public semantics. [AUDIT.md](AUDIT.md) maps the approved goal to executable evidence.

## Run

From `spikes/editor-options`:

```sh
npm run identity:check
npm run identity:test
npm run identity:build
npm run identity:e2e
```

The browser journeys use headless Chromium on temporary port 5182 and shut down their server. They do not open Electron, activate a foreground window or use Keychain APIs. A manual preview can be started with `npx vite --config identity-spike/vite.config.ts`.

## Layout

- `contracts.ts`: portable Zod schemas, inferred values and `IdentityPort`.
- `conformance.ts`: provider-neutral behavioural suite.
- `fidelity.ts`: independent DOM inventory and preservation gate.
- `session.ts`: ProseMirror identity, reference mapping, history and review commands.
- `ReviewViewModel.svelte.ts`, `App.svelte`: UI journey.
- `fixture.ts`: deterministic review replies.
- `identity.test.ts`, `fidelity.test.ts`, `browser.spec.ts`: integration proof.

The provider reuses the preceding parity codec and lifecycle import/export adapters. SHA-256 passage signatures use the portable MIT-licensed `@noble/hashes` package. All changes remain isolated in the spike.
