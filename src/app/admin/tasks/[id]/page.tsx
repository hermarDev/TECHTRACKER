"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";

type User = { id: string; fullName: string; email: string; role: "ADMIN" | "SUPERADMIN" };
type Assignment = { id: string; status: string; student: { fullName: string }; submissions: Array<{ summary: string; version: number }>; remarks: Array<{ body: string; visibility: string }> };
type Task = { title: string; assignments: Assignment[] };
export default function AdminTaskDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = React.useState<User | null>(null);
  const [task, setTask] = React.useState<Task | null>(null);
  const [remarks, setRemarks] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const load = React.useCallback(async () => { const [me, result] = await Promise.all([fetch("/api/auth/me"), fetch(`/api/tasks/${params.id}`)]); if (me.ok) setUser((await me.json()).user); if (result.ok) setTask((await result.json()).task); }, [params.id]);
  React.useEffect(() => { void load(); }, [load]);
  const review = async (assignmentId: string, status: "ACCEPTED" | "RETURNED") => { await fetch(`/api/tasks/${params.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignmentId, status, studentRemark: remarks[assignmentId] ?? "", internalNote: notes[assignmentId] ?? "" }) }); await load(); };
  if (!user || !task) return <main className="p-8">Loading task review...</main>;
  return <AppShell user={user} title={task.title} subtitle="Student-visible return remarks and private staff notes."><div className="space-y-4">{task.assignments.map((assignment) => <article key={assignment.id} className="rounded-xl border border-border bg-card p-5"><div className="flex justify-between"><h2 className="font-semibold">{assignment.student.fullName}</h2><StatusBadge status={assignment.status} /></div><p className="mt-3 whitespace-pre-wrap text-sm">{assignment.submissions.at(-1)?.summary ?? "No submission yet."}</p><div className="mt-4 grid gap-3 md:grid-cols-2"><input className="h-11 rounded-md border bg-background px-3" placeholder="Student-visible remarks (required on return)" value={remarks[assignment.id] ?? ""} onChange={(e) => setRemarks((old) => ({ ...old, [assignment.id]: e.target.value }))} /><input className="h-11 rounded-md border bg-background px-3" placeholder="Private internal note" value={notes[assignment.id] ?? ""} onChange={(e) => setNotes((old) => ({ ...old, [assignment.id]: e.target.value }))} /></div><div className="mt-3 flex gap-2"><button className="min-h-10 rounded-md bg-primary px-3 text-primary-foreground" onClick={() => void review(assignment.id, "ACCEPTED")}>Accept</button><button className="min-h-10 rounded-md border border-amber-500/50 px-3" onClick={() => void review(assignment.id, "RETURNED")}>Return</button></div></article>)}</div></AppShell>;
}
