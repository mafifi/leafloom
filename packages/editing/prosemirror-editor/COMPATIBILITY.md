# Source history decisions

Leafloom follows NEO's author gestures through one ProseMirror history. The following history differences are deliberate improvements over the source engine and split snapshot stacks.

| Clause | Observed NEO behavior | Recommended Leafloom behavior |
| --- | --- | --- |
| NEO086-B | Enter converts empty poetry to prose. Structural Undo restores poetry; Redo leaves poetry unchanged. The source structural snapshot stack has no forward stack. | Retain reversible Enter → Undo → Redo, including exact source markup restoration on Undo. |
| NEO097/098 | Source structural snapshots retain ten entries (`app.js:6116–6132`) and structural Undo has no forward stack; native typing has a separate history. | Use one ProseMirror author history with its default depth of 100 event groups, including structural Redo. Bookkeeping and annotations do not consume author groups. |
| NEO130 | Source placeholder resolution removes the flag and note without recording a structural snapshot (`app.js:4399–4426`). | Undo restores the original flag ID and note text together; Redo removes both again. |
| NEO087-A | Native paragraph merge writes `Alpha&nbsp;beta.` with Chromium style spans. Reopening heals visible text to an ordinary space, while the saved bytes retain the prior serialization until another save. | Preserve the ordinary seam immediately in the model and checkpoint, without inserting engine style wrappers or changing spaces elsewhere. |
| NEO078-B | Deleting an empty front page removes its chapter and kind but leaves its title in `chapterTitles` (`app.js:4196`). The deleted title is unreachable in the author UI. | Remove metadata belonging to the deleted chapter identity. Undo restores its original title, kind and order. Paired native tests characterize the original orphan title separately from this cleanup. |

The source characterization and actual Electron results are recorded in `docs/migration/HIDDEN-REFERENCE-EVIDENCE.md`. Source implementation: `app.js:2294–2299`, `app.js:6116–6164`. Production conformance lives in `tests/authoring.test.ts` and `tests/annotations-paste.test.ts`; the common source acceptance expectations remain unchanged.
