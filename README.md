# TechTracker — 100-Hour Pre-OJT Monitoring System

TechTracker is a web application that monitors and documents a student's **100 hours of Pre-OJT (On-the-Job Training)** duty. It replaces paper-based duty logs with a photo-assisted, auditable digital record: students punch time-in/time-out with evidence photos, complete assigned technical tasks, and run lab unit inspections, while coordinators review, approve, and escalate records. It also tracks a student's readiness for the 100-hour accreditation PDF.

- **Repository:** `hermarDev/TECHTRACKER` (branch `main`)
- **Live frontend:** Next.js 16 (port `3219`)
- **Live API:** Rust (Axum) on port `8080`, fronted by Next.js rewrites

---

## Architecture

```
┌──────────────────────┐         ┌──────────────────────┐
│  Browser (Next.js 16)│ ──────► │  Rust Axum backend   │
│  127.0.0.1:3219      │  /api/* │  127.0.0.1:8080     │
└──────────────────────┘         └──────────┬───────────┘
                                            │ sqlx
                                            ▼
                                  ┌──────────────────────┐
                                  │  PostgreSQL 19        │
                                  │  127.0.0.1:5444      │
                                  └──────────────────────┘
```

- **Next.js** serves the UI only. `src/app/api/**` has been removed; `next.config.ts` rewrites every `/api/*` request to `RUST_BACKEND_URL`, and `RUST_BACKEND_URL` is required in production.
- **Rust Axum** (`backend/`) is the canonical API: auth, profile, attendance, tasks, inspections, messages, notifications, admin, superadmin, uploads, files.
- **Prisma** owns the schema/migrations (`prisma/schema.prisma`); Rust uses sqlx against the same Postgres DB.
- **Storage:** local filesystem under `.storage/` (configurable via `STORAGE_ROOT`).

---

## Roles

| Role | Capabilities |
|---|---|
| **STUDENT** | Punch duty time-in/time-out with evidence photos; view & submit assigned technical tasks; inspect lab units; read/write messages and notifications; view attendance history; download accreditation PDF once Pre-OJT is complete |
| **ADMIN** (coordinator) | All student capabilities + assign/review tasks; review & correct attendance; manage batches/students; run reports; escalate records |
| **SUPERADMIN** | All admin capabilities + system config, admin management, audit log, escalations oversight. **No chat access** (charter rule) |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.4.6 (App Router), React 19, Tailwind CSS 4, Base UI (`@base-ui/react`), lucide-react, sonner |
| API | Rust — Axum 0.7, sqlx 0.8, tokio, serde, jsonwebtoken, bcrypt, printpdf, calamine |
| Database | PostgreSQL 19 |
| ORM / migrations | Prisma 6 (schema owner) |
| Testing | Vitest (unit/integration), Playwright (E2E, incl. 430 px mobile), cargo test |
| Tooling | TypeScript 5, ESLint 9, Prettier-equivalent via `cargo fmt` |

---

## Prerequisites

- Node.js 20+ and npm
- Rust toolchain (cargo 1.x) — `rustup`
- PostgreSQL 19 running on `127.0.0.1:5444` (or set `DATABASE_URL`)
- (Optional) `psql`/`pg_isready` for manual DB inspection

---

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/hermarDev/TECHTRACKER.git
cd TECHTRACKER
npm install
```

### 2. Environment

Create `.env` at the repo root (`.env.example` is the template):

```env
DATABASE_URL="postgresql://techtracker:techtracker_dev@127.0.0.1:5444/techtracker?schema=public"
JWT_SECRET="change-me-to-a-32+-char-secret"
RUST_BACKEND_URL="http://127.0.0.1:8080"
NEXT_PUBLIC_APP_URL="http://127.0.0.1:3219"
```

Copy the same file into the Rust backend:

```bash
cp .env backend/.env
```

### 3. Database

```bash
npm run db:push          # apply Prisma schema
npm run db:seed          # seed demo accounts, batches, schedules, tasks
```

### 4. Run the Rust backend (canonical API)

```bash
cd backend
cargo run                # listens on 0.0.0.0:8080
```

### 5. Run the Next.js frontend

```bash
# in another terminal, from the repo root
npm run dev              # http://127.0.0.1:3219
```

### Alternative: one command for all three services

```bash
docker compose up --build   # Postgres :5444, Rust :8080, Next :3219
npm run db:setup            # schema + raw SQL, including the open-shift index
npm run db:seed             # demo data
```

Open `http://127.0.0.1:3219` and sign in with a demo account (password `TechTrack@2026` for all):

