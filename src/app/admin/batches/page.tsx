"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Layers, Pencil, PowerOff, Users } from "lucide-react";
import type { Role } from "@prisma/client";

import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { DataTableToolbar } from "@/components/shell/DataTableToolbar";
import { FloatingInput } from "@/components/shell/FloatingInput";
import { InlineError } from "@/components/shell/InlineError";
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
  const [wizardFieldErrors, setWizardFieldErrors] = React.useState({
    name: "", section: "", academicYear: "", scheduleLabel: "", startTime: "", endTime: "", graceMinutes: "",
  });
  const [wizardBusy, setWizardBusy] = React.useState(false);

  const [editing, setEditing] = React.useState<Batch | null>(null);
  const [editDraft, setEditDraft] = React.useState({ name: "", section: "", academicYear: "" });
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = React.useState({ name: "", section: "", academicYear: "" });
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
    const loadData = async () => {
      void load();
    };
    loadData();
  }, [load]);

  React.useEffect(() => {
    const loadData = async () => {
      void loadBatches(page, pageSize, search);
    };
    loadData();
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

  const wizardValidateStep = (step: number): boolean => {
    const errors = { name: "", section: "", academicYear: "", scheduleLabel: "", startTime: "", endTime: "", graceMinutes: "" };
    if (step === 1) {
      errors.name = wizard.values.name.trim().length < 2 ? "Batch name must be at least 2 characters." : "";
      errors.section = wizard.values.section.trim() ? "" : "Section is required.";
      errors.academicYear = wizard.values.academicYear.trim() ? "" : "Academic year is required.";
    }
    if (step === 2) {
      errors.scheduleLabel = wizard.values.scheduleLabel.trim() ? "" : "Schedule label is required.";
      const missingTime = !wizard.values.startTime || !wizard.values.endTime;
      errors.startTime = missingTime ? "Start and end times are required." : "";
      errors.endTime = !missingTime && wizard.values.endTime <= wizard.values.startTime
        ? "End time must be after the start time."
        : "";
      const grace = Number(wizard.values.graceMinutes);
      errors.graceMinutes = !Number.isInteger(grace) || grace < 0
        ? "Grace minutes must be a whole number of 0 or more."
        : "";
    }
    setWizardFieldErrors(errors);
    return !Object.values(errors).some(Boolean);
  };

  const wizardNext = () => {
    if (!wizardValidateStep(wizardStep)) return;
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
    const errors = {
      name: editDraft.name.trim().length < 2 ? "Batch name must be at least 2 characters." : "",
      section: editDraft.section.trim() ? "" : "Section is required.",
      academicYear: editDraft.academicYear.trim() ? "" : "Academic year is required.",
    };
    setEditFieldErrors(errors);
    if (errors.name || errors.section || errors.academicYear) return;
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <CircleAlert />
            <AlertTitle>Connection problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section aria-label="Batch list" className="rounded-sm border border-border bg-card p-4 lg:p-5">
          <DataTableToolbar
            search={search}
            onSearchChange={(value) => {
              setPage(1);
              setSearch(value);
            }}
            searchPlaceholder="Search batch or section..."
          />

          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No batches yet. Use “New Batch” to create the first duty batch with its shift schedule.
            </p>
          ) : (
            <div className="mt-4">
              <div className="min-w-0 overflow-x-auto">
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
                            <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(batch)}>
                              <Pencil className="size-4" />
                              Edit
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => void toggleActive(batch)}>
                              <PowerOff className="size-4" />
                              {batch.isActive ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
            <Alert className="border-success-surface/40 bg-success-surface/10 text-success">
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
              <FloatingInput
                id="wizard-name"
                label="Batch name"
                value={wizard.values.name}
                onChange={(e) => {
                  wizard.setValues({ name: e.target.value });
                  setWizardFieldErrors((old) => ({ ...old, name: "" }));
                }}
                error={wizardFieldErrors.name}
              />
              <FloatingInput
                id="wizard-section"
                label="Section"
                value={wizard.values.section}
                onChange={(e) => {
                  wizard.setValues({ section: e.target.value });
                  setWizardFieldErrors((old) => ({ ...old, section: "" }));
                }}
                error={wizardFieldErrors.section}
              />
              <FloatingInput
                id="wizard-year"
                label="Academic year"
                value={wizard.values.academicYear}
                onChange={(e) => {
                  wizard.setValues({ academicYear: e.target.value });
                  setWizardFieldErrors((old) => ({ ...old, academicYear: "" }));
                }}
                error={wizardFieldErrors.academicYear}
              />
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
              <FloatingInput
                id="wizard-schedule-label"
                label="Schedule label"
                value={wizard.values.scheduleLabel}
                onChange={(e) => {
                  wizard.setValues({ scheduleLabel: e.target.value });
                  setWizardFieldErrors((old) => ({ ...old, scheduleLabel: "" }));
                }}
                error={wizardFieldErrors.scheduleLabel}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="wizard-start">Shift start</Label>
                  <Input
                    id="wizard-start"
                    type="time"
                    value={wizard.values.startTime}
                    onChange={(e) => {
                      wizard.setValues({ startTime: e.target.value });
                      setWizardFieldErrors((old) => ({ ...old, startTime: "", endTime: "" }));
                    }}
                    aria-invalid={Boolean(wizardFieldErrors.startTime)}
                    aria-describedby={wizardFieldErrors.startTime ? "wizard-start-error" : undefined}
                  />
                  {wizardFieldErrors.startTime && (
                    <InlineError message={wizardFieldErrors.startTime} id="wizard-start-error" />
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wizard-end">Shift end</Label>
                  <Input
                    id="wizard-end"
                    type="time"
                    value={wizard.values.endTime}
                    onChange={(e) => {
                      wizard.setValues({ endTime: e.target.value });
                      setWizardFieldErrors((old) => ({ ...old, endTime: "" }));
                    }}
                    aria-invalid={Boolean(wizardFieldErrors.endTime)}
                    aria-describedby={wizardFieldErrors.endTime ? "wizard-end-error" : undefined}
                  />
                  {wizardFieldErrors.endTime && (
                    <InlineError message={wizardFieldErrors.endTime} id="wizard-end-error" />
                  )}
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wizard-grace">Grace minutes</Label>
                <Input
                  id="wizard-grace"
                  type="number"
                  min={0}
                  value={wizard.values.graceMinutes}
                  onChange={(e) => {
                    wizard.setValues({ graceMinutes: e.target.value });
                    setWizardFieldErrors((old) => ({ ...old, graceMinutes: "" }));
                  }}
                  aria-invalid={Boolean(wizardFieldErrors.graceMinutes)}
                  aria-describedby={wizardFieldErrors.graceMinutes ? "wizard-grace-error" : undefined}
                />
                {wizardFieldErrors.graceMinutes && (
                  <InlineError message={wizardFieldErrors.graceMinutes} id="wizard-grace-error" />
                )}
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
            <div className="grid gap-2 rounded-sm border border-border bg-muted/30 p-4 text-sm">
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
            <FloatingInput
              id="edit-name"
              label="Batch name"
              value={editDraft.name}
              onChange={(e) => {
                setEditDraft((d) => ({ ...d, name: e.target.value }));
                setEditFieldErrors((old) => ({ ...old, name: "" }));
              }}
              error={editFieldErrors.name}
            />
            <FloatingInput
              id="edit-section"
              label="Section"
              value={editDraft.section}
              onChange={(e) => {
                setEditDraft((d) => ({ ...d, section: e.target.value }));
                setEditFieldErrors((old) => ({ ...old, section: "" }));
              }}
              error={editFieldErrors.section}
            />
            <FloatingInput
              id="edit-year"
              label="Academic year"
              value={editDraft.academicYear}
              onChange={(e) => {
                setEditDraft((d) => ({ ...d, academicYear: e.target.value }));
                setEditFieldErrors((old) => ({ ...old, academicYear: "" }));
              }}
              error={editFieldErrors.academicYear}
            />
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
