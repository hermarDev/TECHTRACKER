"use client";

import { PublicHeader } from "@/components/shell/PublicHeader";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, KeyRound, MailQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FloatingInput } from "@/components/shell/FloatingInput";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);


  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        const message = body.error ?? "Could not process the request. Please try again.";
        setError(message);
        toast.error(message);
        return;
      }

      setSent(true);
      toast.success(body.message ?? "Password reset link sent.");
    } catch {
      const message = "Network error. Please check your connection and try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <PublicHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-[480px] space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Reset your password
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the email associated with your account.
            </p>
          </div>

          <Card className="rounded-xl border-border bg-card shadow-xs">
            <CardContent className="p-6 sm:p-8">
              {sent ? (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-lg border border-success-surface/40 bg-success-surface/10 px-3.5 py-3 text-sm text-success"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="font-medium">Request received.</p>
                    <p>
                      If an account exists for this email address, a password reset link has been
                      sent. The link expires in 1 hour.
                    </p>
                    <p className="text-xs opacity-80">
                      Open the link from your inbox to choose a new password.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {error && (
                    <div
                      role="alert"
                      className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
                    >
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}
                  <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <FloatingInput
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      label="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={Boolean(error)}
                    />
                    <Button type="submit" className="h-11 w-full gap-2 text-sm font-semibold" disabled={submitting}>
                      <MailQuestion className="size-4" aria-hidden="true" />
                      <span>{submitting ? "Sending..." : "Send reset link"}</span>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      If an account exists, a single-use reset link expiring in 1 hour will be sent.
                    </p>
                  </form>
                </>
              )}
            </CardContent>
          </Card>

          <div className="space-y-2 text-center text-sm">
            <p>
              <Link href="/login" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
                <KeyRound className="size-3.5" aria-hidden="true" />
                Back to sign in
              </Link>
            </p>
            <p>
              <Link href="/" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                Back to homepage
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
