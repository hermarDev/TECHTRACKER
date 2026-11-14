"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { useDraftForm } from "@/hooks/useDraftForm";

type User = { id: string; fullName: string; email: string; role: "STUDENT" };
type Task = { id: string; title: string; deadline: string; assignments: Array<{ status: string }> };
export default function TasksPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const draft = useDraftForm("techtracker-task-search", { search: "" });
  React.useEffect(() => { void Promise.all([fetch("/api/auth/me"), fetch("/api/tasks?page=1&pageSize=15")]).then(async ([me, result]) => { if (me.ok) setUser((await me.json()).user); if (result.ok) setTasks((await result.json()).items); }); }, []);
  if (!user) return <main className="p-8">Loading tasks...</main>;
  return <AppShell user={user} title="Technical Tasks" subtitle="Start, document, and resubmit assigned work."><section className="grid gap-4">{tasks.map((task) => <Link href={`/tasks/${task.id}`} key={task.id} className="rounded-xl border border-border bg-card p-5 hover:bg-muted"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{task.title}</h2><StatusBadge status={task.assignments[0]?.status ?? "ASSIGNED"} /></div><p className="mt-2 text-sm text-muted-foreground">Due {new Date(task.deadline).toLocaleDateString()}</p></Link>)}{draft.isDirty && <p className="text-xs text-muted-foreground">Draft preserved locally.</p>}</section></AppShell>;
}
