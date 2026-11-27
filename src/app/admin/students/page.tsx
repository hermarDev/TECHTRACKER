"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  CircleAlert,
  CheckCircle2,
  Copy,
  MoreHorizontal,
  UploadCloud,
  UserCheck,
} from "lucide-react";
import type { Role } from "@/lib/types";

import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { DataTableToolbar } from "@/components/shell/DataTableToolbar";
import { InlineError } from "@/components/shell/InlineError";
import { useDraftForm } from "@/hooks/useDraftForm";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

type Student = {
  id: string;
  fullName: string;
  email: string;
  studentIdNo: string | null;
  program: string | null;
  section: string | null;
  status: string;
  batch: { id: string; name: string; section: string } | null;
  createdAt: string;
};

type AdminBatch = { id: string; name: string; section: string };

type ParsedRow = {
  email?: string;
  studentIdNo?: string;
  fullName?: string;
  program?: string;
  section?: string;
};

type ImportResult = {
  summary: { created: number; skipped: number; overwritten: number; flagged: number; errors: number };
  errors: { row: ParsedRow; error: string }[];
};

const RESOLUTION_OPTIONS = [
  {
    value: "skip",
    title: "Skip duplicates",
    description: "Existing accounts stay untouched; only new students are imported.",
  },
  {
    value: "overwrite",
    title: "Overwrite duplicates",
    description: "Name, program, and section of matching accounts are replaced with the file values.",
  },
  {
    value: "flag",
    title: "Flag duplicates",
    description: "Conflicting rows are held out and reported for manual resolution.",
  },
] as const;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function normalizeRow(row: Record<string, unknown>): ParsedRow {
  const get = (key: string) => {
    const value = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
    return value == null ? undefined : String(value).trim();
  };
  return {
    email: get("email"),
    studentIdNo: get("studentIdNo") ?? get("student_id"),
    fullName: get("fullName") ?? get("name"),
    program: get("program"),
    section: get("section"),
  };
}

