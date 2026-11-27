"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  BellRing,
  CircleAlert,
  FileDown,
  Gavel,
  KeyRound,
  Laptop,
  Layers,
  ListChecks,
  MessageSquareOff,
  Pencil,
  Plus,
  Power,
  ScrollText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
} from "lucide-react";
import type { Role } from "@/lib/types";

import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { PasswordInput } from "@/components/shell/PasswordInput";
import { FloatingInput } from "@/components/shell/FloatingInput";
import { InlineError } from "@/components/shell/InlineError";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";


type AdminRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  createdAt: string;
  coordinatedBatches: number;
  assignedRooms: number;
};

type Config = {
  requiredPreOjtHours: number;
  taskCategories: string[];
  creditRoundingRule: string;
  allowSelfRegistration: boolean;
  updatedAt: string;
};

type BatchRow = {
  id: string;
  name: string;
  section: string;
  academicYear: string;
  isActive: boolean;
  createdAt: string;
  coordinator: { fullName: string } | null;
  students: { id: string }[];
};

type EscalationRow = {
  id: string;
  sourceType: "ATTENDANCE" | "TASK_REVIEW";
  summary: string;
  policyDetails: string;
  status: string;
  rulingNote: string | null;
  ruledAt: string | null;
  createdAt: string;
  student: { fullName: string; email: string; studentIdNo: string | null };
  raisedBy: { fullName: string; role: string } | null;
  ruledBy: { fullName: string } | null;
};

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
  createdAt: string;
  actor: { fullName: string; email: string; role: string } | null;
};

type RoomUnit = {
  id: string;
  unitCode: string;
  specs: string;
  condition: string;
  lastInspectedAt: string | null;
};

type Room = {
  id: string;
  name: string;
  building: string;
  capacity: number;
  isActive: boolean;
  units: RoomUnit[];
};

type Overview = {
  usersByRole: { role: Role; _count: { id: number } }[];
  batchCount: number;
  escalationsByStatus: { status: string; _count: { id: number } }[];
  inspectionCount: number;
  unreadNotifications: number;
};

const TAB_META = [
  { value: "admins", label: "Admins", icon: UserCog },
  { value: "config", label: "100-Hr Config", icon: SlidersHorizontal },
  { value: "batches", label: "Batches", icon: Layers },
  { value: "escalations", label: "Rulings", icon: Gavel },
  { value: "audit", label: "Audit Log", icon: ScrollText },
  { value: "rooms", label: "Lab Rooms", icon: Laptop },
  { value: "alerts", label: "Alerts", icon: BellRing },
] as const;

type TabValue = (typeof TAB_META)[number]["value"];

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; body: T & { error?: string } }> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { ok: res.ok, body };
}

// ============================================================================
// Subsystem 1 — Admin CRUD / Toggle
// ============================================================================

