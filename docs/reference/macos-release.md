# macOS release

Leafloom ships as a Tauri application with its own Node 24.20.0 runtime.
The renderer invokes fixed application methods. Filesystem, spellchecking,
imports and exports run in the host process over a private pipe. Native
file dialogs and user drops grant specific paths to the host. The bundle contains web assets,
Hunspell, thirteen dictionaries, PDFKit, document renderers, Noto Serif fonts
and their complete license notices.

## Build

Run the repository gate, then build on an Apple silicon Mac:

```sh
export PATH="$HOME/.cargo/bin:$PATH"
pnpm run check:ci
pnpm --filter @leafloom/desktop build
node scripts/build-macos-release.mjs
```

Freeze the default frontend before running the release builder. It uses those
compiled assets, rejects the telemetry fixture hook and builds locked Rust
dependencies without the native driver. It stages the host with an ad-hoc
build identity; Developer ID signing occurs during assembly.

Staging checks the exact
runtime version, architecture, byte length and upstream SHA-256 against
`apps/desktop/host/node-runtime.ts`, and copies Node's complete aggregate license. `release-notices.json` records the
production JavaScript and macOS Cargo dependency notices, hashes and pinned
supplemental sources. Packaging verifies the Hunspell and dictionary notices
against the actual bundled versions before signing.

`host-build.json` records the exact bytes loaded by esbuild and the resulting
host entry hash. `source-manifest.json` binds those inputs, the frozen frontend,
production sources, unsigned executables and complete immutable resource
inventory to the built app. The builder checks source stability across the
build and writes `<app>.build.json` with assembled-host acceptance.

The output is `apps/desktop/src-tauri/target/release/bundle/macos/Leafloom.app`.
Its application identifier is `org.mafifi.leafloom`. User books live in
`~/Documents/Leafloom`, separate from NEO's library.

## Assemble a signed distributable

Use a new output path and the installed Developer ID identity:

```sh
node scripts/release-macos.mjs \
  apps/desktop/src-tauri/target/release/bundle/macos/Leafloom.app \
  /absolute/release-directory/Leafloom-preview-arm64.dmg \
  'Developer ID Application: Mostafa Afifi (QJJ98A74J8)'
```

Assembly copies the source app into a disposable directory, signs bundled Node
with the JIT entitlement, then signs the Rust shell with the Apple Events entitlement for user-requested Mail drafts. Both use hardened runtime and secure timestamps. It verifies the assembled
app, retains a signed `.app` beside the DMG, adds an Applications shortcut,
creates and signs a compressed image, and verifies image integrity. Existing
release outputs and receipts are refused. The source app is preserved.

Keep `<dmg>.assembly.json`, `<dmg>.acceptance.json` and
`<dmg>.source-manifest.json` with the app and DMG outside Git. They bind the
distributable, signed executables, compiler inputs, resource inventory and
assembled-host acceptance. Assembly verifies the source binding before signing
and immutable resources after signing.

The release target is macOS 14.0 or later on Apple silicon. The platform gate
checks Info.plist, both Mach-O architectures, deployment commands and system
dylib dependencies. Bundled Node declares and verifies its own macOS 13.5 floor.
Assembly records Gatekeeper assessments for the signed app and DMG alongside
signature verification. Notarization and installation on a clean Mac remain
separate release acceptance steps.

## Verify an assembled app

```sh
LEAFLOOM_BUNDLE_RESOURCES=/absolute/path/Leafloom.app/Contents/Resources \
  node scripts/check-bundled-licenses.mjs
node scripts/verify-macos-app.mjs /absolute/path/Leafloom.app --signed
```

Verification checks bundle structure, resource symlinks, architecture,
Developer ID signatures, team identifier, hardened runtime and timestamps.
It runs the exact bundled Node and host with a restricted PATH and a disposable
marked library, creates and opens a book, commits a four-file checkpoint, reopens the saved
manuscript, checks Hunspell, renders TXT/Markdown/HTML/DOCX/EPUB/PDF, releases
the writer lease, reads the library back, and reaps the process. It deletes only that owned fixture.

## Native acceptance

