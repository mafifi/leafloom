# Leafloom

Leafloom is a desktop writing app built around the page. Books, chapters, notes and saved fragments share a quiet workspace.

## Develop

Use the pinned Node and pnpm versions in the root manifest.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
```

The desktop application lives in `apps/desktop`. Portable TypeScript contracts and their providers live in `packages`. Tauri owns operating-system integration; Svelte owns presentation; ProseMirror owns editing transactions through the editor contract.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries, [DESIGN.md](DESIGN.md) for author workflows, and [CONTRIBUTING.md](CONTRIBUTING.md) for changes. [The rewrite plan](docs/plans/standalone-rewrite.md) tracks delivery. [The migration specification](docs/migration/LEAFLOOM-PARITY.md) defines NEO compatibility. [Spike reuse](docs/migration/SPIKE-REUSE.md) maps retained implementations into production.

## Licence

Leafloom additions use the MIT licence. NEO reference material retains Hugh Howey's MIT notice. Fonts, dictionaries and other bundled assets retain their own notices; see [NOTICE](NOTICE).
