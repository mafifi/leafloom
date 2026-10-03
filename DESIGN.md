# Design

The page is the centre of the app. Preserve NEO's author workflow while giving its implementation clear owners.

## Author experience

- Keep books, shelves and author identities visible and recoverable.
- Preserve the Enter rhythm: paragraphs, scene breaks and chapters remain distinct author actions.
- Preserve poetry, chapter roles, notes, sticky markers, Darlings and manuscript navigation through editing and restart.
- Keep focus, caret, selection and scroll where the writer expects them. Undo and redo operate on author actions, including structural changes.
- Let quiet chrome reveal itself through mouse and keyboard. Every reachable control has a meaningful label, visible focus and predictable dismissal.
- Keep typography, dark/light presentation, page width and spacing tied to NEO fixtures and measured geometry.
- Run spell checking when the author enables it; retain language selection and author dictionaries.


## Future assistance

Present assistance as proposals for author review. Applying an accepted proposal uses the ordinary document history. The review contracts establish this boundary; agent execution and its review workspace follow the authoring replacement.

## State and feedback

A View renders typed presentation and calls named actions. Operation state belongs to its ViewModel. Pending saves and provider work show the operation actually running, with cancellation and recovery where supported. Local preferences, document state and permissions have separate owners.

Use semantic HTML and native text selection. Support reduced motion. Animated navigation must not overwrite a newer author caret or typing operation.

## Acceptance

`docs/migration/feature-inventory.json` owns source-defined NEO behaviours. `docs/migration/LEAFLOOM-PARITY.md` owns migration proof and visual/performance thresholds. `docs/plans/execution-ledger.md` owns current results and gaps.
