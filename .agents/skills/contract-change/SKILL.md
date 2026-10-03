---
name: contract-change
description: Change a portable Leafloom capability without leaking provider implementation or creating a second source of state.
---

# Contract change

Read `ARCHITECTURE.md` and the relevant ADR. State the observed consumer need and observable outcome before editing the API.

- Contract interfaces own domain values. Boundary schemas parse `unknown`; SDK and host values are translated by providers.
- Portable APIs expose no browser/Node/Tauri ambient types. A host binding can use an explicit generic parameter.
- Provider construction belongs to composition. Consumers depend on contracts.
- Reuse one authoritative owner for document, history, revision and permission. Events report committed results; subscriptions dispose with their owner.
- Write contrasting conformance cases against every claimed provider, including failure, interruption and invalid input.
- Update decisions and migration acceptance when semantics change. Run repository policy and targeted checks.

Avoid abstract base classes, generic service locators and new state machines unless the concrete lifecycle needs them. User authorization for the rewrite covers routine contract implementation; retain disagreements and gaps in the plan.
