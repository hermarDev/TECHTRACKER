# Port map: Tech_Tracker

1 of 68 units have a Rust port; no original changed since it was recorded.

## Ports

| Unit | Crate | In Rust | Kept in the original | Cases | Last diff | Original |
| --- | --- | --- | --- | ---: | ---: | --- |
| `src/app/api/auth/logout/` | `rust/logout-rs` | `POST` | - | 0 | not run | unchanged |

## Not ported yet

In the order `analyze` suggests.

| Unit | Lines | Exports | Readiness |
| --- | ---: | ---: | ---: |
| `src/app/api/inspections/` | 119 | 2 | 95 |
| `src/app/api/auth/register/` | 95 | 1 | 95 |
| `src/app/api/superadmin/audit/` | 60 | 1 | 99 |
| `src/app/api/auth/login/` | 138 | 1 | 95 |
| `src/app/api/auth/verify/` | 71 | 2 | 95 |
| `src/app/api/attendance/` | 148 | 4 | 93 |
| `src/app/api/profile/` | 123 | 3 | 93 |
| `src/app/api/superadmin/config/` | 97 | 2 | 93 |
| `src/app/api/auth/reset-password/` | 64 | 1 | 97 |
| `src/app/api/notifications/` | 64 | 2 | 97 |
| `src/app/api/messages/` | 162 | 2 | 92 |
| `src/app/api/messages/[conversationId]/` | 67 | 1 | 96 |
| `src/app/api/superadmin/escalations/` | 167 | 2 | 92 |
| `src/app/api/auth/forgot-password/` | 54 | 1 | 97 |
| `src/app/api/inspections/rooms/` | 38 | 1 | 100 |
| `src/app/api/attendance/[id]/review/` | 50 | 2 | 96 |
| `src/app/api/superadmin/admins/` | 191 | 3 | 88 |
| `src/app/api/auth/me/` | 24 | 1 | 100 |
| `src/app/api/dev/outbox/` | 21 | 1 | 100 |
| `src/app/api/inspections/[id]/review/` | 30 | 1 | 98 |
| `src/app/api/superadmin/rooms/` | 274 | 3 | 84 |
| `src/app/api/tasks/[id]/` | 20 | 2 | 100 |
| `src/app/api/tasks/[id]/review/` | 33 | 1 | 97 |
| `src/app/dashboard/` | 16 | 0 | 100 |
| `src/app/api/tasks/[id]/submit/` | 29 | 1 | 92 |
| `src/app/api/admin/batches/` | 142 | 2 | 87 |
| `src/app/api/admin/students/` | 92 | 2 | 90 |
| `src/app/api/admin/reports/` | 145 | 1 | 88 |
| `src/app/api/admin/students/import/` | 143 | 1 | 85 |
| `src/app/api/inspections/[id]/export/` | 61 | 1 | 93 |
| `src/app/dev/outbox/` | 141 | 0 | 85 |
| `src/hooks/` | 76 | 0 | 86 |
| `src/app/` | 248 | 0 | 83 |
| `src/app/(auth)/forgot-password/` | 131 | 0 | 83 |
| `src/app/(auth)/reset-password/` | 161 | 0 | 82 |
| `src/app/api/admin/batches/[id]/` | 46 | 1 | 92 |
| `src/app/api/tasks/` | 45 | 2 | 91 |
| `src/app/(auth)/register/` | 221 | 0 | 81 |
| `src/app/api/files/[...key]/` | 31 | 1 | 94 |
| `src/app/api/superadmin/overview/` | 24 | 1 | 94 |
| `src/app/api/uploads/` | 23 | 1 | 95 |
| `prisma/` | 480 | 0 | 76 |
| `src/app/(auth)/login/` | 171 | 0 | 78 |
| `src/app/admin/` | 328 | 0 | 77 |
| `src/app/admin/reports/` | 333 | 0 | 77 |
| `src/app/api/attendance/[id]/correct/` | 29 | 1 | 92 |
| `src/app/api/attendance/accreditation-pdf/` | 15 | 1 | 95 |
| `src/app/profile/` | 339 | 0 | 78 |
| `src/app/tasks/` | 179 | 0 | 80 |
| `src/app/api/attendance/[id]/escalate/` | 20 | 1 | 93 |
| `src/app/api/tasks/[id]/start/` | 13 | 1 | 94 |
| `src/app/attendance/` | 364 | 0 | 76 |
| `src/app/notifications/` | 263 | 0 | 76 |
| `src/app/student/` | 241 | 0 | 72 |
| `src/app/admin/tasks/` | 346 | 0 | 73 |
| `src/app/inspections/` | 343 | 0 | 74 |
| `src/app/admin/tasks/[id]/` | 295 | 0 | 71 |
| `src/app/tasks/[id]/` | 336 | 0 | 69 |
| `src/app/admin/attendance/` | 405 | 0 | 66 |
| `src/app/inspections/[roomId]/` | 444 | 0 | 66 |
| `src/app/messages/` | 577 | 0 | 64 |
| `src/app/admin/batches/` | 676 | 0 | 66 |
| `src/app/admin/students/` | 701 | 0 | 55 |
| `src/lib/` | 689 | 36 | 39 |
| `src/components/shell/` | 626 | 0 | 46 |
| `src/app/superadmin/` | 1690 | 0 | 30 |
| `src/components/ui/` | 1368 | 0 | 31 |

Regenerate with `rust-anything map --write`. Commit this file: when the original changes upstream, the next map marks every port whose recording it outdated.
