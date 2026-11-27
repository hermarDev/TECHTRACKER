"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  CircleAlert,
  ClipboardCheck,
  Clock,
  Info,
  FileBarChart2,
  GraduationCap,
  Laptop,
  Layers,
} from "lucide-react";
import type { Role } from "@/lib/types";

import { AppShell } from "@/components/shell/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Metrics = {
  studentsTotal: number | null;
  studentsPending: number | null;
  batchesTotal: number | null;
  attendancePending: number | null;
  attendanceEscalated: number | null;
  tasksTotal: number | null;
  assignmentsTotal: number | null;
  inspectionsTotal: number | null;
  inspectionsPendingReview: number | null;
  defectRooms: number | null;
  flaggedUnits: number | null;
  dutyHours: number | null;
  dutyHoursTruncated: boolean;
};

const INITIAL_METRICS: Metrics = {
  studentsTotal: null,
  studentsPending: null,
  batchesTotal: null,
  attendancePending: null,
  attendanceEscalated: null,
  tasksTotal: null,
  assignmentsTotal: null,
  inspectionsTotal: null,
  inspectionsPendingReview: null,
  defectRooms: null,
  flaggedUnits: null,
  dutyHours: null,
  dutyHoursTruncated: false,
};

const QUICK_ACTIONS = [
  { href: "/admin/attendance", label: "Attendance review", description: "Approve, correct, or escalate photo duty logs", icon: CalendarClock },
  { href: "/admin/tasks", label: "Task review", description: "Assign technical tasks and grade submissions", icon: ClipboardCheck },
  { href: "/inspections", label: "Lab audit", description: "Room-by-unit condition inspections", icon: Laptop },
  { href: "/admin/reports", label: "Operational reports", description: "CSV/PDF exports for accreditation", icon: FileBarChart2 },
];

async function countOf(url: string): Promise<number | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { total?: number };
    return typeof body.total === "number" ? body.total : null;
  } catch {
    return null;
  }
}

async function sumDutyHours(): Promise<{ sum: number; truncated: boolean } | null> {
  try {
    let sum = 0;
    let fetched = 0;
    let page = 1;
    let truncated = false;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`/api/admin/reports?type=duty-hours&page=${page}&pageSize=50`);
      if (!res.ok) return null;
      const body = (await res.json()) as {
        data: { value: string }[];
        total: number;
      };
      for (const row of body.data) {
        const hours = Number(row.value);
        if (Number.isFinite(hours)) sum += hours;
      }
      fetched += body.data.length;
      if (fetched >= body.total || body.data.length === 0) break;
      page += 1;
      if (i === 4) truncated = true;
    }
    return { sum, truncated };
  } catch {
    return null;
  }
}

