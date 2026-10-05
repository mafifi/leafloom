# ADR 0004: Screenplay semantics in the existing manuscript

- Status: Accepted for the authorized catch-up
- Date: 2026-10-05

## Decision

Keep one book folder, one `manuscript.json`, and the existing companion files and four-file checkpoint protocol. `leafloom-manuscript/v2` adds explicit `mode: prose | screenplay` to the identity-bearing manuscript. Readers accept the three earlier envelopes. The writer commits migration through the existing lease, revision and recovery protocol; opening a book does not rewrite its files.

Keep readable chapter HTML. Screenplay paragraphs carry `data-screenplay` with one of seven elements: scene-heading, action, character, parenthetical, dialogue, transition, shot. ProseMirror has the corresponding paragraph attribute. NEO's `sp-*` classes import through an explicit mapping and remain available for compatible rendering. Preserve rich inline marks, chapter identity, passage identity and unsupported source material.

The editor contract owns mode and element commands. They share the existing document/history owner with typing and accepted proposals. Enter and Tab operate on screenplay paragraphs only; Notes and Outline retain their own editing behaviour. Scene navigation is a projection of manuscript passages, carrying chapter and passage identities. It is never saved as a second scene list.

FDX and Fountain are exchange formats. Codecs validate screenplay runs at their boundary. Reject unsupported authored structures rather than silently discarding them. FDX represents all seven elements and bold, italic, underline and strike. Fountain has no separate shot element or strike mark; those require FDX or an explicit later conversion design. A codec rejection leaves the original manuscript and import file intact.

## Module ownership

Application and editor classes keep state and composition. Bound command facades delegate to feature modules through typed operation ports. Ports read the current owner's fields and methods; they do not copy document state or capture a stale host request implementation. Views receive presentation/action slices. Native OS requests live in `os_services.rs`; the Tauri entrypoint owns startup and lifecycle.

The size guard warns above 400 source lines and 300 in `content.ts`, and fails at 1,000. Tests, Rust and CSS are included. Immutable references and generated build resources are excluded. No size exemptions remain after the initial extraction.

## Verification

Retain the historical author integration suite. Exercise screenplay commands through ProseMirror and the browser, including undo, redo, checkpoint and reopen. Exercise file codecs through the real library provider. Keep passage hash compatibility for existing prose. Keep GitHub Actions to policy, types and frontend build; run broader verification locally.

## Remaining NEO catch-up

This decision establishes the representation and command boundaries. The versioned catch-up inventory owns remaining screenplay acceptance: completion, pagination, continuation labels, scene cards, format-specific printing and further import fixtures. It also owns unrelated 1.3.5 features. These remain open until individually demonstrated by candidate integration evidence.
