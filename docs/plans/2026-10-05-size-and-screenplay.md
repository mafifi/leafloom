# Size budgets and screenplay semantics

Authorized scope: introduce source-size enforcement; split oversized owned files by responsibility; extend the manuscript and editor contracts for NEO 1.3.5 screenplay behaviour; preserve existing history, identity, durability and parity.

1. Add a fast size guard and boundary tests. Warn source at 400 lines and content at 300; fail at 1,000. Include tests, CSS and Rust. Exclude immutable references and generated bundles. Freeze existing oversized files at their current sizes during extraction, then remove each exception.
2. Extract application feature operations, editor feature operations, styles and native host operations into focused modules. Keep one editor state/history and the existing author interaction tests.
3. Version the manuscript with explicit prose/screenplay mode. Validate screenplay element semantics, preserve unknown material, migrate old manuscripts without losing content or identity. Keep the four-file storage protocol.
4. Integrate screenplay paragraph semantics, element commands and Enter/Tab behaviour through the editor boundary. Add codecs and derived scene/speaker projections.
5. Run policy, typing, CPU tests and relevant browser integration locally, one heavy job at a time. Keep GitHub Actions unchanged and lightweight.

Progress and rulings go in execution-ledger.md. No source reference is editable. The architectural proposal approved in this conversation is the spec; use the existing catch-up inventory as observable acceptance.

## Implementation status

- Size guard and all eight oversized extractions complete; zero exceptions. Application and editor retain live state/history ownership.
- Manuscript v2, legacy identity compatibility and explicit screenplay element contracts implemented without adding files to the book layout.
- Element commands, Enter/Tab, native element shortcuts, mode switch, scene navigation, Courier Prime and FDX/Fountain provider exchange implemented. Speaker completion remains part of the open NEO 1.3.5 feature inventory.
- Policy and strict checks pass. Frontend build and native-test Rust compilation pass. CPU suite: 635 passed, three existing optional codec skips, 82 files; the final bounded run uses two workers. Two screenplay browser cases pass, including native input, history and reopen. The retained 470-journey run passes with zero skips, retries or flaky cases; its recorded fingerprint matches live inputs.

See execution-ledger.md for source characterization, review fixes and final receipts.
