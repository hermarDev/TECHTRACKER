"use client";

import * as React from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { useDraftForm } from "@/hooks/useDraftForm";

type User = { id: string; fullName: string; email: string; role: "STUDENT"; studentIdNo?: string | null; section?: string | null };
type Attendance = { id: string; status: string; timeIn: string; timeOut?: string | null; recordedHours: number; isIrregular: boolean };

export default function AttendancePage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [items, setItems] = React.useState<Attendance[]>([]);
  const [message, setMessage] = React.useState("");
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [page, setPage] = React.useState(1);
  const form = useDraftForm("techtracker-attendance-draft", { scheduleId: "", shiftDate: "" });
  const load = React.useCallback(async () => {
    const [me, attendance] = await Promise.all([fetch("/api/auth/me"), fetch("/api/attendance?page=1&pageSize=15")]);
    if (me.ok) setUser((await me.json()).user);
    if (attendance.ok) setItems((await attendance.json()).items);
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  const submit = async (action: "TIME_IN" | "TIME_OUT", attendanceId?: string) => {
    if (!photo) return setMessage("A photo is required.");
    const data = new FormData();
    data.set("action", action);
    data.set("photo", photo);
    if (action === "TIME_IN") { data.set("scheduleId", form.values.scheduleId); data.set("shiftDate", form.values.shiftDate); }
    if (attendanceId) data.set("attendanceId", attendanceId);
    const response = await fetch("/api/attendance", { method: "POST", body: data });
    const body = await response.json();
    setMessage(response.ok ? `Confirmed receipt: ${body.receipt.id}` : body.error);
    if (response.ok) { form.clearDraft(); setPhoto(null); await load(); }
  };
  if (!user) return <main className="p-8">Loading attendance...</main>;
  return <AppShell user={user} title="Attendance" subtitle="Photo-assisted duty log; no location tracking.">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Record duty</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use the camera or choose an image file. GPS is never requested.</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">Scheduled shift<select className="h-11 rounded-md border bg-background px-3" value={form.values.scheduleId} onChange={(e) => form.setValues({ scheduleId: e.target.value })}><option value="">Select a scheduled shift</option><option value="current">Current scheduled shift</option></select></label>
          <label className="grid gap-1 text-sm">Shift date<input type="date" className="h-11 rounded-md border bg-background px-3" value={form.values.shiftDate} onChange={(e) => form.setValues({ shiftDate: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Evidence photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
          <button className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground" onClick={() => void submit("TIME_IN")}>Confirm Time-In</button>
          {message && <p role="alert" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">{message}</p>}
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">My attendance</h2>
        <div className="mt-4 divide-y">{items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium tabular-ledger">{new Date(item.timeIn).toLocaleString()}</p><p className="text-sm text-muted-foreground">{item.recordedHours.toFixed(2)} hours</p></div><div className="flex items-center gap-2"><StatusBadge status={item.isIrregular ? "IRREGULAR" : item.status} />{!item.timeOut && <button className="min-h-9 rounded-md border px-3 text-sm" onClick={() => void submit("TIME_OUT", item.id)}>Time-Out</button>}</div></div>)}</div>
        <DataTablePagination page={page} pageSize={15} total={items.length} onPageChange={setPage} onPageSizeChange={() => undefined} />
      </section>
    </div>
  </AppShell>;
}