| Role | Email |
|---|---|
| SuperAdmin | `superadmin@aclc-mandaue.edu.ph` |
| Coordinator | `coordinator@aclc-mandaue.edu.ph` |
| Tech staff | `techstaff@aclc-mandaue.edu.ph` |
| Student (active) | `edrich.bardilas@student.aclc.edu.ph` |
| Student (completed, PDF unlocked) | `joan.inting@student.aclc.edu.ph` |
| Student (pending verification) | `pending.applicant@student.aclc.edu.ph` |

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on port 3219 |
| `npm run build` | Production build |
| `npm run start` | Production server on port 3219 |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit/integration tests |
| `npm run test:e2e` | Playwright E2E suite (desktop + 430 px mobile) |
| `npm run db:push` | Apply Prisma schema to the DB |
| `npm run db:post-push` | Apply raw SQL that Prisma cannot express (open-shift unique index) |
| `npm run db:setup` | `db:push` then `db:post-push`; use this on a fresh DB |
| `npm run db:seed` | Seed demo data |
| `cd backend && cargo run` | Run the Rust API |
| `cd backend && cargo test` | Rust unit tests |
| `cd backend && cargo clippy --all-targets` | Rust lint |
| `cd backend && cargo fmt --check` | Rust format check |

---

## Testing

- **Vitest** (`tests/**/*.test.ts`) — 92 tests. Integration suites call the Rust API at `RUST_BACKEND_URL` (default `http://127.0.0.1:8080`) and read `EmailOutbox` directly from Postgres. Both must be running.
- **Playwright** (`tests/e2e/*.spec.ts`) — 60 tests (desktop + 430 px mobile). Requires the Next server on `:3219`, the Rust backend on `:8080`, and `DATABASE_URL` in `.env`.
- **Rust** (`backend/`) — 24 unit tests (config, storage keys, MIME, PDF pagination, rate limiter helpers).

Run everything:

```bash
npm test && npm run test:e2e
```

---

## Key features (student-facing)

- **Duty attendance** — photo-assisted time-in/time-out with shift scheduling, irregularity flagging, and a safe (receipt-id) success toast. No GPS is ever requested.
- **Technical tasks** — assigned tasks with status tracking (`ASSIGNED → IN_PROGRESS → SUBMITTED → RETURNED → ACCEPTED`), resubmission, threaded remarks, and attachments (≤ 5 MB).
- **Lab inspections** — per-unit condition checklist (`FUNCTIONING / NEEDS_MAINTENANCE / NEEDS_REPAIR`) with mandatory defect remarks, photo evidence, and a draft that survives reloads.
- **Messages** — direct & batch conversations with coordinators, pagination, auto-scroll, and draft preservation.
- **Notifications** — unread badge backed by a server-side total; unread-only filter and mark-all-read.
- **Accreditation PDF** — downloadable once 100 credited hours and all assigned tasks are accepted.

---

## Project layout

```
Tech_Tracker/
├── src/                    # Next.js frontend only (no API routes)
│   ├── app/                # App Router pages
│   ├── components/         # UI primitives + shell (AppShell, DataTablePagination, …)
│   ├── hooks/              # useDraftForm (draft persistence)
│   └── lib/                # live UI helpers (rbac-policies, hours, task-format)
├── backend/                # Rust Axum API (canonical runtime)
│   └── src/routes/         # auth, attendance, tasks, inspections, messages, …
├── prisma/                 # schema.prisma + seed.ts
├── tests/
│   ├── e2e/                # Playwright suites
│   └── integration/        # Vitest suites
├── docs/                   # STUDENT_UI_AUDIT.md, archive/
├── MIGRATION_TO_RUST.md    # Migration status & run instructions
├── next.config.ts          # rewrites /api/* → Rust backend
└── playwright.config.ts
```

---

## Security posture

- JWT auth with signature + status verification (suspended/deleted users rejected immediately).
- Inputs validated at trust boundaries (zod on Next, validator on Rust); parameterized SQL everywhere.
- File uploads validated for MIME and 5 MB size; storage keys canonicalized inside `STORAGE_ROOT`.
- `/api/files/*` requires auth, rejects path traversal, sets `X-Content-Type-Options: nosniff`.
- Secrets live in `.env` (gitignored); `.env.example` is the only committed template.
- See `docs/STUDENT_UI_AUDIT.md` for the full audit and remediation log.

---

## Notes for contributors

- Rust is the only API implementation. Frontend pages call it through `/api/*` rewrites.
- The frontend and backend must both be running for the E2E suite and for normal development. `docker compose up --build` starts Next, Rust and Postgres together.
- `DB_MAX_CONNECTIONS` controls the Rust pool (default 25). `RUST_BACKEND_URL` is required in production; `APP_URL` or `NEXT_PUBLIC_APP_URL` is required too.
- `backend/target/`, `.next/`, `.storage/`, and `.env*` (except `.env.example`) are gitignored.
- See `MIGRATION_TO_RUST.md` for the completed migration.
