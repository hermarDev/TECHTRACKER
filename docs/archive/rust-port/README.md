# Retired `rust-anything` harness

This directory preserves the useful parts of the `rust/` whole-app port harness that was retired on 2026-11-22.

## Why it was removed

- `backend/` (Axum + sqlx) is the live Rust runtime. `next.config.ts` proxies every `/api/*` request to it.
- The `rust/` harness was at **100% fallback**: 0 of 68 units wired, no route served by it.
- Its shape was a **library crate**, not the HTTP server this app needs. It duplicated auth, DB, validation and storage logic already in `backend/`.
- Keeping both Rust trees meant two auth stacks, two DB layers and guaranteed drift.

`rust/` was untracked, so this archive is the durable record. The full source archive (including generated napi wrappers and recorded cases) is at `/tmp/opencode/rust-archive.tar.gz`; that path is temporary, so copy it somewhere durable if you need the generated wrappers.

## What is here

| File | Contents |
|---|---|
| `DECISIONS.md` | 54 ADRs from the harness. Many are auto-accepted recommendations, not ratified decisions. |
| `MAP.md`, `PORT_MAP.md`, `HANDOFF.md` | Unit map, measured port state, and the original handoff. |
| `GLOSSARY.md` | Domain terms and their Rust names. |
| `research/` | `next.md`, `prisma.md`, `zod.md`. The other 11 promised research files were never written. |
| `lib-port.rs` | The partially implemented `src/lib` port: pure logic, crypto and stubs for DB/PDF/storage. |
| `lib-cases.jsonl.gz` | Recorded characterization cases for `src/lib` (569/688 lines, 35 functions). |
| `lib-known-diffs.jsonl` | Known intentional differences (bcrypt random salt). |
| `lib-rust-anything.json` | Harness metadata for the `lib-rs` crate. |

Generated `napi-rs` wrappers, `target/`, `node_modules/` and `.node` binaries were not copied.

## How to harvest a function

1. Pick a **pure** function from `lib-port.rs` (hours, validation, pagination, CSV, lockout).
2. Copy it into `backend/src/<module>.rs`.
3. Add `#[cfg(test)]` tests from `lib-cases.jsonl.gz` or `lib-known-diffs.jsonl`.
4. Run `cd backend && cargo test`.
5. Do **not** add `napi-rs` to `backend/Cargo.toml`; do not call generated wrappers.

DB, PDF, storage and HTTP units are not worth harvesting: `backend/` already implements them, and the harness versions were stubs.
