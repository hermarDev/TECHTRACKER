# TechTracker Web Prototype Implementation Plan

> **For Hermes:** Implement Phase 0 & Phase 1 directly to freeze the schema, auth/RBAC contracts, and shared shadcn/ui shell, then orchestrate Phase 2+ via Herdr visible space-scoped tabs (`MAIN_SPACE`), assigning tasks to **external agents first** (`opencode-external`, `copilot-external`, `cline-external` — **excluding `cursor-agent`**), exhausting their free-tier capacity before transitioning remaining slices, bug fixes, Impeccable refinement, QA, and security checks to **native Herdr specialist agents** (`builder`, `designer`, `qa`, `security`, `investigator`).

**Goal:** Build a verified, full-stack TechTracker web prototype in `/home/hrmr/Documents/CAPSTONE_TEACHTRACKER/Tech_Tracker` implementing all 16 Web flows (`01W–16W`) and 9 Shared Backend flows (`02S–10S`) from `FLOWCHARTS/output/` and `TechTracker_Project_Charter_Justified.docx`, using Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui, Prisma ORM, PostgreSQL 16 (local Docker, zero paid subscriptions), strict TDD (Vitest + Playwright), and Impeccable UI craft.

**Architecture:** Modular Next.js App Router monolith with REST API Route Handlers (`/api/**`), Prisma ORM backed by an isolated local `postgres:16-alpine` Docker container (`techtracker-pg16`, port `5444`), local disk S3/R2-compatible signed media store (`.storage/`), and a local SMTP/security-alert outbox viewer (`/dev/outbox` + DB table) so zero paid external subscriptions are required. Every route, API handler, and UI surface strictly enforces Charter delimitations (no GPS/geofence on attendance, no urgent repair ticket dispatch in lab inspections, no SuperAdmin chat, mandatory return remarks separated from private internal staff notes).

**Tech Stack:** Next.js 15+ (App Router, TypeScript), Tailwind CSS v4, shadcn/ui (`lucide-react`, Radix primitives), Prisma ORM, PostgreSQL 16, `bcryptjs`, `jose` (JWT HTTP-only cookies), `jspdf` / `papaparse` / `xlsx` (for CSV/PDF/XLSX import & export), Vitest (unit + API integration TDD), Playwright (desktop `1440×900` & mobile `430×932` E2E & visual verification).

---

## Agent Execution Strategy (External-First -> Native Herdr Fallback)

1. **Exclusion:** Never use `cursor-external` / `cursor-agent` (rate/limit reached).
2. **External Tier (Wave 1 — Parallel in `MAIN_SPACE`):**
   - **Tab 1 (`opencode-external`):** Free-tier model (`opencode/glm-5.3-flash-free`, fallback `opencode/big-pickle`, `opencode/deepseek-v4.1-flash-free`). Assigned: **Domain A — Auth, Self-Registration, Role Router, Profile (`01W–04W`, `12W`, `02S–04S`)**.
   - **Tab 2 (`copilot-external`):** GitHub Copilot CLI free tier. Assigned: **Domain B — Pre-OJT Attendance, Hours Review, Task Assignment & Revision Loop (`05W–08W`, `05S–08S`)**.
   - **Tab 3 (`cline-external`):** Cline CLI free tier (`cline-pass` / `gemini-3.5-flash`). Assigned: **Domain C — Lab Room/Unit Inspection, Messaging, Batches/Reports/Import & SuperAdmin (`09W–16W`, `09S–10S`)**.
3. **Exhaustion & Transition Rule:**
   - Monitor each external tab via `hc read` / `hc wait`.
   - If any external CLI returns rate limit / quota exhausted / auth limit / tool failure, immediately log the exact exhaustion event, close its tab (`herdr-app do tab.close` -> `hc kill` -> `hc rm`), and reassign any unfinished files in that domain to native Herdr specialist tabs (`hermes -p builder`, `hermes -p designer`, `hermes -p qa`, `hermes -p security`) in `MAIN_SPACE`.
