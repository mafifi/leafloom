# Native acceptance receipts

`verifyNativeEvidence` in `scripts/check-native-evidence.mjs` validates `leafloom/native-v1` receipts directly. The native driver owns process and private fixture lifecycle. Its receipt records actual binary, managed child entry and executable, served frontend assets, executed callback modules, and production source fingerprints before and after execution.

A reviewed entry supplies the exact scenario `id`, literal `title`, `driverActions` and `assertions`. Parsed-output entries also supply `artifactFile`, relative to the retained receipt artifact directory. The validator hashes that file against the parser's recorded SHA256. `requiredArtifacts` can bind additional files with `{path, sha256}`.

Validation requires one matching finite row, a passed whole native run, unchanged current source and executed artifact hashes, and a hidden marked private fixture. Known gaps, unexecuted clauses, duplicate rows, omitted output paths and changed bytes fail validation. Foreground, credential-store and physical-picker entries require their corresponding dedicated proof instead of hidden fixture delivery.

The native result remains a native receipt. It is never converted into simulated Playwright outcomes. A full callback must finish before its rows can support migration promotion. Historical failure receipts remain in the execution ledger; registry entries retain their authored status until current reference, production and semantic acceptance evidence satisfy the complete source scenario.

Run the validator's rejection tests with:

```sh
pnpm exec vitest run tests/repository/native-evidence.test.ts
```
