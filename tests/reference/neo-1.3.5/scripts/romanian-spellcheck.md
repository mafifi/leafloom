# Romanian dictionary evaluation

> Update, 2026-09-30: NEO now checks spelling with Hunspell (WebAssembly)
> instead of nspell. Hunspell reads `dictionary-ro` as published, so the
> flag conversion described below is gone; cedilla normalization stays.
> The nspell measurements below are kept as the record of that evaluation.

Evaluated on 2026-09-28 with nspell 2.1.5, Node 25.8.1, macOS arm64.
`dictionary-ro` 3.0.0 was the current npm release. The registry archive
contains seven files, including `index.aff`, `index.dic`, and `license`,
and is 2,263,919 bytes unpacked. Initial evaluation used a temporary
directory and the project's installed nspell before adding the dependency.

## Performance and correctness

Run `node scripts/benchmark-spellcheck.js` for three trials of each
dictionary. Every trial starts a new process with a fresh nspell instance;
filesystem caches are warm. Load time includes reading the dictionary and,
for Romanian, the compatibility conversion. Memory is measured after an
explicit garbage collection. These are local measurements, not limits.

| Dictionary | Load time | Retained JS heap | Peak process RSS |
|---|---|---|---|
| US English 2.2.1 | 52–59 ms | 12 MiB | 86 MiB |
| Romanian 3.0.0, unadapted | 539–583 ms | 83 MiB | 220 MiB |
| Romanian 3.0.0, compatible affix flags | 1,577–1,586 ms | 180 MiB | 428 MiB |

Romanian is acceptable in the existing utility process, though it uses
considerably more memory than English. Restoring all affix rules costs
about one extra second. The renderer remains free to accept input while
the worker loads. The `frgament` to `fragment` suggestion took 10–11 ms.

The unadapted dictionary rejects `trebui`, `citi`, and `merge`. Romanian
uses the same flags for prefix and suffix rules. nspell stores only one
rule per flag, so the later prefix overwrites the suffix. `spell-ro.js`
assigns unused flags to those prefixes and adds them to the corresponding
dictionary entries in memory. Both rules and their combinations then work.
The dependency is pinned because this conversion assumes single-character
flags with no continuation classes. Tests check those assumptions.

`npm run test:spellcheck` exercises the worker with the original sentence,
inflected and prefixed words, misspellings, suggestions, learned words,
failed loads, language changes, and persisted defaults. Romanian lookup
normalizes NFC and maps legacy cedillas to comma-below letters. It keeps
original response keys and manuscript offsets. Other dictionaries keep
their existing lookup behavior. Diacritics are not stripped, and both
`sa` and `să` remain valid dictionary entries. This is not a grammar checker.

## Distribution

The [upstream notice](https://github.com/wooorm/dictionaries/blob/main/dictionaries/ro/license)
offers GPL, LGPL, and MPL alternatives for the dictionary data. NEO selects
MPL 1.1. The packaging project's MIT license does not cover that data.

[MPL 1.1 sections 3.1–3.7](https://www.mozilla.org/en-US/MPL/1.1/)
require the license and notices to accompany the covered source, source
availability for modifications, and documentation of changes. Section 3.7
allows a larger work under separate terms while preserving those obligations
for the dictionary. NEO includes the full license, upstream attribution,
an Exhibit A notice, source locations, and a dated description of the
runtime conversion. The conversion code ships as source in `app.asar`.

The original `.aff` and `.dic` files ship unchanged and unpacked beside
their notices at `resources/app.asar.unpacked/node_modules/dictionary-ro`.
This provides the source with the app, including offline installs.
The exact npm archive is also linked in the notice. Keep these resources
when changing the build configuration or dictionary version.

Verify an unpacked build, for example on macOS:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --dir --publish never -c.mac.identity=null -c.mac.notarize=false
node scripts/check-romanian-package.js dist/mac-arm64/NEO.app/Contents/Resources
```

This checks the packaged source and notices byte for byte, and confirms
that the archive contains the current worker and compatibility code.
