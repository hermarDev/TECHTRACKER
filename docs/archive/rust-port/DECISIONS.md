# TechTracker — Whole-app port decisions

Source of truth for the Rust port. ADRs are numbered in creation order and never
renumbered; a changed decision gets a new ADR that supersedes the old one.
Recommended answers come from `rust-anything analyze . --whole-app` (see
`rust/MAP.md`); adopted as defaults here, subject to user override.

## ADR-001: Shape of the port
Status: accepted (2026-11-22)
Context: `rust-anything analyze` detects the package as a **library** (no `main`,
no server): the package's public API is the surface. The original is a Next.js
web app (frontend + API routes); rust-anything does not model a Next.js server as
an entry point.
Decision: Treat the package as a library of units per the tooling. Port the API
route handlers and shared `src/lib` units to Rust (napi-rs bridge) and keep the
UI/page units in the source language behind the front door. The UI replacement
(whether a Rust frontend framework or the existing Next.js shell) is deferred
until the backend units are Rust; revisit at cutover.
Consequences: `rust/app` is a library crate, not a binary. No `app record`/HTTP
replay; proof is per-unit `record`/`diff`/`gate`. UI stays TypeScript for now.

## ADR-002: Scope
Status: accepted (2026-11-22)
Context: 68 units: 38 ready, 3 caution, 0 blocked, 27 keep (UI/editor).
Decision: Port every ready and caution unit (API routes, lib, prisma access).
Keep the 27 UI units in the source language for now, behind the front door, and
decide their replacement after the rest is Rust. No features dropped.
Consequences: Fallback rate cannot reach 0 until UI units are either ported or
explicitly excluded from the "app" surface; lift will be revisited.

## ADR-003: Equivalence bar
Status: accepted (2026-11-22)
Context: API returns JSON; HTTP status codes, error messages, and field values
must match for the frontend to keep working.
Decision: Byte-for-byte JSON where the original's `NextResponse.json` output is
stable (key order preserved via serde `preserve_order` / indexmap). Floats:
integers and strings exact; floating-point results within `1e-9` relative
(`--float-tolerance 1e-9`) where math is involved. Exit codes and error text
must match. Clock/random-dependent results pinned via `--pin-clock`.
Consequences: `record` uses `--float-tolerance 1e-9` for numeric units and
`--pin-clock` where `Date.now`/`Math.random` are used.

## ADR-004: Compatibility
Status: accepted (2026-11-22)
Context: Frontend and any external callers depend on routes, status codes,
cookie names, and DB schema.
Decision: Keep all HTTP routes, status codes, cookie names (`SESSION_COOKIE_NAME`),
env vars (`NODE_ENV`, `ENABLE_DEV_OUTBOX`, `DATABASE_URL`, `JWT_SECRET`, etc.),
and the Prisma schema unchanged. Rust talks to the same Postgres DB.
Consequences: Rust units must produce identical response shapes; DB access stays
sqlx against the same schema.

## ADR-005: Targets
Status: accepted (2026-11-22)
Context: Prototype runs on Linux dev machines; Node 22, Rust stable.
Decision: Target Linux x86_64 (dev), minimum Rust stable (current). No binary
size/speed goal beyond not regressing callers. Package manager: cargo + npm.
Consequences: napi-rs bridge targets the Node ABI in use.

## ADR-006: Checkpoints
Status: accepted (2026-11-22)
Context: Guide default is after each wave.
Decision: Stop for go-ahead after each wave of the plan (waves 0,1,2). Report
units done, gate/diff results, replay/fallback rate, and what remains.
Consequences: `rust/MAP.md` and `rust/HANDOFF.md` updated at each checkpoint.

## ADR-007: Cutover
Status: accepted (2026-11-22)
Context: Choice between switch-at-once vs run beside.
Decision: Run the Rust library beside the original first (shadow mode,
`RUST_ANYTHING_MODE=shadow`), then switch to `new` once all ported units pass
gate and replay. Original kept as reference until user confirms retirement.
Consequences: `shadow` drop-in used per unit; cutover script written at the end.