export default function AdminDashboardPage() {
  const [user, setUser] = React.useState<{ id: string; fullName: string; email: string; role: Role } | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [metrics, setMetrics] = React.useState<Metrics>(INITIAL_METRICS);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(null);
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) {
          setError("Your session expired. Please sign in again.");
          return;
        }
        const meBody = (await meRes.json()) as { user: { id: string; fullName: string; email: string; role: Role } };
        if (cancelled) return;
        setUser(meBody.user);
        if (meBody.user.role === "STUDENT") return;
        const [studentsTotal, studentsPending, batchesTotal, attendancePending, attendanceEscalated, tasksTotal, assignmentsTotal, inspectionsTotal, inspectionsPendingReview, roomsRes, hours, notifications] =
          await Promise.all([
            countOf("/api/admin/students?page=1&pageSize=1"),
            countOf("/api/admin/students?page=1&pageSize=1&status=PENDING_VERIFICATION"),
            countOf("/api/admin/batches?page=1&pageSize=1"),
            countOf("/api/attendance?page=1&pageSize=1&status=PENDING"),
            countOf("/api/attendance?page=1&pageSize=1&status=ESCALATED"),
            countOf("/api/tasks?page=1&pageSize=1"),
            countOf("/api/admin/reports?type=task-progress&page=1&pageSize=1"),
            countOf("/api/inspections?page=1&pageSize=1"),
            countOf("/api/inspections?page=1&pageSize=1&status=SUBMITTED"),
            fetch("/api/inspections/rooms").then(
              (res) => res.ok ? (res.json() as Promise<{ rooms: { id: string; name: string; building: string; units: { id: string; unitCode: string; condition: string }[] }[] }>) : null,
              () => null,
            ),
            sumDutyHours(),
            fetch("/api/notifications?page=1&pageSize=50").then(
              (res) => res.ok ? (res.json() as Promise<{ unread?: number; data: { isRead: boolean }[] }>) : null,
              () => null,
            ),
          ]);
        if (!cancelled && notifications) setUnread(notifications.unread ?? notifications.data.filter((n) => !n.isRead).length);

        if (cancelled) return;
        let defectRooms: number | null = null;
        let flaggedUnits: number | null = null;
        if (roomsRes) {
          const roomsWithDefects = roomsRes.rooms.filter((room) =>
            room.units.some((unit) => unit.condition === "NEEDS_MAINTENANCE" || unit.condition === "NEEDS_REPAIR"),
          );
          defectRooms = roomsWithDefects.length;
          flaggedUnits = roomsRes.rooms.reduce(
            (acc, room) =>
              acc + room.units.filter((unit) => unit.condition !== "FUNCTIONING").length,
            0,
          );
        }
        setMetrics({
          studentsTotal,
          studentsPending,
          batchesTotal,
          attendancePending,
          attendanceEscalated,
          tasksTotal,
          assignmentsTotal,
          inspectionsTotal,
          inspectionsPendingReview,
          defectRooms,
          flaggedUnits,
          dutyHours: hours?.sum ?? null,
          dutyHoursTruncated: hours?.truncated ?? false,
        });
      } catch {
        if (!cancelled) setError("TechTracker could not reach the server. Check your connection and retry.");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading coordinator dashboard…</p>
      </main>
    );
  }

  if (user.role === "STUDENT") {
    return (
      <AppShell user={user} unreadNotifications={unread} title="Pre-OJT Coordinator Dashboard">
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CircleAlert />
          <AlertTitle>Coordinator area</AlertTitle>
          <AlertDescription>
            This dashboard is for Pre-OJT coordinators. Your student home is at /student.
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  const cards = [
    {
      label: "Duty hours recorded",
      value: metrics.dutyHours === null ? "—" : `${metrics.dutyHoursTruncated ? "≥ " : ""}${metrics.dutyHours.toFixed(2)} h`,
      sub: metrics.assignmentsTotal === null ? "All attendance logs" : "Across logged attendance",
      icon: Clock,
    },
    {
      label: "Attendance to review",
      value: metrics.attendancePending === null ? "—" : String(metrics.attendancePending),
      sub:
        metrics.attendanceEscalated === null
          ? "Pending photo logs"
          : `${metrics.attendanceEscalated} escalated to SuperAdmin`,
      icon: CalendarClock,
    },
    {
      label: "Active tasks",
      value: metrics.tasksTotal === null ? "—" : String(metrics.tasksTotal),
      sub:
        metrics.assignmentsTotal === null
          ? "Assigned by you"
          : `${metrics.assignmentsTotal} student assignment${metrics.assignmentsTotal === 1 ? "" : "s"}`,
      icon: ClipboardCheck,
    },
    {
      label: "Lab inspections",
      value: metrics.inspectionsTotal === null ? "—" : String(metrics.inspectionsTotal),
      sub:
        metrics.defectRooms !== null && metrics.flaggedUnits !== null
          ? `${metrics.defectRooms} defect room${metrics.defectRooms === 1 ? "" : "s"} · ${metrics.flaggedUnits} unit${metrics.flaggedUnits === 1 ? "" : "s"} flagged`
          : "All submissions",
      icon: Laptop,
    },
    {
      label: "Students",
      value: metrics.studentsTotal === null ? "—" : String(metrics.studentsTotal),
      sub:
        metrics.studentsPending === null
          ? "In your batches"
          : `${metrics.studentsPending} pending verification`,
      icon: GraduationCap,
    },
    {
      label: "Duty batches",
      value: metrics.batchesTotal === null ? "—" : String(metrics.batchesTotal),
      sub: "Coordinated by you",
      icon: Layers,
    },
  ];

  return (
    <AppShell
      user={user}
      unreadNotifications={unread}
      title="Pre-OJT Coordinator Dashboard"
      subtitle="100-hour duty accounting and laboratory condition oversight"
    >
      <div className="grid gap-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <CircleAlert />
            <AlertTitle>Connection problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section aria-label="Summary metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="grid gap-1.5 rounded-xl border border-border bg-card p-5 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  {card.label}
                </div>
                <p className="font-mono text-3xl font-bold tracking-tight tabular-ledger">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </article>
            );
          })}
        </section>

        <section aria-label="Overview actions" className="grid gap-5 lg:grid-cols-2">
          <div className="grid gap-3 rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold">Needs attention</h2>
            <ul className="grid gap-2.5">
              <li>
                <Link
                  href="/admin/attendance"
                  className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5 text-sm transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-primary" aria-hidden="true" />
                    Attendance reviews pending
                  </span>
                  <span className="flex items-center gap-2 font-mono font-semibold tabular-ledger">
                    {metrics.attendancePending ?? "—"}
                    <span aria-hidden="true">→</span>
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/students"
                  className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5 text-sm transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    <GraduationCap className="size-4 text-primary" aria-hidden="true" />
                    Student verifications pending
                  </span>
                  <span className="flex items-center gap-2 font-mono font-semibold tabular-ledger">
                    {metrics.studentsPending ?? "—"}
                    <span aria-hidden="true">→</span>
                  </span>
                </Link>
              </li>
            </ul>
          </div>
          <div className="grid gap-3 rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold">Quick actions</h2>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {QUICK_ACTIONS.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex min-h-12 items-center gap-2.5 rounded-lg border border-border px-3.5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <Alert className="border-border bg-muted/50 text-muted-foreground">
          <Info aria-hidden="true" />
          <AlertTitle>Metrics scope</AlertTitle>
          <AlertDescription>
            Figures cover the batches you coordinate. Duty hours aggregate logged attendance on this device
            session; the exact total is available in Operational Reports with CSV/PDF export.
          </AlertDescription>
        </Alert>
      </div>
    </AppShell>
  );
}
