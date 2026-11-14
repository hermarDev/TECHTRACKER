"use client";

import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Wrench,
  ShieldAlert,
} from "lucide-react";

const STATUS_MAP: Record<
  string,
  { label: string; className: string; icon: "check" | "clock" | "warn" | "x" | "return" | "wrench" | "shield" }
> = {
  APPROVED: {
    label: "Approved",
    className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    icon: "check",
  },
  ACCEPTED: {
    label: "Accepted",
    className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    icon: "check",
  },
  ACTIVE: {
    label: "Active",
    className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    icon: "check",
  },
  FUNCTIONING: {
    label: "Functioning",
    className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    icon: "check",
  },
  PENDING: {
    label: "Pending Review",
    className: "border-amber-500/40 bg-amber-500/12 text-amber-800 dark:text-amber-300",
    icon: "clock",
  },
  PENDING_VERIFICATION: {
    label: "Pending Verification",
    className: "border-amber-500/40 bg-amber-500/12 text-amber-800 dark:text-amber-300",
    icon: "clock",
  },
  SUBMITTED: {
    label: "Submitted",
    className: "border-blue-500/40 bg-blue-500/12 text-blue-700 dark:text-blue-300",
    icon: "clock",
  },
  IN_PROGRESS: {
    label: "In Progress",
    className: "border-blue-500/40 bg-blue-500/12 text-blue-700 dark:text-blue-300",
    icon: "clock",
  },
  ASSIGNED: {
    label: "Assigned",
    className: "border-border bg-muted text-muted-foreground",
    icon: "clock",
  },
  RETURNED: {
    label: "Returned",
    className: "border-amber-500/40 bg-amber-500/14 text-amber-800 dark:text-amber-300",
    icon: "return",
  },
  IRREGULAR: {
    label: "Irregular",
    className: "border-amber-500/40 bg-amber-500/14 text-amber-800 dark:text-amber-300",
    icon: "warn",
  },
  NEEDS_MAINTENANCE: {
    label: "Needs Maintenance",
    className: "border-amber-500/40 bg-amber-500/14 text-amber-800 dark:text-amber-300",
    icon: "wrench",
  },
  NEEDS_REPAIR: {
    label: "Needs Repair",
    className: "border-destructive/45 bg-destructive/12 text-destructive",
    icon: "shield",
  },
  REJECTED: {
    label: "Rejected",
    className: "border-destructive/45 bg-destructive/12 text-destructive",
    icon: "x",
  },
  SUSPENDED: {
    label: "Suspended",
    className: "border-destructive/45 bg-destructive/12 text-destructive",
    icon: "x",
  },
  DEACTIVATED: {
    label: "Deactivated",
    className: "border-border bg-muted text-muted-foreground",
    icon: "x",
  },
  ESCALATED: {
    label: "Escalated",
    className: "border-amber-600/40 bg-amber-500/15 text-amber-800 dark:text-amber-300",
    icon: "shield",
  },
  OPEN: {
    label: "Open",
    className: "border-amber-500/40 bg-amber-500/14 text-amber-800 dark:text-amber-300",
    icon: "warn",
  },
  REVIEWED: {
    label: "Reviewed",
    className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    icon: "check",
  },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const cfg = STATUS_MAP[status] ?? {
    label: status.replaceAll("_", " "),
    className: "border-border bg-muted text-muted-foreground",
    icon: "clock" as const,
  };
  const Icon =
    cfg.icon === "check"
      ? CheckCircle2
      : cfg.icon === "warn"
        ? AlertTriangle
        : cfg.icon === "x"
          ? XCircle
          : cfg.icon === "return"
            ? RotateCcw
            : cfg.icon === "wrench"
              ? Wrench
              : cfg.icon === "shield"
                ? ShieldAlert
                : Clock;

  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cfg.className}`}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span>{label ?? cfg.label}</span>
    </Badge>
  );
}
