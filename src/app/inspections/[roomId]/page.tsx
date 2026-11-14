"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import type { Role } from "@prisma/client";
import {
  CheckCircle2,
  CircleAlert,
  ImageUp,
  Paperclip,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/components/shell/AppShell";
import { useDraftForm } from "@/hooks/useDraftForm";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CONDITIONS = ["FUNCTIONING", "NEEDS_MAINTENANCE", "NEEDS_REPAIR"] as const;
type Condition = (typeof CONDITIONS)[number];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // Charter: <= 5 MB uploads
const ACCEPTED_UPLOAD_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

type RoomUnit = { id: string; unitCode: string; condition: string };
type Room = { id: string; name: string; building: string; units: RoomUnit[] };

type DraftItem = {
  condition: Condition;
  remarks: string;
  photoKey?: string;
  photoName?: string;
};

type InspectionDraft = {
  summaryNote: string;
  items: Record<string, DraftItem>;
};

export default function RoomChecklistPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;

  const [user, setUser] = React.useState<{ id: string; fullName: string; email: string; role: Role } | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [room, setRoom] = React.useState<Room | null>(null);
  const [roomError, setRoomError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadingUnit, setUploadingUnit] = React.useState<string | null>(null);

  const draft = useDraftForm<InspectionDraft>(`techtracker-inspection-${roomId}`, {
    summaryNote: "",
    items: {},
  });

  const load = React.useCallback(async () => {
    setRoomError(null);
    try {
      const [meRes, roomsRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/inspections/rooms"),
      ]);
      if (!meRes.ok) {
        setRoomError("Your session expired. Please sign in again.");
        return;
      }
      const me = (await meRes.json()) as { user: { id: string; fullName: string; email: string; role: Role } };
      setUser(me.user);
      if (roomsRes.ok) {
        const body = (await roomsRes.json()) as { rooms: Room[] };
        setRoom(body.rooms.find((r) => r.id === roomId) ?? null);
      }
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
      setRoomError("TechTracker could not reach the server. Check your connection and retry.");
    }
  }, [roomId]);

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

  const itemFor = React.useCallback(
    (unit: RoomUnit): DraftItem =>
      draft.values.items[unit.id] ?? { condition: unit.condition as Condition, remarks: "" },
    [draft.values.items],
  );

  const updateItem = (unitId: string, patch: Partial<DraftItem>) => {
    const unit = room?.units.find((u) => u.id === unitId);
    if (!unit) return;
    const current = itemFor(unit);
    draft.setValues({
      items: { ...draft.values.items, [unitId]: { ...current, ...patch } },
    });
  };

  const uploadPhoto = async (unitId: string, file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Photo evidence must be 5 MB or smaller.");
      return;
    }
    if (!ACCEPTED_UPLOAD_MIMES.includes(file.type)) {
      toast.error("Photo evidence must be a JPEG, PNG, WEBP image or PDF.");
      return;
    }
    setUploadingUnit(unitId);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("category", "inspections");
      const res = await fetch("/api/uploads", { method: "POST", body });
      const payload = (await res.json()) as {
        file?: { key: string; name: string };
        error?: string;
      };
      if (!res.ok || !payload.file) {
        toast.error(payload.error ?? "Photo upload failed. Try again.");
        return;
      }
      updateItem(unitId, { photoKey: payload.file.key, photoName: payload.file.name });
      toast.success("Photo evidence attached to the unit record.");
    } catch {
      toast.error("Photo upload failed. Try again.");
    } finally {
      setUploadingUnit(null);
    }
  };

  const submit = async () => {
    if (!room) return;
    setSubmitError(null);

    const items = room.units.map((unit) => {
      const item = itemFor(unit);
      return {
        unitId: unit.id,
        condition: item.condition,
        remarks: item.remarks.trim() || null,
        photoKey: item.photoKey ?? null,
      };
    });

    // Charter: defect remarks are mandatory for NEEDS_MAINTENANCE / NEEDS_REPAIR.
    const missingRemarks = room.units.filter((unit, index) => {
      const item = items[index];
      return item.condition !== "FUNCTIONING" && !item.remarks;
    });
    if (missingRemarks.length > 0) {
      const message = `Defect remarks are required for ${missingRemarks.length} unit${missingRemarks.length === 1 ? "" : "s"} flagged Needs Maintenance or Needs Repair (${missingRemarks
        .slice(0, 4)
        .map((u) => u.unitCode)
        .join(", ")}${missingRemarks.length > 4 ? "…" : ""}).`;
      setSubmitError(message);
      toast.error(message);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: room.id,
          summaryNote: draft.values.summaryNote.trim() || null,
          items,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        const message = payload.error ?? "The inspection could not be submitted.";
        setSubmitError(message);
        toast.error(message);
        return;
      }
      toast.success("Inspection submitted — condition records kept for coordinator review.");
      draft.clearDraft();
      setSubmitted(true);
    } catch {
      const message = "The inspection could not be submitted. Check your connection and retry.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading room checklist…</p>
      </main>
    );
  }

  if (roomError) {
    return (
      <AppShell user={user} unreadNotifications={unread} title="Lab Unit Checklist">
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CircleAlert />
          <AlertTitle>Checklist unavailable</AlertTitle>
          <AlertDescription>{roomError}</AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  if (!room) {
    return (
      <AppShell user={user} unreadNotifications={unread} title="Lab Unit Checklist">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="font-medium">Room not available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This laboratory room does not exist or is not assigned to your account.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-4" render={<Link href="/inspections" />}>
            Back to room selection
          </Button>
        </div>
      </AppShell>
    );
  }

  const flaggedCount = room.units.filter((unit) => itemFor(unit).condition !== "FUNCTIONING").length;
  const missingRemarksCount = room.units.filter(
    (unit) => itemFor(unit).condition !== "FUNCTIONING" && itemFor(unit).remarks.trim() === "",
  ).length;
  const photoCount = room.units.filter((unit) => Boolean(itemFor(unit).photoKey)).length;

  return (
    <AppShell
      user={user}
      unreadNotifications={unread}
      title={`Checklist — ${room.name}`}
      subtitle={`${room.building} · unit-by-unit condition audit (A–Z)`}
      actions={
        <Button type="button" variant="outline" size="sm" render={<Link href="/inspections" />}>
          Room selection
        </Button>
      }
    >
      <div className="grid gap-6">
        {submitted && (
          <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 />
            <AlertTitle>Inspection submitted</AlertTitle>
            <AlertDescription>
              The room condition record was logged and routed to the Pre-OJT coordinator for review. No
              repair tickets or urgent dispatches are generated by this prototype.
            </AlertDescription>
          </Alert>
        )}

        {draft.restoredDraft && !submitted && (
          <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 />
            <AlertTitle>Draft restored</AlertTitle>
            <AlertDescription>
              Your in-progress checklist entries were preserved on this device. Clear the draft to start
              over.
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => draft.clearDraft()}
              >
                <Trash2 className="size-3.5" />
                Clear draft
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Summary strip */}
        <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Units in room</p>
            <p className="text-lg font-semibold tabular-ledger">{room.units.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Flagged this session</p>
            <p className="text-lg font-semibold tabular-ledger">{flaggedCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Photo evidence attached</p>
            <p className="text-lg font-semibold tabular-ledger">{photoCount}</p>
          </div>
        </section>

        <section className="grid gap-3 rounded-xl border border-border bg-card p-4">
          <Label htmlFor="summary-note">Session summary note (optional)</Label>
          <Textarea
            id="summary-note"
            placeholder="Overall room observations for this audit session —"
            value={draft.values.summaryNote}
            onChange={(e) => draft.setValues({ summaryNote: e.target.value })}
            className="min-h-16"
          />
          {draft.isDirty && !submitted && (
            <p className="text-xs text-muted-foreground">
              Draft preserved locally on this device — entries survive an accidental page reload.
            </p>
          )}
        </section>

        {/* Unit-by-unit checklist (units arrive sorted A–Z by unitCode) */}
        <section aria-label="Unit checklist" className="grid gap-3">
          {room.units.map((unit, index) => {
            const item = itemFor(unit);
            const needsRemarks = item.condition !== "FUNCTIONING";
            const remarksInvalid = needsRemarks && item.remarks.trim() === "";
            return (
              <article key={unit.id} className="grid gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-md bg-muted font-mono text-xs tabular-ledger">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-mono text-sm font-semibold tabular-ledger">{unit.unitCode}</p>
                      <p className="text-xs text-muted-foreground">Workstation unit</p>
                    </div>
                  </div>
                  <select
                    aria-label={`Condition for unit ${unit.unitCode}`}
                    value={item.condition}
                    onChange={(e) => updateItem(unit.id, { condition: e.target.value as Condition })}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c === "FUNCTIONING"
                          ? "Functioning"
                          : c === "NEEDS_MAINTENANCE"
                            ? "Needs Maintenance"
                            : "Needs Repair"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor={`remarks-${unit.id}`}>
                    Defect remarks{" "}
                    {needsRemarks ? (
                      <span className="text-destructive">(required)</span>
                    ) : (
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    )}
                  </Label>
                  <Textarea
                    id={`remarks-${unit.id}`}
                    aria-invalid={remarksInvalid}
                    placeholder={
                      needsRemarks ? "Describe the observed defect —" : "Only needed when the unit is flagged —"
                    }
                    value={item.remarks}
                    onChange={(e) => updateItem(unit.id, { remarks: e.target.value })}
                    className={remarksInvalid ? "border-destructive/50" : undefined}
                  />
                  {remarksInvalid && (
                    <p role="alert" className="text-xs text-destructive">
                      Defect remarks are mandatory for this condition.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted">
                    <ImageUp className="size-4" />
                    {uploadingUnit === unit.id ? "Uploading…" : item.photoKey ? "Replace photo (≤ 5 MB)" : "Add photo proof (≤ 5 MB)"}
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void uploadPhoto(unit.id, file);
                      }}
                    />
                  </label>
                  {item.photoKey && (
                    <>
                      <a
                        href={`/api/files/${item.photoKey}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"
                      >
                        <Paperclip className="size-4" />
                        <span className="max-w-40 truncate">{item.photoName ?? "View attachment"}</span>
                      </a>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateItem(unit.id, { photoKey: undefined, photoName: undefined })}
                      >
                        <Trash2 className="size-3.5" />
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
          {room.units.length === 0 && (
            <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              No workstation units are configured for this room yet.
            </p>
          )}
        </section>

        {submitError && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
            <CircleAlert />
            <AlertTitle>Cannot submit yet</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <section className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-4 backdrop-blur-sm lg:bottom-4">
          <div className="text-sm text-muted-foreground">
            <span className="tabular-ledger">{room.units.length}</span> units ·{" "}
            <span className="tabular-ledger">{flaggedCount}</span> flagged ·{" "}
            <span className="tabular-ledger">{missingRemarksCount}</span> missing remarks
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                draft.clearDraft();
                setSubmitted(false);
              }}
            >
              <RotateCcw className="size-4" />
              Reset session
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={submitting}>
              <Save className="size-4" />
              {submitting ? "Submitting…" : "Submit room inspection"}
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
