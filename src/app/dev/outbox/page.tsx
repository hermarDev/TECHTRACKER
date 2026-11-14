import Link from "next/link";
import { CircleAlert, Inbox, KeyRound, MailWarning, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";

const CATEGORY_STYLE: Record<string, { label: string; className: string }> = {
  VERIFICATION: {
    label: "Verification",
    className: "border-blue-500/40 bg-blue-500/12 text-blue-700 dark:text-blue-300",
  },
  PASSWORD_RESET: {
    label: "Password Reset",
    className: "border-amber-500/40 bg-amber-500/12 text-amber-800 dark:text-amber-300",
  },
  SECURITY_ALERT: {
    label: "Security Alert",
    className: "border-destructive/45 bg-destructive/12 text-destructive",
  },
};

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Local zero-subscription email outbox viewer. In the prototype every
 * transactional email (account verification links, password reset links and
 * 5-attempt lockout security alerts) renders into the EmailOutbox table
 * instead of an SMTP provider.
 */
export default async function DevOutboxPage() {
  const emails = await db.emailOutbox.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-muted/40">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-sm font-semibold text-primary-foreground">
              TT
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">Dev Email Outbox</p>
              <p className="truncate text-[11px] text-muted-foreground">
                Local prototype mail — zero paid subscriptions
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
              <ShieldCheck className="size-4" aria-hidden="true" />
              <span>Sign in</span>
            </Link>
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost" }))}>
              <span>Dashboard</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 lg:px-8">
        <div
          role="note"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-800 dark:text-amber-300"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This viewer is a development tool standing in for SMTP. It exposes verification links,
            password reset links and lockout alerts — disable it before any real deployment.
          </span>
        </div>

        {emails.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">The outbox is empty.</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Register a student account, request a password reset, or trigger a 5-attempt
                lockout to see the corresponding emails rendered here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4" aria-label="Queued emails">
            {emails.map((email) => {
              const style = CATEGORY_STYLE[email.category] ?? {
                label: email.category,
                className: "border-border bg-muted text-muted-foreground",
              };
              return (
                <Card key={email.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2 text-base">
                          {email.category === "SECURITY_ALERT" ? (
                            <MailWarning className="size-4 text-destructive" aria-hidden="true" />
                          ) : email.category === "PASSWORD_RESET" ? (
                            <KeyRound className="size-4 text-primary" aria-hidden="true" />
                          ) : (
                            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                          )}
                          <span className="truncate">{email.subject}</span>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          To <span className="font-medium text-foreground">{email.toEmail}</span> ·{" "}
                          <span className="tabular-ledger">{formatTimestamp(email.createdAt)}</span>
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0", style.className)}>
                        {style.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/50 px-3.5 py-3 font-mono text-xs leading-5 text-foreground">
                      {email.body}
                    </pre>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
