"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, BellRing, CheckCheck, CheckCircle2, CircleAlert, MailOpen } from "lucide-react";
import type { Role } from "@/lib/types";

import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const [unread, setUnread] = React.useState(0);
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
    async (targetPage: number, targetSize: number, unreadOnlyFilter: boolean) => {
      const res = await fetch(
        `/api/notifications?page=${targetPage}&pageSize=${targetSize}${unreadOnlyFilter ? "&unreadOnly=true" : ""}`,
      );
      if (!res.ok) {
        toast.error("Notifications could not be loaded.");
        return;
      }
      const body = (await res.json()) as {
        data: Notification[];
        page: number;
        pageSize: number;
        total: number;
        unread: number;
      };
      setRows(body.data);
      setPage(body.page);
      setPageSize(body.pageSize);
      setTotal(body.total);
      setUnread(body.unread);
    },
    [],
  );

  React.useEffect(() => {
    const loadData = async () => {
      void load();
    };
    loadData();
  }, [load]);

  React.useEffect(() => {
    const loadData = async () => {
      void loadNotifications(page, pageSize, unreadOnly);
    };
    loadData();
  }, [loadNotifications, page, pageSize, unreadOnly]);

  const markRead = async (ids: string[], all = false) => {
    if (!all && ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { ids }),
      });
      const body = (await res.json()) as { error?: string; markedRead?: number };
      if (!res.ok) {
        toast.error(body.error ?? "Notifications could not be marked as read.");
        return;
      }
      toast.success(
        body.markedRead === 1 ? "Notification marked as read." : `${body.markedRead ?? 0} notifications marked as read.`,
      );
      await loadNotifications(page, pageSize, unreadOnly);
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
  const visible = rows;

  return (
    <AppShell
      user={user}
      unreadNotifications={unread}
      title="Notifications & System Alerts"
      subtitle="Assignment, attendance, inspection, and escalation notices"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <CircleAlert />
            <AlertTitle>Connection problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5 shadow-xs [&_button]:max-w-full [&_button]:whitespace-normal">
          <div className="flex items-center gap-3">
            <BellRing className="size-5 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">
                <span className="tabular-ledger">{unread}</span> unread ·{" "}
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
              onClick={() => { setPage(1); setUnreadOnly((v) => !v); }}
            >
              <Bell className="size-4" />
              {unreadOnly ? "Showing unread only" : "Show unread only"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || unread === 0}
              onClick={() => void markRead([], true)}
            >
              <CheckCheck className="size-4" />
              Mark all as read
            </Button>
          </div>
        </section>

        <section aria-label="Notification inbox" className="grid gap-3">
          {visible.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-xs">
              {unreadOnly
                ? "No unread notifications — you are all caught up."
                : "No notifications yet. Activity notices will appear here as your duty records are processed."}
            </p>
          ) : (
            visible.map((notification) => (
              <article
                key={notification.id}
                className={`grid grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border bg-card p-5 shadow-xs [&_a]:max-w-full [&_a]:whitespace-normal [&_button]:max-w-full [&_button]:whitespace-normal ${
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
                    <Link
                      href={notification.link}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      onClick={() => {
                        if (!notification.isRead) void markRead([notification.id]);
                      }}
                    >
                      Open linked record
                    </Link>
                  )}
                  {!notification.isRead && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void markRead([notification.id])}
                    >
                      <MailOpen className="size-4" />
                      Mark as read
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>

        <section className="min-w-0 max-w-full rounded-xl border border-border bg-card p-4 shadow-xs [&_div]:flex-wrap [&_button]:max-w-full [&_button]:whitespace-normal">
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

        <Alert className="border-success-surface/40 bg-success-surface/10 text-success">
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
