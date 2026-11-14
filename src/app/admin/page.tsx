"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpenCheck,
  CalendarClock,
  CircleAlert,
  ClipboardCheck,
  Clock,
  FileBarChart2,
  GraduationCap,
  Laptop,
  Layers,
  MessageSquare,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { Role } from "@prisma/client";

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

const QUICK_LINKS = [
  { href: "/admin/attendance", label: "Attendance review", description: "Approve, correct, or escalate photo duty logs", icon: CalendarClock },
  { href: "/admin/tasks", label: "Task review", description: "Assign technical tasks and grade submissions", icon: ClipboardCheck },
  { href: "/inspections", label: "Lab audit", description: "Room-by-unit condition inspections", icon: Laptop },
  { href: "/admin/batches", label: "Batches & schedules", description: "Create and manage duty batches", icon: Layers },
  { href: "/admin/students", label: "Student directory", description: "Verify accounts and import rosters", icon: Users },
  { href: "/admin/reports", label: "Operational reports", description: "CSV/PDF exports for accreditation", icon: FileBarChart2 },
  { href: "/messages", label: "Messages", description: "Individual and batch coordination", icon: MessageSquare },
  { href: "/notifications", label: "Notifications", description: "System alerts and activity notices", icon: BookOpenCheck },
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
        try {
          const notifRes = await fetch("/api/notifications?page=1&pageSize=50");
          if (!cancelled && notifRes.ok) {
            const notifBody = (await notifRes.json()) as { data: { isRead: boolean }[] };
            setUnread(notifBody.data.filter((n) => !n.isRead).length);
          }
        } catch {
          // Notification badge is best-effort in the local prototype.
        }

        const [studentsTotal, studentsPending, batchesTotal, attendancePending, attendanceEscalated, tasksTotal, assignmentsTotal, inspectionsTotal, inspectionsPendingReview, roomsRes] =
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
              (res) =>
                res.ok
                  ? (res.json() as Promise<{ rooms: { id: string; name: string; building: string; units: { id: string; unitCode: string; condition: string }[] }[] }>)
                  : null,
              () => null,
            ),
          ]);

        const hours = await sumDutyHours();

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
        metrics.inspectionsPendingReview === null
          ? "All submissions"
          : `${metrics.inspectionsPendingReview} awaiting coordinator review`,
      icon: Laptop,
    },
    {
      label: "Defect rooms",
      value: metrics.defectRooms === null ? "—" : String(metrics.defectRooms),
      sub:
        metrics.flaggedUnits === null
          ? "Rooms with flagged units"
          : `${metrics.flaggedUnits} unit${metrics.flaggedUnits === 1 ? "" : "s"} flagged`,
      icon: ShieldAlert,
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

        <section aria-label="Summary metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="grid gap-1 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                  {card.label}
                </div>
                <p className="text-2xl font-semibold tabular-ledger">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </article>
            );
          })}
        </section>

        <section aria-labelledby="quick-links-heading" className="grid gap-3">
          <h2 id="quick-links-heading" className="text-base font-semibold">
            Quick navigation
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {QUICK_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-20 flex-col justify-center gap-1 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                      {item.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
          <CircleAlert aria-hidden="true" />
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
