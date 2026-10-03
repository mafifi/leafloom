# Stable macOS test hosts

The parity harness launches dedicated development-signed Electron bundles from
`node_modules/.neo-parity-hosts/`. It never falls back to the unsigned npm runtime
on macOS. Upstream npm bundles remain unchanged.

Both pinned runtimes use bundle ID `org.neo.editor-parity`, app name `NEO Parity`,
and the same certificate signing requirement. Fixture profiles and libraries
remain disposable; executable identity does not change between test cases.

Prepare once using an existing local certificate:

```sh
NEO_PARITY_SIGN_IDENTITY='Apple Development: Your Name (certificate identifier)' npm run parity:prepare:macos
```

The preparation command preserves framework symlinks and runtime entitlements,
signs nested code and the dedicated bundle, verifies its complete seal, and
records the upstream runtime hash and signing requirement. It reuses verified
bundles until the pinned runtime or certificate changes. The launch harness
checks the actual certificate requirement and sealed bundle before each launch.

This follows Drawloom's stable bundle identity and certificate signing approach.
These are local development hosts; release signing and notarisation are separate.
No Keychain access lists, credentials or macOS security preferences are modified.

## Verification record: 2 October 2026

Both runtime bundles pass `codesign --verify --deep --strict`. Both report the
same certificate-based designated requirement and Team ID. TypeScript checks
and renderer/host builds pass. No Electron application was launched during
preparation or signature verification. Absence of repeated Keychain prompts
still requires a real encryption round trip and relaunch in an unlocked desktop
session. An existing approval for generic Electron may not cover NEO Parity.

The crash investigation is recorded in [CRASH-INVESTIGATION.md](CRASH-INVESTIGATION.md).
Signing addresses identity; native menu pointer lifetime is a separate repair.

Subsequent unlocked-desktop verification used the real safeStorage provider:
Electron 43 encrypted a synthetic secret, Electron 44 decrypted it after a
relaunch, and Electron 43 decrypted it again. All three operations succeeded
without repeated permission prompts. The retained lifecycle record is
`/tmp/neo-signed-keychain-lifecycle.json`. Paired actual cover-settings Save and
Remove checks also passed. No encryption implementation or Keychain response
was substituted.
