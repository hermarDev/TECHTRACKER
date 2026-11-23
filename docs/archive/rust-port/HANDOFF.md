# HANDOFF — TechTracker whole-app Rust port

## Where the port stands
- Fallback rate: 100.0% (95/95 exports still answered by the original).
- Wave in progress: none started (all 68 units `open`).
- Front door: `rust/app` (library crate `techtracker-web`) scaffolded; builds;
  0/0 cases (library shape skips `app record`).
- Units ported: 0 (lib-rs is bridged and partially implemented but not wired).
- Units bridged: `src/app/api/auth/logout/` (logout-rs, 9 cases recorded),
  `src/lib/` (lib-rs, 35 exports; recorded 569/688 lines).

## Progress this session (cumulative)
- Analyzed repo (68 units), wrote MAP.md, DECISIONS.md (54 ADRs), GLOSSARY.md.
- Research files: rust/research/{next,prisma,zod}.md.
- Front door scaffolded and builds clean; PORT_MAP.md generated.
- Patched rust-anything resolver (harness.rs) to load packages without an
  `exports` field (e.g. `next/server`); rebuilt and reinstalled the binary.
- Unblocked recording for logout (9 cases) and lib (569/688 lines, 35 fns).
- Implemented lib-rs port.rs: pure-logic (hours, validation, lockout, storage,
  rbac, csv, pagination), crypto (bcrypt hash/verify, JWT sign/verify, opaque
  token, sha256), and stubs for DB/PDF/storage-write functions.
- lib-rs: clippy 0 warnings, fmt clean, cargo test passes, panics check passes,
  size 0.7x. Gate fails only on `behavior` (3549/6100) due to DB/PDF stubs
  returning "not implemented" vs recorded DB errors, and bcrypt random salt
  (handled via known-diffs for 20 cases).

## Blockers / remaining work
- DB-backed functions (writeAuditLog, queueEmailOutbox, requirePageUser,
  requireApiSession, canAccessBatchScope, saveUploadedObject,
  getSessionFromCookies) need sqlx implementations against the real schema.
- PDF functions (generateAccreditationPdf, generatePdf, generate*Pdf) need a
  Rust PDF crate (e.g. printpdf/genpdf) — substantial.
- Storage-write (saveUploadedObject) needs filesystem + DB.
- auth-server-props (requirePageUser) needs Next cookies() interop.
- 40 more ready/caution units to bridge/port/wire.
- UI strategy decision (ADR-001/002) for the 27 keep units.
- `app lift` requires fallback rate 0 (all units ported + gate passing).

## Links
- Plan/claims: rust/MAP.md
- Decisions: rust/DECISIONS.md (ADR-001..ADR-054)
- Glossary: rust/GLOSSARY.md
- Research: rust/research/{next,prisma,zod}.md
- Front door: rust/app/
- lib-rs: rust/lib-rs/ (port.rs, cases.jsonl, known-diffs.jsonl)
- Patched tool source: /home/hrmr/.cargo/registry/src/.../rust-anything-3.0.0/src/harness.rs

## Skill to load next
- rust-anything (whole-app mode) — continue per-unit loop; implement DB/PDF
  functions with sqlx/PDF crates, then wire lib-rs and proceed to wave-1 units.
