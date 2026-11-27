"use client";

import { PublicHeader } from "@/components/shell/PublicHeader";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FloatingInput } from "@/components/shell/FloatingInput";
import { PasswordInput } from "@/components/shell/PasswordInput";

const ROLE_PATH: Record<string, string> = {
  SUPERADMIN: "/superadmin",
  ADMIN: "/admin",
  STUDENT: "/student",
};

type Mode = "idle" | "success" | "error";

export default function LoginPage() {
  const router = useRouter();
  const hydrated = React.useSyncExternalStore(() => () => {}, () => true, () => false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("idle");
  const [alertMessage, setAlertMessage] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);

  const verifiedParam = React.useRef<string | null>(null);
  React.useEffect(() => {
    verifiedParam.current = new URLSearchParams(window.location.search).get("verified");
    if (verifiedParam.current === "1") {
      setMode("success");
      setAlertMessage("Email verified successfully. Your account is active — you can sign in now.");
    } else if (verifiedParam.current === "invalid") {
      setMode("error");
      setAlertMessage("That verification link is invalid or has expired. Register again or contact your coordinator.");
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMode("idle");
    setAlertMessage("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as { error?: string; user?: { role: string } };
      if (!res.ok || !body.user) {
        setMode("error");
        setAlertMessage(body.error ?? "Sign-in failed. Please try again.");
        toast.error(body.error ?? "Sign-in failed. Please try again.");
        return;
      }
      setMode("success");
      toast.success("Signed in successfully.");
      router.replace(ROLE_PATH[body.user.role] ?? "/student");
    } catch {
      setMode("error");
      setAlertMessage("Network error. Please check your connection and try again.");
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <PublicHeader showSignIn={false} />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-[480px] space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Sign in to TechTracker
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Use your institutional or registered account.
            </p>
          </div>

          <Card className="rounded-xl border-border bg-card shadow-xs">
            <CardContent className="p-6 sm:p-8">
              {mode === "error" && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{alertMessage}</span>
                </div>
              )}
              {mode === "success" && (
                <div
                  role="status"
                  className="mb-5 flex items-start gap-2.5 rounded-lg border border-success-surface/40 bg-success-surface/10 px-3.5 py-3 text-sm text-success"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{alertMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <fieldset disabled={!hydrated} className="space-y-5">
                  <FloatingInput id="email" name="email" type="email" autoComplete="email" required label="Email address" error={emailError} value={email} onChange={(e) => { setEmail(e.target.value); setEmailError(null); }} />
                  <PasswordInput id="password" name="password" autoComplete="current-password" required label="Password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={mode === "error"} />
                  <div className="flex justify-end">
                    <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={submitting}>
                    {submitting ? "Signing in..." : "Sign in"}
                  </Button>
                </fieldset>
              </form>
            </CardContent>
          </Card>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">New to TechTracker? </span>
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create student account
            </Link>
          </div>

          <div className="flex flex-col items-center gap-2 pt-1 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Accounts lock for 15 minutes after 5 failed sign-in attempts.
            </p>
            <Link href="/" className="hover:text-foreground hover:underline">
              Back to homepage
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}