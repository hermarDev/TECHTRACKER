"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Layers, Pencil, Power, Search, Users } from "lucide-react";
import type { Role } from "@prisma/client";

import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { useDraftForm } from "@/hooks/useDraftForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type Batch = {
  id: string;
  name: string;
  section: string;
  academicYear: string;
  isActive: boolean;
  createdAt: string;
  coordinator: { fullName: string };
  students: { id: string }[];
};

type DirectoryStudent = {
  id: string;
  fullName: string;
  email: string;
  studentIdNo: string | null;
  program: string | null;
  section: string | null;
};

type WizardDraft = {
  name: string;
  section: string;
  academicYear: string;
  isActive: boolean;
  scheduleLabel: string;
  startTime: string;
  endTime: string;
  graceMinutes: string;
  selectedStudentIds: string[];
};

const WIZARD_INITIAL: WizardDraft = {
  name: "",
  section: "",
  academicYear: "",
  isActive: true,
  scheduleLabel: "",
  startTime: "08:00",
  endTime: "17:00",
  graceMinutes: "15",
  selectedStudentIds: [],
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default function AdminBatchesPage() {
  const [user, setUser] = React.useState<{ id: string; fullName: string; email: string; role: Role } | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [rows, setRows] = React.useState<Batch[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [wizardStep, setWizardStep] = React.useState(1);
  const [wizardStudents, setWizardStudents] = React.useState<DirectoryStudent[]>([]);
  const [wizardError, setWizardError] = React.useState<string | null>(null);
  const [wizardBusy, setWizardBusy] = React.useState(false);

  const [editing, setEditing] = React.useState<Batch | null>(null);
  const [editDraft, setEditDraft] = React.useState({ name: "", section: "", academicYear: "" });
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editBusy, setEditBusy] = React.useState(false);

  const wizard = useDraftForm<WizardDraft>("techtracker-batch-wizard", WIZARD_INITIAL);

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
          const notifBody = (await notifRes.json()) as { data: { isRead: boolean }[] };
          setUnread(notifBody.data.filter((n) => !n.isRead).length);
        }
      } catch {
        // Notification badge is best-effort in the local prototype.
      }
    } catch {
      setError("TechTracker could not reach the server. Check your connection and retry.");
    }
  }, []);

  const loadBatches = React.useCallback(async (targetPage: number, targetSize: number, targetSearch: string) => {
    const params = new URLSearchParams({ page: String(targetPage), pageSize: String(targetSize) });
    if (targetSearch.trim()) params.set("search", targetSearch.trim());
    const res = await fetch(`/api/admin/batches?${params.toString()}`);
    if (!res.ok) {
      toast.error("Batches could not be loaded.");
      return;
    }
    const body = (await res.json()) as { data: Batch[]; page: number; pageSize: number; total: number };
    setRows(body.data);
    setPage(body.page);
    setPageSize(body.pageSize);
    setTotal(body.total);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      void load();
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [load]);

  React.useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      void loadBatches(page, pageSize, search);
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [loadBatches, page, pageSize, search]);

  // ---- Wizard: step 3 loads verified students ----
  React.useEffect(() => {
    if (!wizardOpen || wizardStep !== 3) return;
    void (async () => {
      const res = await fetch("/api/admin/students?page=1&pageSize=50&status=ACTIVE");
      if (!res.ok) {
        toast.error("Verified students could not be loaded.");
        return;
      }
      const body = (await res.json()) as { data: DirectoryStudent[] };
      setWizardStudents(body.data);
    })();
  }, [wizardOpen, wizardStep]);

  const openWizard = () => {
    setWizardStep(1);
    setWizardError(null);
    setWizardStudents([]);
    setWizardOpen(true);
  };

  const wizardValidateStep = (step: number): string | null => {
    if (step === 1) {
      if (wizard.values.name.trim().length < 2) return "Batch name is required.";
      if (!wizard.values.section.trim()) return "Section is required.";
      if (!wizard.values.academicYear.trim()) return "Academic year is required.";
    }
    if (step === 2) {
      if (!wizard.values.scheduleLabel.trim()) return "Schedule label is required.";
      if (!wizard.values.startTime || !wizard.values.endTime) return "Start and end times are required.";
      if (wizard.values.endTime <= wizard.values.startTime) return "End time must be after the start time.";
      const grace = Number(wizard.values.graceMinutes);
      if (!Number.isInteger(grace) || grace < 0) return "Grace minutes must be a whole number of 0 or more.";
    }
    return null;
  };

  const wizardNext = () => {
    const problem = wizardValidateStep(wizardStep);
    if (problem) {
      setWizardError(problem);
      toast.error(problem);
      return;
    }
    setWizardError(null);
    setWizardStep((s) => Math.min(4, s + 1));
  };

  const wizardCreate = async () => {
    const selected = wizardStudents.filter((s) => wizard.values.selectedStudentIds.includes(s.id));
    setWizardBusy(true);
    try {
      const res = await fetch("/api/admin/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch: {
            name: wizard.values.name.trim(),
            section: wizard.values.section.trim(),
            academicYear: wizard.values.academicYear.trim(),
            isActive: wizard.values.isActive,
          },
          schedule: {
            label: wizard.values.scheduleLabel.trim(),
            startTime: wizard.values.startTime,
            endTime: wizard.values.endTime,
            graceMinutes: Number(wizard.values.graceMinutes),
          },
          students: selected.map((s) => ({
            email: s.email,
            studentIdNo: s.studentIdNo ?? "",
            fullName: s.fullName,
            program: s.program ?? undefined,
            section: s.section ?? undefined,
          })),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        const message = body.error ?? "The batch could not be created.";
        setWizardError(message);
        toast.error(message);
        return;
      }
      toast.success(`Batch “${wizard.values.name.trim()}” created with its duty shift schedule.`);
      wizard.setValues(WIZARD_INITIAL);
      wizard.clearDraft();
      setWizardOpen(false);
      await loadBatches(page, pageSize, search);
    } catch {
      const message = "The batch could not be created. Check your connection and retry.";
      setWizardError(message);
      toast.error(message);
    } finally {
      setWizardBusy(false);
    }
  };

  const toggleActive = async (batch: Batch) => {
    try {
      const res = await fetch(`/api/admin/batches/${batch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !batch.isActive }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "The batch could not be updated.");
        return;
      }
      toast.success(batch.isActive ? `Batch “${batch.name}” deactivated.` : `Batch “${batch.name}” activated.`);
      await loadBatches(page, pageSize, search);
    } catch {
      toast.error("The batch could not be updated. Check your connection and retry.");
    }
  };

  const openEdit = (batch: Batch) => {
    setEditing(batch);
    setEditDraft({ name: batch.name, section: batch.section, academicYear: batch.academicYear });
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editDraft.name.trim().length < 2) {
      setEditError("Batch name is required.");
      return;
    }
    if (!editDraft.section.trim()) {
      setEditError("Section is required.");
      return;
    }
    if (!editDraft.academicYear.trim()) {
      setEditError("Academic year is required.");
      return;
    }
    setEditBusy(true);
    try {
      const res = await fetch(`/api/admin/batches/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name.trim(),
          section: editDraft.section.trim(),
          academicYear: editDraft.academicYear.trim(),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        const message = body.error ?? "The batch could not be updated.";
        setEditError(message);
        toast.error(message);
        return;
      }
      toast.success("Batch details saved.");
      setEditing(null);
      await loadBatches(page, pageSize, search);
    } catch {
      setEditError("The batch could not be updated. Check your connection and retry.");
    } finally {
      setEditBusy(false);
    }
  };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading batches…</p>
      </main>
    );
  }

  if (user.role === "STUDENT") {
    return (
      <AppShell user={user} unreadNotifications={unread} title="Batch & Schedule Management">
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CircleAlert />
          <AlertTitle>Coordinator area</AlertTitle>
          <AlertDescription>Batch management is limited to Pre-OJT coordinator accounts.</AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  const selectedCount = wizard.values.selectedStudentIds.length;

  return (
    <AppShell
      user={user}
      unreadNotifications={unread}
      title="Batch & Schedule Management"
      subtitle="Duty batches, shift schedules, and roster assignment"
      actions={
        <Button type="button" size="sm" onClick={openWizard}>
          <Layers className="size-4" />
          New Batch
        </Button>
      }
    >
      <div className="grid gap-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <CircleAlert />
            <AlertTitle>Connection problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section aria-label="Batch list" className="rounded-xl border border-border bg-card p-4 lg:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Batches</h2>
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              Search
              <span className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  aria-label="Search batches by name or section"
                  value={search}
                  onChange={(e) => {
                    setPage(1);
                    setSearch(e.target.value);
                  }}
                  placeholder="Name or section —"
                  className="h-9 rounded-md border border-input bg-background pl-7 pr-2 text-xs"
                />
              </span>
            </label>
          </div>

          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No batches yet. Use “New Batch” to create the first duty batch with its shift schedule.
            </p>
          ) : (
            <div className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Academic year</TableHead>
                    <TableHead>Coordinator</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">{batch.name}</TableCell>
                      <TableCell>{batch.section}</TableCell>
                      <TableCell className="tabular-ledger">{batch.academicYear}</TableCell>
                      <TableCell>{batch.coordinator?.fullName ?? "—"}</TableCell>
                      <TableCell className="tabular-ledger">{batch.students.length}</TableCell>
                      <TableCell className="tabular-ledger">{formatDate(batch.createdAt)}</TableCell>
                      <TableCell>
                        <StatusBadge status={batch.isActive ? "ACTIVE" : "DEACTIVATED"} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(batch)}>
                            <Pencil className="size-3.5" />
                            Edit
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => void toggleActive(batch)}>
                            <Power className="size-3.5" />
                            {batch.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
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
            </div>
          )}
        </section>
      </div>

      {/* 13W — 3-Step Batch Creation Wizard */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Batch — Step {wizardStep} of 4</DialogTitle>
            <DialogDescription>
              {wizardStep === 1 && "Batch identity: name, section, and academic year."}
              {wizardStep === 2 && "Duty shift schedule: label, shift window, and grace period."}
              {wizardStep === 3 && "Select verified students to enroll in this batch."}
              {wizardStep === 4 && "Confirm the batch creation summary before submitting."}
            </DialogDescription>
          </DialogHeader>

          {wizard.restoredDraft && wizardStep === 1 && (
            <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 />
              <AlertTitle>Draft restored</AlertTitle>
              <AlertDescription>
                Your in-progress batch wizard entries were preserved on this device.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    wizard.setValues(WIZARD_INITIAL);
                    wizard.clearDraft();
                  }}
                >
                  Clear draft
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {wizardStep === 1 && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="wizard-name">Batch name</Label>
                <Input
                  id="wizard-name"
                  value={wizard.values.name}
                  onChange={(e) => wizard.setValues({ name: e.target.value })}
                  placeholder="e.g., BSIT-4A Batch 2026-2"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wizard-section">Section</Label>
                <Input
                  id="wizard-section"
                  value={wizard.values.section}
                  onChange={(e) => wizard.setValues({ section: e.target.value })}
                  placeholder="e.g., BSIT-4A"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wizard-year">Academic year</Label>
                <Input
                  id="wizard-year"
                  value={wizard.values.academicYear}
                  onChange={(e) => wizard.setValues({ academicYear: e.target.value })}
                  placeholder="e.g., 2026-2027"
                />
              </div>
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <Checkbox
                  checked={wizard.values.isActive}
                  onCheckedChange={(checked) => wizard.setValues({ isActive: checked === true })}
                />
                Batch is active for duty logging
              </label>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="wizard-schedule-label">Schedule label</Label>
                <Input
                  id="wizard-schedule-label"
                  value={wizard.values.scheduleLabel}
                  onChange={(e) => wizard.setValues({ scheduleLabel: e.target.value })}
                  placeholder="e.g., Weekday Morning Shift"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="wizard-start">Shift start</Label>
                  <Input
                    id="wizard-start"
                    type="time"
                    value={wizard.values.startTime}
                    onChange={(e) => wizard.setValues({ startTime: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wizard-end">Shift end</Label>
                  <Input
                    id="wizard-end"
                    type="time"
                    value={wizard.values.endTime}
                    onChange={(e) => wizard.setValues({ endTime: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wizard-grace">Grace minutes</Label>
                <Input
                  id="wizard-grace"
                  type="number"
                  min={0}
                  value={wizard.values.graceMinutes}
                  onChange={(e) => wizard.setValues({ graceMinutes: e.target.value })}
                />
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="tabular-ledger">{selectedCount}</span> student{selectedCount === 1 ? "" : "s"} selected
                — selection is optional; you can enroll students later from the directory.
              </p>
              <fieldset className="grid max-h-64 gap-1.5 overflow-y-auto rounded-md border border-input p-2">
                <legend className="px-1 text-xs text-muted-foreground">Verified students (A–Z)</legend>
                {wizardStudents.length === 0 && (
                  <p className="p-2 text-sm text-muted-foreground">No verified students found in your scope.</p>
                )}
                {wizardStudents.map((student) => (
                  <label key={student.id} className="flex min-h-9 items-center gap-2 text-sm">
                    <Checkbox
                      checked={wizard.values.selectedStudentIds.includes(student.id)}
                      onCheckedChange={(checked) =>
                        wizard.setValues({
                          selectedStudentIds: checked
                            ? [...wizard.values.selectedStudentIds, student.id]
                            : wizard.values.selectedStudentIds.filter((id) => id !== student.id),
                        })
                      }
                    />
                    <Users className="size-3.5 text-muted-foreground" />
                    <span className="truncate">{student.fullName}</span>
                    <span className="ml-auto truncate text-xs tabular-ledger text-muted-foreground">
                      {student.studentIdNo ?? "—"}
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
          )}

          {wizardStep === 4 && (
            <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <p>
                <span className="text-muted-foreground">Batch:</span> {wizard.values.name.trim()} ·{" "}
                {wizard.values.section.trim()} · {wizard.values.academicYear.trim()} ·{" "}
                {wizard.values.isActive ? "Active" : "Inactive"}
              </p>
              <p>
                <span className="text-muted-foreground">Schedule:</span> {wizard.values.scheduleLabel.trim()} ·{" "}
                {wizard.values.startTime}–{wizard.values.endTime} · {wizard.values.graceMinutes} min grace
              </p>
              <p>
                <span className="text-muted-foreground">Students:</span>{" "}
                <span className="tabular-ledger">{selectedCount}</span> selected
              </p>
            </div>
          )}

          {wizardError && (
            <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
              <CircleAlert />
              <AlertTitle>Check the wizard entries</AlertTitle>
              <AlertDescription>{wizardError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWizardStep((s) => Math.max(1, s - 1))}
              disabled={wizardStep === 1 || wizardBusy}
            >
              Back
            </Button>
            <div className="flex gap-2">
              {wizardStep < 4 ? (
                <Button type="button" onClick={wizardNext}>
                  Continue
                </Button>
              ) : (
                <Button type="button" onClick={() => void wizardCreate()} disabled={wizardBusy}>
                  <CheckCircle2 className="size-4" />
                  {wizardBusy ? "Creating…" : "Confirm & create batch"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit batch dialog */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit batch</DialogTitle>
            <DialogDescription>Update the batch identity fields. Activation is toggled from the list.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-name">Batch name</Label>
              <Input
                id="edit-name"
                value={editDraft.name}
                onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-section">Section</Label>
              <Input
                id="edit-section"
                value={editDraft.section}
                onChange={(e) => setEditDraft((d) => ({ ...d, section: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-year">Academic year</Label>
              <Input
                id="edit-year"
                value={editDraft.academicYear}
                onChange={(e) => setEditDraft((d) => ({ ...d, academicYear: e.target.value }))}
              />
            </div>
            {editError && (
              <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                <CircleAlert />
                <AlertTitle>Cannot save batch</AlertTitle>
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveEdit()} disabled={editBusy}>
                {editBusy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
