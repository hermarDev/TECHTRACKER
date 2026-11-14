"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BellRing,
  CircleAlert,
  CheckCircle2,
  Layers,
  MessageSquarePlus,
  Paperclip,
  Send,
  ShieldOff,
  UserRound,
} from "lucide-react";
import type { Role } from "@prisma/client";

import { AppShell } from "@/components/shell/AppShell";
import { useDraftForm } from "@/hooks/useDraftForm";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // Charter: <= 5 MB uploads
const ACCEPTED_UPLOAD_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

type Me = { id: string; fullName: string; email: string; role: Role };
type ConversationMessage = {
  id: string;
  body: string;
  senderId: string;
  sender: { fullName: string };
  attachmentKey: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  createdAt: string;
};
type Conversation = {
  id: string;
  title: string | null;
  type: "DIRECT" | "BATCH";
  updatedAt: string;
  batch: { id: string; name: string; section: string } | null;
  members: { user: { id: string; fullName: string; email: string; role: string } }[];
  messages: ConversationMessage[];
};
type AdminBatch = { id: string; name: string; section: string };
type DirectoryStudent = { id: string; fullName: string; email: string };

function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function conversationLabel(conversation: Conversation, meId: string): string {
  if (conversation.title) return conversation.title;
  const others = conversation.members
    .map((m) => m.user)
    .filter((u) => u.id !== meId)
    .map((u) => u.fullName);
  return others.length > 0 ? others.join(", ") : "Conversation";
}

function conversationPreview(conversation: Conversation): string {
  const last = conversation.messages[0];
  return last ? last.body : "No messages yet.";
}

