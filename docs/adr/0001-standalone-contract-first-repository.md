# ADR 0001: Standalone contract-first repository

- Status: Accepted for the authorized rewrite
- Date: 2026-10-02

## Context

NEO's distinctive author experience must survive a complete replacement of its JavaScript/Electron implementation. Leafloom must build independently while following the maintainer's mature Drawloom contract conventions.

## Decision

Use a standalone pnpm workspace. Portable contract packages own interfaces, validated boundary values and shared conformance. Provider packages implement contracts. Composition roots select providers. Stateful lifecycles may use classes; transformations use pure functions; consumers never import provider internals.

Root documentation owns product, architecture and writing rules. ADRs own decisions. Plans own delivery status. The NEO inventory owns source-derived acceptance. The immutable upstream snapshot and its SHA-256 provenance own the reference implementation.

MIT covers Leafloom additions. NEO and asset-specific notices remain intact. Drawloom informs these independently authored rules; it is not a runtime dependency and its private material is not copied.

## Alternatives

Embedding Leafloom in the projects monorepo was rejected by the maintainer's standalone OSS requirement. Continuing the compatibility spike was rejected because original controllers and host remain the codebase to replace.

## Verification

Repository policy checks package roles, dependency direction, portable runtime imports, prohibited reference/spike imports and pinned upstream bytes. Candidate parity requires fresh Leafloom-specific results; a copied bridge report cannot satisfy it.

See [the spike-to-production source map](../migration/SPIKE-REUSE.md) for the retained implementations and new integration.