The optional `native-test` Cargo feature enables embedded WDIO plugins in debug
builds. Production builds omit the driver. A native test sets
`LEAFLOOM_FIXTURE_ROOT` to an absolute disposable directory containing
`.leafloom-fixture`; `LEAFLOOM_HIDDEN=1` keeps the window hidden. Those environment
overrides are excluded from the production shell.

Build and run the hidden test against embedded assets:

```sh
pnpm --filter @leafloom/desktop build
pnpm --filter @leafloom/desktop bundle:host
TAURI_CONFIG='{"build":{"devUrl":null}}' cargo build \
  --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --features native-test,tauri/custom-protocol
node scripts/verify-macos-native.mjs \
  apps/desktop/src-tauri/target/debug/leafloom-desktop \
  /absolute/release-directory/native-acceptance.json
```

The test uses the embedded macOS WebDriver, typing in the actual WKWebView and a private
marked library. It checks onboarding, book creation, durable autosave,
close/reopen, bundled Hunspell and native path grants. It reaps the exact
owned shell and host processes and removes its fixture.

Add `--performance` after the output path to measure opening and durable
editing of a private 100,000-word book. The macOS embedded driver's text-entry
command uses `document.execCommand`; the receipt records that transport. Input
paint percentiles require recorded event samples. Keep the receipt and any
failure screenshot with the tested artifact.

`--ui-host-recovery` types unsaved prose, kills the owned Node child, uses the
rendered recovery banner and button, and verifies a durable new local copy with
the original manuscript unchanged. `--host-recovery` separately checks process
replacement, fresh writer leases, stale checkpoint/close denial and idempotent
closing of absent sessions. `--menu-filter` inserts an actual foreign native menu
item across language rebuilds. `--cover-ui` uses a loopback provider and the marked
fixture's memory credential store, checks settings and painting while writing,
and verifies the rendered image decodes. Receipts bind the executed callback,
native binary, actual child runtime and fetched WebView assets by SHA-256.

Performance receipts separate WebDriver dispatch, WK input-to-DOM mutation and
next-frame callbacks. They retain the mounted editor and verify all four disk
hashes against a reopened receipt plus content-free checkpoint telemetry. The
hidden WKWebView may suppress frame callbacks; zero samples cannot establish
paint timing. The driver uses `execCommand` for contenteditable input.

For transaction profiling, build the frontend with
`LEAFLOOM_TELEMETRY_TEST=1` before the native test build. The receipt aggregates
fixed-name spans from the read-only diagnostic hook, separating editor
transactions, UI projection and durable checkpoints. Omit this environment
variable from the release build; the diagnostic hook is removed at compile time.

Run `node scripts/verify-macos-startup.mjs <debug-binary> <receipt.json>` to check
sanitized startup failures and byte preservation for corrupt profiles, symbolic
links to profiles, and symbolic links to the library lock. These checks use hidden
marked disposable profiles and exit before a document window is created.