export default function MessagesPage() {
  const [me, setMe] = React.useState<Me | null>(null);
  const [unread, setUnread] = React.useState(0);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerMode, setPickerMode] = React.useState<"BATCH" | "DIRECT">("BATCH");
  const [pickerBody, setPickerBody] = React.useState("");
  const [pickerBatches, setPickerBatches] = React.useState<AdminBatch[]>([]);
  const [pickerStudents, setPickerStudents] = React.useState<DirectoryStudent[]>([]);
  const [pickerBatchId, setPickerBatchId] = React.useState("");
  const [pickerStudentIds, setPickerStudentIds] = React.useState<string[]>([]);
  const [pickerError, setPickerError] = React.useState<string | null>(null);
  const [pickerSending, setPickerSending] = React.useState(false);

  const isAdmin = me?.role === "ADMIN";

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) {
        setError("Your session expired. Please sign in again.");
        return;
      }
      const meBody = (await meRes.json()) as { user: Me };
      setMe(meBody.user);
      try {
        const notifRes = await fetch("/api/notifications?page=1&pageSize=50");
        if (notifRes.ok) {
          const notifBody = (await notifRes.json()) as { data: { isRead: boolean }[] };
          setUnread(notifBody.data.filter((n) => !n.isRead).length);
        }
      } catch {
        // Notification badge is best-effort in the local prototype.
      }
      if (meBody.user.role === "SUPERADMIN") return; // Charter 160/199: no chat data for SuperAdmin.
      const res = await fetch("/api/messages");
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Conversations could not be loaded.");
        return;
      }
      const body = (await res.json()) as { conversations: Conversation[] };
      setConversations(body.conversations);
      setSelectedId((current) => current ?? body.conversations[0]?.id ?? null);
    } catch {
      setError("TechTracker could not reach the server. Check your connection and retry.");
    }
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

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const composer = useDraftForm<{ body: string }>(
    `techtracker-message-draft-${selectedId ?? "none"}`,
    { body: "" },
  );

  // ---- Load picker roster (ADMIN only; students have no directory scope) ----
  React.useEffect(() => {
    if (!pickerOpen || !isAdmin) return;
    void (async () => {
      if (pickerMode === "BATCH") {
        const res = await fetch("/api/admin/batches?page=1&pageSize=50");
        if (res.ok) {
          const body = (await res.json()) as { data: AdminBatch[] };
          setPickerBatches(body.data);
        }
      } else {
        const res = await fetch("/api/admin/students?page=1&pageSize=50");
        if (res.ok) {
          const body = (await res.json()) as { data: DirectoryStudent[] };
          setPickerStudents(body.data);
        }
      }
    })();
  }, [pickerOpen, pickerMode, isAdmin]);

  const sendToExisting = async () => {
    if (!selected) return;
    const bodyText = composer.values.body.trim();
    if (!bodyText) {
      toast.error("Write a message before sending.");
      return;
    }
    setSending(true);
    try {
      let uploaded: { key: string; name: string; mime: string; size: number } | null = null;
      if (attachment) {
        if (attachment.size > MAX_UPLOAD_BYTES) {
          toast.error("Attachments must be 5 MB or smaller.");
          return;
        }
        if (!ACCEPTED_UPLOAD_MIMES.includes(attachment.type)) {
          toast.error("Attachments must be a JPEG, PNG, WEBP image or PDF.");
          return;
        }
        const formData = new FormData();
        formData.set("file", attachment);
        formData.set("category", "messages");
        const uploadRes = await fetch("/api/uploads", { method: "POST", body: formData });
        const uploadBody = (await uploadRes.json()) as {
          file?: { key: string; name: string; mime: string; size: number };
          error?: string;
        };
        if (!uploadRes.ok || !uploadBody.file) {
          toast.error(uploadBody.error ?? "Attachment upload failed.");
          return;
        }
        uploaded = uploadBody.file;
      }
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selected.id,
          body: bodyText,
          attachmentKey: uploaded?.key ?? null,
          attachmentName: uploaded?.name ?? null,
          attachmentMime: uploaded?.mime ?? null,
          attachmentSize: uploaded?.size ?? null,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error ?? "Message could not be sent.");
        return;
      }
      toast.success("Message sent.");
      composer.clearDraft();
      setAttachment(null);
      await load();
    } catch {
      toast.error("Message could not be sent. Check your connection and retry.");
    } finally {
      setSending(false);
    }
  };

  // ---- New Conversation picker (forward-compatible with POST /api/messages) ----
  const sendNewConversation = async () => {
    const bodyText = pickerBody.trim();
    if (!bodyText) {
      setPickerError("Write the first message before sending.");
      return;
    }
    if (pickerMode === "BATCH" && !pickerBatchId) {
      setPickerError("Select a batch to message.");
      return;
    }
    if (pickerMode === "DIRECT" && pickerStudentIds.length === 0) {
      setPickerError("Select at least one recipient.");
      return;
    }
    setPickerError(null);
    setPickerSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: pickerMode,
          ...(pickerMode === "BATCH" ? { batchId: pickerBatchId } : { recipientIds: pickerStudentIds }),
          body: bodyText,
        }),
      });
      const payload = (await res.json()) as { error?: string; conversation?: { id: string } };
      if (!res.ok) {
        setPickerError(
          payload.error ??
            "The message server could not create the thread. New conversation threads must be registered server-side.",
        );
        toast.error(payload.error ?? "New conversation could not be started.");
        return;
      }
      toast.success("New conversation started.");
      setPickerOpen(false);
      setPickerBody("");
      setPickerBatchId("");
      setPickerStudentIds([]);
      if (payload.conversation?.id) setSelectedId(payload.conversation.id);
      await load();
    } catch {
      setPickerError("The message server could not be reached. Try again.");
    } finally {
      setPickerSending(false);
    }
  };

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading messages…</p>
      </main>
    );
  }

  // ---- Charter 160/199: SuperAdmin receives alerts only — strictly no chat access ----
  if (me.role === "SUPERADMIN") {
    return (
      <AppShell user={me} unreadNotifications={unread} title="Messages">
        <div className="mx-auto grid max-w-xl gap-4 rounded-xl border border-border bg-card p-6 text-center">
          <ShieldOff className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Alerts Only — No Chat Access</h2>
          <p className="text-sm text-muted-foreground">
            Per the project Charter (Sections 160 and 199), the SuperAdmin account receives system alerts
            and escalation rulings only. Individual and batch messaging is reserved for Pre-OJT
            coordinators and students, so this console has no chat capabilities.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" render={<Link href="/notifications" />}>
              <BellRing className="size-4" />
              Open system alerts
            </Button>
            <Button type="button" variant="outline" render={<Link href="/superadmin" />}>
              Back to console
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell user={me} unreadNotifications={unread} title="Messages">
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <CircleAlert />
          <AlertTitle>Messages unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  const threadMessages = selected ? [...selected.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];

  return (
    <AppShell
      user={me}
      unreadNotifications={unread}
      title="Messages"
      subtitle="Individual and batch coordination with Pre-OJT coordinators"
      actions={
        <Button type="button" size="sm" onClick={() => setPickerOpen(true)}>
          <MessageSquarePlus className="size-4" />
          New Conversation
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,2fr)_minmax(0,3fr)]">
        {/* Conversation list */}
        <section aria-label="Conversations" className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Conversations</h2>
            <p className="text-xs text-muted-foreground tabular-ledger">{conversations.length} threads</p>
          </div>
          {conversations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No conversations yet. Use “New Conversation” to start one.
            </p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto lg:max-h-[40rem]">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    aria-current={selectedId === conversation.id ? "true" : undefined}
                    onClick={() => setSelectedId(conversation.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted ${
                      selectedId === conversation.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{conversationLabel(conversation, me.id)}</p>
                      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {conversation.type === "BATCH" ? "Batch" : "Direct"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {conversationPreview(conversation)}
                    </p>
                    <p className="mt-0.5 text-[10px] tabular-ledger text-muted-foreground">
                      {formatTime(conversation.updatedAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Thread */}
        <section aria-label="Message thread" className="flex min-h-[28rem] flex-col rounded-xl border border-border bg-card">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <p className="text-sm text-muted-foreground">Select a conversation to read the thread.</p>
            </div>
          ) : (
            <>
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">{conversationLabel(selected, me.id)}</h2>
                <p className="text-xs text-muted-foreground">
                  {selected.type === "BATCH" && selected.batch
                    ? `Batch thread · ${selected.batch.name} (${selected.batch.section})`
                    : `${selected.members.length} participant${selected.members.length === 1 ? "" : "s"}`}
                </p>
              </div>

              <ol className="flex-1 space-y-3 overflow-y-auto p-4">
                {threadMessages.length === 0 && (
                  <li className="text-sm text-muted-foreground">No messages in this thread yet.</li>
                )}
                {threadMessages.map((message) => {
                  const own = message.senderId === me.id;
                  return (
                    <li key={message.id} className={own ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={`max-w-[85%] rounded-xl border p-3 ${
                          own ? "border-primary/25 bg-primary/10" : "border-border bg-muted/40"
                        }`}
                      >
                        <p className="text-xs font-medium text-muted-foreground">
                          {own ? "You" : message.sender.fullName}
                          <span className="ml-2 tabular-ledger">{formatTime(message.createdAt)}</span>
                        </p>
                        <p className="mt-1 text-sm whitespace-pre-wrap">{message.body}</p>
                        {message.attachmentKey && (
                          <a
                            href={`/api/files/${message.attachmentKey}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                          >
                            <Paperclip className="size-3.5" />
                            <span className="max-w-48 truncate">{message.attachmentName ?? "Attachment"}</span>
                            {message.attachmentSize != null && (
                              <span className="text-muted-foreground tabular-ledger">
                                {formatBytes(message.attachmentSize)}
                              </span>
                            )}
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="border-t border-border p-4">
                <Label htmlFor="composer-body">Message</Label>
                <Textarea
                  id="composer-body"
                  placeholder="Write your message —"
                  value={composer.values.body}
                  onChange={(e) => composer.setValues({ body: e.target.value })}
                  className="mt-1 min-h-20"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted">
                    <Paperclip className="size-4" />
                    {attachment ? attachment.name : "Attach file (≤ 5 MB)"}
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => {
                        setAttachment(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Button type="button" onClick={() => void sendToExisting()} disabled={sending} className="ml-auto">
                    <Send className="size-4" />
                    {sending ? "Sending…" : "Send message"}
                  </Button>
                </div>
                {attachment && (
                  <button
                    type="button"
                    className="mt-1 text-xs text-muted-foreground underline underline-offset-2"
                    onClick={() => setAttachment(null)}
                  >
                    Remove selected attachment
                  </button>
                )}
                {composer.isDirty && (
                  <p className="mt-1 text-xs text-muted-foreground">Draft preserved locally on this device.</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* New Conversation picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Conversation</DialogTitle>
            <DialogDescription>
              {isAdmin
                ? "Message a whole duty batch or individual students. Threads appear in every recipient's conversation list."
                : "New batch and coordinator threads are opened by your Pre-OJT coordinator; they appear here once created."}
            </DialogDescription>
          </DialogHeader>

          {isAdmin ? (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="picker-mode">Recipients</Label>
                <select
                  id="picker-mode"
                  value={pickerMode}
                  onChange={(e) => setPickerMode(e.target.value === "BATCH" ? "BATCH" : "DIRECT")}
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="BATCH">Batch announcement</option>
                  <option value="DIRECT">Individual students</option>
                </select>
              </div>

              {pickerMode === "BATCH" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="picker-batch">Duty batch</Label>
                  <select
                    id="picker-batch"
                    value={pickerBatchId}
                    onChange={(e) => setPickerBatchId(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Select a batch —</option>
                    {pickerBatches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.name} ({batch.section})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <fieldset className="grid max-h-48 gap-1.5 overflow-y-auto rounded-md border border-input p-2">
                  <legend className="px-1 text-xs text-muted-foreground">Recipients</legend>
                  {pickerStudents.length === 0 && (
                    <p className="p-2 text-sm text-muted-foreground">No students in your directory scope.</p>
                  )}
                  {pickerStudents.map((student) => (
                    <label key={student.id} className="flex min-h-9 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={pickerStudentIds.includes(student.id)}
                        onChange={(e) =>
                          setPickerStudentIds((current) =>
                            e.target.checked
                              ? [...current, student.id]
                              : current.filter((id) => id !== student.id),
                          )
                        }
                        className="size-4 accent-[var(--primary)]"
                      />
                      <UserRound className="size-3.5 text-muted-foreground" />
                      <span className="truncate">{student.fullName}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">{student.email}</span>
                    </label>
                  ))}
                </fieldset>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="picker-body">First message</Label>
                <Textarea
                  id="picker-body"
                  placeholder="Write the first message —"
                  value={pickerBody}
                  onChange={(e) => setPickerBody(e.target.value)}
                  className="min-h-20"
                />
              </div>

              {pickerError && (
                <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
                  <CircleAlert />
                  <AlertTitle>Cannot start conversation</AlertTitle>
                  <AlertDescription>{pickerError}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPickerOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void sendNewConversation()} disabled={pickerSending}>
                  <Layers className="size-4" />
                  {pickerSending ? "Starting…" : "Start conversation"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 />
                <AlertTitle>Waiting on coordinator threads</AlertTitle>
                <AlertDescription>
                  Students receive individual and batch threads from their Pre-OJT coordinator. Existing
                  conversations are listed on the left.
                </AlertDescription>
              </Alert>
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => setPickerOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
