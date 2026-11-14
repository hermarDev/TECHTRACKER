"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, BellRing, CheckCheck, CheckCircle2, CircleAlert, MailOpen } from "lucide-react";
import type { Role } from "@prisma/client";

import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  ASSIGNMENT: "Assignment",
  TASK_REVIEW: "Task Review",
  ATTENDANCE: "Attendance",
  INSPECTION: "Inspection",
  MESSAGE: "Message",
  ESCALATION: "Escalation",
  SYSTEM_ALERT: "System Alert",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function NotificationsPage() {
  const [user, setUser] = React.useState<{ id: string; fullName: string; email: string; role: Role } | null>(null);
  const [rows, setRows] = React.useState<Notification[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [total, setTotal] = React.useState(0);
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) {
        setError("Your session expired. Please sign in again.");
        return;
      }
      const meBody = (await meRes.json()) as { user: { id: string; fullName: string; email: string; role: Role } };
      setUser(meBody.user);
    } catch {
      setError("TechTracker could not reach the server. Check your connection and retry.");
    }
  }, []);

  const loadNotifications = React.useCallback(
    async (targetPage: number, targetSize: number) => {
      const res = await fetch(`/api/notifications?page=${targetPage}&pageSize=${targetSize}`);
      if (!res.ok) {
        toast.error("Notifications could not be loaded.");
        return;
      }
      const body = (await res.json()) as {
        data: Notification[];
        page: number;
        pageSize: number;
        total: number;
      };
      setRows(body.data);
      setPage(body.page);
      setPageSize(body.pageSize);
      setTotal(body.total);
    },
    [],
  );

  React.useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      void load();
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [load]);

  React.useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      void loadNotifications(page, pageSize);
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [loadNotifications, page, pageSize]);

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const body = (await res.json()) as { error?: string; markedRead?: number };
      if (!res.ok) {
        toast.error(body.error ?? "Notifications could not be marked as read.");
        return;
      }
      toast.success(
        body.markedRead === 1 ? "Notification marked as read." : `${body.markedRead} notifications marked as read.`,
      );
      await loadNotifications(page, pageSize);
    } catch {
      toast.error("Notifications could not be marked as read. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading notifications…</p>
      </main>
    );
  }

  // The alerts API returns the newest entries per page; the unread filter is applied
  // within the current page because the endpoint does not expose an isRead parameter yet.
  const visible = unreadOnly ? rows.filter((n) => !n.isRead) : rows;
  const unreadOnPage = rows.filter((n) => !n.isRead).length;
  const unreadIds = rows.filter((n) => !n.isRead).map((n) => n.id);

  return (
    <AppShell
      user={user}
      unreadNotifications={unreadOnPage}
      title="Notifications & System Alerts"
      subtitle="Assignment, attendance, inspection, and escalation notices"
    >
      <div className="grid gap-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <CircleAlert />
            <AlertTitle>Connection problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <BellRing className="size-5 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">
                <span className="tabular-ledger">{unreadOnPage}</span> unread on this page ·{" "}
                <span className="tabular-ledger">{total}</span> total notices
              </p>
              <p className="text-xs text-muted-foreground">Newest first — open a notice to follow its deep link.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={unreadOnly ? "default" : "outline"}
              size="sm"
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly((v) => !v)}
            >
              <Bell className="size-3.5" />
              {unreadOnly ? "Showing unread only" : "Show unread only"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || unreadIds.length === 0}
              onClick={() => void markRead(unreadIds)}
            >
              <CheckCheck className="size-3.5" />
              Mark all on page as read
            </Button>
          </div>
        </section>

        <section aria-label="Notification inbox" className="grid gap-3">
          {visible.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              {unreadOnly
                ? "No unread notifications on this page — you are all caught up."
                : "No notifications yet. Activity notices will appear here as your duty records are processed."}
            </p>
          ) : (
            visible.map((notification) => (
              <article
                key={notification.id}
                className={`grid gap-2 rounded-xl border bg-card p-4 ${
                  notification.isRead ? "border-border" : "border-primary/30 bg-primary/[0.04]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {!notification.isRead && (
                    <span aria-label="Unread" className="size-2 shrink-0 rounded-full bg-primary" />
                  )}
                  <StatusBadge status={notification.type} label={TYPE_LABELS[notification.type] ?? notification.type} />
                  <span className="text-xs tabular-ledger text-muted-foreground">
                    {formatDateTime(notification.createdAt)}
                  </span>
                </div>
                <p className={`text-sm ${notification.isRead ? "font-medium" : "font-semibold"}`}>
                  {notification.title}
                </p>
                <p className="text-sm text-muted-foreground">{notification.body}</p>
                <div className="flex flex-wrap gap-2">
                  {notification.link && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      render={<Link href={notification.link} />}
                      onClick={() => {
                        if (!notification.isRead) void markRead([notification.id]);
                      }}
                    >
                      Open linked record
                    </Button>
                  )}
                  {!notification.isRead && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void markRead([notification.id])}
                    >
                      <MailOpen className="size-3.5" />
                      Mark as read
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPage(1);
              setPageSize(size);
            }}
          />
        </section>

        <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 />
          <AlertTitle>Delivery note</AlertTitle>
          <AlertDescription>
            Escalation rulings and attendance decisions also notify you here. Messages between students and
            coordinators stay inside the Messages screen.
          </AlertDescription>
        </Alert>
      </div>
    </AppShell>
  );
}
