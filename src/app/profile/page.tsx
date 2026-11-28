"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, KeyRound, Save, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/components/shell/AppShell";
import { PasswordInput } from "@/components/shell/PasswordInput";
import { FloatingInput } from "@/components/shell/FloatingInput";

interface ProfileUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  studentIdNo: string | null;
  program: string | null;
  section: string | null;
  phone: string | null;
}

type ProfileMode = "idle" | "success" | "error";
type PasswordMode = "idle" | "success" | "error";

export default function ProfilePage() {
  const [user, setUser] = React.useState<ProfileUser | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [program, setProgram] = React.useState("");
  const [section, setSection] = React.useState("");
  const [detailsSubmitting, setDetailsSubmitting] = React.useState(false);
  const [detailsMode, setDetailsMode] = React.useState<ProfileMode>("idle");
  const [detailsMessage, setDetailsMessage] = React.useState("");

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordSubmitting, setPasswordSubmitting] = React.useState(false);
  const [passwordMode, setPasswordMode] = React.useState<PasswordMode>("idle");
  const [passwordMessage, setPasswordMessage] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) {
          if (!cancelled) {
            setLoadError("Could not load your profile. Please refresh the page.");
          }
          return;
        }
        const body = (await res.json()) as { user: ProfileUser };
        if (cancelled) return;
        setUser(body.user);
        setFullName(body.user.fullName ?? "");
        setPhone(body.user.phone ?? "");
        setProgram(body.user.program ?? "");
        setSection(body.user.section ?? "");
      } catch {
        if (!cancelled) setLoadError("Network error while loading your profile. Please refresh the page.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isStudent = user?.role === "STUDENT";

  const handleDetailsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDetailsSubmitting(true);
    setDetailsMode("idle");
    setDetailsMessage("");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          ...(isStudent ? { program, section } : {}),
        }),
      });
      const body = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        const message = body.error ?? "Could not update your profile. Please try again.";
        setDetailsMode("error");
        setDetailsMessage(message);
        toast.error(message);
        return;
      }

      setDetailsMode("success");
      setDetailsMessage("Profile updated successfully.");
      toast.success("Profile updated successfully.");
    } catch {
      const message = "Network error. Please check your connection and try again.";
      setDetailsMode("error");
      setDetailsMessage(message);
      toast.error(message);
    } finally {
      setDetailsSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordSubmitting(true);
    setPasswordMode("idle");
    setPasswordMessage("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const body = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        const message = body.error ?? "Could not change your password. Please try again.";
        setPasswordMode("error");
        setPasswordMessage(message);
        toast.error(message);
        return;
      }

      setPasswordMode("success");
      setPasswordMessage("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully.");
    } catch {
      const message = "Network error. Please check your connection and try again.";
      setPasswordMode("error");
      setPasswordMessage(message);
      toast.error(message);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-muted/40 px-4">
        <div
          role="alert"
          className="flex max-w-md items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      </div>
    );
  }

  const shellUser = user
    ? {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role as "STUDENT" | "ADMIN" | "SUPERADMIN",
        studentIdNo: user.studentIdNo,
        section: user.section,
      }
    : null;

  return (
    <AppShell
      user={shellUser ?? { id: "", fullName: "Loading...", email: "", role: "STUDENT" }}
      title="Account settings"
      subtitle="View your details, update contact information and change your password"
    >
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* Profile details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="size-4 text-primary" aria-hidden="true" />
              Profile Details
            </CardTitle>
            <CardDescription>
              {isStudent
                ? "Update your name, phone number and class details. Email and student ID are managed by your coordinator."
                : "Update your name and phone number. Your email address is managed by the system administrator."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {detailsMode === "success" && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-success-surface/40 bg-success-surface/10 px-3.5 py-3 text-sm text-success"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{detailsMessage}</span>
              </div>
            )}
            {detailsMode === "error" && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{detailsMessage}</span>
              </div>
            )}

            <form onSubmit={handleDetailsSubmit} className="space-y-4" noValidate>
              <FloatingInput
                id="fullName"
                label="Full name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input id="email" className="h-11 bg-muted/60" value={user?.email ?? ""} readOnly disabled />
                </div>
                <FloatingInput
                  id="phone"
                  label="Phone number"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              {isStudent && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="studentIdNo">Student ID number</Label>
                      <Input
                        id="studentIdNo"
                        className="h-11 bg-muted/60"
                        value={user?.studentIdNo ?? "—"}
                        readOnly
                        disabled
                      />
                    </div>
                    <FloatingInput
                      id="program"
                      label="Program"
                      required
                      value={program}
                      onChange={(e) => setProgram(e.target.value)}
                    />
                  </div>
                  <FloatingInput
                    id="section"
                    label="Section"
                    required
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                  />
                </>
              )}
              <Button type="submit" className="h-11 gap-2" disabled={detailsSubmitting || !user}>
                <Save className="size-4" aria-hidden="true" />
                <span>{detailsSubmitting ? "Saving..." : "Save changes"}</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" aria-hidden="true" />
              Change Password
            </CardTitle>
            <CardDescription>
              Your current password is required. The new password must be at least 8 characters and
              match the confirmation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {passwordMode === "success" && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-success-surface/40 bg-success-surface/10 px-3.5 py-3 text-sm text-success"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{passwordMessage}</span>
              </div>
            )}
            {passwordMode === "error" && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{passwordMessage}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
              <PasswordInput
                id="currentPassword"
                label="Current password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <PasswordInput
                id="newPassword"
                label="New password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <PasswordInput
                id="confirmPassword"
                label="Confirm new password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <Button type="submit" className="h-11 gap-2" disabled={passwordSubmitting || !user}>
                <KeyRound className="size-4" aria-hidden="true" />
                <span>{passwordSubmitting ? "Updating..." : "Change password"}</span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
