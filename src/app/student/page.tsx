"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  ClipboardCheck,
  GraduationCap,
  Laptop,
  MessageSquare,
} from "lucide-react";
import type { Role, TaskAssignmentStatus } from "@prisma/client";
import { computeHoursProgress } from "@/lib/hours";
import { toast } from "sonner";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { Progress } from "@/components/ui/progress";


const QUICK_LINKS = [
  { href: "/attendance", label: "Time In / Time Out", icon: CalendarClock, description: "Photo-assisted attendance punch" },
  { href: "/tasks", label: "My Tasks", icon: ClipboardCheck, description: "Start, document and resubmit assigned tasks" },
  { href: "/inspections", label: "Lab Audit", icon: Laptop, description: "Room-by-unit condition checklist" },
  { href: "/messages", label: "Messages", icon: MessageSquare, description: "Coordinate with your Pre-OJT coordinator" },
] as const;

const OPEN_TASK_STATUSES: TaskAssignmentStatus[] = ["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "RETURNED"];

type User = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  studentIdNo?: string | null;
  section?: string | null;
  requiredHours?: number;
};

type AttendanceLog = {
  id: string;
  status: string;
  shiftDate: string;
  timeOut?: string | null;
  recordedHours: number;
  creditedHours: number;
};

type TaskAssignment = {
  id: string;
  status: string;
  task: { title: string; category: string; deadline: string };
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function formatDate(date: Date | string): string {
  return toDate(date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(date: Date | string): string {
  return toDate(date).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [attendanceLogs, setAttendanceLogs] = React.useState<AttendanceLog[]>([]);
  const [taskAssignments, setTaskAssignments] = React.useState<TaskAssignment[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const meRes = await fetch("/api/auth/me");
        if (meRes.status === 401) {
          router.replace("/login");
          return;
        }
        if (!meRes.ok) throw new Error("Auth failed");
        const meBody = (await meRes.json()) as { user: User };
        const [profileRes, attendanceRes, tasksRes, notifRes] = await Promise.all([
          fetch("/api/profile"),
          fetch("/api/attendance?page=1&pageSize=50"),
          fetch("/api/tasks?page=1&pageSize=50"),
          fetch("/api/notifications?page=1&pageSize=50"),
        ]);
        if (cancelled) return;

        let fullUser: User = meBody.user;
        if (profileRes.ok) {
          const profileBody = (await profileRes.json()) as { user: Partial<User> };
          fullUser = { ...fullUser, ...profileBody.user };
        }
        setUser(fullUser);

        // Fetch all attendance pages so progress is not truncated at 50 logs.
        const allAttendance: AttendanceLog[] = [];
        if (attendanceRes.ok) {
          const first = (await attendanceRes.json()) as { items?: AttendanceLog[]; total?: number; pageSize?: number };
          allAttendance.push(...(first.items ?? []));
          const total = first.total ?? allAttendance.length;
          const ps = first.pageSize ?? 50;
          let page = 2;
          while (allAttendance.length < total) {
            const r = await fetch(`/api/attendance?page=${page}&pageSize=${ps}`);
            if (r.status === 401) { router.replace("/login"); return; }
            if (!r.ok) break;
            const d = (await r.json()) as { items?: AttendanceLog[] };
            const batch = d.items ?? [];
            if (batch.length === 0) break;
            allAttendance.push(...batch);
            page += 1;
          }
        }
        setAttendanceLogs(allAttendance);

        // Fetch all task pages so assignments are not truncated.
        const allAssignments: TaskAssignment[] = [];
        if (tasksRes.ok) {
          const first = (await tasksRes.json()) as { items?: Array<{ id: string; title: string; category: string; deadline: string; assignments?: Array<{ id: string; status: string }> }>; total?: number; pageSize?: number };
          const collect = (items: Array<{ id: string; title: string; category: string; deadline: string; assignments?: Array<{ id: string; status: string }> }>) => {
            for (const task of items) {
              for (const a of task.assignments ?? []) {
                allAssignments.push({
                  id: a.id,
                  status: a.status,
                  task: { title: task.title, category: task.category, deadline: task.deadline },
                });
              }
            }
          };
          collect(first.items ?? []);
          const total = first.total ?? 0;
          const ps = first.pageSize ?? 50;
          let page = 2;
          let fetchedTasks = (first.items ?? []).length;
          while (fetchedTasks < total) {
            const r = await fetch(`/api/tasks?page=${page}&pageSize=${ps}`);
            if (r.status === 401) { router.replace("/login"); return; }
            if (!r.ok) break;
            const d = (await r.json()) as { items?: Array<{ id: string; title: string; category: string; deadline: string; assignments?: Array<{ id: string; status: string }> }> };
            const batch = d.items ?? [];
            if (batch.length === 0) break;
            collect(batch);
            fetchedTasks += batch.length;
            page += 1;
          }
        }
        setTaskAssignments(allAssignments);

        if (notifRes.ok) {
          const data = (await notifRes.json()) as { unread?: number; data?: Array<{ isRead: boolean }>; items?: Array<{ isRead: boolean }> };
          if (typeof data.unread === "number") {
            setUnread(data.unread);
          } else {
            const rows = data.data ?? data.items ?? [];
            setUnread(rows.filter((n) => !n.isRead).length);
          }
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading student dashboard…</p>
      </main>
    );
  }

  const allAssignedTasksAccepted =
    taskAssignments.length > 0 && taskAssignments.every((a) => a.status === "ACCEPTED");
  const progress = computeHoursProgress({
    logs: attendanceLogs.map((l) => ({ status: l.status, recordedHours: l.recordedHours, creditedHours: l.creditedHours })),
    requiredHours: user.requiredHours ?? 100,
    allAssignedTasksAccepted,
  });

  const activeTasks = taskAssignments.filter((a) => OPEN_TASK_STATUSES.includes(a.status as TaskAssignmentStatus));
  const recentAttendance = attendanceLogs.slice(0, 5);

  return (
    <AppShell
      user={{ id: user.id, fullName: user.fullName, email: user.email, role: user.role, studentIdNo: user.studentIdNo, section: user.section }}
      unreadNotifications={unread}
      title="Student Dashboard"
      subtitle={`100-Hour Pre-OJT Ledger${user.section ? ` — ${user.section}` : ""}`}
    >
      <div className="grid gap-6">
        {/* 100-Hour Ledger: credited vs pending kept separate */}
        <section aria-label="100-hour ledger" className="grid gap-4 rounded-sm border border-border bg-card p-4 lg:p-5">
          <div className="flex items-center gap-2">
            <GraduationCap className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold">100-Hour Pre-OJT Ledger</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Coordinator-accredited hours are counted toward the requirement; pending punches are shown separately until reviewed.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-sm border border-success-surface/35 bg-success-surface/10 px-3.5 py-3">
              <p className="text-xs font-medium text-success">Credited (Approved)</p>
              <p className="mt-1 text-2xl font-semibold tabular-ledger text-success">
                {progress.creditedHours.toFixed(2)}
                <span className="ml-1 text-sm font-normal">hrs</span>
              </p>
            </div>
            <div className="rounded-sm border border-warning-surface/40 bg-warning-surface/10 px-3.5 py-3">
              <p className="text-xs font-medium text-warning">Pending Review</p>
              <p className="mt-1 text-2xl font-semibold tabular-ledger text-warning">
                {progress.pendingHours.toFixed(2)}
                <span className="ml-1 text-sm font-normal">hrs</span>
              </p>
            </div>
            <div className="rounded-sm border border-border bg-muted px-3.5 py-3">
              <p className="text-xs font-medium text-muted-foreground">Remaining</p>
              <p className="mt-1 text-2xl font-semibold tabular-ledger">
                {progress.remainingHours.toFixed(2)}
                <span className="ml-1 text-sm font-normal">hrs</span>
              </p>
            </div>
            <div className="rounded-sm border border-border bg-muted px-3.5 py-3">
              <p className="text-xs font-medium text-muted-foreground">Requirement</p>
              <p className="mt-1 text-2xl font-semibold tabular-ledger">
                {progress.requiredHours.toFixed(0)}
                <span className="ml-1 text-sm font-normal">hrs</span>
              </p>
            </div>
          </div>

          <div>
            <Progress value={progress.percentCredited} className="w-full" aria-label="Credited hours toward the 100-hour requirement" />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Credited toward {progress.requiredHours.toFixed(0)}-hour requirement</span>
              <span className="tabular-ledger font-medium">{progress.percentCredited.toFixed(1)}%</span>
            </div>
          </div>

          {progress.preOjtEligibleForCompletion ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-sm border border-success-surface/40 bg-success-surface/10 px-3.5 py-2.5 text-sm text-success"
            >
              <BookOpenCheck className="size-4 shrink-0" aria-hidden="true" />
              All requirements met — credited hours reached {progress.requiredHours.toFixed(0)} and every assigned task is accepted. Your coordinator will mark Pre-OJT completion.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Pre-OJT completion requires {progress.requiredHours.toFixed(0)} credited hours plus all assigned tasks accepted.
            </p>
          )}
        </section>

        <section aria-label="Overview actions" className="grid gap-4 lg:grid-cols-2">
          {/* Active tasks summary */}
          <div className="grid gap-3 rounded-sm border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
                Active Tasks
              </h2>
              <Link href="/tasks" className="-mr-2 inline-flex min-h-11 items-center px-2 text-xs font-medium text-primary underline-offset-4 hover:underline">
                View all
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">Assigned, in-progress, submitted or returned assignments.</p>
            {activeTasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No active task assignments yet. New assignments will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {activeTasks.slice(0, 5).map((assignment) => (
                  <li key={assignment.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{assignment.task.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {assignment.task.category} · Due {formatDate(assignment.task.deadline)}
                      </p>
                    </div>
                    <StatusBadge status={assignment.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent attendance */}
          <div className="grid gap-3 rounded-sm border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <CalendarClock className="size-4 text-primary" aria-hidden="true" />
                Recent Attendance
              </h2>
              <Link href="/attendance" className="-mr-2 inline-flex min-h-11 items-center px-2 text-xs font-medium text-primary underline-offset-4 hover:underline">
                View all
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">Latest duty shifts and their review status.</p>
            {recentAttendance.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No attendance records yet. Use Time In on your scheduled shift to start logging hours.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {recentAttendance.map((log) => (
                  <li key={log.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{formatDateTime(log.shiftDate)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-ledger">
                        {log.status === "APPROVED"
                          ? `${log.creditedHours.toFixed(2)} credited hrs`
                          : log.timeOut
                            ? `${log.recordedHours.toFixed(2)} recorded hrs`
                            : "Awaiting Time Out"}
                      </p>
                    </div>
                    <StatusBadge status={log.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Quick links */}
        <section aria-label="Quick links">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex min-h-24 flex-col justify-between rounded-sm border border-border bg-card px-4 py-3.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    {item.label}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="line-clamp-2">{item.description}</span>
                    <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>    </AppShell>
  );
}