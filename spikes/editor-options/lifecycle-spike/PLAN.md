# Electron document lifecycle probe

Approved question: can the authoring architecture import NEO books faithfully and protect acknowledged changes through the real Electron lifecycle?

- [x] Versioned whole-book envelope and lossless NEO-folder import/export.
- [x] Typed renderer/main ports, durable receipts and content-free IPC traces.
- [x] Ordered atomic writes, recovery and error handling.
- [x] Writer lease and optimistic external-edit detection.
- [x] Hidden signed Electron authoring/save/restart and unsaved-exit checks.
- [x] Discussion-ready results and format recommendation.

This is throwaway spike code. Use the existing signed Electron host unchanged, private profiles and temporary books. No native menus, Keychain access, personal libraries or foreground activation. Browser plugin is unavailable; use regular Playwright's Electron driver. The flow under test is imported NEO book → author edits → durable receipt → process restart → same acknowledged content. Additional flows cover conflicts, disk errors and save/discard/cancel on close.

Candidate format: one `manuscript.json` with version, revision, preserved NEO metadata, ordered sections containing their HTML, and Darlings. Rich notes/outline remain independent HTML documents. Preserve sticky JSON and image assets without interpreting them. The earlier flat block/run schema is insufficient for anchors, rich notes and existing settings; do not silently flatten them. This probe tests compatibility, not a final production schema decision.
