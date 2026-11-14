"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { useDraftForm } from "@/hooks/useDraftForm";

type User = { id: string; fullName: string; email: string; role: "STUDENT" };
type Task = { title: string; instructions: string; assignments: Array<{ id: string; status: string; remarks: Array<{ body: string; visibility: string }> }> };
export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = React.useState<User | null>(null);
  const [task, setTask] = React.useState<Task | null>(null);
  const [message, setMessage] = React.useState("");
  const draft = useDraftForm("techtracker-task-detail-" + params.id, { summary: "" });
  const load = React.useCallback(async () => { const [me, result] = await Promise.all([fetch("/api/auth/me"), fetch(`/api/tasks/${params.id}`)]); if (me.ok) setUser((await me.json()).user); if (result.ok) setTask((await result.json()).task); }, [params.id]);
  React.useEffect(() => { void load(); }, [load]);
  const start = async () => { await fetch(`/api/tasks/${params.id}/start`, { method: "POST" }); await load(); };
  const submit = async () => { const body = new FormData(); body.set("summary", draft.values.summary); const response = await fetch(`/api/tasks/${params.id}/submit`, { method: "POST", body }); setMessage(response.ok ? "Completion report submitted." : (await response.json()).error); if (response.ok) { draft.clearDraft(); await load(); } };
  if (!user || !task) return <main className="p-8">Loading task...</main>;
  const assignment = task.assignments[0];
  return <AppShell user={user} title={task.title} subtitle="Completion report and student-visible remarks."><div className="max-w-3xl space-y-5"><section className="rounded-xl border border-border bg-card p-5"><StatusBadge status={assignment.status} /><p className="mt-4 whitespace-pre-wrap text-sm">{task.instructions}</p>{["ASSIGNED", "RETURNED"].includes(assignment.status) && <button className="mt-5 min-h-11 rounded-md bg-primary px-4 text-primary-foreground" onClick={() => void start()}>Start task</button>}</section><section className="rounded-xl border border-border bg-card p-5"><label className="grid gap-2 text-sm font-medium">Completion summary<textarea className="min-h-36 rounded-md border bg-background p-3" value={draft.values.summary} onChange={(e) => draft.setValues({ summary: e.target.value })} /></label><button className="mt-4 min-h-11 rounded-md bg-primary px-4 text-primary-foreground" onClick={() => void submit()}>Submit / Resubmit</button>{message && <p role="alert" className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">{message}</p>}</section><section className="rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">Remarks</h2>{assignment.remarks.map((remark, index) => <p key={index} className="mt-3 border-l-2 border-border pl-3 text-sm">{remark.body}</p>)}</section></div></AppShell>;
}
