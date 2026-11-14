"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";

type User = { id: string; fullName: string; email: string; role: "ADMIN" | "SUPERADMIN" };
type Task = { id: string; title: string; deadline: string; assignments: Array<{ status: string; student: { fullName: string } }> };
export default function AdminTasksPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  React.useEffect(() => { void Promise.all([fetch("/api/auth/me"), fetch("/api/tasks?page=1&pageSize=15")]).then(async ([me, result]) => { if (me.ok) setUser((await me.json()).user); if (result.ok) setTasks((await result.json()).items); }); }, []);
  if (!user) return <main className="p-8">Loading task reports...</main>;
  return <AppShell user={user} title="Task Assignment & Review" subtitle="Assign technical work and review completion reports."><div className="grid gap-4">{tasks.map((task) => <Link href={`/admin/tasks/${task.id}`} key={task.id} className="rounded-xl border border-border bg-card p-5 hover:bg-muted"><div className="flex justify-between gap-3"><h2 className="font-semibold">{task.title}</h2><StatusBadge status={task.assignments[0]?.status ?? "ASSIGNED"} /></div><p className="mt-2 text-sm text-muted-foreground">{task.assignments.length} assigned student(s) · Due {new Date(task.deadline).toLocaleDateString()}</p></Link>)}</div></AppShell>;
}