export default function AdminStudentsPage() {
  const [user, setUser] = React.useState<{ id: string; fullName: string; email: string; role: Role } | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [rows, setRows] = React.useState<Student[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [total, setTotal] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [verifyingId, setVerifyingId] = React.useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [wizardStep, setWizardStep] = React.useState(1);
  const [wizardFile, setWizardFile] = React.useState<File | null>(null);
  const [parsedRows, setParsedRows] = React.useState<ParsedRow[]>([]);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [importBusy, setImportBusy] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null);
  const [wizardError, setWizardError] = React.useState<string | null>(null);
  const [batches, setBatches] = React.useState<AdminBatch[]>([]);

  const importDraft = useDraftForm<{ duplicateResolution: "skip" | "overwrite" | "flag"; batchId: string }>(
    "techtracker-student-import",
    { duplicateResolution: "skip", batchId: "" },
  );

  const load = React.useCallback(async () => {
    setError(null);
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

  const [searchDraft, setSearchDraft] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [sectionFilter, setSectionFilter] = React.useState("");

  const loadStudents = React.useCallback(
    async (targetPage: number, targetSize: number) => {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(targetSize) });
      if (searchDraft.trim()) params.set("search", searchDraft.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (sectionFilter.trim()) params.set("section", sectionFilter.trim());
      const res = await fetch(`/api/admin/students?${params.toString()}`);
      if (!res.ok) {
        toast.error("The student directory could not be loaded.");
        return;
      }
      const body = (await res.json()) as {
        data: Student[];
        page: number;
        pageSize: number;
        total: number;
      };
      setRows(body.data);
      setPage(body.page);
      setPageSize(body.pageSize);
      setTotal(body.total);
    },
    [searchDraft, statusFilter, sectionFilter],
  );

  React.useEffect(() => {
    const loadData = async () => {
      void load();
    };
    loadData();
  }, [load]);

  React.useEffect(() => {
    const loadData = async () => {
      void loadStudents(page, pageSize);
    };
    loadData();
  }, [loadStudents, page, pageSize]);

  React.useEffect(() => {
    if (!wizardOpen) return;
    void (async () => {
      const res = await fetch("/api/admin/batches?page=1&pageSize=50");
      if (res.ok) {
        const body = (await res.json()) as { data: AdminBatch[] };
        setBatches(body.data);
      }
    })();
  }, [wizardOpen]);

  const verifyStudent = async (student: Student) => {
    setVerifyingId(student.id);
    try {
      const res = await fetch("/api/admin/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Verification could not be recorded.");
        return;
      }
      toast.success(`${student.fullName} is now verified and active.`);
      await loadStudents(page, pageSize);
    } catch {
      toast.error("Verification could not be recorded. Check your connection and retry.");
    } finally {
      setVerifyingId(null);
    }
  };

  // ---- Import wizard: client-side parse preview (Step 2) ----
  const parseFile = async (file: File) => {
    setWizardFile(file);
    setParsedRows([]);
    setFileError(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setFileError("The roster file exceeds the 5 MB limit.");
      return;
    }
    const isCsv = file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");
    const isXlsx =
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.name.toLowerCase().endsWith(".xlsx");
    if (!isCsv && !isXlsx) {
      setFileError("Unsupported file type. Upload a CSV or XLSX roster.");
      return;
    }
    setParsing(true);
    try {
      let parsed: ParsedRow[] = [];
      if (isCsv) {
        const text = await file.text();
        const { parse } = await import("papaparse");
        const result = parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
        parsed = result.data.map(normalizeRow);
      } else {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { blankrows: false }).map(normalizeRow);
      }
      parsed = parsed.filter((r) => r.email || r.studentIdNo || r.fullName);
      if (parsed.length === 0) {
        setFileError("No roster rows were detected. Check that the file has a header row.");
        return;
      }
      setParsedRows(parsed);
    } catch {
      setFileError("The file could not be parsed. Confirm it is a valid CSV or XLSX roster.");
    } finally {
      setParsing(false);
    }
  };

  const invalidRowCount = parsedRows.filter((r) => !r.email || !r.studentIdNo || !r.fullName).length;

  const openWizard = () => {
    setWizardStep(1);
    setWizardFile(null);
    setParsedRows([]);
    setFileError(null);
    setImportResult(null);
    setWizardError(null);
    setWizardOpen(true);
  };

  const runImport = async () => {
    if (!wizardFile) {
      setFileError("Choose a CSV or XLSX roster file first.");
      return;
    }
    setFileError(null);
    setImportBusy(true);
    setWizardError(null);
    try {
      const formData = new FormData();
      formData.set("file", wizardFile);
      formData.set("duplicateResolution", importDraft.values.duplicateResolution);
      if (importDraft.values.batchId) formData.set("batchId", importDraft.values.batchId);
      const res = await fetch("/api/admin/students/import", { method: "POST", body: formData });
      const body = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) {
        setWizardError(body.error ?? "The import could not be completed.");
        toast.error(body.error ?? "The import could not be completed.");
        return;
      }
      setImportResult(body);
      toast.success(
        `Import finished — ${body.summary.created} created, ${body.summary.skipped} skipped, ${body.summary.overwritten} overwritten, ${body.summary.flagged} flagged.`,
      );
      await loadStudents(page, pageSize);
    } catch {
      setWizardError("The import could not be completed. Check your connection and retry.");
    } finally {
      setImportBusy(false);
    }
  };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading student directory…</p>
      </main>
    );
  }

  if (user.role === "STUDENT") {
    return (
      <AppShell user={user} unreadNotifications={unread} title="Student Directory">
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CircleAlert />
          <AlertTitle>Coordinator area</AlertTitle>
          <AlertDescription>The student directory is limited to Pre-OJT coordinator accounts.</AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  return (
    <AppShell
      user={user}
      unreadNotifications={unread}
      title="Student Directory & Import"
      subtitle="Verify accounts and import student rosters (CSV/XLSX)"
      actions={
        <Button type="button" size="sm" onClick={openWizard}>
          <UploadCloud className="size-4" />
          Import Roster
        </Button>
      }
    >
      <div className="grid min-w-0 gap-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <CircleAlert />
            <AlertTitle>Connection problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* 15W — Directory filters */}
        <section aria-labelledby="directory-heading" className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-xs lg:p-6">
          <div className="grid gap-3">
            <h2 id="directory-heading" className="text-base font-semibold">
              Student directory
            </h2>
            <DataTableToolbar
              search={searchDraft}
              onSearchChange={(value) => {
                setPage(1);
                setSearchDraft(value);
              }}
              searchPlaceholder="Search name, ID, or email..."
              filters={
                <>
                  <Select
                    items={[
                      { value: "ALL", label: "All statuses" },
                      { value: "PENDING_VERIFICATION", label: "Pending Verification" },
                      { value: "ACTIVE", label: "Active" },
                      { value: "SUSPENDED", label: "Suspended" },
                      { value: "DEACTIVATED", label: "Deactivated" },
                    ]}
                    value={statusFilter || "ALL"}
                    onValueChange={(value) => {
                      setPage(1);
                      setStatusFilter(value === "ALL" ? "" : (value ?? ""));
                    }}
                  >
                    <SelectTrigger className="h-9 w-44" aria-label="Filter by status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All statuses</SelectItem>
                      <SelectItem value="PENDING_VERIFICATION">Pending Verification</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="SUSPENDED">Suspended</SelectItem>
                      <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    aria-label="Filter by section"
                    value={sectionFilter}
                    onChange={(e) => {
                      setPage(1);
                      setSectionFilter(e.target.value);
                    }}
                    placeholder="Filter section..."
                    className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
                  />
                </>
              }
            />
          </div>

          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No students matched. Pending students appear here once they register and are placed in one of
              your batches.
            </p>
          ) : (
            <div className="mt-4 min-w-0 max-w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Program / Section</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell>
                        <p className="font-medium">{student.fullName}</p>
                        <p className="text-xs text-muted-foreground">{student.email}</p>
                      </TableCell>
                      <TableCell className="font-mono tabular-ledger">{student.studentIdNo ?? "—"}</TableCell>
                      <TableCell>
                        {student.program ?? "—"} / {student.section ?? "—"}
                      </TableCell>
                      <TableCell>{student.batch ? student.batch.name : "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={student.status} />
                      </TableCell>
                      <TableCell className="tabular-ledger">{formatDate(student.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          {student.status === "PENDING_VERIFICATION" && (
                            <Button
                              type="button"
                              size="sm"
                              disabled={verifyingId === student.id}
                              onClick={() => void verifyStudent(student)}
                            >
                              <BadgeCheck className="size-4" />
                              {verifyingId === student.id ? "Verifying…" : "Verify Pending"}
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-9"
                                  aria-label={`More actions for ${student.fullName}`}
                                />
                              }
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  void navigator.clipboard.writeText(student.email);
                                  toast.success("Email address copied.");
                                }}
                              >
                                <Copy className="size-4" />
                                Copy email
                              </DropdownMenuItem>
                              {student.studentIdNo && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    void navigator.clipboard.writeText(student.studentIdNo!);
                                    toast.success("Student ID copied.");
                                  }}
                                >
                                  <Copy className="size-4" />
                                  Copy student ID
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
        </section>
      </div>

      {/* 15W — 4-Step Import Wizard */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student Roster Import — Step {wizardStep} of 4</DialogTitle>
            <DialogDescription>
              {wizardStep === 1 && "Upload a CSV or XLSX roster file (up to 5 MB)."}
              {wizardStep === 2 && "Review the parsed preview before choosing how duplicates are handled."}
              {wizardStep === 3 && "Choose the duplicate resolution policy and optional batch assignment."}
              {wizardStep === 4 && "Confirm to run the import; a per-row summary is shown afterwards."}
            </DialogDescription>
          </DialogHeader>

          {wizardStep === 1 && (
            <div className="grid gap-3">
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center hover:bg-muted/60">
                <UploadCloud className="size-6 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium">
                  {wizardFile ? wizardFile.name : "Choose roster file (CSV or XLSX)"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Columns: email, studentIdNo, fullName, program, section — up to 5 MB
                </span>
                <input
                  type="file"
                  className="sr-only"
                  accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void parseFile(file);
                  }}
                  aria-invalid={Boolean(fileError)}
                  aria-describedby={fileError ? "roster-file-error" : undefined}
                />
              </label>
              {parsing && <p className="text-sm text-muted-foreground">Parsing roster…</p>}
              {fileError && <InlineError message={fileError} id="roster-file-error" />}
            </div>
          )}

          {wizardStep === 2 && (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="tabular-ledger">{parsedRows.length}</span> rows parsed from{" "}
                {wizardFile?.name ?? "the file"} ·{" "}
                <span className={invalidRowCount > 0 ? "font-medium text-destructive" : ""}>
                  <span className="tabular-ledger">{invalidRowCount}</span> row{invalidRowCount === 1 ? "" : "s"} missing
                  required fields
                </span>
              </p>
              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Student ID</TableHead>
                      <TableHead>Full name</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Section</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 10).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row.email ?? <span className="text-destructive">missing</span>}</TableCell>
                        <TableCell className="tabular-ledger">
                          {row.studentIdNo ?? <span className="text-destructive">missing</span>}
                        </TableCell>
                        <TableCell>{row.fullName ?? <span className="text-destructive">missing</span>}</TableCell>
                        <TableCell>{row.program ?? "—"}</TableCell>
                        <TableCell>{row.section ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsedRows.length > 10 && (
                <p className="text-xs text-muted-foreground">
                  Showing the first 10 of <span className="tabular-ledger">{parsedRows.length}</span> rows.
                </p>
              )}
            </div>
          )}

          {wizardStep === 3 && (
            <div className="grid gap-3">
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Duplicate resolution</legend>
                {RESOLUTION_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex min-h-11 items-start gap-3 rounded-lg border p-3 text-sm ${
                      importDraft.values.duplicateResolution === option.value
                        ? "border-primary/40 bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="duplicate-resolution"
                      value={option.value}
                      checked={importDraft.values.duplicateResolution === option.value}
                      onChange={() => importDraft.setValues({ duplicateResolution: option.value })}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{option.title}</span>
                      <span className="block text-xs text-muted-foreground">{option.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="grid gap-1.5">
                <label htmlFor="import-batch" className="text-sm font-medium">
                  Assign imported students to batch (optional)
                </label>
                <Select
                  items={[
                    { value: "NONE", label: "No batch assignment" },
                    ...batches.map((batch) => ({
                      value: batch.id,
                      label: `${batch.name} (${batch.section})`,
                    })),
                  ]}
                  value={importDraft.values.batchId || "NONE"}
                  onValueChange={(value) =>
                    importDraft.setValues({ batchId: value === "NONE" ? "" : (value ?? "") })
                  }
                >
                  <SelectTrigger id="import-batch" className="w-full">
                    <SelectValue placeholder="No batch assignment">
                      {(value: string | null) => {
                        if (value === "NONE") return "No batch assignment";
                        const batch = batches.find((item) => item.id === value);
                        return batch ? `${batch.name} (${batch.section})` : "Batch unavailable";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No batch assignment</SelectItem>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.name} ({batch.section})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {importDraft.isDirty && (
                <p className="text-xs text-muted-foreground">Import choices preserved locally on this device.</p>
              )}
            </div>
          )}

          {wizardStep === 4 && !importResult && (
            <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <p>
                <span className="text-muted-foreground">File:</span> {wizardFile?.name ?? "—"}{" "}
                {wizardFile && (
                  <span className="tabular-ledger text-muted-foreground">
                    ({(wizardFile.size / 1024).toFixed(0)} KB)
                  </span>
                )}
              </p>
              <p>
                <span className="text-muted-foreground">Rows parsed:</span>{" "}
                <span className="tabular-ledger">{parsedRows.length}</span> ·{" "}
                <span className="text-muted-foreground">Duplicates:</span>{" "}
                {importDraft.values.duplicateResolution}
              </p>
              <p>
                <span className="text-muted-foreground">Batch assignment:</span>{" "}
                {batches.find((b) => b.id === importDraft.values.batchId)?.name ?? "None"}
              </p>
            </div>
          )}

          {wizardStep === 4 && importResult && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(
                  [
                    ["Created", importResult.summary.created],
                    ["Skipped", importResult.summary.skipped],
                    ["Overwritten", importResult.summary.overwritten],
                    ["Flagged", importResult.summary.flagged],
                    ["Errors", importResult.summary.errors],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-card p-3 text-center">
                    <p className="text-lg font-semibold tabular-ledger">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {importResult.errors.length > 0 && (
                <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                  <CircleAlert />
                  <AlertTitle>Rows needing attention</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {importResult.errors.slice(0, 5).map((entry, index) => (
                        <li key={index}>
                          {entry.row.email ?? entry.row.studentIdNo ?? "Row"} — {entry.error}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {wizardError && (
            <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
              <CircleAlert />
              <AlertTitle>Import blocked</AlertTitle>
              <AlertDescription>{wizardError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWizardStep((s) => Math.max(1, s - 1))}
              disabled={wizardStep === 1 || importBusy}
            >
              Back
            </Button>
            <div className="flex gap-2">
              {wizardStep < 4 ? (
                <Button
                  type="button"
                  disabled={wizardStep === 1 && (!wizardFile || parsedRows.length === 0)}
                  onClick={() => setWizardStep((s) => Math.min(4, s + 1))}
                >
                  <UserCheck className="size-4" />
                  Continue
                </Button>
              ) : importResult ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setWizardOpen(false);
                    setImportResult(null);
                  }}
                >
                  <CheckCircle2 className="size-4" />
                  Done
                </Button>
              ) : (
                <div>
                  <Button type="button" onClick={() => void runImport()} disabled={importBusy}>
                    <UploadCloud className="size-4" />
                    {importBusy ? "Importing…" : "Confirm & import"}
                  </Button>
                  {fileError && !wizardFile && (
                    <InlineError message={fileError} id="roster-file-error" />
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
