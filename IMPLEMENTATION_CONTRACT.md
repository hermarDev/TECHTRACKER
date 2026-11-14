# TechTracker Web Prototype — Parallel Implementation Contract

## Shared Frozen Foundations (DO NOT MODIFY WITHOUT LEAD APPROVAL)
- `prisma/schema.prisma`, `prisma/seed.ts`
- `src/lib/db.ts`, `src/lib/auth.ts`, `src/lib/rbac.ts`, `src/lib/storage.ts`, `src/lib/audit.ts`, `src/lib/hours.ts`, `src/lib/validation.ts`, `src/lib/auth-server-props.ts`
- `src/components/shell/AppShell.tsx`, `PasswordInput.tsx`, `StatusBadge.tsx`, `DataTablePagination.tsx`, `ThemeToggle.tsx`
- `src/hooks/useDraftForm.ts`
- `src/app/globals.css`, `src/app/layout.tsx`, `src/app/api/files/[...key]/route.ts`

## Critical Tech Rules
1. **shadcn/ui v4 (`@base-ui/react`)**: NEVER pass `asChild` to `Button`, `DialogTrigger`, `SheetTrigger`, etc. Use `render={<Link ... />}` or style `<Link>` with `buttonVariants()`!
2. **Next.js 16 Route Handlers & Dynamic Pages**: `context.params` and `cookies()` are Promises — always `await context.params` and `await cookies()`.
3. **UI Craft Rules**:
   - Neutral placeholders only (NO "Juan dela Cruz", NO example names/phone numbers).
   - Always use `<PasswordInput>` (Eye/EyeOff icon, never visible "Show" text).
   - Form error alerts use `border-destructive/40 bg-destructive/10` + `<CircleAlert>`; success states use emerald tokens + `<CheckCircle2>`; trigger `toast.success` / `toast.error` from `sonner` alongside inline `role="alert"`.
   - Tabular figures (`tabular-ledger`) for hours, timestamps, student IDs, unit codes.
   - NO `asChild`, NO decorative gradients, NO GPS/geolocation, NO urgent repair dispatch/tickets, NO chat UI for SuperAdmin.
4. **TDD Rule**: Write failing test in your domain integration test file first, verify it fails, write minimal clean implementation, run `npx vitest run <your-test>` and `npx tsc --noEmit` to verify pass.

## Disjoint File Ownership Matrix

### Domain A — `opencode-external` (Flows 01W–04W, 12W, 02S–04S)
- `src/app/page.tsx` (01W Master Overview + entry routing)
- `src/app/(auth)/login/page.tsx` (03W Sign-In — NO role selector!)
- `src/app/(auth)/register/page.tsx` (02W Student Self-Registration — Full Name, Email, Student ID, Program, Section, Password + Confirm)
- `src/app/(auth)/forgot-password/page.tsx` & `src/app/(auth)/reset-password/page.tsx` (03W Recovery)
- `src/app/dashboard/page.tsx` (04W Role Dashboard Router)
- `src/app/student/page.tsx` (04W Student Home: 100-hr progress credited vs pending, active tasks, recent attendance, notifications)
- `src/app/profile/page.tsx` (12W Profile & Password Change)
- `src/app/dev/outbox/page.tsx` (Local zero-subscription email viewer for verification/reset/lockout alerts)
- `src/app/api/auth/**` (`register`, `verify`, `login`, `logout`, `forgot-password`, `reset-password`, `me`)
- `src/app/api/profile/route.ts` & `src/app/api/dev/outbox/route.ts`
- `tests/integration/domain-a.test.ts`

### Domain B — `copilot-external` (Flows 05W–08W, 05S–08S)
- `src/app/attendance/page.tsx` (05W Student Attendance: scheduled shift selector, webcam capture + file upload <=5MB, NO GPS, draft preservation)
- `src/app/admin/attendance/page.tsx` (06W Coordinator Review Queue: photo preview, Approve/Reject w/ mandatory remarks, Correction modal w/ before/after preview + mandatory justification, Escalate to SuperAdmin, Accreditation PDF button)
- `src/app/tasks/page.tsx` & `src/app/tasks/[id]/page.tsx` (07W/08W Student Tasks: Start Task, Completion Report + attachments <=5MB, Threaded Student-Visible Remarks — NEVER show INTERNAL_STAFF_ONLY remarks, Resubmit when RETURNED)
- `src/app/admin/tasks/page.tsx` & `src/app/admin/tasks/[id]/page.tsx` (07W/08W Coordinator Task Assignment + Review w/ mandatory return remarks + private internal notes)
- `src/app/api/attendance/**` (`route.ts`, `[id]/review/route.ts`, `[id]/correct/route.ts`, `[id]/escalate/route.ts`, `accreditation-pdf/route.ts`)
- `src/app/api/tasks/**` (`route.ts`, `[id]/route.ts`, `[id]/start/route.ts`, `[id]/submit/route.ts`, `[id]/review/route.ts`)
- `src/lib/pdf-accreditation.ts` (Generates "100-Hour Internal Duty Accreditation Summary Log (PDF)")
- `tests/integration/domain-b.test.ts`

### Domain C — `cline-external` (Flows 09W–16W, 09S–10S)
- `src/app/inspections/page.tsx` & `src/app/inspections/[roomId]/page.tsx` (09W/10W Room & Unit A-Z Checklist, mandatory defect remarks + photo proof, NO urgent alerts/tickets, CSV/PDF Room Summary Report)
- `src/app/messages/page.tsx` (11W Individual & Batch Messaging w/ <=5MB attachment; SuperAdmin blocked!)
- `src/app/notifications/page.tsx` (11W Alerts & Notifications inbox + mark read)
- `src/app/admin/page.tsx` (04W Admin Dashboard)
- `src/app/admin/batches/page.tsx` (13W 3-Step Batch & Schedule Wizard + paginated list 15/25/50)
- `src/app/admin/reports/page.tsx` (14W Operational Reports w/ filters + 15/25/50 pagination + CSV/PDF export + audit trail)
- `src/app/admin/students/page.tsx` (15W Student Directory 15/25/50 + 4-step CSV/XLSX Import Wizard w/ duplicate resolution)
- `src/app/superadmin/page.tsx` (16W 7-Subsystem Executive Console + Escalation Rulings + Admin CRUD + Config + Audit Log — NO chat)
- `src/app/api/inspections/**`, `src/app/api/messages/**`, `src/app/api/notifications/**`, `src/app/api/admin/**`, `src/app/api/superadmin/**`
- `src/lib/reports-export.ts`
- `tests/integration/domain-c.test.ts`
