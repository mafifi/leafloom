# Architecture

Leafloom is a standalone Svelte 5 and TypeScript desktop application packaged by Tauri. Portable contracts define behaviour; providers implement it; application composition chooses providers.

## Boundaries

| Owner | Responsibility |
|---|---|
| Document contracts | Versioned document values, chapter identity and roles, annotation identity, serialization and validation |
| Editor contracts | Author commands, selection, transaction results, snapshots and one undo/redo history |
| ProseMirror provider | Visible editor surfaces, DOM/position mapping and actual editor transactions |
| Review contracts | Revision-bound proposals, conflicts, author acceptance and dismissal |
| Host contracts | Scoped files, native dialogs, clipboard, menus, spelling and application lifecycle |
| Browser host | Disposable development/test fixtures through the same host contract |
| Tauri/Rust host | Native OS services, scoped grants, lifecycle and native image codec |
| Managed Node host | Bundled TypeScript LibraryHost and filesystem-documents persistence, leases, durable receipts, backup and recovery |
| ViewModels | UI operation state, derived presentation and named actions |
| Svelte Views | Accessible rendering and layout through narrow presentation/action props |
| Composition root | Provider selection, subscription lifetimes and application startup |

Portable contracts contain neither DOM nor operating-system SDK types. Providers translate external values. A package declares `leafloom.role` (`contract`, `provider`, `consumer`, `runtime`, `composition`) and `leafloom.runtime` (`portable`, `browser`, `node`, `tauri`). Application Views never select providers.

## Author transaction path

```text
keyboard / pointer / menu / accepted proposal
                   ↓
           editor command contract
                   ↓
      transaction + one author history
                   ↓
       immutable document revision
             ↙             ↘
      presentation       host persistence
```

Typing, formatting, paragraph/chapter operations and accepted review-contract proposals share one document history. Focused metadata fields retain their native field history while editing; committing the field joins document history. External structural reconciliation establishes a new history boundary. [ADR 0003](docs/adr/0003-document-history-and-durability.md) defines these transitions. ViewModels do not maintain a second document or document undo stack. Provider events describe committed outcomes; listeners cannot mutate a document behind the command boundary.

## Storage

The managed Node child owns durable storage through bundled TypeScript `LibraryHost` and `@leafloom/filesystem-documents`; Rust mediates native services and grants. Packaging pins the Node runtime and records bundled host/resources in its manifest. Runtime diagnostics and native receipts identify and hash the actual child executable, host entry and served WebView assets.

Persist portable author content independently of UI decorations. Import NEO chapter HTML and side data through an explicit codec, preserving identities and unsupported material. The persistence protocol records a four-file save receipt and supports interruption recovery; [ADR 0003](docs/adr/0003-document-history-and-durability.md) owns the required semantics. A read or revision mismatch never silently overwrites newer author work.

## Assistance

Review contracts and the editor provider support revision-bound proposals, acceptance, dismissal and shared document history. Agent/plugin discovery, configuration, execution and a mounted review workspace are deferred.

Future assistance providers receive bounded document revisions and return validated proposals. Installation, configuration and tool permission have separate owners. Provider SDKs, host credentials and filesystem authority belong inside their providers.

## Dependencies and evidence

No production module imports `spikes/`, `tests/reference/neo`, the copied Electron bridge, Drawloom or the projects monorepo. Re-express architectural principles in Leafloom-owned contracts. Preserve upstream MIT and asset notices. Record licences for bundled/transitive dependencies and downloaded models separately.

The original Electron reference adapter, browser candidate adapter and native Tauri candidate adapter remain distinct. The full parity gate accepts only fresh Leafloom-specific integration evidence. Architecture decisions live in `docs/adr`; bounded work and unresolved acceptance live in `docs/plans`.

## Screenplays and source size

[ADR 0004](docs/adr/0004-screenplay-semantics-and-manuscript-v2.md) defines screenplay elements and `leafloom-manuscript/v2`. The storage layout remains unchanged. Typed paragraph semantics survive save and reopen; scene navigation derives from passage identity. Mode and element changes join author history. Exchange codecs validate runs and reject unsupported material.

Application and editor state owners compose bound command facades and focused feature modules. Operation ports access live owner values and methods, retaining one document, history and lifecycle. `check:size` warns at 300–400 lines and blocks owned files at 1,000; policy runs it in the existing lightweight CI job.
