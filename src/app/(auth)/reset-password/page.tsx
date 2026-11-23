"use client";

import { BrandLogo } from "@/components/shell/BrandLogo";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="flex min-h-screen flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <BrandLogo className="mx-auto size-12" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Set a New Password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Password reset — ACLC College of Mandaue BSIT Pre-OJT
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reset your password</CardTitle>
            <CardDescription>
              Choose a new password with at least 8 characters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-sm border border-success-surface/40 bg-success-surface/10 px-3.5 py-3 text-sm text-success"
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
                    className="mb-4 flex items-start gap-2.5 rounded-sm border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
                  >
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}
                {token === null && (
                  <div
                    role="alert"
                    className="mb-4 flex items-start gap-2.5 rounded-sm border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
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
                  <Button type="submit" className="h-11 w-full gap-2 text-base" disabled={submitting}>
                    <KeyRound className="size-4" aria-hidden="true" />
                    <span>{submitting ? "Updating..." : "Update password"}</span>
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Link expired?{" "}
          <Link href="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">
            Request a new reset link
          </Link>
        </p>
      </div>
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
