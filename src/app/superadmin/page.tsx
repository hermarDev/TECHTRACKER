"use client";

import * as React from "react";
import Link from "next/link";
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
import type { Role } from "@prisma/client";

import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { PasswordInput } from "@/components/shell/PasswordInput";
import { Button } from "@/components/ui/button";
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

const PAGE_SIZES = [15, 25, 50] as const;

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
  const [createBusy, setCreateBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminRow | null>(null);
  const [editDraft, setEditDraft] = React.useState({ fullName: "", email: "", phone: "" });
  const [editError, setEditError] = React.useState<string | null>(null);
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
    let cancelled = false;
    const loadData = async () => {
      void load(page, pageSize);
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [load, page, pageSize]);

  const createAdmin = async () => {
    if (createDraft.fullName.trim().length < 2) return setCreateError("Full name is required.");
    if (!createDraft.email.trim()) return setCreateError("Email address is required.");
    if (createDraft.password.length < 8) return setCreateError("Password must be at least 8 characters.");
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
    setCreateOpen(false);
    setCreateDraft({ fullName: "", email: "", password: "", phone: "" });
    void load(page, pageSize);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editDraft.fullName.trim().length < 2) return setEditError("Full name is required.");
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
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <UserCog className="size-4 text-muted-foreground" />
          Coordinator (Admin) accounts
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
            <input
              aria-label="Search admins"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Name or email —"
              className="h-9 rounded-md border border-input bg-background pl-7 pr-2 text-xs"
            />
          </span>
          <select
            aria-label="Filter admin status"
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value);
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DEACTIVATED">Deactivated</option>
          </select>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            New Admin
          </Button>
        </div>
      </div>

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
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void toggleStatus(admin)}>
                    <Power className="size-3.5" />
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create admin account</DialogTitle>
            <DialogDescription>Coordinator accounts sign in with the credentials defined here.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="admin-fullname">Full name</Label>
              <Input
                id="admin-fullname"
                value={createDraft.fullName}
                onChange={(e) => setCreateDraft((d) => ({ ...d, fullName: e.target.value }))}
                placeholder="Official staff name —"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={createDraft.email}
                onChange={(e) => setCreateDraft((d) => ({ ...d, email: e.target.value }))}
                placeholder="name@aclc-mandaue.edu.ph"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="admin-password">Temporary password</Label>
              <PasswordInput
                id="admin-password"
                value={createDraft.password}
                onChange={(e) => setCreateDraft((d) => ({ ...d, password: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="admin-phone">Phone (optional)</Label>
              <Input
                id="admin-phone"
                value={createDraft.phone}
                onChange={(e) => setCreateDraft((d) => ({ ...d, phone: e.target.value }))}
                placeholder="Contact number —"
              />
            </div>
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
            <div className="grid gap-1.5">
              <Label htmlFor="edit-admin-name">Full name</Label>
              <Input
                id="edit-admin-name"
                value={editDraft.fullName}
                onChange={(e) => setEditDraft((d) => ({ ...d, fullName: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-admin-email">Email</Label>
              <Input
                id="edit-admin-email"
                type="email"
                value={editDraft.email}
                onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-admin-phone">Phone</Label>
              <Input
                id="edit-admin-phone"
                value={editDraft.phone}
                onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
              />
            </div>
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
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      setError("Required Pre-OJT hours must be a positive number.");
      return;
    }
    const categories = categoriesText
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (categories.length === 0) {
      setError("At least one task category is required.");
      return;
    }
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
          onChange={(e) => setHours(e.target.value)}
          className="max-w-40 tabular-ledger"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="config-rounding">Credit rounding rule</Label>
        <select
          id="config-rounding"
          value={rounding}
          onChange={(e) => setRounding(e.target.value)}
          className="h-10 max-w-xs rounded-md border border-input bg-background px-2 text-sm"
        >
          {ROUNDING_RULES.map((rule) => (
            <option key={rule.value} value={rule.value}>
              {rule.label}
            </option>
          ))}
        </select>
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
          placeholder="PC Assembly, OS Configuration, Network Cabling —"
        />
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
    <div className="grid gap-4">
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
    let cancelled = false;
    const loadData = async () => {
      void load(page, pageSize);
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [load, page, pageSize]);

  const submitRuling = async () => {
    if (!ruling) return;
    if (rulingNote.trim().length === 0) {
      setRulingError("A written ruling note is mandatory.");
      return;
    }
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
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Gavel className="size-4 text-muted-foreground" />
          Flagged attendance & escalation rulings
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <select
            aria-label="Filter by ruling status"
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value);
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            {RULING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "OPEN" ? "Open cases" : s === "APPROVED" ? "Approved" : s === "UPHELD" ? "Upheld" : "Dismissed"}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by source"
            value={sourceFilter}
            onChange={(e) => {
              setPage(1);
              setSourceFilter(e.target.value);
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">All sources</option>
            <option value="ATTENDANCE">Attendance</option>
            <option value="TASK_REVIEW">Task review</option>
          </select>
        </div>
      </div>

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
                <p className="text-xs tabular-ledger text-muted-foreground">{row.student.studentIdNo ?? "—"}</p>
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
                      <Gavel className="size-3.5" />
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
                  onChange={(e) => setRulingNote(e.target.value)}
                  placeholder="Written basis for this ruling —"
                  className="min-h-24"
                />
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
    let cancelled = false;
    const loadData = async () => {
      void load(page, pageSize);
    };
    loadData();
    return () => {
      cancelled = true;
    };
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <ScrollText className="size-4 text-muted-foreground" />
          Full system audit trail
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
            <input
              aria-label="Search audit log"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Action, entity, actor —"
              className="h-9 rounded-md border border-input bg-background pl-7 pr-2 text-xs"
            />
          </span>
          <select
            aria-label="Filter by entity type"
            value={entityFilter}
            onChange={(e) => {
              setPage(1);
              setEntityFilter(e.target.value);
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">All entity types</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => void exportCsv()} disabled={exporting}>
            <FileDown className="size-3.5" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

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
    let cancelled = false;
    const loadData = async () => {
      void load();
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const createRoom = async () => {
    if (createDraft.name.trim().length < 2) return setCreateError("Room name is required.");
    if (!createDraft.building.trim()) return setCreateError("Building is required.");
    const capacity = Number(createDraft.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) return setCreateError("Capacity must be a positive number.");
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
    setCreateOpen(false);
    setCreateDraft({ name: "", building: "", capacity: "40", unitLines: "" });
    void load();
  };

  const saveRoom = async () => {
    if (!editingRoom) return;
    if (editDraft.name.trim().length < 2) return setEditError("Room name is required.");
    const capacity = Number(editDraft.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) return setEditError("Capacity must be a positive number.");
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
    setEditingRoom(null);
    void load();
  };

  const saveUnit = async () => {
    if (!editUnit) return;
    if (unitDraft.unitCode.trim().length < 1) return setUnitError("Unit code is required.");
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
    setEditUnit(null);
    void load();
  };

  const conditionCounts = (room: Room) => ({
    functioning: room.units.filter((u) => u.condition === "FUNCTIONING").length,
    flagged: room.units.filter((u) => u.condition !== "FUNCTIONING").length,
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Laptop className="size-4 text-muted-foreground" />
          Lab rooms & units (A–Z)
        </h3>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" />
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

      <div className="grid gap-3">
        {rooms.map((room) => {
          const counts = conditionCounts(room);
          return (
            <article key={room.id} className="rounded-xl border border-border bg-card p-4">
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
                    <Pencil className="size-3.5" />
                    Configure
                  </Button>
                </div>
              </div>
              {room.units.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-border">
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
                                <Pencil className="size-3.5" />
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
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
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
            <div className="grid gap-1.5">
              <Label htmlFor="room-name">Room name</Label>
              <Input
                id="room-name"
                value={createDraft.name}
                onChange={(e) => setCreateDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g., Computer Lab 3"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="room-building">Building</Label>
              <Input
                id="room-building"
                value={createDraft.building}
                onChange={(e) => setCreateDraft((d) => ({ ...d, building: e.target.value }))}
                placeholder="Campus building —"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="room-capacity">Capacity</Label>
              <Input
                id="room-capacity"
                type="number"
                min={1}
                value={createDraft.capacity}
                onChange={(e) => setCreateDraft((d) => ({ ...d, capacity: e.target.value }))}
                className="tabular-ledger"
              />
            </div>
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
              <div className="grid gap-1.5">
                <Label htmlFor="edit-room-name">Room name</Label>
                <Input
                  id="edit-room-name"
                  value={editDraft.name}
                  onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-room-building">Building</Label>
                <Input
                  id="edit-room-building"
                  value={editDraft.building}
                  onChange={(e) => setEditDraft((d) => ({ ...d, building: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-room-capacity">Capacity</Label>
                <Input
                  id="edit-room-capacity"
                  type="number"
                  min={1}
                  value={editDraft.capacity}
                  onChange={(e) => setEditDraft((d) => ({ ...d, capacity: e.target.value }))}
                  className="tabular-ledger"
                />
              </div>
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
            <div className="grid gap-1.5">
              <Label htmlFor="unit-code">Unit code</Label>
              <Input
                id="unit-code"
                value={unitDraft.unitCode}
                onChange={(e) => setUnitDraft((d) => ({ ...d, unitCode: e.target.value }))}
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="unit-specs">Specs</Label>
              <Input
                id="unit-specs"
                value={unitDraft.specs}
                onChange={(e) => setUnitDraft((d) => ({ ...d, specs: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="unit-condition">Condition</Label>
              <select
                id="unit-condition"
                value={unitDraft.condition}
                onChange={(e) => setUnitDraft((d) => ({ ...d, condition: e.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="FUNCTIONING">Functioning</option>
                <option value="NEEDS_MAINTENANCE">Needs Maintenance</option>
                <option value="NEEDS_REPAIR">Needs Repair</option>
              </select>
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
      <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
        <MessageSquareOff />
        <AlertTitle>Alerts only — no chat access</AlertTitle>
        <AlertDescription>
          Per the project Charter (Sections 160 and 199), the SuperAdmin account receives system alerts and
          escalation cases only. Messaging is reserved for coordinators and students.
        </AlertDescription>
      </Alert>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Unread alert notifications</p>
          <p className="text-2xl font-semibold tabular-ledger">{overview?.unreadNotifications ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Open escalations</p>
          <p className="text-2xl font-semibold tabular-ledger">{openEscalations ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Inspections on record</p>
          <p className="text-2xl font-semibold tabular-ledger">{overview?.inspectionCount ?? "—"}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" render={<Link href="/notifications" />}>
          <BellRing className="size-4" />
          Open notifications inbox
        </Button>
        <Button type="button" variant="outline" render={<Link href="/admin/attendance" />}>
          <ListChecks className="size-4" />
          Flagged attendance queue
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Page shell
// ============================================================================

export default function SuperAdminPage() {
  const [user, setUser] = React.useState<{ id: string; fullName: string; email: string; role: Role } | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<TabValue>("admins");

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
            const notifBody = (await notifRes.json()) as { data: { isRead: boolean }[] };
            setUnread(notifBody.data.filter((n) => !n.isRead).length);
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
      <div className="grid gap-6">
        {error && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <CircleAlert />
            <AlertTitle>Connection problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Executive summary */}
        <section aria-label="Executive summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Coordinators", value: roleCounts("ADMIN"), icon: UserCog },
            { label: "Students", value: roleCounts("STUDENT"), icon: Users },
            { label: "Batches", value: overview?.batchCount ?? null, icon: Layers },
            { label: "Inspections", value: overview?.inspectionCount ?? null, icon: Laptop },
            { label: "Unread alerts", value: overview?.unreadNotifications ?? null, icon: BellRing },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="grid gap-1 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                  {card.label}
                </div>
                <p className="text-2xl font-semibold tabular-ledger">{card.value ?? "—"}</p>
              </article>
            );
          })}
        </section>

        <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
          <TabsList className="flex w-full flex-wrap justify-start">
            {TAB_META.map((meta) => {
              const Icon = meta.icon;
              return (
                <TabsTrigger key={meta.value} value={meta.value} className="px-3">
                  <Icon className="size-3.5" />
                  {meta.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <section aria-label="Subsystem workspace" className="rounded-xl border border-border bg-card p-4 lg:p-5">
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
