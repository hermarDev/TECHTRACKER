# Student UI Audit — TechTracker

Date: 2026-11-23
Scope: Student-facing pages (`/student`, `/attendance`, `/tasks`, `/tasks/[id]`, `/inspections`, `/inspections/[roomId]`, `/messages`, `/notifications`, `/profile`), shared shell (`AppShell`, `StatusBadge`, `DataTablePagination`, `FloatingInput`, `InlineError`, `PasswordInput`, `DataTableToolbar`), `useDraftForm` hook, both backends (Next routes + Rust).

Method: static code inspection only (no runtime/browser verification, no tests executed, no contrast measurements).

## A. Broken or misleading behavior

| # | Finding | Evidence |
|---|---------|----------|
| A1 | Forms don't actually clear after submit/reset. `clearDraft()` wipes localStorage but never resets `values`. Result: sent message text stays in composer; task summary stays after submit; "Reset session" on checklist leaves entries on screen. | `src/hooks/useDraftForm.ts:52-60`; callers `messages/page.tsx:243`, `tasks/[id]/page.tsx:131`, `inspections/[roomId]/page.tsx:200,452` |
| A2 | Task status filter is dead. UI sends `status=` but neither backend reads it. | `tasks/page.tsx:55` vs `api/tasks/route.ts:17-31`, `backend/src/routes/tasks.rs:13-19` |
| A3 | "Start task" toasts success even on 409/400 — `response.ok` never checked. | `tasks/[id]/page.tsx:80-88` |
| A4 | Completion form always enabled regardless of status. Submit works only when IN_PROGRESS (Rust) / IN_PROGRESS+RETURNED (Next) → opaque "Task is not ready for submission." Next↔Rust mismatch for RETURNED resubmits. | `tasks/[id]/page.tsx:237`; `api/tasks/[id]/submit/route.ts:15`; `tasks.rs:432` |
| A5 | Chat shows only 5 newest messages forever. API hard-caps `take: 5`; no "load older"; no polling/refresh. | `api/messages/route.ts:37`; `messages/page.tsx` |
| A6 | Stuck loading screens. Student dashboard `load()` has no try/catch. Attendance/tasks/task-detail: 401 never redirects; 404 task shows "Loading task..." forever. Three loading styles. | `student/page.tsx:82-176`; `attendance/page.tsx:77-97,199`; `tasks/page.tsx:71`; `tasks/[id]/page.tsx:64-78,149` |
| A7 | Notification badge wrong/inconsistent. API returns no total-unread; dashboard/AppShell count only first 50; notifications page passes unread-on-current-page so bell changes with pagination. "Unread only" and "Mark all read" page-limited. | `api/notifications/route.ts:34`; `student/page.tsx:162-170`; `notifications/page.tsx:134-141`; `AppShell.tsx:103-118` |
| A8 | Silent data loss during photo upload (lab checklist). `uploadPhoto` completes async and writes stale `draft.values.items` snapshot — edits to other units during upload are overwritten. | `inspections/[roomId]/page.tsx:110-153` |
| A9 | Time-Out UX trap. Row button silently requires photo chosen in "Record duty" card; error appears far from button; no per-row busy indicator; `body.receipt.id` throws if shape differs → false "Network error" toast after successful punch. | `attendance/page.tsx:165-197,364-372` |
| A10 | Empty states mask errors and filters. Failed fetches render "No records yet". Inspections/messages/notifications flash empty while loading. "Submit first audit" copy shows even when filter hid rows. Messages tells students to "Use New Conversation" but they can't create conversations. | `attendance/page.tsx:346`; `tasks/page.tsx:107`; `inspections/page.tsx:274-281`; `messages/page.tsx:356-359,371-374,689-704` |

## B. Polish gaps

