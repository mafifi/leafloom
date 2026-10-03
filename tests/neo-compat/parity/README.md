# NEO ProseMirror parity proof

This phase replaces representative comparison coverage with an exhaustive feature specification, original-app reference tests, target integration tests and a traceability gate.

The active plan is [PLAN.md](PLAN.md). The independently mined inventory and coverage audit define required shipped desktop behaviour. Roadmap ideas and Pocket-specific behaviour are classified separately.

## Reference environment

`reference/launch.cjs` runs a byte-for-byte snapshot of original NEO source in a marked temporary profile. Documents, app data, settings, manuscript files and backups are private to the test. External service requests, native system preference writes and external navigation are intercepted. The reference uses original NEO's native editor; it does not substitute a document-model mock.

```sh
# Run from spikes/editor-options
npx playwright test --config parity/reference.config.ts
node parity/scripts/check-coverage.mjs
```

The coverage gate deliberately fails until all required scenarios have registry entries and successful reference/target report evidence. Reports are generated verification artifacts and are ignored by Git. Each entry must declare author actions and observable assertions; passing the gate does not replace semantic review of the test's validity.

## Completion standard

Every shipped feature must have source/doc evidence, explicit acceptance scenarios, valid integration coverage and a faithful passing ProseMirror implementation. No skipped or expected-failure scenario counts toward success. The earlier three-provider spike's passing tests remain regression coverage and do not establish this full parity goal.