## ADR-008: Async strategy
Status: accepted (2026-11-22)
Context: Route handlers are async (DB, crypto). napi-rs supports async fn.
Decision: Bridge with napi-rs async fn where the original is async; keep the
async shell thin and port the sync core where possible. DB stays async (sqlx).
Consequences: Every unit's `port.rs` exposes async entry points as needed.

## ADR-009: Database access
Status: accepted (2026-11-22)
Context: @prisma/client maps only in part to sqlx/diesel/sea-orm.
Decision: Use sqlx against the existing Postgres schema (raw SQL), matching the
existing `backend/` migration approach. Prisma remains the schema/migration owner.
Consequences: No ORM in Rust; queries hand-written; schema changes flow through
Prisma.

## ADR-010: Validation
Status: accepted (2026-11-22)
Context: zod maps partially to serde + garde.
Decision: Use serde for (de)serialization and garde/validator for validation;
error messages may differ and are recorded as known-diffs where intentional.
Consequences: Validation error text is not byte-identical; recorded as known-diff
with user approval.
## ADR-011: D1 — shape
Status: accepted (2026-11-22)
Context: The app is a library, entered through techtracker-web (.). Port every entry point, in that shape?
Decision: Yes: the Rust crate's public API becomes the library's front door
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-012: D2 — keep src/app/
Status: accepted (2026-11-22)
Context: src/app/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-013: D3 — keep src/app/(auth)/forgot-password/
Status: accepted (2026-11-22)
Context: src/app/(auth)/forgot-password/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-014: D4 — keep src/app/(auth)/login/
Status: accepted (2026-11-22)
Context: src/app/(auth)/login/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-015: D5 — keep src/app/(auth)/register/
Status: accepted (2026-11-22)
Context: src/app/(auth)/register/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-016: D6 — keep src/app/(auth)/reset-password/
Status: accepted (2026-11-22)
Context: src/app/(auth)/reset-password/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-017: D7 — keep src/app/admin/
Status: accepted (2026-11-22)
Context: src/app/admin/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-018: D8 — keep src/app/admin/attendance/
Status: accepted (2026-11-22)
Context: src/app/admin/attendance/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-019: D9 — keep src/app/admin/batches/
Status: accepted (2026-11-22)
Context: src/app/admin/batches/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-020: D10 — keep src/app/admin/reports/
Status: accepted (2026-11-22)
Context: src/app/admin/reports/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-021: D11 — keep src/app/admin/students/
Status: accepted (2026-11-22)
Context: src/app/admin/students/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-022: D12 — keep src/app/admin/tasks/
Status: accepted (2026-11-22)
Context: src/app/admin/tasks/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-023: D13 — keep src/app/admin/tasks/[id]/
Status: accepted (2026-11-22)
Context: src/app/admin/tasks/[id]/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-024: D14 — keep src/app/attendance/
Status: accepted (2026-11-22)
Context: src/app/attendance/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-025: D15 — keep src/app/dashboard/
Status: accepted (2026-11-22)
Context: src/app/dashboard/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-026: D16 — keep src/app/dev/outbox/
Status: accepted (2026-11-22)
Context: src/app/dev/outbox/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-027: D17 — keep src/app/inspections/
Status: accepted (2026-11-22)
Context: src/app/inspections/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-028: D18 — keep src/app/inspections/[roomId]/
Status: accepted (2026-11-22)
Context: src/app/inspections/[roomId]/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-029: D19 — keep src/app/messages/
Status: accepted (2026-11-22)
Context: src/app/messages/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-030: D20 — keep src/app/notifications/
Status: accepted (2026-11-22)
Context: src/app/notifications/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-031: D21 — keep src/app/profile/
Status: accepted (2026-11-22)
Context: src/app/profile/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-032: D22 — keep src/app/student/
Status: accepted (2026-11-22)
Context: src/app/student/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-033: D23 — keep src/app/superadmin/
Status: accepted (2026-11-22)
Context: src/app/superadmin/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-034: D24 — keep src/app/tasks/
Status: accepted (2026-11-22)
Context: src/app/tasks/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-035: D25 — keep src/app/tasks/[id]/
Status: accepted (2026-11-22)
Context: src/app/tasks/[id]/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-036: D26 — keep src/components/shell/
Status: accepted (2026-11-22)
Context: src/components/shell/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-037: D27 — keep src/components/ui/
Status: accepted (2026-11-22)
Context: src/components/ui/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-038: D28 — keep src/hooks/
Status: accepted (2026-11-22)
Context: src/hooks/ stays in the source language (UI code: keep in the original language). What replaces it in the Rust app, or does it stay outside?
Decision: Keep it outside the Rust app, behind the front door, and decide its replacement once the rest is Rust
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-039: D29 — dependency next
Status: accepted (2026-11-22)
Context: Which crate replaces next (used by 59 units)?
Decision: Research it against primary sources into rust/research/next.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-040: D30 — dependency lucide-react
Status: accepted (2026-11-22)
Context: Which crate replaces lucide-react (used by 25 units)?
Decision: Research it against primary sources into rust/research/lucide-react.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-041: D31 — dependency sonner
Status: accepted (2026-11-22)
Context: Which crate replaces sonner (used by 20 units)?
Decision: Research it against primary sources into rust/research/sonner.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-042: D32 — dependency cn
Status: accepted (2026-11-22)
Context: Which crate replaces cn (used by 7 units)?
Decision: Research it against primary sources into rust/research/cn.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-043: D33 — dependency xlsx
Status: accepted (2026-11-22)
Context: Which crate replaces xlsx (used by 2 units)?
Decision: Research it against primary sources into rust/research/xlsx.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-044: D34 — dependency @base-ui/react
Status: accepted (2026-11-22)
Context: Which crate replaces @base-ui/react (used by 1 unit)?
Decision: Research it against primary sources into rust/research/@base-ui-react.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-045: D35 — dependency class-variance-authority
Status: accepted (2026-11-22)
Context: Which crate replaces class-variance-authority (used by 1 unit)?
Decision: Research it against primary sources into rust/research/class-variance-authority.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-046: D36 — dependency jspdf
Status: accepted (2026-11-22)
Context: Which crate replaces jspdf (used by 1 unit)?
Decision: Research it against primary sources into rust/research/jspdf.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-047: D37 — dependency jspdf-autotable
Status: accepted (2026-11-22)
Context: Which crate replaces jspdf-autotable (used by 1 unit)?
Decision: Research it against primary sources into rust/research/jspdf-autotable.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-048: D38 — dependency next-themes
Status: accepted (2026-11-22)
Context: Which crate replaces next-themes (used by 1 unit)?
Decision: Research it against primary sources into rust/research/next-themes.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-049: D39 — dependency react
Status: accepted (2026-11-22)
Context: Which crate replaces react (declared, no unit imports it)?
Decision: Research it against primary sources into rust/research/react.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-050: D40 — dependency react-dom
Status: accepted (2026-11-22)
Context: Which crate replaces react-dom (declared, no unit imports it)?
Decision: Research it against primary sources into rust/research/react-dom.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-051: D41 — dependency shadcn
Status: accepted (2026-11-22)
Context: Which crate replaces shadcn (declared, no unit imports it)?
Decision: Research it against primary sources into rust/research/shadcn.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-052: D42 — dependency tw-animate-css
Status: accepted (2026-11-22)
Context: Which crate replaces tw-animate-css (declared, no unit imports it)?
Decision: Research it against primary sources into rust/research/tw-animate-css.md before porting what uses it
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-053: D43 — dependency zod
Status: accepted (2026-11-22)
Context: zod maps to serde, garde only in part (used by 22 units; Schemas become types plus validation; error messages will differ). Use it?
Decision: Use serde, garde, and record cases for the behavior it does not cover
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.

## ADR-054: D44 — dependency @prisma/client
Status: accepted (2026-11-22)
Context: @prisma/client maps to sqlx, diesel, sea-orm only in part (used by 2 units; an ORM's dynamic queries need redesign). Use it?
Decision: Use sqlx, diesel, sea-orm, and record cases for the behavior it does not cover
Consequences: As recommended by `rust-anything analyze`; revisit if the user overrides.
