"use client";

import * as React from "react";
import { toast } from "sonner";
import { CircleAlert, FileDown, FileText, Filter } from "lucide-react";
import type { Role } from "@prisma/client";

import { AppShell } from "@/components/shell/AppShell";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { useDraftForm } from "@/hooks/useDraftForm";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const REPORT_TYPES = [
  { value: "attendance", label: "Attendance logs" },
  { value: "duty-hours", label: "Duty hours" },
  { value: "task-progress", label: "Task progress" },
  { value: "lab-equipment", label: "Lab equipment condition" },
] as const;

type ReportRow = {
  batch: string;
  section: string;
  metric: string;
  value: string;
  label: string;
};

type AdminBatch = { id: string; name: string; section: string };

function buildQuery(
  filters: { type: string; batchId: string; section: string; dateFrom: string; dateTo: string },
  extra: Record<string, string>,
): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  // The lab-equipment dataset is room-based; batch/section/date filters do not apply to it.
  if (filters.type !== "lab-equipment") {
    if (filters.batchId) params.set("batchId", filters.batchId);
    if (filters.section.trim()) params.set("section", filters.section.trim());
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export default function AdminReportsPage() {
  const [user, setUser] = React.useState<{ id: string; fullName: string; email: string; role: Role } | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [batches, setBatches] = React.useState<AdminBatch[]>([]);
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [total, setTotal] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const filters = useDraftForm<{ type: string; batchId: string; section: string; dateFrom: string; dateTo: string }>(
    "techtracker-report-filters",
    { type: "attendance", batchId: "", section: "", dateFrom: "", dateTo: "" },
  );

  React.useEffect(() => {
    void (async () => {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) {
          setError("Your session expired. Please sign in again.");
          return;
        }
        const meBody = (await meRes.json()) as { user: { id: string; fullName: string; email: string; role: Role } };
        setUser(meBody.user);
        try {
          const notifRes = await fetch("/api/notifications?page=1&pageSize=50");
          if (notifRes.ok) {
            const notifBody = (await notifRes.json()) as { data: { isRead: boolean }[] };
            setUnread(notifBody.data.filter((n) => !n.isRead).length);
          }
        } catch {
          // Notification badge is best-effort in the local prototype.
        }
        const batchRes = await fetch("/api/admin/batches?page=1&pageSize=50");
        if (batchRes.ok) {
          const batchBody = (await batchRes.json()) as { data: AdminBatch[] };
          setBatches(batchBody.data);
        }
      } catch {
        setError("TechTracker could not reach the server. Check your connection and retry.");
      }
    })();
  }, []);

  const loadReport = React.useCallback(
    async (
      currentFilters: { type: string; batchId: string; section: string; dateFrom: string; dateTo: string },
      targetPage: number,
      targetSize: number,
    ) => {
      setError(null);
      const query = buildQuery(currentFilters, {
        page: String(targetPage),
        pageSize: String(targetSize),
      });
      const res = await fetch(`/api/admin/reports?${query}`);
      if (!res.ok) {
        toast.error("The report could not be generated.");
        return;
      }
      const body = (await res.json()) as {
        data: ReportRow[];
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

  const filtersRef = React.useRef(filters.values);

  React.useEffect(() => {
    filtersRef.current = filters.values;
  }, [filters.values]);

  React.useEffect(() => {
    // Pagination changes refetch with the latest saved filter selections.
    void loadReport(filtersRef.current, page, pageSize);
  }, [loadReport, page, pageSize]);

  const runReport = () => {
    setPage(1);
    void loadReport(filters.values, 1, pageSize);
  };

  const exportUrl = (format: "csv" | "pdf") =>
    `/api/admin/reports?${buildQuery(filters.values, { format, pageSize: "50" })}`;

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading reports…</p>
      </main>
    );
  }

  if (user.role === "STUDENT") {
    return (
      <AppShell user={user} unreadNotifications={unread} title="Operational Reporting">
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CircleAlert />
          <AlertTitle>Coordinator area</AlertTitle>
          <AlertDescription>Operational reporting is limited to Pre-OJT coordinator accounts.</AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  const showBatchFilters = filters.values.type !== "lab-equipment";

  return (
    <AppShell
      user={user}
      unreadNotifications={unread}
      title="Operational Reporting & Export"
      subtitle="Attendance, duty hours, task progress, and lab equipment condition"
    >
      <div className="grid gap-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <CircleAlert />
            <AlertTitle>Connection problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Filters */}
        <section aria-labelledby="filters-heading" className="rounded-xl border border-border bg-card p-4">
          <h2 id="filters-heading" className="flex items-center gap-2 text-base font-semibold">
            <Filter className="size-4 text-muted-foreground" />
            Report filters
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="grid gap-1.5">
              <label htmlFor="report-type" className="text-xs text-muted-foreground">
                Report type
              </label>
              <select
                id="report-type"
                value={filters.values.type}
                onChange={(e) => {
                  filters.setValues({ type: e.target.value });
                  setPage(1);
                }}
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {showBatchFilters && (
              <>
                <div className="grid gap-1.5">
                  <label htmlFor="report-batch" className="text-xs text-muted-foreground">
                    Batch
                  </label>
                  <select
                    id="report-batch"
                    value={filters.values.batchId}
                    onChange={(e) => {
                      filters.setValues({ batchId: e.target.value });
                      setPage(1);
                    }}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">All batches</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="report-section" className="text-xs text-muted-foreground">
                    Section
                  </label>
                  <input
                    id="report-section"
                    value={filters.values.section}
                    onChange={(e) => filters.setValues({ section: e.target.value })}
                    placeholder="e.g., BSIT-4A"
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="report-from" className="text-xs text-muted-foreground">
                    Date from
                  </label>
                  <input
                    id="report-from"
                    type="date"
                    value={filters.values.dateFrom}
                    onChange={(e) => filters.setValues({ dateFrom: e.target.value })}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="report-to" className="text-xs text-muted-foreground">
                    Date to
                  </label>
                  <input
                    id="report-to"
                    type="date"
                    value={filters.values.dateTo}
                    onChange={(e) => filters.setValues({ dateTo: e.target.value })}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={runReport}>
              Generate report
            </Button>
            <Button type="button" variant="outline" render={<a href={exportUrl("csv")} download />}>
              <FileDown className="size-4" />
              Export CSV
            </Button>
            <Button type="button" variant="outline" render={<a href={exportUrl("pdf")} download />}>
              <FileText className="size-4" />
              Export PDF
            </Button>
          </div>
          {filters.isDirty && (
            <p className="mt-2 text-xs text-muted-foreground">Filter selections preserved locally on this device.</p>
          )}
        </section>

        {/* Report table */}
        <section aria-labelledby="table-heading" className="rounded-xl border border-border bg-card p-4 lg:p-5">
          <h2 id="table-heading" className="text-base font-semibold">
            Report results
          </h2>
          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No rows matched the selected filters. Adjust the filters or generate the report again.
            </p>
          ) : (
            <div className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={`${row.label}-${index}`}>
                      <TableCell>{row.batch || "—"}</TableCell>
                      <TableCell>{row.section || "—"}</TableCell>
                      <TableCell>{row.metric}</TableCell>
                      <TableCell className="tabular-ledger">{row.value}</TableCell>
                      <TableCell className="max-w-72 truncate" title={row.label}>
                        {row.label || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3">
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
              <p className="mt-2 text-xs text-muted-foreground">
                CSV and PDF exports capture the current filters (first 50 rows server-side). Every report
                generation is recorded in the audit trail.
              </p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