4. **Native Herdr Specialist Tier (Wave 2 — Verification, Craft, Security, Bug Fixes):**
   - `designer` (with `impeccable` + `craft-floor.md`): Responsive layout, shadcn/ui polish, contrast/spacing audit, `impeccable detect --json`, Playwright desktop/mobile screenshots.
   - `qa`: Full TDD verification matrix (`vitest`, `playwright`, Charter delimitation checks, bug reproduction & regression tests).
   - `security`: RBAC/IDOR audit (`04S`), upload MIME/5MB/path-traversal audit, rate-limit/lockout audit (`03S`), private internal notes isolation (`08S`), SuperAdmin chat block (`11W`).
   - `builder`: Integration fixes for bugs surfaced by `qa` / `security` / `designer`.

---

## Charter & Flowchart Compliance Matrix (Mandatory Rules)

| Flow | Key Requirements & Mandatory Charter Constraints |
|---|---|
| `01W` | Master overview landing + auth entry + authenticated workspace shell |
| `02W / 02S` | Student self-registration: `fullName`, `email`, `studentIdNo`, `program`, `section`, `password`, `confirmPassword`; NO manual role picker; creates `pending_verification` + verification token receipt; duplicate email -> prompt login/reset |
| `03W / 03S` | Email + password login (`bcrypt`); 5 consecutive failed logins -> 15-min lockout + security alert email logged to dev outbox; pending/suspended block; JWT session cookie; 1-hr TTL reset token recovery |
| `04W / 04S` | JWT role router (`superadmin` -> `/superadmin`, `admin` -> `/admin`, `student` -> `/student`); server-side RBAC + batch/room record scope boundary on every API endpoint |
| `05W / 05S` | Attendance Time In/Out: scheduled shift selector + webcam capture / photo upload (<=5MB); **NO GPS/geolocation** (Charter 163, 202, 207); active batch check; off-schedule flagged `IRREGULAR`; localStorage draft preservation + unsaved warning; confirmed DB receipt before showing recorded |
| `06W / 06S` | Coordinator attendance review queue + photo preview; Approve -> compute `session_hrs = TimeOut - TimeIn` -> credit Pre-OJT hours; >=100 credited hours + all tasks approved -> `COMPLETED` + **"100-Hour Internal Duty Accreditation Summary Log (PDF)"** (Charter 193); Reject -> mandatory remarks; Correction modal with before/after preview + mandatory audit justification; Escalate to SuperAdmin (`C-W06-W16-ESCALATE`) & apply ruling (`C-W16-W06-RULING`) |
| `07W / 07S` | Task assignment (Title, Instructions, Target Lab/PCs, Deadline, Individual or Batch) + real-time/in-app notification; Student `Start Task` -> `IN_PROGRESS` |
| `08W / 08S` | Task completion report + work photos/files (<=5MB) + summary; Reviewer Accept or Return with **mandatory student-visible remarks** + **private internal staff notes** (hidden from students); threaded remark history + attachment preview + student resubmission (`RETURNED` -> `SUBMITTED`) |
| `09W / 09S` | Lab Room & Unit Selection (Admin, Coordinator, or Assigned Student); rooms & workstations sorted A–Z (`PC-01`..`PC-N`); statuses: `FUNCTIONING`, `NEEDS_MAINTENANCE`, `NEEDS_REPAIR` |
| `10W / 10S` | Inspection submission: mandatory defect remarks + photo proof for maintenance/repair units; **NO urgent alert / repair ticket / dispatch** (Charter 158, 197); room staging checklist -> atomic commit -> receipt -> Room Condition Summary Report (PDF/CSV); Admin report review |
| `11W` | Messaging & Notifications: Student <-> Admin individual/batch chat + <=5MB MIME-validated attachment; **SuperAdmin has NO chat access (alerts only)** per Charter 160, 199 |
| `12W` | Profile Management: display profile, edit contact info, change password (current password verified, >=8 chars, match, bcrypt update, audit log, toast) |
| `13W` | Admin Batch & Schedule Management: paginated batches (`15/25/50`), 3-step create wizard (batch/section/AY -> duty shifts start/end/grace -> assign verified unassigned students -> activate + notify), edit/deactivate |
| `14W` | Operational Reporting & Export: Attendance, Duty Hours, Task Progress, Lab Equipment; filters (Date Range, Section, Batch, Room); paginated (`15/25/50`); CSV & PDF export + audit log |
| `15W` | Student Directory & 4-Step Import Wizard: search/filter + `15/25/50` pagination; Upload CSV/XLSX -> Parse & Header Validation Preview -> Duplicate Resolution (`skip`/`overwrite`/`flag`) -> Confirm & Target Batch -> Summary (`N imported, M skipped`) |
| `16W` | SuperAdmin Console (7 Subsystems): 1. Admin CRUD/toggle, 2. 100-Hr categories & credit rules, 3. Batch & Schedule inspection, 4. Flagged photos & Escalation Resolution ruling, 5. Full Audit Log search/export, 6. Rooms/Units/System Settings, 7. System Alerts (no chat) |

