# TechTracker — Port map (MAP.md)

Goal: standalone pure-Rust app (rust-anything whole-app port); original kept as reference.

Companion files: DECISIONS.md (ADRs), GLOSSARY.md, research/, HANDOFF.md, app-cases/.
Generated state: run `rust-anything map` (writes rust/PORT_MAP.md) and reconcile.

## ADR index
See DECISIONS.md: ADR-001..ADR-054.

## Units

| Wave | Unit | Status (plan) | Port state | Lines | Readiness | Bridge | Risks |
|---:|---|---|---|---:|---:|---|---|
| 0 | `src/hooks/` | keep | open | 76 | 86 | keep | Callback-shaped APIs (1); Exceptions (3) |
| 0 | `prisma/` | ready | open | 480 | 76 | napi-rs | String offsets and slicing (1); Async and promises (46) |
| 0 | `src/lib/` | caution | open | 689 | 39 | napi-rs | String offsets and slicing (1); Async and promises (22) |
| 0 | `src/components/ui/` | keep | open | 1368 | 31 | keep | - |
| 1 | `src/app/api/auth/logout/` | ready | open | 16 | 100 | napi-rs | Async and promises (1) |
| 1 | `src/app/api/auth/me/` | ready | open | 24 | 100 | napi-rs | Async and promises (3) |
| 1 | `src/app/api/dev/outbox/` | ready | open | 21 | 100 | napi-rs | Async and promises (2) |
| 1 | `src/app/api/inspections/rooms/` | ready | open | 38 | 100 | napi-rs | Async and promises (5) |
| 1 | `src/app/api/tasks/[id]/` | ready | open | 20 | 100 | napi-rs | Async and promises (4) |
| 1 | `src/app/dashboard/` | keep | open | 16 | 100 | keep | Async and promises (2) |
| 1 | `src/app/api/superadmin/audit/` | ready | open | 60 | 99 | napi-rs | Async and promises (5) |
| 1 | `src/app/api/inspections/[id]/review/` | ready | open | 30 | 98 | napi-rs | Async and promises (7); Clock and random numbers (1) |
| 1 | `src/app/api/auth/forgot-password/` | ready | open | 54 | 97 | napi-rs | Async and promises (6); Exceptions (1) |
| 1 | `src/app/api/auth/reset-password/` | ready | open | 64 | 97 | napi-rs | Async and promises (6); Clock and random numbers (2) |
| 1 | `src/app/api/notifications/` | ready | open | 64 | 97 | napi-rs | Async and promises (10); Exceptions (1) |
| 1 | `src/app/api/tasks/[id]/review/` | ready | open | 33 | 97 | napi-rs | Async and promises (11); Clock and random numbers (1) |
| 1 | `src/app/api/attendance/[id]/review/` | ready | open | 50 | 96 | napi-rs | Async and promises (13); Clock and random numbers (2) |
| 1 | `src/app/api/messages/[conversationId]/` | ready | open | 67 | 96 | napi-rs | Async and promises (9); Exceptions (1) |
| 1 | `src/app/api/attendance/accreditation-pdf/` | ready | open | 15 | 95 | napi-rs | Async and promises (4) |
| 1 | `src/app/api/auth/login/` | ready | open | 138 | 95 | napi-rs | Async and promises (10); Exceptions (1) |
| 1 | `src/app/api/auth/register/` | ready | open | 95 | 95 | napi-rs | Async and promises (9); Exceptions (1) |
| 1 | `src/app/api/auth/verify/` | ready | open | 71 | 95 | napi-rs | Async and promises (11); Exceptions (1) |
| 1 | `src/app/api/inspections/` | ready | open | 119 | 95 | napi-rs | Async and promises (11); Exceptions (1) |
| 1 | `src/app/api/uploads/` | caution | open | 23 | 95 | napi-rs | Async and promises (4) |
| 1 | `src/app/api/files/[...key]/` | ready | open | 31 | 94 | napi-rs | Async and promises (4); Exceptions (1) |
| 1 | `src/app/api/superadmin/overview/` | ready | open | 24 | 94 | napi-rs | Async and promises (5) |
| 1 | `src/app/api/tasks/[id]/start/` | ready | open | 13 | 94 | napi-rs | Async and promises (5); Clock and random numbers (1) |
| 1 | `src/app/api/attendance/` | ready | open | 148 | 93 | napi-rs | Async and promises (14); Clock and random numbers (2) |
| 1 | `src/app/api/attendance/[id]/escalate/` | ready | open | 20 | 93 | napi-rs | Async and promises (9) |
| 1 | `src/app/api/inspections/[id]/export/` | ready | open | 61 | 93 | napi-rs | Async and promises (6) |
| 1 | `src/app/api/profile/` | ready | open | 123 | 93 | napi-rs | Async and promises (16); Exceptions (2) |
| 1 | `src/app/api/superadmin/config/` | ready | open | 97 | 93 | napi-rs | Async and promises (12); Insertion-ordered maps and object keys (1) |
| 1 | `src/app/api/admin/batches/[id]/` | ready | open | 46 | 92 | napi-rs | Async and promises (8); Exceptions (1) |
| 1 | `src/app/api/attendance/[id]/correct/` | ready | open | 29 | 92 | napi-rs | Async and promises (7); Clock and random numbers (1) |
| 1 | `src/app/api/messages/` | ready | open | 162 | 92 | napi-rs | Async and promises (16); Exceptions (1) |
| 1 | `src/app/api/superadmin/escalations/` | ready | open | 167 | 92 | napi-rs | Async and promises (18); Exceptions (1) |
| 1 | `src/app/api/tasks/[id]/submit/` | caution | open | 29 | 92 | napi-rs | Async and promises (11) |
| 1 | `src/app/api/tasks/` | ready | open | 45 | 91 | napi-rs | Async and promises (13) |
| 1 | `src/app/api/admin/students/` | ready | open | 92 | 90 | napi-rs | Async and promises (11); Exceptions (1) |
| 1 | `src/app/api/admin/reports/` | ready | open | 145 | 88 | napi-rs | Async and promises (8); Insertion-ordered maps and object keys (1) |
| 1 | `src/app/api/superadmin/admins/` | ready | open | 191 | 88 | napi-rs | Async and promises (20); Insertion-ordered maps and object keys (2) |
| 1 | `src/app/api/admin/batches/` | ready | open | 142 | 87 | napi-rs | Async and promises (17); Exceptions (1) |
| 1 | `src/app/api/admin/students/import/` | ready | open | 143 | 85 | napi-rs | Async and promises (13) |
| 1 | `src/app/dev/outbox/` | keep | open | 141 | 85 | keep | Async and promises (2) |
| 1 | `src/app/api/superadmin/rooms/` | ready | open | 274 | 84 | napi-rs | Async and promises (29); Insertion-ordered maps and object keys (3) |
| 1 | `src/app/` | keep | open | 248 | 83 | keep | Async and promises (2) |
| 1 | `src/app/(auth)/forgot-password/` | keep | open | 131 | 83 | keep | Async and promises (3); Exceptions (1) |
| 1 | `src/components/shell/` | keep | open | 626 | 46 | keep | String offsets and slicing (2); Async and promises (2) |
| 2 | `src/app/(auth)/reset-password/` | keep | open | 161 | 82 | keep | Async and promises (3); Exceptions (1) |
| 2 | `src/app/(auth)/register/` | keep | open | 221 | 81 | keep | Async and promises (3); Exceptions (1) |
| 2 | `src/app/tasks/` | keep | open | 179 | 80 | keep | Async and promises (10); Exceptions (1) |
| 2 | `src/app/(auth)/login/` | keep | open | 171 | 78 | keep | Async and promises (3); Exceptions (1) |
| 2 | `src/app/profile/` | keep | open | 339 | 78 | keep | Async and promises (9); Exceptions (3) |
| 2 | `src/app/admin/` | keep | open | 328 | 77 | keep | Async and promises (14); Exceptions (4) |
| 2 | `src/app/admin/reports/` | keep | open | 333 | 77 | keep | Async and promises (10); Insertion-ordered maps and object keys (1) |
| 2 | `src/app/attendance/` | keep | open | 364 | 76 | keep | Async and promises (18); Exceptions (3) |
| 2 | `src/app/notifications/` | keep | open | 263 | 76 | keep | Async and promises (12); Exceptions (2) |
| 2 | `src/app/inspections/` | keep | open | 343 | 74 | keep | Async and promises (16); Exceptions (3) |
| 2 | `src/app/admin/tasks/` | keep | open | 346 | 73 | keep | Async and promises (17); Exceptions (2) |
| 2 | `src/app/student/` | keep | open | 241 | 72 | keep | String offsets and slicing (2); Async and promises (4) |
| 2 | `src/app/admin/tasks/[id]/` | keep | open | 295 | 71 | keep | String offsets and slicing (1); Async and promises (14) |
| 2 | `src/app/tasks/[id]/` | keep | open | 336 | 69 | keep | String offsets and slicing (1); Async and promises (17) |
| 2 | `src/app/admin/attendance/` | keep | open | 405 | 66 | keep | String offsets and slicing (2); Async and promises (22) |
| 2 | `src/app/admin/batches/` | keep | open | 676 | 66 | keep | Async and promises (25); Exceptions (5) |
| 2 | `src/app/inspections/[roomId]/` | keep | open | 444 | 66 | keep | String offsets and slicing (1); Async and promises (14) |
| 2 | `src/app/messages/` | keep | open | 577 | 64 | keep | Async and promises (24); Exceptions (4) |
| 2 | `src/app/admin/students/` | keep | open | 701 | 55 | keep | String offsets and slicing (2); Async and promises (26) |
| 2 | `src/app/superadmin/` | keep | open | 1690 | 30 | keep | String offsets and slicing (1); Async and promises (44) |

Port state legend: `open`, `claimed by <session> <date>`, `done (gate X/Y, replay Z%)`.

## Open questions
- UI replacement strategy for the 27 keep units (decide after backend units are Rust).
- Whether to treat the Next.js server as the host or replace with a Rust HTTP server (ADR-001).

## Out of scope
- Prisma schema/migrations (Prisma remains owner).
- Production deploy, DNS, secrets (user-only; cutover.sh).
