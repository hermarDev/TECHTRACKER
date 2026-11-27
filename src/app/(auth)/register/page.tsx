"use client";

import { PublicHeader } from "@/components/shell/PublicHeader";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CircleAlert, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FloatingInput } from "@/components/shell/FloatingInput";
import { PasswordInput } from "@/components/shell/PasswordInput";
import { useDraftForm } from "@/hooks/useDraftForm";

interface FormState {
  fullName: string;
  email: string;
  studentIdNo: string;
  program: string;
  section: string;
  password: string;
  confirmPassword: string;
}

const EMPTY_DETAILS = { fullName: "", email: "", studentIdNo: "", program: "", section: "" };


export default function RegisterPage() {
  const hydrated = React.useSyncExternalStore(() => () => {}, () => true, () => false);
  const draft = useDraftForm("techtracker-registration-draft", EMPTY_DETAILS);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const form: FormState = { ...draft.values, password, confirmPassword };
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = React.useState<string | null>(null);
  const [emailError, setEmailError] = React.useState<string | null>(null);


  const update = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (field === "password") setPassword(value);
    else if (field === "confirmPassword") setConfirmPassword(value);
    else draft.setValues({ [field]: value });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await res.json()) as { error?: string };

      if (!res.ok) {
        const message = body.error ?? "Registration failed. Please review your details and try again.";
        setError(message);
        toast.error(message);
        return;
      }

      setRegisteredEmail(form.email.trim().toLowerCase());
      draft.resetAll();
      setPassword("");
      setConfirmPassword("");
      toast.success("Registration received. Check your email for the verification link.");
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
        <div className="w-full max-w-[520px] space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Create student account
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Register as an eligible BSIT student.
            </p>
          </div>

          <Card className="rounded-xl border-border bg-card shadow-xs">
            <CardContent className="p-6 sm:p-8">
              {registeredEmail && (
                <div
                  role="status"
                  className="mb-5 flex items-start gap-2.5 rounded-lg border border-success-surface/40 bg-success-surface/10 px-3.5 py-3 text-sm text-success"
                >
                  <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="font-medium">Registration received.</p>
                    <p>
                      A verification link was sent to <span className="font-medium">{registeredEmail}</span>.
                      Open it to activate your account before signing in.
                    </p>
                    <p className="text-xs opacity-80">
                      Open the link from your inbox to activate the account before signing in.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <fieldset disabled={!hydrated} className="space-y-4">
                  <FloatingInput id="email" name="email" type="email" required autoComplete="email" label="Email address" error={emailError} value={form.email} onChange={(e) => { update("email")(e); setEmailError(null); }} />
                  <FloatingInput
                    id="fullName"
                    required
                    autoComplete="name"
                    label="Full name"
                    value={form.fullName}
                    onChange={update("fullName")}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FloatingInput
                      id="studentIdNo"
                      required
                      label="Student ID number"
                      value={form.studentIdNo}
                      onChange={update("studentIdNo")}
                    />
                    <FloatingInput
                      id="section"
                      required
                      label="Section"
                      value={form.section}
                      onChange={update("section")}
                    />
                  </div>
                  <FloatingInput
                    id="program"
                    required
                    label="Program"
                    value={form.program}
                    onChange={update("program")}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <PasswordInput
                      id="password"
                      required
                      autoComplete="new-password"
                      label="Password"
                      value={form.password}
                      onChange={update("password")}
                    />
                    <PasswordInput
                      id="confirmPassword"
                      required
                      autoComplete="new-password"
                      label="Confirm password"
                      value={form.confirmPassword}
                      onChange={update("confirmPassword")}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use at least 8 characters for your password.
                  </p>
                  <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={submitting}>
                    {submitting ? "Submitting..." : "Create student account"}
                  </Button>
                </fieldset>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-2 text-center text-sm">
            <p className="text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
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