See [Tauri's WebDriver guide](https://v2.tauri.app/develop/tests/webdriver/) and
[WebdriverIO's plugin setup](https://webdriver.io/docs/desktop-testing/tauri/plugin-setup/).

## Notarization and installation

The assembly script records notarization as `not submitted` and performs no
upload. A maintainer can submit the exact signed DMG using a configured
`notarytool` Keychain profile, retain Apple's receipt and log, then staple and
validate an Accepted ticket. Credentials belong in Keychain.

After notarization, install from the exact DMG on a clean test Mac and verify
launch, save/reopen, spellchecking, export and preservation of existing books.
Record the installation result with the retained artifact hash.

## Platform and Cover Art verification

The arm64 application requires macOS 14.0 or later. The bundled Node 24.20.0
Mach-O records macOS 13.5; the shell and Info.plist record macOS 14.0. Run
`node scripts/verify-release-platform.mjs PATH/Leafloom.app` before signing.
The gate checks CPU architecture, both Mach-O deployment targets, runtime
manifest and system-only dylib dependencies against the Info.plist minimum.

Cover Art credentials use the application-scoped native credential store.
The provider reads saved manuscript excerpts in an owned, separate Node worker.
Only model availability errors advance model fallback; authentication, quota
and transport failures finish the job with a content-free error code. A second
job for the same book is refused until the first job ends.

Append `--cover-art` to the hidden native acceptance command to exercise an
offline loopback provider with an in-memory fixture credential. The test holds
the image response, verifies the main host continues responding, refuses a
duplicate job, and checks the durable art image and sidecar before clearing
the fixture credential. It makes no provider request and accesses no Keychain.

## Local release channel

Leafloom uses a manual release channel. Version and About information come from
the application package. `updateStatus` and `checkForUpdates` return the typed
`disabled` state with `release-channel-unconfigured`; they perform no network
request. Configure a Leafloom-owned release endpoint and verification key
before enabling a remote update provider.

The native shell registers the Single Instance plugin before other plugins.
A second launch focuses the existing main window. A held OS file lock inside
the selected library also excludes parallel owners during launch races and
across different profiles. The private acceptance configuration gives each
marked fixture a separate application namespace and refuses a second launch
against that same fixture without bringing its hidden window forward.

On macOS, closing the main window saves and releases the current book, then
hides the window. Reopening from the Dock shows the writing library. Quit
requests use the same save path before the shell stops and reaps every owned
host and Cover Art worker. Startup failures produce a native error dialog
with a fixed diagnostic code; hidden fixture runs suppress the dialog.

Cover jobs persist progress in the book's `art-job.json`. After a restart,
unfinished jobs report `INTERRUPTED` and wait for an explicit retry. A completed
`art.json` carries the job ID and image SHA256. The host verifies the artifact
before returning a recovered result or rendering a painted cover.

Export renderers read saved typography preferences. HTML embeds selected bundled
faces with their Unicode ranges and metric overrides; EPUB retains reader serif
typography. DOCX names the chosen family; PDF subsets bundled variants or installed
system families and uses the bundled Noto Serif fallback.
System font files remain on the user's machine. PDF glyph selection tests actual
font coverage and keeps combining sequences together. Unsupported bundled
WOFF2 subsets use Noto Serif; installed families remain selected for glyphs they
support. Generated output labels use the stored interface language; the
manuscript language remains the EPUB identity and document language. Custom
titles retain their exact text.

An unexpected main-host exit emits `leafloom:host-failed` with a fixed
`HOST_UNAVAILABLE` or `HOST_PROTOCOL` code and restart capability.
`restartHost` replaces and reaps the failed process, then requires the client
to reopen documents and acquire fresh writer leases. Checkpoints carrying an
old lease are rejected. Append `--host-recovery` to native acceptance to kill
the owned fixture host and verify this boundary, preserved manuscript bytes
and refusal to restart a healthy process.

DOCX imports bound decompressed document XML to 20 MB and styles XML to 5 MB
before parsing. DOCX XML and TXT/Markdown inputs require valid UTF-8.
Rejected imports leave the library unchanged.

Email draft requests may carry `expectedFingerprint`, the saved title/prose
SHA-256. The host loads an isolated durable snapshot and rejects a mismatch with
`EXTERNAL_CHANGE` before creating an export. The accepted snapshot remains the
PDF source through asynchronous cover rendering.

The filesystem provider suite kills an isolated Node worker after each sequential
replacement, before the final manuscript replacement and after all four fsyncs.
Reopening retains newer valid files, exposes review-version mismatch, reacquires
the writer lease and rejects stale expected hashes before any replacement.
These fixtures exercise process termination; power interruption uses a separate
filesystem test environment.

The native shell starts its bundled host with `NODE_ENV=production` and clears
ambient Node preload, search-path and REPL options. Append `--runtime-env` to
hidden native acceptance to supply an invalid ambient Node option and verify
the application still uses its bundled host.

PDF drop caps use the source platform font stacks: Didot, Apple Chancery and
Futura on macOS; Libre Bodoni, TeX Gyre Chorus and Jost lead the Linux stacks.
The renderer measures actual glyph ink and wraps the first two prose lines
beside the initial at the source 1.7 line height. Opening dialogue and disabled
caps retain ordinary glyph sizes. The export suite inspects embedded fonts,
glyph positions and extracted text, including rich text and opening poetry.

Desktop deletion holds a writer lease while the native provider moves the
original book folder to system Trash. macOS removes that exact lease from the
OS-returned destination so Put Back restores a writable book. Native failure
returns `TRASH_UNAVAILABLE` and keeps the library entry. The development host
uses the recoverable `LibraryRoot/Trash` fallback. `DeletionReply` identifies
`system-trash` or `library-trash`; reserved library directories and mismatched
manuscript IDs cannot be deleted as books.

Run the actual macOS Trash fixture without a window or Finder activation:

```sh
LEAFLOOM_TEST_SYSTEM_TRASH=1 cargo test \
  --manifest-path apps/desktop/src-tauri/Cargo.toml system_trash
```

The fixture verifies preserved bytes and lease removal, then cleans up only the
exact destination returned by NSFileManager. Windows and Linux use the pinned
system Trash provider. Run native acceptance separately on each platform.

WebP custom covers retain their original bytes in the library, HTML and EPUB.
PDF and email rendering decode pixels through a pipe-only mode of the bundled
Rust executable. The helper accepts bounded WebP bytes on stdin, emits a fixed
ABI header and RGBA on stdout, and exits before Tauri or AppKit initializes.
The host validates canvas and coded-frame dimensions, preserves transparency
and renders the first animated frame. A ten-second timeout terminates stalled
helpers; Unix helpers also exit when their parent host disappears.

The native shell injects its own executable path into the host. For development
or codec acceptance, set `LEAFLOOM_IMAGE_DECODER` to the freshly built executable.
Both the host and release verifier require the codec ABI marker before invoking
a binary. The assembled-app gate verifies actual decoded pixels and a WebP PDF
with development runtimes removed from PATH. The codec uses the pinned pure
Rust `image` and `image-webp` crates.

`verify-macos-codec-lifecycle.mjs` kills only its owned fixture parent while
holding the helper input pipe open. Immediate and delayed termination verify
that the helper exits without EOF; the release builder runs both cases against
the actual assembled executable.

User-requested manuscript and chapter printing uses a UUID-owned temporary HTML
file, with directory mode 0700 and file mode 0600 on Unix. The preview permits
only its exact document URL, embeds a restrictive document CSP, waits for fonts
and images, and removes the owned file when the preview closes. macOS retains
the preview until AppKit returns from the print operation; other platforms keep
the preview available for the user to close after printing. File transport
preserves books larger than the data-URL limit recorded in the original NEO
printer. The application CSP permits bundled data fonts.

```sh
node --experimental-transform-types scripts/verify-macos-print-fonts.mjs \
  /absolute/release-directory/print-font-proof.json
```

This headless Chromium proof loads actual generated host HTML from private files,
checks the selected font under the CSP and retains the ending of a large Unicode
manuscript. Native print sheets remain a separate user-invoked acceptance step.

Hidden document import/export acceptance enables `--document-io` in the native
driver. The debug-only `native-test` picker provider consumes queues from the
marked fixture's `.leafloom-dialogs.json`. Existing sources and output parents
must resolve within the fixture; missing responses fail without opening a
system dialog. Converters and path grants remain the production implementations.
The release build excludes this provider.

PDF export bundles pinned Noto Serif CJK JP Regular and Bold 2.003 from the
official Noto CJK repository, alongside their complete SIL OFL and upstream
notice. The selected writing font remains in use for supported glyphs. CJK
italic and bold italic text uses the matching fallback face with PDF oblique
painting. Unsupported grapheme clusters return `PDF_GLYPH_UNAVAILABLE` before
replacing an existing destination.

`node scripts/verify-release-fonts.mjs` verifies both font provenance manifests,
exact font and legal-text hashes, regular files and official source revisions.
The release builder repeats this check on bundled resources. Actual PDF tests
inspect extracted text, embedded faces, glyph coverage and oblique operators.

Whole-book export assigns a UUID through the editor's normal leased checkpoint
before preparing output. EPUB uses the same `urn:uuid:` identifier in OPF and NCX
across repeated exports and reopen. Bound collection export persists its UUID in
`shelf.binding.uuid` through the library writer and passes the validated UUID to
the host. Unbound anthology exports create a fresh edition UUID.
