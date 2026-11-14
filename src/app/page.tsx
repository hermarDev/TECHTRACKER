import Link from "next/link";
import {
  CalendarClock,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Laptop,
  LogIn,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionFromCookies } from "@/lib/auth";
import { roleDashboardPath } from "@/lib/rbac";
import { cn } from "cn";

const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: "SuperAdmin console",
  ADMIN: "Coordinator dashboard",
  STUDENT: "Student dashboard",
};

export default async function Home() {
  const session = await getSessionFromCookies();

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-muted/40">
      {/* Institutional header */}
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary font-mono text-sm font-semibold text-primary-foreground">
              TT
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">TechTracker</p>
              <p className="truncate text-[11px] text-muted-foreground">ACLC College of Mandaue</p>
            </div>
          </div>
          <nav aria-label="Account entry" className="flex items-center gap-2">
            {session ? (
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "default", size: "lg" }), "gap-2")}
              >
                <LayoutDashboard className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {ROLE_LABEL[session.role] ?? "Your dashboard"}
                </span>
                <span className="sm:hidden">Dashboard</span>
              </Link>
            ) : (
              <>
                <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "gap-2")}>
                  <LogIn className="size-4" aria-hidden="true" />
                  <span>Sign in</span>
                </Link>
                <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
                  <UserPlus className="size-4" aria-hidden="true" />
                  <span>Register</span>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 lg:px-8 lg:py-14">
        {/* 01W Overview hero */}
        <section className="max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <GraduationCap className="size-3.5" aria-hidden="true" />
            BSIT Pre-OJT &amp; Laboratory Monitoring
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
            100-Hour Pre-OJT Monitoring &amp; Computer Laboratory Condition Audits
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            TechTracker replaces manual paper logbooks and ad-hoc tracking with auditable,
            role-scoped digital workflows: verified duty-hour accounting that separates pending
            punches from coordinator-accredited hours, plus structured room-by-unit laboratory
            condition inspections — strictly bounded by college policy.
          </p>
          {session && (
            <div className="mt-6">
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ size: "lg" }), "gap-2")}
              >
                <LayoutDashboard className="size-4" aria-hidden="true" />
                <span>Continue to your dashboard</span>
              </Link>
            </div>
          )}
        </section>

        {/* Module overview cards */}
        <section aria-label="System modules" className="mt-10 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4 text-primary" aria-hidden="true" />
                100-Hour Pre-OJT Monitoring
              </CardTitle>
              <CardDescription>
                Photo-assisted Time In / Time Out attendance with coordinator review — no GPS
                tracking. Track pending versus credited hours toward the 100-hour requirement.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2">
                  <ClipboardCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Assigned technical tasks with reviewed completion reports
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Immutable audit trail for corrections, reviews and rulings
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Laptop className="size-4 text-primary" aria-hidden="true" />
                Laboratory Condition Audits
              </CardTitle>
              <CardDescription>
                Room-by-unit A–Z equipment checklists recording Functioning, Needs Maintenance or
                Needs Repair, with mandatory defect remarks and photo proof.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2">
                  <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Batch scheduling and operational report exports
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Role-scoped access for students, coordinators and SuperAdmin
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>

        {/* Entry points */}
        <section aria-label="Get started" className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Get started</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Students</CardTitle>
                <CardDescription>
                  Incoming fourth-year BSIT students self-register, verify their email, and start
                  logging duty hours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/register" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
                  <UserPlus className="size-4" aria-hidden="true" />
                  <span>Create student account</span>
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Coordinators &amp; SuperAdmin</CardTitle>
                <CardDescription>
                  Sign in with your issued institutional account to review attendance, tasks and
                  escalations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
                  <LogIn className="size-4" aria-hidden="true" />
                  <span>Sign in</span>
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Local email outbox</CardTitle>
                <CardDescription>
                  On this zero-subscription prototype, verification and reset emails render into a
                  local outbox viewer.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/dev/outbox" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  <span>Open outbox</span>
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background py-6">
        <p className="mx-auto max-w-6xl px-4 text-xs text-muted-foreground lg:px-8">
          TechTracker — ACLC College of Mandaue. Photos are supporting evidence only; no
          geolocation, GPS or automated grading is used.
        </p>
      </footer>
    </div>
  );
}