---

## Execution Phases

### Phase 0: Environment, Impeccable Context & Project Scaffolding (Team-Lead)
1. Initialize git repository in `/home/hrmr/Documents/CAPSTONE_TEACHTRACKER/Tech_Tracker` (`git init`) and `.gitignore`.
2. Write `PRODUCT.md` per `impeccable` `init.md` (grounded in Charter + Draw.io specs, disclosing brief-inferred facts) and run `impeccable concept-seed --scope direction --mode operate` + write surface brief direction contract (`THESIS`, `OWN-WORLD`, `STORY`, `FIRST VIEWPORT`, `FORM`, `FINISH`).
3. Start isolated PostgreSQL 16 Docker container: `techtracker-pg16` (`postgres:16-alpine`) on `127.0.0.1:5444` with DB `techtracker`, user `techtracker`, password `techtracker_dev` (local dev only; `.env` gitignored).
4. Scaffold Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui + Prisma + Vitest + Playwright + `lucide-react` + `bcryptjs` + `jose` + `jspdf` + `jspdf-autotable` + `papaparse` + `xlsx`.
5. Initialize shadcn/ui primitives (`button`, `input`, `label`, `card`, `badge`, `dialog`, `sheet`, `table`, `tabs`, `select`, `textarea`, `toast`/`sonner`, `alert`, `progress`, `separator`, `dropdown-menu`, `checkbox`).

### Phase 1: Frozen Data Model, Core Libraries & Shared App Shell (Team-Lead, Single Writer)
1. **Prisma Schema (`prisma/schema.prisma`) & Migration + Seed (`prisma/seed.ts`):**
   - `User`, `PasswordResetToken`, `Batch`, `Schedule`, `AttendanceLog`, `Task`, `TaskAssignment`, `TaskSubmission`, `TaskRemark`, `LabRoom`, `ComputerUnit`, `Inspection`, `InspectionItem`, `Conversation`, `ConversationMember`, `Message`, `Notification`, `AuditLog`, `SystemConfig`, `EmailOutbox`, `EscalationCase`.
   - Seed realistic ACLC College of Mandaue BSIT demo dataset: 1 SuperAdmin, 2 Pre-OJT Coordinators (Admins), 2 Batches with Schedules, 8 Students (including 1 approaching 100h, 1 pending verification, 1 with returned task), 3 Lab Rooms (`Lab 1`, `Lab 2`, `Lab 3`) with workstations (`PC-01`..`PC-10`), sample attendance/tasks/inspections/messages/escalations.
2. **Core Backend Libraries (`src/lib/`):**
   - `src/lib/db.ts` — PrismaClient singleton.
   - `src/lib/auth.ts` — `hashPassword`, `verifyPassword` (bcryptjs), `signJwt`, `verifyJwt` (`jose`), cookie session helpers, 5-attempt / 15-min lockout check + email outbox security alert (`03S`).
   - `src/lib/rbac.ts` — `requireSession`, `requireRole`, `assertBatchScope`, `assertStudentOwnership`, `assertRoomInspector` (`04S`).
   - `src/lib/storage.ts` — local R2-compatible file storage (`.storage/`), strict MIME allowlist (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), max 5MB check, safe UUID keys + authenticated download route `/api/files/[...key]`.
   - `src/lib/audit.ts` — immutable `writeAuditLog()` helper.
   - `src/lib/validation.ts` — Zod schemas & pagination (`15 | 25 | 50`) + sorting helpers.
3. **Shared UI Shell & Client Hooks (`src/components/shell/`, `src/hooks/`):**
   - `AppShell.tsx`: Responsive desktop sidebar + mobile bottom/drawer navigation tailored per role (`student`, `admin`, `superadmin`) with `NotificationsBell` and no SuperAdmin chat link.
   - `useDraftForm.ts`: `localStorage` draft preservation + unsaved changes `beforeunload` / route-leave confirmation prompt (Charter Lines 60–61).
   - `DataTablePagination.tsx`: `15 / 25 / 50` selector + search/filter bar + empty-state helper.
