# Native crash investigation — 2 October 2026

Read-only inspection. No Electron launches, runtime changes, signing changes, or Keychain operations performed during this investigation.

## Confirmed incidents

The retained `~/Library/Logs/DiagnosticReports` directory contains **11 distinct Electron crash incidents**, all dated 2 October 2026 between **06:00:26 and 06:22:49 BST** (05:00:26–05:22:49 UTC). Each has a distinct PID and incident UUID; the `.000.ips` suffix is a second process crash, not a duplicate of the other report at that timestamp. No older or nested Electron/NEO reports were found in this directory tree.

All 11 reports record:

- Electron **44.5.1**, ARM64, macOS **27.0.1 (26A434)**.
- Main thread `CrBrowserMain`, queue `com.apple.main-thread`.
- `EXC_BAD_ACCESS`, `SIGSEGV`, termination namespace `SIGNAL`, code **11**.
- Invalid-address/pointer-authentication-failure subtype.
- Top frames `objc_msgSend` → Koffi `ForwardCallGG`; ARM thread register names the Objective-C selector **`numberOfItems`**.
- Codex coalition `com.openai.codex`; parent is `node` or an already exited process.
- Process lifetime **0.692–0.947 seconds** before the crash: these reports concern startup/early menu work, rather than a long-running editing session.

| Crash report | PID | Parent PID / name | Lifetime | Incident UUID |
|---|---:|---|---:|---|
| Electron-2026-10-02-060026.000.ips | 28743 | 28742 / Exited process | 0.774s | `0DF7090E-AFA1-4EB2-ACF8-16C2A6E66B34` |
| Electron-2026-10-02-060026.ips | 28672 | 28670 / Exited process | 0.771s | `0ADC6D55-FFB8-4A5F-8BC1-4F1225A8A1D2` |
| Electron-2026-10-02-060616.ips | 30361 | 30239 / Exited process | 0.697s | `3141060B-9E22-458A-BF8F-3D1E3A2D08B4` |
| Electron-2026-10-02-060617.ips | 30369 | 30368 / node | 0.714s | `ADCB5907-C9AC-41AE-B333-E4CB67244140` |
| Electron-2026-10-02-061009.ips | 30929 | 30835 / Exited process | 0.703s | `B559AA85-47C7-460B-818B-2902296A710A` |
| Electron-2026-10-02-061010.ips | 30938 | 30937 / node | 0.745s | `16EA6006-FA47-44DB-8DC2-E947C6ADD154` |
| Electron-2026-10-02-061205.ips | 31348 | 31345 / Exited process | 0.692s | `2F8C6218-91F9-42D7-A9E3-EB2770D3C203` |
| Electron-2026-10-02-061524.ips | 32038 | 31966 / Exited process | 0.867s | `E72629BE-60F7-4971-AC1A-301CA2F2999D` |
| Electron-2026-10-02-061525.ips | 32046 | 32045 / node | 0.947s | `7576C1B3-9028-420F-9A91-A2EE27ABFDA8` |
| Electron-2026-10-02-062248.ips | 34569 | 34566 / Exited process | 0.692s | `6FA85BDF-AB8F-4CE8-9E27-2D9E0AE542A8` |
| Electron-2026-10-02-062249.ips | 34577 | 34576 / node | 0.709s | `82F5B353-41FC-40E1-AD98-3FCCFB20629A` |

Raw reports remain in `/Users/afifim/Library/Logs/DiagnosticReports/`; none were deleted or rewritten.

## Executable attribution

The `.ips` executable path is privacy-redacted as `/Users/USER/*/Electron.app/Contents/MacOS/Electron`, so it does not disclose the launch directory or original/candidate engine mode. Its Mach-O UUID **`4c4c448f-5555-3144-a1ab-f1a26eb65237`** exactly matches the installed spike binary at:

`/Users/afifim/Development/neo/spikes/editor-options/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`

The declared-original Electron 43.7.6 alias has a different executable UUID, **`4c4c4446-5555-3144-a121-364251d837cc`**. These eleven reports identify the 44 binary, not that 43 alias. The crashing image also identifies `koffi.node` UUID `4f8f6032-e53b-3180-bb6c-131e532f9990` and Electron Framework UUID `4c4c4412-5555-3144-a10a-0d09c3791472`.

## Source correlation and probable cause

Original [main.js](/Users/afifim/Development/neo/main.js:1753) obtains the count with `objc.count(edit, selector('numberOfItems'))`. [hideSystemEditItems](/Users/afifim/Development/neo/main.js:1778) reuses a raw cached `editMenuState.edit` pointer. Its notification callback at [main.js:1802](/Users/afifim/Development/neo/main.js:1802) also reuses or populates that cache.

