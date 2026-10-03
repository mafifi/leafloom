# Approved goal completion audit

| Goal requirement | Authoritative evidence |
| --- | --- |
| Preserve NEO rich content in a versioned whole-book envelope | `contracts.ts`, `fidelity.test.ts`: supported rich corpus; unchanged raw HTML; edit/reopen/export; source folder unchanged; metadata, Darlings and auxiliary bytes retained |
| Stable references through typing | `identity.test.ts`: repeated text, insertion before target, unrelated edits retained, 1,000 typing transactions |
| Split and merge | Real `splitBlock`/`joinBackward` tests, including merged-away identity and spanning references; browser structure journey |
| Passage movement | Explicit transaction tests, native undo/redo, move after split with disconnected reference segments, JSON reopen |
| Undo/redo | Native `prosemirror-history` tests; acceptance state, IDs and reference locations; rollover and branch tests; browser acceptance journey |
| Derived structured extracts without semantic mutation | `conformance.ts`: before/after manuscript equality; `ReviewInput` rich runs, ordering, current segments and source versions |
| Deterministic suggestion and multi-passage note | `fixture.ts`; cross-chapter node and browser structure journeys |
| Accept, undo and reject suggestions | Portable conformance + actual PM/browser acceptance/rejection cases; mark preservation and idempotency |
| Stale safety | Changed text/marks, deleted targets, mismatched versions, malformed locations, pre-creation undo; rejected writes leave newer text intact |
| Unsupported content preservation | `fidelity.test.ts` unknown tags/styles/attributes/links/nested annotations; exact source preservation and refused dispatch; read-only browser journey |
| Contracts and architecture direction | `contracts.ts`, `CONTRACTS.md`, provider-neutral conformance; `ReviewViewModel.svelte.ts` and dumb Svelte View; live Drawloom ADR 0004 inspected |
| Integration tests and discussion verdict | 44 node integration tests, 4 headless UI journeys, clean type/build checks; `FINDINGS.md` |
| Background testing, agents deferred | Playwright `headless:true`; deterministic fixture provider; no native launch or agent invocation |

Run commands and file ownership are documented in `README.md`. The lifecycle suite was rerun as a focused regression check after adding the portable hashing dependency. No foreground automation was used.