4. **TDD Baseline (`tests/unit/*.test.ts`):**
   - Write & run Vitest unit tests for `auth` (bcrypt, 5-attempt lockout, JWT), `rbac` (`04S`), `storage` (MIME + 5MB limit), `hours` (`session_hrs`, 100-hr completion rule), and `pagination` (`15/25/50`) BEFORE launching Wave 1.
5. Commit Phase 1 baseline (`git add` + `git commit`) so every Herdr agent builds on a clean, verified contract.

### Phase 2: Wave 1 — External Agents Parallel Build (`opencode`, `copilot`, `cline`)
Acquire atomic `coord.py claim` covering disjoint files across the three domains:
- **External Agent A (`opencode-external`):**
  - Exclusive files: `src/app/page.tsx`, `src/app/(auth)/**`, `src/app/dashboard/page.tsx`, `src/app/student/page.tsx`, `src/app/profile/page.tsx`, `src/app/dev/outbox/page.tsx`, `src/app/api/auth/**`, `src/app/api/profile/**`, `tests/integration/domain-a.test.ts`.
  - Flows: `01W`, `02W/02S`, `03W/03S`, `04W/04S`, `12W`.
- **External Agent B (`copilot-external`):**
  - Exclusive files: `src/app/attendance/**`, `src/app/admin/attendance/**`, `src/app/tasks/**`, `src/app/admin/tasks/**`, `src/app/api/attendance/**`, `src/app/api/tasks/**`, `src/lib/pdf-accreditation.ts`, `tests/integration/domain-b.test.ts`.
  - Flows: `05W/05S`, `06W/06S`, `07W/07S`, `08W/08S`.
- **External Agent C (`cline-external`):**
  - Exclusive files: `src/app/inspections/**`, `src/app/messages/**`, `src/app/notifications/**`, `src/app/admin/page.tsx`, `src/app/admin/batches/**`, `src/app/admin/reports/**`, `src/app/admin/students/**`, `src/app/superadmin/**`, `src/app/api/inspections/**`, `src/app/api/messages/**`, `src/app/api/notifications/**`, `src/app/api/admin/**`, `src/app/api/superadmin/**`, `src/lib/reports-export.ts`, `tests/integration/domain-c.test.ts`.
  - Flows: `09W/09S`, `10W/10S`, `11W`, `13W`, `14W`, `15W`, `16W`.

### Phase 3: Integration, Free-Tier Exhaustion Fallback & Native Herdr Specialist Wave
1. Verify each external agent's work, run `npx tsc --noEmit` + `npx vitest run`.
2. Any slice left incomplete due to free-tier exhaustion or bugs is immediately taken over by native Herdr specialist tabs (`builder`, `designer`) in `MAIN_SPACE`.
3. Run `npm run build` and start local production/dev server on an isolated free port (`http://127.0.0.1:3219`).
4. Run `designer` / `qa` / `security` native Herdr specialist tabs:
   - `qa`: Playwright E2E TDD suite covering all 16 flows (`01W–16W`) across Student, Admin, and SuperAdmin roles at desktop (`1440×900`) and mobile (`430×932`), plus verifying Charter delimitations (no GPS, no urgent ticket dispatch, no SuperAdmin chat, internal notes hidden from student, 5-attempt lockout, 5MB upload cap, 15/25/50 pagination, draft preservation).
   - `security`: Code security & RBAC audit (`04S`, IDOR, XSS, upload path safety, SQL/Prisma safety, secret hygiene).
   - `designer`: Run `impeccable detect --json`, inspect captured screenshots via `vision_analyze`, fix contrast/overflow/hierarchy/mobile-navigation defects, document `DESIGN.md` & `.impeccable/design.json`.

### Phase 4: Final Verification Gate & Delivery
1. Re-run `npx tsc --noEmit`, `npx vitest run`, `npm run build`, and `npx playwright test` after final bug fixes.
2. Verify all external/native Herdr tabs are cleanly closed (`tab.close`, `hc kill`, `hc rm`) and `coord.py` claims completed.
3. Report exact URL, demo credentials, test counts, external-agent usage/exhaustion status, and any residual risks.