- Task detail: RETURNED remarks buried below submit form; no returned-for-revision banner; remarks don't distinguish author; success uses `role="alert"` (should be `status`); attachment size prints raw floats; history attachments all labeled "Attachment"; no client MIME check. (`tasks/[id]/page.tsx:227,242-254,303-318`)
- Attendance: no client ≤5MB/MIME pre-check; students can't view own punch photos; receipt toast shows raw UUID; `shiftDate` unrestricted/no hint; unbatched students see all schedules and only learn failure on submit. (`attendance/page.tsx`, `api/attendance/route.ts:59-68,127`)
- Lab checklist: native `<select>` and hand-styled labels vs shared components; defect-remarks error fires before typing; submit error lists unit codes but never scrolls/focuses first invalid unit; destructive "Reset session" no confirmation; attached photos show filename link only. (`inspections/[roomId]/page.tsx:348,364-378,174-179,449-459`)
- Messages: no auto-scroll to newest; no per-conversation unread marker; no Enter-to-send; selected attachment shows only "Remove"; image attachments render twice. (`messages/page.tsx:435-494,541-549`)
- Profile: mixes FloatingInput and plain Label+Input; sidebar name stale after save; load-error outside AppShell; no client password match/length check. (`profile/page.tsx:152-164,217-267`)
- Auth: `emailError` dead code on login/register; server field errors only top banner; register no password-requirements hint; no resend-verification path. (`login/page.tsx:30`, `register/page.tsx:36`)
- Consistency: timestamps mix browser-locale, `en-PH`, `undefined` locale; `.tabular-ledger` sets tabular-nums but not JetBrains Mono; StatusBadge says "Returned"/"Irregular" vs charter "Returned for Revision"/"Irregular / Off-Schedule"; task filter shows raw enums; scattered `[&_div]:flex-wrap` hacks.
- Shell/a11y: no skip-to-content; Chat (core student feature) in mobile "More" overflow; badge refreshes only on tab visibility; ThemeToggle shows moon in both states; attendance/task file inputs `display:none` with `aria-describedby` error (screen readers can't reach it — checklist's `sr-only` pattern is correct).

## C. Good bones worth keeping

Ledger separation (credited vs pending), draft persistence + `beforeunload` warning, camera stream lifecycle cleanup, checklist per-unit validation + sticky summary bar, server-side remark visibility filtering, reduced-motion CSS.

## Proposed Plan

Phase 1 — Fix broken behavior (highest value, mostly small diffs):
1. Root-fix `clearDraft()` to also reset values (one place; audit 5 callers) → A1.
2. Implement `status` filter in both task backends (charter requires filters) → A2.
3. Check `response.ok` in `start()`; gate completion form by status with guidance → A3/A4.
4. Add try/catch + error-with-retry + 401 redirect to dashboard/attendance/tasks/task-detail; one shared loading pattern → A6.
5. Messages: add "load older" (cursor/pagination), auto-scroll to newest, light polling or refresh, hide New Conversation for students, fix empty-state copy → A5/A10.
6. Add total `unread` to notifications GET (both backends); use for every badge; server-side unread filter + mark-all-read → A7.
7. Fix upload race using functional updater (`setValues(prev => …)`) → A8.
8. Time-Out: photo affordance next to row button (reuse camera dialog), client 5MB/MIME check, safe receipt parsing → A9.

Phase 2 — Polish & consistency:
RETURNED banner + remark author labels; shared error/empty/loading states (filter-empty vs no-data); one `en-PH` date helper + mono ledger numerals; shared Select/Button in checklist; confirmation on Reset session + scroll-to-first-invalid; attachment name/size formatting (reuse `formatBytes`); profile field consistency + live shell update; register field-level errors + password hint; vocabulary alignment; skip link, ThemeToggle state, `sr-only` file inputs; remove wrapper hacks by fixing pagination responsiveness.

Phase 3 — Verify:
Extend Playwright for previously untested flows (message send clears composer, history loads, task start→submit→resubmit, status filter actually filters, Time-Out, mark-read, reset session). Run Vitest + Playwright + 430px mobile pass.

Risk note: A4/A2 fixes touch both backends mid-Rust-migration — keep Next and Rust in lockstep or the proxy flag changes behavior. A5/A7 behavior should get a quick live confirmation before fixing since findings are code-level.
