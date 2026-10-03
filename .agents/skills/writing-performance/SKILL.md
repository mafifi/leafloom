---
name: writing-performance
description: Measure author interaction and durability on reproducible synthetic books while retaining correctness evidence.
---

# Writing performance

Measure the actual production surface before optimizing it. Use synthetic 10,000/100,000-word books with declared paragraph/chapter counts, typography and window size.

- Separate cold start, typing-to-visible-update, selection/navigation, rendering and durable save/recovery.
- Record runtime/hardware, build hashes, fixture seed, samples and p50/p95. Use observable completion rather than arbitrary sleeps.
- Capture one reproducible baseline, optimize the measured owner, then repeat the affected measurement and semantic regression suite.
- Keep one editor history and actual native input. No hidden mirror, swallowed author event or fake state update may improve a number.
- Test cancellation, late replies, background polling and long-book scroll/caret retention.
- Report native host and browser evidence separately. Filesystem fsync and receipts are not rendering latency.

Store evidence under `.leafloom/evidence` and update the execution ledger. Passing a small synthetic sample does not prove full NEO acceptance.
