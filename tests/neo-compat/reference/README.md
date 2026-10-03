# Original NEO reference adapter

The pinned source in `tests/reference/neo` is the original oracle. `launch.cjs` snapshots its files into a marked temporary directory, places Electron settings and Documents inside that directory, and intercepts outbound HTTP, mail, updates and external navigation. Editing, filesystem writes and the original controllers remain real. Hidden mode forces native windows to remain invisible, suppresses native activation and denies credential writes and safeStorage operations.

Install this separate test-only dependency set with `pnpm --dir tests/neo-compat/reference install --ignore-workspace`. On macOS prepare the certificate-signed reference host with `NEO_PARITY_SIGN_IDENTITY="<existing certificate identity>" node tests/neo-compat/reference/prepare-macos-host.mjs`. The pinned original runtime is Electron 43.7.6; the stable host identity is `org.neo.editor-parity`.

The reference command is explicitly enabled and defaults to hidden renderer testing:

```sh
LEAFLOOM_NATIVE_REFERENCE=1 LEAFLOOM_REFERENCE_HIDDEN=1 pnpm exec playwright test --config tests/neo-compat/reference/playwright.config.ts authoring.spec.ts outline.spec.ts
```

The shared authoring cases use actual UI actions in both implementations. The browser candidate uses a private development filesystem host; the reference adapter uses Electron and its own private profile. Leafloom code is never injected into the original reference. A launch failure or native crash writes a safety stop beside the signed runtime. Inspect the process ledger and macOS diagnostic report before resuming.

Private fixtures are retained after a run for disk and artifact inspection. They live under the OS temporary directory and can be removed once evidence is captured. Source settings, the user's Documents library and existing Keychain entries are outside the fixture.

`LEAFLOOM_REFERENCE_HIDDEN=0` enables the source's native windows and credential behavior for separately authorized foreground cases. Hidden results are labelled `electron-reference-hidden`; the parity gate excludes them from native foreground acceptance. Native menu watcher injection remains disabled unless a host fixture explicitly enables it.


Hidden default groups exclude Notes and Sticky cases that operate the global native clipboard. The adapter rejects explicit clipboard writes in hidden mode. Run safe groups in bounded batches; renderer results remain separate from foreground native acceptance.
