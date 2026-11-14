"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/shell/PasswordInput";
import { cn } from "cn";

// Mirrors rbac.roleDashboardPath (kept client-side to avoid server-only imports).
const ROLE_PATH: Record<string, string> = {
  SUPERADMIN: "/superadmin",
  ADMIN: "/admin",
  STUDENT: "/student",
};

type Mode = "idle" | "success" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("idle");
  const [alertMessage, setAlertMessage] = React.useState("");

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
      const body = (await res.json()) as {
        error?: string;
        user?: { role: string };
      };

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
    <div className="flex min-h-screen flex-1 items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-primary font-mono text-base font-semibold text-primary-foreground">
            TT
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in to TechTracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ACLC College of Mandaue — BSIT Pre-OJT &amp; Lab Monitoring
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Use your registered institutional email. Your dashboard opens by role — no role selection needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mode === "error" && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{alertMessage}</span>
              </div>
            )}
            {mode === "success" && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-700 dark:text-emerald-300"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{alertMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="Institutional email address"
                  className="h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={mode === "error"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={mode === "error"}
                />
              </div>
              <Button type="submit" className="h-11 w-full gap-2 text-base" disabled={submitting}>
                <LogIn className="size-4" aria-hidden="true" />
                <span>{submitting ? "Signing in..." : "Sign in"}</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-3 text-center text-sm">
          <p className="text-muted-foreground">
            Forgot your password?{" "}
            <Link href="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">
              Reset it here
            </Link>
          </p>
          <p className="text-muted-foreground">
            Incoming fourth-year BSIT student?{" "}
            <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              Create your student account
            </Link>
          </p>
          <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground/80">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Accounts lock for 15 minutes after 5 failed sign-in attempts.
          </p>
        </div>

        <div className="text-center">
          <Link href="/dev/outbox" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}>
            Local dev email outbox
          </Link>
        </div>
      </div>
    </div>
  );
}
