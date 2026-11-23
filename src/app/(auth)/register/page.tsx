"use client";

import { BrandLogo } from "@/components/shell/BrandLogo";
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
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-[450px] space-y-6">
        <div className="text-center">
          <BrandLogo className="mx-auto size-12" />
          <h1 className="mt-6 text-2xl font-normal tracking-tight text-foreground">
            Student Self-Registration
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Create your TechTracker account</p>
        </div>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="pt-6">
            {registeredEmail && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2.5 rounded-md border border-success-surface/40 bg-success-surface/10 px-3.5 py-3 text-sm text-success"
              >
                <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-medium">Registration received.</p>
                  <p>
                    A verification link was sent to <span className="font-medium">{registeredEmail}</span>.
                    Open it to activate your account before signing in.
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
            )}

            {error && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <fieldset disabled={!hydrated} className="space-y-4">
                <FloatingInput id="email" name="email" type="email" required autoComplete="email" label="Email address" error={emailError} value={form.email} onChange={(e) => { update("email")(e); setEmailError(null); }} />
                <div className="space-y-1">
                  <FloatingInput
                    id="fullName"
                    required
                    autoComplete="name"
                    label="Full name"
                    value={form.fullName}
                    onChange={update("fullName")}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <FloatingInput
                      id="studentIdNo"
                      required
                      label="Student ID number"
                      value={form.studentIdNo}
                      onChange={update("studentIdNo")}
                    />
                  </div>
                  <div className="space-y-1">
                    <FloatingInput
                      id="program"
                      required
                      label="Program"
                      value={form.program}
                      onChange={update("program")}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <FloatingInput
                    id="section"
                    required
                    label="Section"
                    value={form.section}
                    onChange={update("section")}
                  />
                </div>
                <div className="space-y-1">
                  <PasswordInput
                    id="password"
                    required
                    autoComplete="new-password"
                    label="Password"
                    value={form.password}
                    onChange={update("password")}
                  />
                </div>
                <div className="space-y-1">
                  <PasswordInput
                    id="confirmPassword"
                    required
                    autoComplete="new-password"
                    label="Confirm password"
                    value={form.confirmPassword}
                    onChange={update("confirmPassword")}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Button type="submit" className="h-10 px-6" disabled={submitting}>
                    {submitting ? "Submitting..." : "Register"}
                  </Button>
                </div>
                </fieldset>
              </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}