"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, KeyRound, MailQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="flex min-h-screen flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-primary font-mono text-base font-semibold text-primary-foreground">
            TT
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Password Recovery</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reset links are single-use and expire after 1 hour.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Forgot your password?</CardTitle>
            <CardDescription>
              Enter your registered institutional email and we will send a reset link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-700 dark:text-emerald-300"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-medium">Request received.</p>
                  <p>
                    If an account exists for this email address, a password reset link has been
                    sent. The link expires in 1 hour.
                  </p>
                  <p className="text-xs opacity-80">
                    On this local prototype, read the link in the{" "}
                    <Link href="/dev/outbox" className="underline underline-offset-4">
                      dev email outbox
                    </Link>
                    .
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
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="Institutional email address"
                      className="h-11"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={Boolean(error)}
                    />
                  </div>
                  <Button type="submit" className="h-11 w-full gap-2 text-base" disabled={submitting}>
                    <MailQuestion className="size-4" aria-hidden="true" />
                    <span>{submitting ? "Sending..." : "Send reset link"}</span>
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground/80">
          <KeyRound className="size-3.5" aria-hidden="true" />
          For your security, the response is identical whether or not the account exists.
        </p>
      </div>
    </div>
  );
}
