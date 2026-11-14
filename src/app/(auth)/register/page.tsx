"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, MailCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/shell/PasswordInput";

interface FormState {
  fullName: string;
  email: string;
  studentIdNo: string;
  program: string;
  section: string;
  password: string;
  confirmPassword: string;
}

const EMPTY_FORM: FormState = {
  fullName: "",
  email: "",
  studentIdNo: "",
  program: "",
  section: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterPage() {
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = React.useState<string | null>(null);

  const update = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

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
      setForm(EMPTY_FORM);
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
    <div className="flex min-h-screen flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-primary font-mono text-base font-semibold text-primary-foreground">
            TT
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Student Self-Registration</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            100-hour technical Pre-OJT — ACLC College of Mandaue BSIT
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create your student account</CardTitle>
            <CardDescription>
              Student access is assigned automatically after email verification — no role selection is needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {registeredEmail && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-700 dark:text-emerald-300"
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
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  required
                  autoComplete="name"
                  placeholder="Enter your complete legal name"
                  className="h-11"
                  value={form.fullName}
                  onChange={update("fullName")}
                  aria-invalid={Boolean(error)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Institutional email address"
                  className="h-11"
                  value={form.email}
                  onChange={update("email")}
                  aria-invalid={Boolean(error)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="studentIdNo">Student ID number</Label>
                  <Input
                    id="studentIdNo"
                    required
                    placeholder="Your student ID number"
                    className="h-11"
                    value={form.studentIdNo}
                    onChange={update("studentIdNo")}
                    aria-invalid={Boolean(error)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="program">Program</Label>
                  <Input
                    id="program"
                    required
                    placeholder="e.g., BSIT"
                    className="h-11"
                    value={form.program}
                    onChange={update("program")}
                    aria-invalid={Boolean(error)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="section">Section</Label>
                <Input
                  id="section"
                  required
                  placeholder="Your current section"
                  className="h-11"
                  value={form.section}
                  onChange={update("section")}
                  aria-invalid={Boolean(error)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  required
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={update("password")}
                  aria-invalid={Boolean(error)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <PasswordInput
                  id="confirmPassword"
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={form.confirmPassword}
                  onChange={update("confirmPassword")}
                  aria-invalid={Boolean(error)}
                />
              </div>
              <Button type="submit" className="h-11 w-full gap-2 text-base" disabled={submitting}>
                <UserPlus className="size-4" aria-hidden="true" />
                <span>{submitting ? "Submitting..." : "Register"}</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Already registered and verified?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
