# Leafloom

Leafloom is a desktop writing app built around the page. Books, chapters, notes and saved fragments share a quiet workspace.

Leafloom is a rewrite derived from [NEO](https://github.com/hughhowey/neo), created by [Hugh Howey](https://github.com/hughhowey). It carries forward NEO’s page-centred author workflow in a Svelte, TypeScript, ProseMirror and Tauri architecture. NEO’s MIT notice and the original asset licences are retained in [LICENSE.neo](LICENSE.neo) and [NOTICE](NOTICE).

## Download

[Download Leafloom 1.3.5 for Apple silicon Macs](https://github.com/mafifi/leafloom/releases/download/v1.3.5/Leafloom-1.3.5-macos-arm64.dmg). Requires macOS 14 or later. Open the disk image and drag Leafloom into Applications.

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