Menu rebuilding [main.js:1676](/Users/afifim/Development/neo/main.js:1676) clears the cache before `Menu.setApplicationMenu(menu)`, then updates menu index/expected items afterward. Native menu notifications can occur during replacement. The source has no `replacing` guard to prevent a notification from reacquiring a menu pointer during that transition. A stale/deallocated `NSMenu` receiving `numberOfItems` is therefore the **probable cause** matching the native stack and selector. JavaScript `try/catch` cannot catch this native invalid-memory access.

Existing retained parity source-oracle records characterize original Electron 44 menu-rebuild `SIGSEGV`, and original declared Electron 43 foreign-item filtering failure (`NEO-277-A/B` in `registry-editing-notes-native.json`). That is consistent with this signature. Searching retained `/tmp/neo*` logs/JSON and parity reports found no matching crash PIDs or incident UUIDs: individual incidents cannot be assigned to an exact test or engine mode from current retained evidence. The reports themselves establish eleven real crashes; the probable source mechanism does not substitute for exact per-process provenance.

The later full master log `/tmp/neo-parity-full-final-run.log` records declared-original `[UPSTREAM277]` behavior and candidate `NEO-277-A/B` live menu checks passing. Those later test results do not erase or reclassify the earlier eleven crashes.

## Candidate native bridge comparison

[TypeScript native-menu-boundary.ts](/Users/afifim/Development/neo/spikes/editor-options/parity/src/native-menu-boundary.ts:27) resolves `NSApplication.mainMenu` and its current Edit submenu **for each use**, rather than storing an `NSMenu` pointer between notifications. Its `replacing` flag encloses the real `setApplicationMenu` call; notification callbacks return during replacement. Its `hiding` flag prevents recursive filtering notifications. These changes address the specific cached-menu/reentrant-replacement hazard suggested by the dumps.

The callback is registered with `koffi.register`, and the watcher is allocated/initialized without a corresponding release. The installer returns `{imp, watcher, hide}`; [launch.cjs:172](/Users/afifim/Development/neo/spikes/editor-options/parity/reference/launch.cjs:172) retains that result. Koffi's bundled `doc/callbacks.md:100–102` states registered callbacks remain available until explicitly unregistered. This keeps the callback available during normal process lifetime.

**Remaining lifetime work:** neither original nor candidate unregisters the AppKit notification observer/Koffi callback during shutdown, and the candidate has no shutdown flag or disposal method. A callback arriving while Node is tearing down remains a risk to investigate; these startup crash reports do not demonstrate that shutdown failure. The bridge also still uses raw live Objective-C pointers within synchronous FFI calls, without explicit retain/release for the duration of a filtering pass. The existing replacement/reentrancy guards reduce the known risk but are not proof against every native object-lifetime transition. Stabilization should include an explicit shutdown lifecycle and focused native menu replacement/teardown validation once launches are authorized.

## Deliberate terminations and Keychain separation

[books-helpers.ts:45](/Users/afifim/Development/neo/spikes/editor-options/parity/tests/books-helpers.ts:45) explicitly sends **SIGKILL** after a bounded cover-key Save timeout to stop a blocked native Keychain request. That is distinct from these eleven reports: all terminate with **SIGSEGV/code11**, never SIGKILL/code9. Test timeout or driver assertion failure alone is not a native crash.

No inspected crashed-thread stack contains `safeStorage`, Security framework encryption, or a Keychain operation. Repeated Keychain prompts require the separate stable signing/application-identity investigation. Signing stabilization alone does not repair the AppKit pointer hazard identified here.

All Electron launches remain stopped pending parent/user direction.

## Follow-up repair after investigation

The candidate boundary now sets a shutdown guard, removes the actual
NSNotificationCenter observer, and unregisters its Koffi callback on Electron's
`will-quit` event. This closes the observer/callback lifetime gap identified above.
The boundary continues to resolve the current menu synchronously and suppresses
notifications during replacement. TypeScript and bundle compilation are checked;
a fresh native startup/rebuild/quit run has not yet exercised this addition.

Dedicated stable signed test hosts are described in
[MACOS-TEST-HOSTS.md](MACOS-TEST-HOSTS.md). Signing does not repair invalid AppKit
pointers. All integration launches remain stopped during this review.

## Subsequent controlled verification

The repaired host also disposes the bridge before the source app's direct
`app.exit` path. The installer guards repeat registration within the process.
The actual candidate NEO-277-B menu replacement, typing and quit check passed
after these changes. Later native shortcut and book suites used the dedicated
signed hosts. A fresh diagnostic-report inventory at 10:01 BST found the same
eleven earlier incidents and no subsequent Electron or NEO crash reports.
The process ledger and crash-stop marker retain failures and prevent another
launch after an unexpected native fatal termination.
