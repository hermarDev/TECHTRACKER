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
import type { TaskAssignmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { computeHoursProgress } from "@/lib/hours";
import { requirePageUser } from "@/lib/auth-server-props";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";

const QUICK_LINKS = [
  { href: "/attendance", label: "Time In / Time Out", icon: CalendarClock, description: "Photo-assisted attendance punch" },
  { href: "/tasks", label: "My Tasks", icon: ClipboardCheck, description: "Start, document and resubmit assigned tasks" },
  { href: "/inspections", label: "Lab Audit", icon: Laptop, description: "Room-by-unit condition checklist" },
  { href: "/messages", label: "Messages", icon: MessageSquare, description: "Coordinate with your Pre-OJT coordinator" },
] as const;

const OPEN_TASK_STATUSES: TaskAssignmentStatus[] = ["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "RETURNED"];

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function StudentDashboardPage() {
  const { user, unreadNotifications } = await requirePageUser(["STUDENT"]);

  const [attendanceLogs, taskAssignments] = await Promise.all([
    db.attendanceLog.findMany({
      where: { studentId: user.id },
      orderBy: { shiftDate: "desc" },
      take: 50,
    }),
    db.taskAssignment.findMany({
      where: { studentId: user.id },
      include: { task: { select: { title: true, category: true, deadline: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const allAssignedTasksAccepted =
    taskAssignments.length > 0 && taskAssignments.every((a) => a.status === "ACCEPTED");
  const progress = computeHoursProgress({
    logs: attendanceLogs,
    requiredHours: user.requiredHours,
    allAssignedTasksAccepted,
  });

  const activeTasks = taskAssignments.filter((a) => OPEN_TASK_STATUSES.includes(a.status));
  const recentAttendance = attendanceLogs.slice(0, 5);

  return (
    <AppShell
      user={{ id: user.id, fullName: user.fullName, email: user.email, role: "STUDENT", studentIdNo: user.studentIdNo, section: user.section }}
      unreadNotifications={unreadNotifications}
      title="Student Dashboard"
      subtitle={`100-Hour Pre-OJT Ledger${user.section ? ` — ${user.section}` : ""}`}
    >
      <div className="space-y-5">
        {/* 100-Hour Ledger: credited vs pending kept separate */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="size-4 text-primary" aria-hidden="true" />
              100-Hour Pre-OJT Ledger
            </CardTitle>
            <CardDescription>
              Coordinator-accredited hours are counted toward the requirement; pending punches are
              shown separately until reviewed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-3">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Credited (Approved)</p>
                <p className="mt-1 text-2xl font-semibold tabular-ledger text-emerald-700 dark:text-emerald-300">
                  {progress.creditedHours.toFixed(2)}
                  <span className="ml-1 text-sm font-normal">hrs</span>
                </p>
              </div>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Pending Review</p>
                <p className="mt-1 text-2xl font-semibold tabular-ledger text-amber-800 dark:text-amber-300">
                  {progress.pendingHours.toFixed(2)}
                  <span className="ml-1 text-sm font-normal">hrs</span>
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted px-3.5 py-3">
                <p className="text-xs font-medium text-muted-foreground">Remaining</p>
                <p className="mt-1 text-2xl font-semibold tabular-ledger">
                  {progress.remainingHours.toFixed(2)}
                  <span className="ml-1 text-sm font-normal">hrs</span>
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted px-3.5 py-3">
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
                className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-300"
              >
                <BookOpenCheck className="size-4 shrink-0" aria-hidden="true" />
                All requirements met — credited hours reached {progress.requiredHours.toFixed(0)} and every assigned task is accepted. Your coordinator will mark Pre-OJT completion.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pre-OJT completion requires {progress.requiredHours.toFixed(0)} credited hours plus all assigned tasks accepted.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Active tasks summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
                  Active Tasks
                </span>
                <Link href="/tasks" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                  View all
                </Link>
              </CardTitle>
              <CardDescription>Assigned, in-progress, submitted or returned assignments.</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Recent attendance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-primary" aria-hidden="true" />
                  Recent Attendance
                </span>
                <Link href="/attendance" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                  View all
                </Link>
              </CardTitle>
              <CardDescription>Latest duty shifts and their review status.</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </div>

        {/* Quick links */}
        <section aria-label="Quick links">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex min-h-24 flex-col justify-between rounded-lg border border-border bg-card px-4 py-3.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
      </div>
    </AppShell>
  );
}
