import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, GraduationCap, Laptop, LayoutDashboard, LogIn, UserPlus } from "lucide-react";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { buttonVariants } from "@/components/ui/button";
import { getBackendSession } from "@/lib/backend-session";
import { roleDashboardPath } from "@/lib/rbac-policies";
import { cn } from "cn";

export default async function Home() {
  const session = await getBackendSession();

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background text-foreground">
      <PublicHeader sessionRole={session?.role ?? null} />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border bg-background">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12 lg:px-8 lg:py-20">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-primary uppercase">
                <GraduationCap className="size-4" aria-hidden="true" />
                BSIT / Pre-OJT &amp; Lab Monitoring
              </p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Track duty hours.
                <br />
                Monitor laboratories.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
                A single institutional portal for verified duty hours, technical tasks, and
                room-by-unit laboratory condition audits — bounded strictly by college policy.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
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
                    <Link
                      href="/login"
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      <LogIn className="size-4" aria-hidden="true" />
                      <span>Already registered? Sign in</span>
                    </Link>
                  </>
                )}
              </div>
              <p className="mt-6 text-xs text-muted-foreground">
                100-hour requirement · Coordinator review · Photo evidence (no GPS)
              </p>
            </div>

            {/* Illustrative data previews */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">Pre-OJT progress</p>
                  <span className="inline-flex items-center rounded-full border border-warning-surface/40 bg-warning-surface/15 px-2.5 py-0.5 text-xs font-medium text-warning">
                    4 hrs pending
                  </span>
                </div>
                <p className="mt-3 font-mono text-3xl font-semibold tracking-tight tabular-ledger text-foreground">
                  64.5 <span className="text-lg font-normal text-muted-foreground">/ 100 hrs</span>
                </p>
                <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[64.5%] rounded-full bg-primary" />
                </div>
                <p className="mt-2.5 text-xs text-muted-foreground">
                  Credited hours only — pending punches await coordinator approval
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">Computer Lab 1</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-success">26 functioning</span>
                    <span>2 maintenance</span>
                    <span>2 repair</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
                  <p className="font-mono text-xs font-medium text-foreground">
                    PC-14 <span className="text-muted-foreground">/ Monitor flicker</span>
                  </p>
                  <span className="inline-flex items-center rounded-full border border-warning-surface/40 bg-warning-surface/15 px-2.5 py-0.5 text-xs font-medium text-warning">
                    Flagged
                  </span>
                </div>
              </div>

              <p className="text-right text-[11px] text-muted-foreground">
                Illustrative data preview — sample records are not live system data
              </p>
            </div>
          </div>
        </section>

        {/* Two modules, one platform */}
        <section className="mx-auto w-full max-w-6xl px-4 py-12 lg:px-8 lg:py-14">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Two modules, one platform.
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
              <div className="flex items-center gap-2.5">
                <ClipboardCheck className="size-5 text-primary" aria-hidden="true" />
                <h3 className="text-base font-semibold text-foreground">100-Hour Pre-OJT Monitoring</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Log photo-assisted duty shifts, submit assigned technical tasks, and track
                coordinator-credited hours separately from pending reviews.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
              <div className="flex items-center gap-2.5">
                <Laptop className="size-5 text-primary" aria-hidden="true" />
                <h3 className="text-base font-semibold text-foreground">Laboratory Condition Audits</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Inspect workstations A–Z by room, document maintenance or repair defects with
                photo evidence, and export CSV/PDF accreditation logs.
              </p>
            </div>
          </div>

          {/* Workflow strip */}
          <div className="mt-8 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-6 py-4 text-sm font-medium text-foreground shadow-xs">
            <span className="inline-flex items-center gap-2">
              <span className="font-mono text-xs text-primary">01</span>
              Log duty
            </span>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="inline-flex items-center gap-2">
              <span className="font-mono text-xs text-primary">02</span>
              Coordinator reviews
            </span>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              <span className="font-mono text-xs text-primary">03</span>
              Hours credited
            </span>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>
            Students: self-register · Coordinators &amp; SuperAdmin: sign in with issued accounts
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span>ACLC College of Mandaue · BSIT Pre-OJT</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
