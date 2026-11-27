"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, ClipboardList, FileDown, FileText, Wrench } from "lucide-react";
import type { Role } from "@/lib/types";

import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RoomUnit = { id: string; unitCode: string; condition: string };
type Room = { id: string; name: string; building: string; units: RoomUnit[] };
type InspectionRow = {
  id: string;
  roomId: string;
  status: string;
  createdAt: string;
  summaryNote: string | null;
  room: { name: string; building: string };
  inspector: { fullName: string };
  items: { condition: string; remarks: string | null; photoKey: string | null }[];
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function withPhotoCount(rows: InspectionRow[]): number {
  return rows.filter((row) => row.items.some((i) => Boolean(i.photoKey))).length;
}

export default function InspectionsPage() {
  const [user, setUser] = React.useState<{ id: string; fullName: string; email: string; role: Role } | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [rows, setRows] = React.useState<InspectionRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [total, setTotal] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const canReview = user !== null && user.role !== "STUDENT";

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [meRes, roomsRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/inspections/rooms"),
      ]);
      if (!meRes.ok) {
        setError("Your session expired. Please sign in again.");
        return;
      }
      const me = (await meRes.json()) as { user: { id: string; fullName: string; email: string; role: Role } };
      if (roomsRes.ok) {
        const body = (await roomsRes.json()) as { rooms: Room[] };
        setRooms(body.rooms);
      } else {
        setError("Laboratory rooms could not be loaded. Please retry.");
      }
      setUser(me.user);
      try {
        const notifRes = await fetch("/api/notifications?page=1&pageSize=50");
        if (notifRes.ok) {
          const notifBody = (await notifRes.json()) as { unread: number };
          setUnread(notifBody.unread);
        }
      } catch {
        // Notification badge is best-effort in the local prototype.
      }
    } catch {
      setError("TechTracker could not reach the server. Check your connection and retry.");
    }
  }, []);

  const loadInspections = React.useCallback(
    async (targetPage: number, targetSize: number, status: string) => {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(targetSize) });
      if (status) params.set("status", status);
      const res = await fetch(`/api/inspections?${params.toString()}`);
      if (!res.ok) {
        toast.error("Could not load the inspection queue.");
        return;
      }
      const body = (await res.json()) as {
        data: InspectionRow[];
        page: number;
        pageSize: number;
        total: number;
      };
      setRows(body.data);
      setPage(body.page);
      setPageSize(body.pageSize);
      setTotal(body.total);
    },
    [],
  );

  React.useEffect(() => {
    const loadData = async () => {
      void load();
    };
    loadData();
  }, [load]);

  React.useEffect(() => {
    const loadData = async () => {
      void loadInspections(page, pageSize, statusFilter);
    };
    loadData();
  }, [loadInspections, page, pageSize, statusFilter]);

  const review = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/inspections/${id}/review`, { method: "POST" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Review could not be recorded.");
        return;
      }
      toast.success("Inspection marked as Reviewed.");
      await loadInspections(page, pageSize, statusFilter);
    } finally {
      setBusyId(null);
    }
  };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading lab inspections…</p>
      </main>
    );
  }

  return (
    <AppShell
      user={user}
      unreadNotifications={unread}
      title="Lab Unit Inspections"
      subtitle="Room-by-unit condition audits — Functioning, Needs Maintenance, Needs Repair"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <CircleAlert />
            <AlertTitle>Connection problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* 09W — Room selection, sorted A–Z by the API */}
        <section aria-labelledby="rooms-heading" className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="rooms-heading" className="text-base font-semibold">
              Laboratory rooms <span className="text-muted-foreground">(A–Z)</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {rooms.length} room{rooms.length === 1 ? "" : "s"} available to your account
            </p>
          </div>
          {rooms.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-xs">
              No laboratory rooms are assigned yet. Coordinate with the Pre-OJT office to get a room
              assignment.
            </p>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rooms.map((room) => {
                const functioning = room.units.filter((u) => u.condition === "FUNCTIONING").length;
                const maintenance = room.units.filter((u) => u.condition === "NEEDS_MAINTENANCE").length;
                const repair = room.units.filter((u) => u.condition === "NEEDS_REPAIR").length;
                return (
                  <li
                    key={room.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-xs [&_a]:max-w-full [&_a]:whitespace-normal"
                  >
                    <div>
                      <p className="font-semibold">{room.name}</p>
                      <p className="text-xs text-muted-foreground">{room.building}</p>
                    </div>
                    <p className="text-xs tabular-ledger text-muted-foreground">
                      {room.units.length} workstation unit{room.units.length === 1 ? "" : "s"}
                    </p>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <span className="rounded-full border border-success-surface/35 bg-success-surface/12 px-2 py-0.5 text-success">
                        {functioning} functioning
                      </span>
                      <span
                        className={
                          maintenance === 0
                            ? "rounded-full border border-border px-2 py-0.5 text-muted-foreground"
                            : "rounded-full border border-warning-surface/40 bg-warning-surface/12 px-2 py-0.5 text-warning"
                        }
                      >
                        {maintenance} maintenance
                      </span>
                      <span
                        className={
                          repair === 0
                            ? "rounded-full border border-border px-2 py-0.5 text-muted-foreground"
                            : "rounded-full border border-destructive/45 bg-destructive/12 px-2 py-0.5 text-destructive"
                        }
                      >
                        {repair} repair
                      </span>
                    </div>
                    <div className="flex justify-end border-t border-border pt-3">
                      <Link href={`/inspections/${room.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        <Wrench className="size-4" />
                        Open unit checklist
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 09W — Recent inspection submissions */}
        <section aria-labelledby="recent-heading" className="rounded-xl border border-border bg-card p-5 shadow-xs lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 [&>label]:min-w-0 [&>label]:max-w-full [&_select]:min-w-0 [&_select]:max-w-full">
            <h2 id="recent-heading" className="text-base font-semibold">
              Recent inspections
            </h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Status
              <Select
                items={[
                  { value: "ALL", label: "All statuses" },
                  { value: "SUBMITTED", label: "Submitted" },
                  { value: "REVIEWED", label: "Reviewed" },
                ]}
                value={statusFilter || "ALL"}
                onValueChange={(value) => {
                  setPage(1);
                  setStatusFilter(value === "ALL" ? "" : (value ?? ""));
                }}
              >
                <SelectTrigger size="sm" className="w-32" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="SUBMITTED">Submitted</SelectItem>
                  <SelectItem value="REVIEWED">Reviewed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <ClipboardList className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">No inspections recorded yet</p>
              <p className="text-sm text-muted-foreground">
                Open a room checklist above to submit the first audit.
              </p>
            </div>
          ) : (
            <div className="mt-4 min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>Inspector</TableHead>
                    <TableHead>Units flagged</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const flagged = row.items.filter((i) => i.condition !== "FUNCTIONING").length;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.room.name}</TableCell>
                        <TableCell>{row.inspector.fullName}</TableCell>
                        <TableCell>
                          <span className="tabular-ledger">{flagged}</span>
                          <span className="text-muted-foreground"> of </span>
                          <span className="tabular-ledger">{row.items.length}</span>
                        </TableCell>
                        <TableCell className="tabular-ledger">{formatDateTime(row.createdAt)}</TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <a href={`/api/inspections/${row.id}/export?format=csv`} download className={buttonVariants({ variant: "outline", size: "sm" })}>
                              <FileDown className="size-4" />
                              CSV
                            </a>
                            <a href={`/api/inspections/${row.id}/export?format=pdf`} download className={buttonVariants({ variant: "outline", size: "sm" })}>
                              <FileText className="size-4" />
                              PDF
                            </a>
                            {canReview && row.status === "SUBMITTED" && (
                              <Button
                                type="button"
                                size="sm"
                                disabled={busyId === row.id}
                                onClick={() => void review(row.id)}
                              >
                                <CheckCircle2 className="size-4" />
                                {busyId === row.id ? "Marking…" : "Admin Review"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="mt-3 min-w-0 max-w-full [&_div]:flex-wrap [&_button]:max-w-full [&_button]:whitespace-normal">
                <DataTablePagination
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPage(1);
                    setPageSize(size);
                  }}
                />
              </div>
            </div>
          )}
          {rows.length > 0 && withPhotoCount(rows) > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {withPhotoCount(rows)} submission{withPhotoCount(rows) === 1 ? "" : "s"} on this page include photo evidence.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
