# Native surface performance

Passage identity lives on paragraph, heading and code-block node views. Each view renders the schema's DOM specification, keeps its `contentDOM`, and accepts content updates while `sameMarkup` holds. An attribute change rebuilds that block with the same passage ID. These attributes never enter the document codec or checkpoint.

Author annotations remain decorations. Each projected immutable editor state constructs its `DecorationSet` once; repeated ProseMirror decoration queries return that set. Opening speech and publication attribution ranges use a cache keyed by immutable section content. The surface projects author changes independently; ViewModels update its editing capability only when lease or recovery state changes.

The dense manuscript profile isolated the prior cost to surface projection: every input rebuilt a decoration tree containing 4,000 passage-ID node decorations. Caching the completed set removed repeated queries but still rebuilt the large tree for each author transaction. Moving passage IDs into node views removed that work.

On 2 October 2026, the production Chromium fixture typed into one 100,000-word chapter with 4,000 paragraphs, retained its mounted editor view, and completed a durable four-file save:

| Measurement | Milliseconds |
| --- | ---: |
| Input to paint p50 | 19.9 |
| Input to paint p95 | 32.9 |
| Editor transaction p95 | 2.5 |
| Surface annotation projection p95 | 0.1 |
| Surface update p95 | 0.4 |
| Durable save receipt | 147.4 |

The run report is `/tmp/leafloom-dense-nodeview-profile.json`; its fixture source fingerprint is `b5a261db807ed1f04c942d48651ed8002389845a0364fff4615d182fa4209e94`. Reproduce with the `dense4000paragraph` case in `tests/neo-compat/candidate/performance.spec.ts`. Archive its attached performance JSON before another run reuses the output directory.

Mounted conformance in `tests/surfaces.test.ts` verifies editable DOM identity, rich marks, code whitespace, attribute changes, undo history and checkpoint invariance. `tests/performance.test.ts` exercises core bookkeeping and 5,000 annotation ranges separately.

The corresponding hidden macOS WKWebView fixture measured native input-to-DOM p95 at 7ms, down from 132ms in the preceding artifact, with the mounted editor retained and all four checkpoint hashes verified on reopen. Driver dispatch p95 fell from 298.4ms to 14.6ms. This fixture uses the official Tauri WebDriver contenteditable insertion path; its hidden window supplies DOM measurements rather than paint frames.

Native reports: `/tmp/leafloom-native-profile-20261002.json` and `/tmp/leafloom-native-profile-nodeviews-20261002.json`. The latter binds JavaScript `/assets/index-CRnCEhVt.js` (SHA-256 `4f026fb97452452e5c13c22325327357a96849e8ec01b2e12ca40f93fc97f871`) to desktop binary SHA-256 `adae250a3a8b7ca2f40dceffb3f4a9d008c882be36738eb1add8022ce16843c8`. Native timing, Chromium paint timing and physical keyboard input are distinct measurements.
