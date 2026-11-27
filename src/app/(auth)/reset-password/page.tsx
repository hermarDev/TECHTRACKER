"use client";

import { PublicHeader } from "@/components/shell/PublicHeader";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PasswordInput } from "@/components/shell/PasswordInput";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);


  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const body = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        const message = body.error ?? "Could not reset the password. Request a new reset link.";
        setError(message);
        toast.error(message);
        return;
      }

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
      toast.success("Password updated successfully.");
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
              Set a new password
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Use a valid, unexpired reset link.
            </p>
          </div>

          <Card className="rounded-xl border-border bg-card shadow-xs">
            <CardContent className="p-6 sm:p-8">
              {success ? (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-lg border border-success-surface/40 bg-success-surface/10 px-3.5 py-3 text-sm text-success"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="font-medium">Password updated successfully.</p>
                    <p>
                      You can now{" "}
                      <Link href="/login" className="font-medium underline underline-offset-4">
                        sign in
                      </Link>{" "}
                      with your new password.
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
                  {token === null && (
                    <div
                      role="alert"
                      className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
                    >
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>Missing reset token. Open the link from your password reset email.</span>
                    </div>
                  )}
                  <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <PasswordInput
                      id="password"
                      required
                      autoComplete="new-password"
                      label="New password (at least 8 characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={Boolean(error)}
                    />
                    <PasswordInput
                      id="confirmPassword"
                      required
                      autoComplete="new-password"
                      label="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      aria-invalid={Boolean(error)}
                    />
                    <Button type="submit" className="h-11 w-full gap-2 text-sm font-semibold" disabled={submitting}>
                      <KeyRound className="size-4" aria-hidden="true" />
                      <span>{submitting ? "Updating..." : "Update password"}</span>
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>

          <div className="space-y-2 text-center text-sm">
            <p className="text-muted-foreground">
              Link expired?{" "}
              <Link href="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">
                Request a new reset link
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

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<main className="p-8 text-center text-sm text-muted-foreground">Loading password reset...</main>}>
      <ResetPasswordForm />
    </React.Suspense>
  );
}