function AdminsPanel() {
  const [rows, setRows] = React.useState<AdminRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState({ fullName: "", email: "", password: "", phone: "" });
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = React.useState({ fullName: "", email: "", password: "" });
  const [createBusy, setCreateBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminRow | null>(null);
  const [editDraft, setEditDraft] = React.useState({ fullName: "", email: "", phone: "" });
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = React.useState({ fullName: "" });
  const [editBusy, setEditBusy] = React.useState(false);

  const load = React.useCallback(async (targetPage: number, targetSize: number) => {
    const params = new URLSearchParams({ page: String(targetPage), pageSize: String(targetSize) });
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    const { ok, body } = await jsonFetch<{ data: AdminRow[]; total: number }>(`/api/superadmin/admins?${params}`);
    if (!ok) {
      toast.error(body.error ?? "Admin accounts could not be loaded.");
      return;
    }
    setRows(body.data ?? []);
    setTotal(body.total ?? 0);
  }, [search, statusFilter]);

  React.useEffect(() => {
    const loadData = async () => {
      void load(page, pageSize);
    };
    loadData();
  }, [load, page, pageSize]);

  const createAdmin = async () => {
    const fieldErrors = {
      fullName: createDraft.fullName.trim().length < 2 ? "Full name must be at least 2 characters." : "",
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createDraft.email.trim()) ? "" : "Enter a valid email address.",
      password: createDraft.password.length < 8 ? "Password must be at least 8 characters." : "",
    };
    setCreateFieldErrors(fieldErrors);
    if (fieldErrors.fullName || fieldErrors.email || fieldErrors.password) return;
    setCreateBusy(true);
    setCreateError(null);
    const { ok, body } = await jsonFetch<{ admin: AdminRow }>("/api/superadmin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: createDraft.fullName.trim(),
        email: createDraft.email.trim(),
        password: createDraft.password,
        phone: createDraft.phone.trim() || null,
      }),
    });
    setCreateBusy(false);
    if (!ok) {
      setCreateError(body.error ?? "The admin account could not be created.");
      return;
    }
    toast.success(`Admin account for ${createDraft.fullName.trim()} created.`);
    setCreateFieldErrors({ fullName: "", email: "", password: "" });
    setCreateOpen(false);
    setCreateDraft({ fullName: "", email: "", password: "", phone: "" });
    void load(page, pageSize);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const fullNameError = editDraft.fullName.trim().length < 2 ? "Full name must be at least 2 characters." : "";
    setEditFieldErrors({ fullName: fullNameError });
    if (fullNameError) return;
    setEditBusy(true);
    setEditError(null);
    const { ok, body } = await jsonFetch<{ admin: AdminRow }>("/api/superadmin/admins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminId: editing.id,
        fullName: editDraft.fullName.trim(),
        email: editDraft.email.trim(),
        phone: editDraft.phone.trim() || null,
      }),
    });
    setEditBusy(false);
    if (!ok) {
      setEditError(body.error ?? "The admin account could not be updated.");
      return;
    }
    toast.success("Admin account details saved.");
    setEditFieldErrors({ fullName: "" });
    setEditing(null);
    void load(page, pageSize);
  };

  const toggleStatus = async (admin: AdminRow) => {
    const next = admin.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE";
    const { ok, body } = await jsonFetch<{ admin: AdminRow }>("/api/superadmin/admins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId: admin.id, status: next }),
    });
    if (!ok) {
      toast.error(body.error ?? "The status change could not be recorded.");
      return;
    }
    toast.success(`${admin.fullName} is now ${next === "ACTIVE" ? "active" : "deactivated"}.`);
    void load(page, pageSize);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <UserCog className="size-4 text-muted-foreground" />
          Coordinator (Admin) accounts
        </h3>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-xs text-muted-foreground [&>span]:min-w-0 [&>span]:max-w-full [&_input]:min-w-0 [&_input]:max-w-full [&_select]:min-w-0 [&_select]:max-w-full">
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2" />
            <input
              aria-label="Search admins"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search name or email..."
              className="h-9 rounded-md border border-input bg-background pl-7 pr-2 text-xs"
            />
          </span>
          <Select
            items={[
              { value: "ALL", label: "All statuses" },
              { value: "ACTIVE", label: "Active" },
              { value: "DEACTIVATED", label: "Deactivated" },
            ]}
            value={statusFilter || "ALL"}
            onValueChange={(value) => {
              setPage(1);
              setStatusFilter(value === "ALL" ? "" : (value ?? ""));
            }}
          >
            <SelectTrigger size="sm" className="w-36" aria-label="Filter admin status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New Admin
          </Button>
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admin</TableHead>
              <TableHead>Batches</TableHead>
              <TableHead>Rooms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Since</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((admin) => (
              <TableRow key={admin.id}>
                <TableCell>
                  <p className="font-medium">{admin.fullName}</p>
                  <p className="text-xs text-muted-foreground">{admin.email}</p>
                </TableCell>
                <TableCell className="tabular-ledger">{admin.coordinatedBatches}</TableCell>
                <TableCell className="tabular-ledger">{admin.assignedRooms}</TableCell>
                <TableCell>
                  <StatusBadge status={admin.status} />
                </TableCell>
                <TableCell className="tabular-ledger">{formatDateTime(admin.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(admin);
                        setEditDraft({ fullName: admin.fullName, email: admin.email, phone: admin.phone ?? "" });
                        setEditError(null);
                      }}
                    >
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void toggleStatus(admin)}>
                      <Power className="size-4" />
                      {admin.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  No admin accounts matched.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="min-w-0 max-w-full [&_div]:flex-wrap [&_button]:max-w-full [&_button]:whitespace-normal">
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create admin account</DialogTitle>
            <DialogDescription>Coordinator accounts sign in with the credentials defined here.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <FloatingInput
              id="admin-fullname"
              label="Full name"
              value={createDraft.fullName}
              onChange={(e) => setCreateDraft((d) => ({ ...d, fullName: e.target.value }))}
              error={createFieldErrors.fullName}
            />
            <FloatingInput
              id="admin-email"
              label="Email"
              type="email"
              value={createDraft.email}
              onChange={(e) => setCreateDraft((d) => ({ ...d, email: e.target.value }))}
              error={createFieldErrors.email}
            />
            <PasswordInput
              id="admin-password"
              label="Temporary password"
              value={createDraft.password}
              onChange={(e) => setCreateDraft((d) => ({ ...d, password: e.target.value }))}
              error={createFieldErrors.password}
            />
            <FloatingInput
              id="admin-phone"
              label="Phone (optional)"
              value={createDraft.phone}
              onChange={(e) => setCreateDraft((d) => ({ ...d, phone: e.target.value }))}
            />
            {createError && (
              <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                <CircleAlert />
                <AlertTitle>Cannot create account</AlertTitle>
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void createAdmin()} disabled={createBusy}>
                <KeyRound className="size-4" />
                {createBusy ? "Creating…" : "Create admin"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit admin account</DialogTitle>
            <DialogDescription>Status toggling is a separate action from the account list.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <FloatingInput
              id="edit-admin-name"
              label="Full name"
              value={editDraft.fullName}
              onChange={(e) => setEditDraft((d) => ({ ...d, fullName: e.target.value }))}
              error={editFieldErrors.fullName}
            />
            <FloatingInput
              id="edit-admin-email"
              label="Email"
              type="email"
              value={editDraft.email}
              onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
            />
            <FloatingInput
              id="edit-admin-phone"
              label="Phone"
              value={editDraft.phone}
              onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
            />
            {editError && (
              <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                <CircleAlert />
                <AlertTitle>Cannot save account</AlertTitle>
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
    </div>
  );
}

// ============================================================================
// Subsystem 2 — 100-Hour Config & Categories
// ============================================================================

const ROUNDING_RULES = [
  { value: "EXACT_MINUTES", label: "Exact minutes" },
  { value: "ROUND_DOWN_15", label: "Round down to 15 min" },
  { value: "ROUND_UP_15", label: "Round up to 15 min" },
  { value: "NEAREST_QUARTER", label: "Nearest quarter hour" },
] as const;

function ConfigPanel() {
  const [config, setConfig] = React.useState<Config | null>(null);
  const [hours, setHours] = React.useState("100");
  const [rounding, setRounding] = React.useState("EXACT_MINUTES");
  const [selfReg, setSelfReg] = React.useState(true);
  const [categoriesText, setCategoriesText] = React.useState("");
  const [hoursError, setHoursError] = React.useState("");
  const [categoriesError, setCategoriesError] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const { ok, body } = await jsonFetch<{ config: Config }>("/api/superadmin/config");
      if (!ok) {
        setError(body.error ?? "System configuration could not be loaded.");
        return;
      }
      setConfig(body.config);
      setHours(String(body.config.requiredPreOjtHours));
      setRounding(body.config.creditRoundingRule);
      setSelfReg(body.config.allowSelfRegistration);
      setCategoriesText(body.config.taskCategories.join(", "));
    })();
  }, []);

  const save = async () => {
    const parsedHours = Number(hours);
    const invalidHours = !Number.isInteger(parsedHours) || parsedHours < 1 || parsedHours > 1000;
    setHoursError(invalidHours ? "Enter a whole number of hours between 1 and 1000." : "");
    if (invalidHours) return;
    const categories = categoriesText
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    setCategoriesError(categories.length === 0 ? "At least one task category is required." : "");
    if (categories.length === 0) return;
    setBusy(true);
    setError(null);
    const { ok, body } = await jsonFetch<{ config: Config }>("/api/superadmin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requiredPreOjtHours: parsedHours,
        creditRoundingRule: rounding,
        allowSelfRegistration: selfReg,
        taskCategories: categories,
      }),
    });
    setBusy(false);
    if (!ok) {
      setError(body.error ?? "The configuration could not be saved.");
      return;
    }
    setConfig(body.config);
    setCategoriesText(body.config.taskCategories.join(", "));
    toast.success("100-hour configuration saved and audited.");
  };

  return (
    <div className="grid max-w-2xl gap-4">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        100-hour completion rules & task categories
      </h3>
      {error && (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CircleAlert />
          <AlertTitle>Configuration problem</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {config && (
        <p className="text-xs text-muted-foreground">
          Last updated <span className="tabular-ledger">{formatDateTime(config.updatedAt)}</span>
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="config-hours">Required Pre-OJT hours</Label>
        <Input
          id="config-hours"
          type="number"
          min={1}
          max={1000}
          value={hours}
          onChange={(e) => {
            setHours(e.target.value);
            setHoursError("");
          }}
          className="max-w-40 tabular-ledger"
          aria-invalid={Boolean(hoursError)}
          aria-describedby={hoursError ? "config-hours-error" : undefined}
        />
        {hoursError && <InlineError message={hoursError} id="config-hours-error" />}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="config-rounding">Credit rounding rule</Label>
        <Select items={ROUNDING_RULES} value={rounding} onValueChange={(value) => setRounding(value ?? "")}>
          <SelectTrigger id="config-rounding" className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROUNDING_RULES.map((rule) => (
              <SelectItem key={rule.value} value={rule.value}>
                {rule.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex min-h-9 max-w-xs items-center gap-2 text-sm">
        <Checkbox checked={selfReg} onCheckedChange={(checked) => setSelfReg(checked === true)} />
        Allow student self-registration
      </label>
      <div className="grid gap-1.5">
        <Label htmlFor="config-categories">Task categories (comma-separated)</Label>
        <Textarea
          id="config-categories"
          value={categoriesText}
          onChange={(e) => setCategoriesText(e.target.value)}
          className="min-h-24"
          placeholder="PC Assembly, OS Configuration, Network Cabling"
          aria-invalid={Boolean(categoriesError)}
          aria-describedby={categoriesError ? "config-categories-error" : undefined}
        />
        {categoriesError && <InlineError message={categoriesError} id="config-categories-error" />}
      </div>
      <div>
        <Button type="button" onClick={() => void save()} disabled={busy}>
          <ShieldCheck className="size-4" />
          {busy ? "Saving…" : "Save configuration"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Subsystem 3 — Batch & Schedule Inspection (read-only executive view)
// ============================================================================

function BatchesPanel() {
  const [rows, setRows] = React.useState<BatchRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      const { ok, body } = await jsonFetch<{ data: BatchRow[] }>("/api/admin/batches?page=1&pageSize=50");
      if (!ok) {
        setError(body.error ?? "Batches could not be loaded.");
        return;
      }
      setRows(body.data ?? []);
    })();
  }, []);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <Layers className="size-4 text-muted-foreground" />
        Batch & schedule inspection (all batches, A–Z roster of record)
      </h3>
      {error && (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CircleAlert />
          <AlertTitle>Batches unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="min-w-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Academic year</TableHead>
              <TableHead>Coordinator</TableHead>
              <TableHead>Students</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
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
                <TableCell>
                  <StatusBadge status={batch.isActive ? "ACTIVE" : "DEACTIVATED"} />
                </TableCell>
                <TableCell className="tabular-ledger">{formatDateTime(batch.createdAt)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No batches exist yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Scheduling edits remain with the coordinating admin in Batch & Schedule Management; this console view is
        read-only.
      </p>
    </div>
  );
}

// ============================================================================
// Subsystem 4 — Flagged Attendance & Escalation Rulings
// ============================================================================

const RULING_STATUSES = ["OPEN", "APPROVED", "UPHELD", "DISMISSED"] as const;
const RULING_STATUS_LABELS = {
  OPEN: "Open cases",
  APPROVED: "Approved",
  UPHELD: "Upheld",
  DISMISSED: "Dismissed",
} as const;

function EscalationsPanel() {
  const [rows, setRows] = React.useState<EscalationRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [total, setTotal] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<string>("OPEN");
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [ruling, setRuling] = React.useState<EscalationRow | null>(null);
  const [rulingStatus, setRulingStatus] = React.useState<string>("APPROVED");
  const [rulingNote, setRulingNote] = React.useState("");
  const [rulingNoteError, setRulingNoteError] = React.useState("");
  const [rulingError, setRulingError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async (targetPage: number, targetSize: number) => {
    const params = new URLSearchParams({ page: String(targetPage), pageSize: String(targetSize) });
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("sourceType", sourceFilter);
    const { ok, body } = await jsonFetch<{ data: EscalationRow[]; total: number }>(
      `/api/superadmin/escalations?${params}`,
    );
    if (!ok) {
      toast.error(body.error ?? "Escalation cases could not be loaded.");
      return;
    }
    setRows(body.data ?? []);
    setTotal(body.total ?? 0);
  }, [statusFilter, sourceFilter]);

  React.useEffect(() => {
    const loadData = async () => {
      void load(page, pageSize);
    };
    loadData();
  }, [load, page, pageSize]);

  const submitRuling = async () => {
    if (!ruling) return;
    if (rulingNote.trim().length === 0) {
      setRulingNoteError("A written ruling note is mandatory.");
      return;
    }
    setRulingNoteError("");
    setBusy(true);
    setRulingError(null);
    const { ok, body } = await jsonFetch<{ escalation: EscalationRow }>("/api/superadmin/escalations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ escalationId: ruling.id, status: rulingStatus, rulingNote: rulingNote.trim() }),
    });
    setBusy(false);
    if (!ok) {
      setRulingError(body.error ?? "The ruling could not be recorded.");
      return;
    }
    toast.success(`Escalation ruled ${rulingStatus.toLowerCase()} and propagated to the linked record.`);
    setRuling(null);
    setRulingNote("");
    void load(page, pageSize);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Gavel className="size-4 text-muted-foreground" />
          Flagged attendance & escalation rulings
        </h3>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-xs text-muted-foreground [&>span]:min-w-0 [&>span]:max-w-full [&_input]:min-w-0 [&_input]:max-w-full [&_select]:min-w-0 [&_select]:max-w-full">
          <Select
            items={RULING_STATUSES.map((status) => ({ value: status, label: RULING_STATUS_LABELS[status] }))}
            value={statusFilter}
            onValueChange={(value) => {
              setPage(1);
              setStatusFilter(value ?? "");
            }}
          >
            <SelectTrigger size="sm" className="w-36" aria-label="Filter by ruling status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULING_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {RULING_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={[
              { value: "ALL", label: "All sources" },
              { value: "ATTENDANCE", label: "Attendance" },
              { value: "TASK_REVIEW", label: "Task review" },
            ]}
            value={sourceFilter || "ALL"}
            onValueChange={(value) => {
              setPage(1);
              setSourceFilter(value === "ALL" ? "" : (value ?? ""));
            }}
          >
            <SelectTrigger size="sm" className="w-36" aria-label="Filter by source">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All sources</SelectItem>
              <SelectItem value="ATTENDANCE">Attendance</SelectItem>
              <SelectItem value="TASK_REVIEW">Task review</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Raised by</TableHead>
              <TableHead>Filed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <p className="font-medium">{row.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.sourceType === "ATTENDANCE" ? "Attendance escalation" : "Task review escalation"}
                  </p>
                </TableCell>
                <TableCell>
                  <p>{row.student.fullName}</p>
                  <p className="font-mono text-xs tabular-ledger text-muted-foreground">{row.student.studentIdNo ?? "—"}</p>
                </TableCell>
                <TableCell>{row.raisedBy?.fullName ?? "—"}</TableCell>
                <TableCell className="tabular-ledger">{formatDateTime(row.createdAt)}</TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    {row.status === "OPEN" ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setRuling(row);
                          setRulingStatus("APPROVED");
                          setRulingNote("");
                          setRulingError(null);
                        }}
                      >
                        <Gavel className="size-4" />
                        Rule on case
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {row.rulingNote ? `“${row.rulingNote.slice(0, 48)}${row.rulingNote.length > 48 ? "…" : ""}”` : "—"}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  No escalation cases matched the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="min-w-0 max-w-full [&_div]:flex-wrap [&_button]:max-w-full [&_button]:whitespace-normal">
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

      <Dialog open={ruling !== null} onOpenChange={(open) => !open && setRuling(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Escalation ruling</DialogTitle>
            <DialogDescription>
              The ruling propagates to the flagged attendance log or task assignment and notifies the student
              and the raising coordinator.
            </DialogDescription>
          </DialogHeader>
          {ruling && (
            <div className="grid gap-3">
              <div className="grid gap-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{ruling.summary}</p>
                <p className="text-xs text-muted-foreground">{ruling.policyDetails}</p>
                <p className="text-xs text-muted-foreground">
                  Student: {ruling.student.fullName} ({ruling.student.studentIdNo ?? "—"})
                </p>
              </div>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Ruling</legend>
                {(["APPROVED", "UPHELD", "DISMISSED"] as const).map((option) => (
                  <label key={option} className="flex min-h-9 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="ruling-status"
                      value={option}
                      checked={rulingStatus === option}
                      onChange={() => setRulingStatus(option)}
                    />
                    {option === "APPROVED"
                      ? "Approved — student favour, credited hours restored"
                      : option === "UPHELD"
                        ? "Upheld — original irregularity stands with credit adjustment"
                        : "Dismissed — coordinator decision confirmed"}
                  </label>
                ))}
              </fieldset>
              <div className="grid gap-1.5">
                <Label htmlFor="ruling-note">Ruling note (mandatory)</Label>
                <Textarea
                  id="ruling-note"
                  value={rulingNote}
                  onChange={(e) => {
                    setRulingNote(e.target.value);
                    setRulingNoteError("");
                  }}
                  placeholder="Written basis for this ruling"
                  className="min-h-24"
                  aria-invalid={Boolean(rulingNoteError)}
                  aria-describedby={rulingNoteError ? "ruling-note-error" : undefined}
                />
                {rulingNoteError && <InlineError message={rulingNoteError} id="ruling-note-error" />}
              </div>
              {rulingError && (
                <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                  <CircleAlert />
                  <AlertTitle>Cannot record ruling</AlertTitle>
                  <AlertDescription>{rulingError}</AlertDescription>
                </Alert>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setRuling(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void submitRuling()} disabled={busy}>
                  <Gavel className="size-4" />
                  {busy ? "Recording…" : "Record ruling"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Subsystem 5 — Full System Audit Search & Export
// ============================================================================

function AuditPanel() {
  const [rows, setRows] = React.useState<AuditRow[]>([]);
  const [entityTypes, setEntityTypes] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [entityFilter, setEntityFilter] = React.useState("");
  const [exporting, setExporting] = React.useState(false);

  const load = React.useCallback(async (targetPage: number, targetSize: number) => {
    const params = new URLSearchParams({ page: String(targetPage), pageSize: String(targetSize) });
    if (search.trim()) params.set("search", search.trim());
    if (entityFilter) params.set("entityType", entityFilter);
    const { ok, body } = await jsonFetch<{
      data: AuditRow[];
      total: number;
      entityTypes: string[];
    }>(`/api/superadmin/audit?${params}`);
    if (!ok) {
      toast.error(body.error ?? "The audit log could not be loaded.");
      return;
    }
    setRows(body.data ?? []);
    setTotal(body.total ?? 0);
    if (body.entityTypes) setEntityTypes(body.entityTypes);
  }, [search, entityFilter]);

  React.useEffect(() => {
    const loadData = async () => {
      void load(page, pageSize);
    };
    loadData();
  }, [load, page, pageSize]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const collected: AuditRow[] = [];
      const maxPages = 20;
      for (let p = 1; p <= maxPages; p++) {
        const params = new URLSearchParams({ page: String(p), pageSize: "50" });
        if (search.trim()) params.set("search", search.trim());
        if (entityFilter) params.set("entityType", entityFilter);
        const { ok, body } = await jsonFetch<{ data: AuditRow[]; total: number }>(`/api/superadmin/audit?${params}`);
        if (!ok || !body.data || body.data.length === 0) break;
        collected.push(...body.data);
        if (collected.length >= body.total) break;
      }
      if (collected.length === 0) {
        toast.error("There are no audit rows to export with the current filters.");
        return;
      }
      const flat = collected.map((row) => ({
        createdAt: row.createdAt,
        actor: row.actor?.fullName ?? "",
        actorRole: row.actor?.role ?? "",
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        details: JSON.stringify(row.details ?? {}),
      }));
      const { generateCsv } = await import("@/lib/reports-export");
      const csv = generateCsv(flat);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `techtracker-audit-log.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Audit log exported — ${flat.length} rows.`);
    } catch {
      toast.error("The audit export could not be generated.");
    } finally {
      setExporting(false);
    }
  };

  const entityOptions = entityTypes.map((type) => ({
    value: type,
    label: type.toLowerCase().replace(/_/g, " "),
  }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <ScrollText className="size-4 text-muted-foreground" />
          Full system audit trail
        </h3>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-xs text-muted-foreground [&>span]:min-w-0 [&>span]:max-w-full [&_input]:min-w-0 [&_input]:max-w-full [&_select]:min-w-0 [&_select]:max-w-full">
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2" />
            <input
              aria-label="Search audit log"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search action, entity, or actor..."
              className="h-9 rounded-md border border-input bg-background pl-7 pr-2 text-xs"
            />
          </span>
          <Select
            items={[{ value: "ALL", label: "All entity types" }, ...entityOptions]}
            value={entityFilter || "ALL"}
            onValueChange={(value) => {
              setPage(1);
              setEntityFilter(value === "ALL" ? "" : (value ?? ""));
            }}
          >
            <SelectTrigger size="sm" className="w-44" aria-label="Filter by entity type">
              <SelectValue placeholder="All entity types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All entity types</SelectItem>
              {entityOptions.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={() => void exportCsv()} disabled={exporting}>
            <FileDown className="size-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Entity ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="tabular-ledger">{formatDateTime(row.createdAt)}</TableCell>
                <TableCell>
                  <p>{row.actor?.fullName ?? "System"}</p>
                  <p className="text-xs text-muted-foreground">{row.actor?.role ?? "—"}</p>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.action}</TableCell>
                <TableCell>{row.entityType}</TableCell>
                <TableCell className="font-mono text-xs">{row.entityId}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  No audit entries matched the search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="min-w-0 max-w-full [&_div]:flex-wrap [&_button]:max-w-full [&_button]:whitespace-normal">
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
  );
}

// ============================================================================
// Subsystem 6 — Lab Rooms & Units A–Z Configuration
// ============================================================================

function parseUnitLines(text: string): { unitCode: string; specs?: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [code, ...rest] = line.split("::");
      const spec = rest.join("::").trim();
      return { unitCode: code.trim(), ...(spec ? { specs: spec } : {}) };
    });
}

function RoomsPanel() {
  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState({ name: "", building: "", capacity: "40", unitLines: "" });
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = React.useState({ name: "", building: "", capacity: "" });
  const [editFieldErrors, setEditFieldErrors] = React.useState({ name: "", capacity: "" });
  const [unitCodeError, setUnitCodeError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [editingRoom, setEditingRoom] = React.useState<Room | null>(null);
  const [editDraft, setEditDraft] = React.useState({ name: "", building: "", capacity: "40", isActive: true, unitLines: "" });
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editUnit, setEditUnit] = React.useState<{ room: Room; unit: RoomUnit } | null>(null);
  const [unitDraft, setUnitDraft] = React.useState({ unitCode: "", specs: "", condition: "FUNCTIONING" });
  const [unitError, setUnitError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const { ok, body } = await jsonFetch<{ rooms: Room[] }>("/api/superadmin/rooms");
    if (!ok) {
      setError(body.error ?? "Lab rooms could not be loaded.");
      return;
    }
    setRooms(body.rooms ?? []);
  }, []);

  React.useEffect(() => {
    const loadData = async () => {
      void load();
    };
    loadData();
  }, [load]);

  const createRoom = async () => {
    const fieldErrors = {
      name: createDraft.name.trim().length < 2 ? "Room name must be at least 2 characters." : "",
      building: createDraft.building.trim() ? "" : "Building is required.",
      capacity: "",
    };
    const capacity = Number(createDraft.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) fieldErrors.capacity = "Capacity must be a positive whole number.";
    setCreateFieldErrors(fieldErrors);
    if (fieldErrors.name || fieldErrors.building || fieldErrors.capacity) return;
    const units = parseUnitLines(createDraft.unitLines);
    setBusy(true);
    setCreateError(null);
    const { ok, body } = await jsonFetch<{ room: Room }>("/api/superadmin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createDraft.name.trim(),
        building: createDraft.building.trim(),
        capacity,
        units: units.length > 0 ? units : undefined,
      }),
    });
    setBusy(false);
    if (!ok) {
      setCreateError(body.error ?? "The room could not be created.");
      return;
    }
    toast.success(`Lab room ${createDraft.name.trim()} created with ${units.length || "no"} unit(s).`);
    setCreateFieldErrors({ name: "", building: "", capacity: "" });
    setCreateOpen(false);
    setCreateDraft({ name: "", building: "", capacity: "40", unitLines: "" });
    void load();
  };

  const saveRoom = async () => {
    if (!editingRoom) return;
    const fieldErrors = {
      name: editDraft.name.trim().length < 2 ? "Room name must be at least 2 characters." : "",
      capacity: "",
    };
    const capacity = Number(editDraft.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) fieldErrors.capacity = "Capacity must be a positive whole number.";
    setEditFieldErrors(fieldErrors);
    if (fieldErrors.name || fieldErrors.capacity) return;
    setBusy(true);
    setEditError(null);
    const newUnits = parseUnitLines(editDraft.unitLines);
    const { ok, body } = await jsonFetch<{ room: Room }>("/api/superadmin/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: editingRoom.id,
        name: editDraft.name.trim(),
        building: editDraft.building.trim(),
        capacity,
        isActive: editDraft.isActive,
        ...(newUnits.length > 0 ? { newUnits } : {}),
      }),
    });
    setBusy(false);
    if (!ok) {
      setEditError(body.error ?? "The room could not be updated.");
      return;
    }
    toast.success(`Lab room ${editDraft.name.trim()} saved.`);
    setEditFieldErrors({ name: "", capacity: "" });
    setEditingRoom(null);
    void load();
  };

  const saveUnit = async () => {
    if (!editUnit) return;
    if (!unitDraft.unitCode.trim()) {
      setUnitCodeError("Unit code is required.");
      return;
    }
    setUnitCodeError("");
    setBusy(true);
    setUnitError(null);
    const { ok, body } = await jsonFetch<{ unit: RoomUnit }>("/api/superadmin/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitId: editUnit.unit.id,
        unitCode: unitDraft.unitCode.trim(),
        specs: unitDraft.specs.trim() || undefined,
        condition: unitDraft.condition,
      }),
    });
    setBusy(false);
    if (!ok) {
      setUnitError(body.error ?? "The unit could not be updated.");
      return;
    }
    toast.success(`Unit ${unitDraft.unitCode.trim()} configuration saved.`);
    setUnitCodeError("");
    setEditUnit(null);
    void load();
  };

  const conditionCounts = (room: Room) => ({
    functioning: room.units.filter((u) => u.condition === "FUNCTIONING").length,
    flagged: room.units.filter((u) => u.condition !== "FUNCTIONING").length,
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Laptop className="size-4 text-muted-foreground" />
          Lab rooms & units (A–Z)
        </h3>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New Room
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CircleAlert />
          <AlertTitle>Rooms unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 min-w-0 gap-3">
        {rooms.map((room) => {
          const counts = conditionCounts(room);
          return (
            <article key={room.id} className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{room.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {room.building} · capacity <span className="tabular-ledger">{room.capacity}</span> ·{" "}
                    <span className="tabular-ledger">{room.units.length}</span> units
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={room.isActive ? "ACTIVE" : "DEACTIVATED"} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingRoom(room);
                      setEditDraft({
                        name: room.name,
                        building: room.building,
                        capacity: String(room.capacity),
                        isActive: room.isActive,
                        unitLines: "",
                      });
                      setEditError(null);
                    }}
                  >
                    <Pencil className="size-4" />
                    Configure
                  </Button>
                </div>
              </div>
              {room.units.length > 0 && (
                <div className="mt-3 min-w-0 max-w-full overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Unit code</TableHead>
                        <TableHead>Specs</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead>Last inspected</TableHead>
                        <TableHead className="text-right">Edit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {room.units.map((unit) => (
                        <TableRow key={unit.id}>
                          <TableCell className="font-mono text-xs tabular-ledger">{unit.unitCode}</TableCell>
                          <TableCell className="max-w-56 truncate text-xs">{unit.specs}</TableCell>
                          <TableCell>
                            <StatusBadge status={unit.condition} />
                          </TableCell>
                          <TableCell className="text-xs tabular-ledger">{formatDateTime(unit.lastInspectedAt)}</TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditUnit({ room, unit });
                                  setUnitDraft({ unitCode: unit.unitCode, specs: unit.specs, condition: unit.condition });
                                  setUnitError(null);
                                }}
                              >
                                <Pencil className="size-4" />
                                Edit
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="tabular-ledger">{counts.functioning}</span> functioning ·{" "}
                <span className="tabular-ledger">{counts.flagged}</span> flagged for maintenance or repair
              </p>
            </article>
          );
        })}
        {rooms.length === 0 && (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-xs">
            No lab rooms configured yet.
          </p>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New lab room</DialogTitle>
            <DialogDescription>
              Units are created A–Z automatically. Enter one unit code per line, optionally “CODE :: specs”.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <FloatingInput
              id="room-name"
              label="Room name"
              value={createDraft.name}
              onChange={(e) => setCreateDraft((d) => ({ ...d, name: e.target.value }))}
              error={createFieldErrors.name}
            />
            <FloatingInput
              id="room-building"
              label="Building"
              value={createDraft.building}
              onChange={(e) => setCreateDraft((d) => ({ ...d, building: e.target.value }))}
              error={createFieldErrors.building}
            />
            <FloatingInput
              id="room-capacity"
              label="Capacity"
              type="number"
              min={1}
              value={createDraft.capacity}
              onChange={(e) => setCreateDraft((d) => ({ ...d, capacity: e.target.value }))}
              className="tabular-ledger"
              error={createFieldErrors.capacity}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="room-units">Unit codes (one per line)</Label>
              <Textarea
                id="room-units"
                value={createDraft.unitLines}
                onChange={(e) => setCreateDraft((d) => ({ ...d, unitLines: e.target.value }))}
                className="min-h-28 font-mono text-xs"
                placeholder={"PC-01 :: Core i5, 16GB\nPC-02"}
              />
            </div>
            {createError && (
              <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                <CircleAlert />
                <AlertTitle>Cannot create room</AlertTitle>
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void createRoom()} disabled={busy}>
                {busy ? "Creating…" : "Create room"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editingRoom !== null} onOpenChange={(open) => !open && setEditingRoom(null)}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure lab room</DialogTitle>
            <DialogDescription>
              Update room identity, activation, or add more units (one per line, optional “CODE :: specs”).
            </DialogDescription>
          </DialogHeader>
          {editingRoom && (
            <div className="grid gap-3">
              <FloatingInput
                id="edit-room-name"
                label="Room name"
                value={editDraft.name}
                onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                error={editFieldErrors.name}
              />
              <FloatingInput
                id="edit-room-building"
                label="Building"
                value={editDraft.building}
                onChange={(e) => setEditDraft((d) => ({ ...d, building: e.target.value }))}
              />
              <FloatingInput
                id="edit-room-capacity"
                label="Capacity"
                type="number"
                min={1}
                value={editDraft.capacity}
                onChange={(e) => setEditDraft((d) => ({ ...d, capacity: e.target.value }))}
                className="tabular-ledger"
                error={editFieldErrors.capacity}
              />
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <Checkbox checked={editDraft.isActive} onCheckedChange={(checked) => setEditDraft((d) => ({ ...d, isActive: checked === true }))} />
                Room is active for inspection
              </label>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-room-units">Add units (one per line)</Label>
                <Textarea
                  id="edit-room-units"
                  value={editDraft.unitLines}
                  onChange={(e) => setEditDraft((d) => ({ ...d, unitLines: e.target.value }))}
                  className="min-h-20 font-mono text-xs"
                  placeholder={"PC-41 :: Core i7, 16GB"}
                />
              </div>
              {editError && (
                <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                  <CircleAlert />
                  <AlertTitle>Cannot save room</AlertTitle>
                  <AlertDescription>{editError}</AlertDescription>
                </Alert>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingRoom(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void saveRoom()} disabled={busy}>
                  {busy ? "Saving…" : "Save room"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editUnit !== null} onOpenChange={(open) => !open && setEditUnit(null)}>
        <DialogContent className="sm:max-w-sm max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure unit</DialogTitle>
            <DialogDescription>
              {editUnit ? `${editUnit.room.name} · ${editUnit.unit.unitCode}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <FloatingInput
              id="unit-code"
              label="Unit code"
              value={unitDraft.unitCode}
              onChange={(e) => setUnitDraft((d) => ({ ...d, unitCode: e.target.value }))}
              className="tabular-ledger"
              error={unitCodeError}
            />
            <FloatingInput
              id="unit-specs"
              label="Specs"
              value={unitDraft.specs}
              onChange={(e) => setUnitDraft((d) => ({ ...d, specs: e.target.value }))}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="unit-condition">Condition</Label>
              <Select
                items={[
                  { value: "FUNCTIONING", label: "Functioning" },
                  { value: "NEEDS_MAINTENANCE", label: "Needs Maintenance" },
                  { value: "NEEDS_REPAIR", label: "Needs Repair" },
                ]}
                value={unitDraft.condition}
                onValueChange={(value) => setUnitDraft((d) => ({ ...d, condition: value ?? "" }))}
              >
                <SelectTrigger id="unit-condition" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FUNCTIONING">Functioning</SelectItem>
                  <SelectItem value="NEEDS_MAINTENANCE">Needs Maintenance</SelectItem>
                  <SelectItem value="NEEDS_REPAIR">Needs Repair</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {unitError && (
              <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                <CircleAlert />
                <AlertTitle>Cannot save unit</AlertTitle>
                <AlertDescription>{unitError}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditUnit(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveUnit()} disabled={busy}>
                {busy ? "Saving…" : "Save unit"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Subsystem 7 — System Alerts (NO Chat)
// ============================================================================

function AlertsPanel({ overview }: { overview: Overview | null }) {
  const openEscalations =
    overview?.escalationsByStatus.find((e) => e.status === "OPEN")?._count.id ?? null;
  return (
    <div className="grid max-w-2xl gap-4">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <BellRing className="size-4 text-muted-foreground" />
        System alerts
      </h3>
      <Alert className="border-success-surface/40 bg-success-surface/10 text-success">
        <MessageSquareOff />
        <AlertTitle>Alerts only — no chat access</AlertTitle>
        <AlertDescription>
          Per the project Charter (Sections 160 and 199), the SuperAdmin account receives system alerts and
          escalation cases only. Messaging is reserved for coordinators and students.
        </AlertDescription>
      </Alert>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xs text-muted-foreground">Unread alert notifications</p>
          <p className="text-2xl font-semibold tabular-ledger">{overview?.unreadNotifications ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xs text-muted-foreground">Open escalations</p>
          <p className="text-2xl font-semibold tabular-ledger">{openEscalations ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <p className="text-xs text-muted-foreground">Inspections on record</p>
          <p className="text-2xl font-semibold tabular-ledger">{overview?.inspectionCount ?? "—"}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/notifications" className={buttonVariants()}>
          <BellRing className="size-4" />
          Open notifications inbox
        </Link>
        <Link href="/admin/attendance" className={buttonVariants({ variant: "outline" })}>
          <ListChecks className="size-4" />
          Flagged attendance queue
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// Page shell
// ============================================================================

function SuperAdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = React.useState<{ id: string; fullName: string; email: string; role: Role } | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const qTab = searchParams.get("tab");
  const tab: TabValue = qTab && TAB_META.some((t) => t.value === qTab) ? (qTab as TabValue) : "admins";

  React.useEffect(() => {
    void (async () => {
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
        if (meBody.user.role === "SUPERADMIN") {
          const { ok, body } = await jsonFetch<Overview>("/api/superadmin/overview");
          if (ok) setOverview(body);
        }
      } catch {
        setError("TechTracker could not reach the server. Check your connection and retry.");
      }
    })();
  }, []);

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading SuperAdmin console…</p>
      </main>
    );
  }

  if (user.role !== "SUPERADMIN") {
    return (
      <AppShell user={user} unreadNotifications={unread} title="SuperAdmin Console">
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CircleAlert />
          <AlertTitle>Executive area</AlertTitle>
          <AlertDescription>The SuperAdmin console is limited to the system owner account.</AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  const roleCounts = (role: Role) => overview?.usersByRole.find((r) => r.role === role)?._count.id ?? null;

  return (
    <AppShell
      user={user}
      unreadNotifications={unread}
      title="SuperAdmin Console"
      subtitle="Executive oversight — accounts, rules, escalations, audit, and lab configuration"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <CircleAlert />
            <AlertTitle>Connection problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Executive summary */}
        <section aria-label="Executive summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Coordinators", value: roleCounts("ADMIN"), icon: UserCog },
            { label: "Students", value: roleCounts("STUDENT"), icon: Users },
            { label: "Batches", value: overview?.batchCount ?? null, icon: Layers },
            { label: "Inspections", value: overview?.inspectionCount ?? null, icon: Laptop },
            { label: "Unread alerts", value: overview?.unreadNotifications ?? null, icon: BellRing },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="grid gap-1.5 rounded-xl border border-border bg-card p-5 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  {card.label}
                </div>
                <p className="font-mono text-3xl font-bold tracking-tight tabular-ledger">{card.value ?? "—"}</p>
              </article>
            );
          })}
        </section>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = value as TabValue;
            router.replace(next === "admins" ? "/superadmin" : `/superadmin?tab=${next}`, { scroll: false });
          }}
        >
          <TabsList className="flex w-full flex-wrap justify-start">
            {TAB_META.map((meta) => {
              const Icon = meta.icon;
              return (
                <TabsTrigger key={meta.value} value={meta.value} className="px-3">
                  <Icon className="size-4" />
                  {meta.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <section aria-label="Subsystem workspace" className="rounded-xl border border-border bg-card p-5 shadow-xs lg:p-6">
          {tab === "admins" && <AdminsPanel />}
          {tab === "config" && <ConfigPanel />}
          {tab === "batches" && <BatchesPanel />}
          {tab === "escalations" && <EscalationsPanel />}
          {tab === "audit" && <AuditPanel />}
          {tab === "rooms" && <RoomsPanel />}
          {tab === "alerts" && <AlertsPanel overview={overview} />}
        </section>
      </div>
    </AppShell>
  );
}

export default function SuperAdminPage() {
  return (
    <React.Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">Loading SuperAdmin console…</p>
        </main>
      }
    >
      <SuperAdminContent />
    </React.Suspense>
  );
}
