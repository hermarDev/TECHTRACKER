import { BrandLogo } from "@/components/shell/BrandLogo";
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
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      {/* Institutional header */}
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-auto min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-y-2 px-4 py-3 lg:px-8 lg:py-0">
          <div className="flex items-center gap-3">
            <BrandLogo />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">TechTracker</p>
              <p className="truncate text-xs text-muted-foreground">ACLC College of Mandaue</p>
            </div>
          </div>
          <nav aria-label="Account entry" className="ml-auto flex items-center gap-2">
            {session ? (
              <Link
                href={roleDashboardPath(session.role)}
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

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
            <div className="max-w-3xl">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                <GraduationCap className="size-4" aria-hidden="true" />
                BSIT Pre-OJT &amp; Laboratory Monitoring
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground lg:text-5xl">
                100-Hour Pre-OJT Monitoring &amp; Computer Laboratory Condition Audits
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground lg:text-lg">
                TechTracker replaces manual paper logbooks and ad-hoc tracking with auditable,
                role-scoped digital workflows: verified duty-hour accounting that separates pending
                punches from coordinator-accredited hours, plus structured room-by-unit laboratory
                condition inspections — strictly bounded by college policy.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {session ? (
                  <Link
                    href={roleDashboardPath(session.role)}
                    className={cn(buttonVariants({ size: "lg" }), "gap-2")}
                  >
                    <LayoutDashboard className="size-4" aria-hidden="true" />
                    <span>Continue to your dashboard</span>
                  </Link>
                ) : (
                  <>
                    <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
                      <UserPlus className="size-4" aria-hidden="true" />
                      <span>Create student account</span>
                    </Link>
                    <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}>
                      <LogIn className="size-4" aria-hidden="true" />
                      <span>Sign in</span>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Modules */}
        <section aria-label="System modules" className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-8">
          <div className="mb-8 max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight">Two modules, one workflow</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Everything a coordinator needs to verify 100 hours of technical Pre-OJT and audit
              laboratory equipment — in one role-scoped system.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
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
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    Assigned technical tasks with reviewed completion reports
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    Immutable audit trail for corrections, reviews and rulings
                  </li>
                  <li className="flex items-start gap-2">
                    <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    Pending vs. coordinator-accredited hour separation
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
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <Laptop className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    Batch scheduling and operational report exports (CSV/PDF)
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    Role-scoped access for students, coordinators and SuperAdmin
                  </li>
                  <li className="flex items-start gap-2">
                    <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    Escalation rulings with source-record propagation
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* How it works */}
        <section aria-label="How it works" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-8">
            <div className="mb-8 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Three steps from punch to accredited hour.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                { step: "01", title: "Log duty", body: "Student punches Time In / Time Out with a photo. Hours stay pending until reviewed." },
                { step: "02", title: "Coordinator reviews", body: "Coordinator approves, rejects, or corrects with mandatory remarks and audit entry." },
                { step: "03", title: "Hours credited", body: "Approved hours count toward the 100-hour requirement; completion tracked automatically." },
              ].map((s) => (
                <div key={s.step} className="rounded-sm border border-border bg-background p-6">
                  <p className="font-mono text-xs font-semibold text-primary">{s.step}</p>
                  <h3 className="mt-2 text-base font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Entry points */}
        <section aria-label="Get started" className="mx-auto w-full max-w-6xl px-4 py-16 lg:px-8">
          <div className="mb-8 max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight">Get started</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              One login path for students, coordinators and SuperAdmin — role is assigned automatically.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
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

      <footer className="border-t border-border bg-background py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 text-xs text-muted-foreground lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>TechTracker — ACLC College of Mandaue. Photos are supporting evidence only; no geolocation, GPS or automated grading is used.</p>
          <p>100-hour technical Pre-OJT monitoring &amp; computer laboratory condition audits.</p>
        </div>
      </footer>
    </div>
  );
}