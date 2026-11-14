"use client";

import * as React from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";

type User = { id: string; fullName: string; email: string; role: "ADMIN" | "SUPERADMIN" };
type Item = { id: string; status: string; isIrregular: boolean; recordedHours: number; student: { fullName: string; studentIdNo: string | null } };

export default function AdminAttendancePage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [items, setItems] = React.useState<Item[]>([]);
  const [remarks, setRemarks] = React.useState<Record<string, string>>({});
  const [page, setPage] = React.useState(1);
  const load = React.useCallback(async () => { const me = await fetch("/api/auth/me"); const records = await fetch("/api/attendance?page=1&pageSize=15"); if (me.ok) setUser((await me.json()).user); if (records.ok) setItems((await records.json()).items); }, []);
  React.useEffect(() => { void load(); }, [load]);
  const review = async (id: string, status: "APPROVED" | "REJECTED") => { const response = await fetch(`/api/attendance/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, remarks: remarks[id] ?? "" }) }); if (response.ok) void load(); };
  if (!user) return <main className="p-8">Loading review queue...</main>;
  return <AppShell user={user} title="Attendance Review Queue" subtitle="Review, correct, and escalate duty evidence."><section className="rounded-xl border border-border bg-card p-5"><div className="divide-y">{items.map((item) => <article key={item.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]"><div><p className="font-medium">{item.student.fullName} <span className="tabular-ledger text-muted-foreground">{item.student.studentIdNo}</span></p><p className="text-sm text-muted-foreground">{item.recordedHours.toFixed(2)} recorded hours</p><StatusBadge status={item.isIrregular ? "IRREGULAR" : item.status} /></div><div className="flex flex-wrap items-center gap-2"><input aria-label="Review remarks" className="h-10 rounded-md border bg-background px-3" placeholder="Remarks" value={remarks[item.id] ?? ""} onChange={(e) => setRemarks((old) => ({ ...old, [item.id]: e.target.value }))} /><button className="min-h-10 rounded-md bg-primary px-3 text-primary-foreground" onClick={() => void review(item.id, "APPROVED")}>Approve</button><button className="min-h-10 rounded-md border border-destructive/40 px-3 text-destructive" onClick={() => void review(item.id, "REJECTED")}>Reject</button><a className="min-h-10 rounded-md border px-3 py-2 text-sm" href={`/api/attendance/accreditation-pdf?studentId=${item.student.studentIdNo ?? ""}`}>Accreditation PDF</a></div></article>)}</div><DataTablePagination page={page} pageSize={15} total={items.length} onPageChange={setPage} onPageSizeChange={() => undefined} /></section></AppShell>;
}
