# Migrating TechTracker backend to Rust (Axum)

## Status
- Canonical Rust runtime: `backend/` (Axum + sqlx + Postgres).
- The `rust/` whole-app harness was retired on 2026-11-22. It was at 100% fallback with 0/68 units wired. Its useful parts are archived in `docs/archive/rust-port/`.
- Live proxy: `next.config.ts` rewrites every `/api/*` request to `RUST_BACKEND_URL`.
- Fully migrated: `/api/auth/*`, `/api/profile`, `/api/attendance` (GET/POST + review/correct/escalate), `/api/tasks` (GET/POST/GET :id + start/submit/review), `/api/inspections` (GET/POST/rooms/export/review), `/api/messages`, `/api/notifications`, `/api/uploads`, `/api/files/*`, `/api/admin/*`, `/api/superadmin/*`, `/api/dev/outbox`.
- Remaining stubs: none. `GET /api/attendance/accreditation-pdf` implemented (PDF via printpdf). `POST /api/admin/students/import` implemented (CSV/XLSX). `GET /api/inspections/:id/export` honors `?format=csv|pdf` (CSV + PDF).
- Implemented this round: PDF generation (accreditation + inspection), student import, scope/ownership checks, attendance data integrity, task field mismatch/races, multipart task submission, Next.js student shell cutover.
- Next.js remains the frontend shell. The handlers in `src/app/api/**` are fallbacks until each route is gated and deleted.

## Run the Rust backend
```bash
cd backend
cp ../.env .env  # or set DATABASE_URL, JWT_SECRET, etc.
cargo run
# listens on 0.0.0.0:8080
```

## Security baseline
- Production requires `DATABASE_URL` and a strong `JWT_SECRET` (>= 32 chars); the dev fallbacks are rejected.
- CORS origin comes from `APP_URL` or `NEXT_PUBLIC_APP_URL`, not a hard-coded localhost.
- Authentication verifies the JWT signature **and** the user's current `status`; suspended or deleted users are rejected immediately.
- `GET /api/files/*key` requires authentication, rejects `..`/absolute/backslash keys, canonicalizes inside `STORAGE_ROOT`, and sets `X-Content-Type-Options: nosniff`.
- The dev outbox is gated in production by `ENABLE_DEV_OUTBOX=1`.
- Internal and database errors return a generic message; details go to the server log.

## Database
- Schema is owned by Prisma (`prisma/schema.prisma`). Run `npm run db:push` / migrations as before.
- Rust uses sqlx against the same Postgres DB (raw SQL). Keep Prisma for schema/migrations.

## Migration order
1. Auth (done) — register, verify, login, logout, forgot/reset password, me.
2. Profile — GET/PUT/PATCH (done).
3. Attendance — list/create/review/correct/escalate (done); accreditation PDF still stubbed.
4. Tasks — CRUD + start/submit/review (done).
5. Inspections — list/create/rooms/export/review (done; export format partial).
6. Messages, Notifications (done).
7. Admin — reports, students, batches (done); student import still stubbed.
8. SuperAdmin — overview, audit, rooms, escalations, config, admins (done).
9. Uploads, Files (done; files hardened).
10. Dev outbox (done).

## Tests
```bash
cd backend
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```
The backend currently has unit tests for config validation, safe storage keys and MIME guessing. Route-level integration tests are the next gate before deleting each Next.js fallback.

## Retired harness
- Archive: `docs/archive/rust-port/` (`lib-port.rs`, recorded cases, ADRs, research).
- Do not add `napi-rs` to `backend/Cargo.toml`.
- Harvest only pure functions from `lib-port.rs`; DB/PDF/storage units were stubs and are already implemented in `backend/`.

## Type sharing
- Use `ts-rs` or OpenAPI (`utoipa`) to generate TS types from Rust structs, replacing hand-written types.

## Notes
- Frozen foundations in `src/lib/*` remain authoritative for business rules until each domain is migrated.
- Do not delete a Next.js route handler until its Rust equivalent is implemented and tested.
