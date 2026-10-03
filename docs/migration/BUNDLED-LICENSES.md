# Bundled license material

Leafloom source additions use MIT. NEO-derived algorithms retain Hugh Howey's MIT attribution in `LICENSE.neo` and source comments. Fonts, dictionaries, the embedded spelling engine and third-party packages retain their own terms.

| Material | Retained terms and provenance |
|---|---|
| Hunspell engine 1.7.3 | MPL 1.1 selected from upstream MPL/GPL/LGPL alternatives; full license, attribution and exact source commit retained |
| `@farscrl/hunspell-wasm` 1.0.1 wrapper | Package MIT license; wrapper release commit and pinned Hunspell submodule recorded separately |
| Romanian dictionary 3.0.0 | Full upstream attribution and selected MPL 1.1 text; unmodified `.aff`/`.dic` source files bundled |
| Portuguese dictionary 4.0.0 | Full upstream attribution and selected MPL 2.0 text; unmodified `.aff`/`.dic` source files bundled |
| NEO/Noto fonts | Original font notices, SIL OFL and font provenance accompany the actual font files |
| Noto Serif CJK JP Regular/Bold 2.003 | Official `noto-cjk` commit `9b0f1436e455d902de067a2501422e5dc71ad16b`, SIL OFL, exact font hashes and retained attribution in `provenance-cjk.json` |
| Node runtime | Aggregate Node license accompanies the pinned runtime |
| npm and Cargo dependencies | Installed notices plus pinned supplemental upstream material; package versions, source revisions and text hashes recorded by the host release collection |

`docs/migration/bundled-licenses/source-provenance.json` pins the wrapper release to `63f4605a9185b9fa211910eea68510dea8095d4c` and its Hunspell submodule to `c5f98152a274e25b5107101104bef632b83a0cc9`. The exact [upstream release tree](https://github.com/farscrl/hunspell-wasm/tree/63f4605a9185b9fa211910eea68510dea8095d4c) includes the native build recipe and engine submodule reference.

The host staging process copies the complete license collection into `host/licenses`, alongside the dependency and source provenance receipts. Retain actual upstream copyright statements. Supplemental metadata declarations and standard permission text have distinct provenance; they are not invented upstream copyright notices.

Before distributing an artifact:

1. Generate the release notice collection from the installed production dependencies and Cargo metadata used for the build.
2. Run `node scripts/check-bundled-licenses.mjs` against installed source packages.
3. Run the same command with `LEAFLOOM_BUNDLE_RESOURCES` set to the actual app's `Contents/Resources` directory. It verifies complete upstream text hashes, pinned package versions, dictionary source files and notices in the artifact.
4. Record the corresponding source distribution for covered source files and any modifications. Preserve dictionary source data and provide the pinned engine source and wrapper build materials according to the selected [MPL 1.1](https://www.mozilla.org/en-US/MPL/1.1/) and [MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/) terms.
5. Sign the verified artifact, then retain its identity, build and notice receipts together.

Changing a spelling package, dictionary or covered source file requires updating its source and license receipts before packaging. A package's top-level SPDX field does not replace its retained license texts or the terms of embedded code.

`node scripts/verify-release-fonts.mjs` verifies both Latin and CJK source provenance and exact font bytes. The release resource gate verifies the staged counterparts in the app bundle.
