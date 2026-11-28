/* Authenticated and local preview images bypass the Next image optimizer. */
/* eslint-disable @next/next/no-img-element */
"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import type { Role } from "@/lib/types";

import { AppShell } from "@/components/shell/AppShell";
import { useDraftForm } from "@/hooks/useDraftForm";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InlineError } from "@/components/shell/InlineError";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // Charter: <= 5 MB uploads
const ACCEPTED_UPLOAD_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

type Me = { id: string; fullName: string; email: string; role: Role };
type ConversationMessage = {
  id: string;
  body: string;
  senderId: string;
  sender?: { fullName: string };
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
  members: { user?: { id: string; fullName: string; email: string; role: string } }[];
  messages: ConversationMessage[];
};
type AdminBatch = { id: string; name: string; section: string };
type DirectoryStudent = { id: string; fullName: string; email: string };

function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function isImageAttachment(name: string | null): boolean {
  return Boolean(name && /\.(jpe?g|png|webp)$/i.test(name));
}

function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function conversationLabel(conversation: Conversation, meId: string): string {
  if (conversation.title) return conversation.title;
  const others = conversation.members
    .filter((m) => m.user && m.user.id !== meId)
    .map((m) => m.user?.fullName || "Former member");
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
  const [conversationTotal, setConversationTotal] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [conversationPage, setConversationPage] = React.useState(1);
  const threadRef = React.useRef<HTMLElement>(null);
  const messagesEndRef = React.useRef<HTMLElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [composerError, setComposerError] = React.useState("");
  const [attachmentError, setAttachmentError] = React.useState("");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerMode, setPickerMode] = React.useState<"BATCH" | "DIRECT">("BATCH");
  const [pickerBody, setPickerBody] = React.useState("");
  const [pickerBatches, setPickerBatches] = React.useState<AdminBatch[]>([]);
  const [pickerStudents, setPickerStudents] = React.useState<DirectoryStudent[]>([]);
  const [pickerBatchId, setPickerBatchId] = React.useState("");
  const [pickerStudentIds, setPickerStudentIds] = React.useState<string[]>([]);
  const [pickerError, setPickerError] = React.useState<string | null>(null);
  const [pickerFieldErrors, setPickerFieldErrors] = React.useState({
    body: "",
    batch: "",
    recipients: "",
  });
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
          const notifBody = (await notifRes.json()) as { unread: number };
          setUnread(notifBody.unread);
        }
      } catch {
        // Notification badge is best-effort in the local prototype.
      }
      if (meBody.user.role === "SUPERADMIN") return; // Charter 160/199: no chat data for SuperAdmin.
      const res = await fetch("/api/messages?page=" + conversationPage + "&pageSize=5");
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Conversations could not be loaded.");
        return;
      }
      const body = (await res.json()) as {
        conversations: Conversation[];
        total?: number;
      };
      setConversationTotal(body.total ?? body.conversations.length);
      setConversations((current) =>
        conversationPage > 1
          ? [...current, ...body.conversations.filter(
              (item) => !current.some((existing) => existing.id === item.id)
            )]
          : body.conversations
      );
      setSelectedId((current) => current ?? body.conversations[0]?.id ?? null);
    } catch {
      setError("TechTracker could not reach the server. Check your connection and retry.");
    }
  }, [conversationPage]);

  React.useEffect(() => {
    const loadData = async () => {
      void load();
    };
    loadData();
  }, [load]);

  React.useEffect(() => {
    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          scrollToBottom();
        }
      },
      { root: messagesEndRef.current }
    );
    const target = messagesEndRef.current;
    if (target) observer.observe(target);
    return () => observer.disconnect();
  }, [selectedId]);

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
      setComposerError("Write a message before sending.");
      return;
    }
    setComposerError("");
    setAttachmentError("");
    setSending(true);
    try {
      let uploaded: { key: string; name: string; mime: string; size: number } | null = null;
      if (attachment) {
        if (attachment.size > MAX_UPLOAD_BYTES) {
          setAttachmentError("Attachments must be 5 MB or smaller.");
          return;
        }
        if (!ACCEPTED_UPLOAD_MIMES.includes(attachment.type)) {
          setAttachmentError("Attachments must be a JPEG, PNG, WEBP image or PDF.");
          return;
        }
        setAttachmentError("");
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
    const errors = {
      body: bodyText ? "" : "Write the first message before sending.",
      batch: pickerMode === "BATCH" && !pickerBatchId ? "Select a batch to message." : "",
      recipients:
        pickerMode === "DIRECT" && pickerStudentIds.length === 0
          ? "Select at least one recipient."
          : "",
    };
    setPickerFieldErrors(errors);
    if (errors.body || errors.batch || errors.recipients) return;
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
    if (error) {
      return (
        <main className="flex min-h-screen items-center justify-center p-8">
          <div className="grid max-w-md gap-4">
            <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
              <CircleAlert />
              <AlertTitle>Session unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div>
              <Link href="/login" className={buttonVariants({ size: "sm" })}>
                Sign in
              </Link>
            </div>
          </div>
        </main>
      );
    }
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
        <div className="mx-auto grid max-w-xl gap-4 rounded-xl border border-border bg-card p-6 text-center shadow-xs">
          <ShieldOff className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Alerts Only — No Chat Access</h2>
          <p className="text-sm text-muted-foreground">
            Per the project Charter (Sections 160 and 199), the SuperAdmin account receives system alerts
            and escalation rulings only. Individual and batch messaging is reserved for Pre-OJT
            coordinators and students, so this console has no chat capabilities.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/notifications" className={buttonVariants()}>
              <BellRing className="size-4" />
              Open system alerts
            </Link>
            <Link href="/superadmin" className={buttonVariants({ variant: "outline" })}>
              Back to console
            </Link>
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
      actions={me.role !== "STUDENT" ? (
        <Button type="button" size="sm" aria-label="New Conversation" onClick={() => setPickerOpen(true)}>
          <MessageSquarePlus className="size-4" />
          <span className="hidden sm:inline">New Conversation</span>
        </Button>
      ) : null}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,2fr)_minmax(0,3fr)]">
        {/* Conversation list */}
        <section aria-label="Conversations" className="min-w-0 w-full rounded-xl border border-border bg-card shadow-xs">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Conversations</h2>
            <p className="text-xs text-muted-foreground tabular-ledger">
              {conversations.length} thread{conversations.length === 1 ? "" : "s"}
            </p>
          </div>
          {conversations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {me.role === "STUDENT"
                ? "No conversations yet. Your coordinator will start threads; check notifications for updates."
                : "No conversations yet. Use “New Conversation” to start one."}
            </p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto lg:max-h-[40rem]">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    aria-current={selectedId === conversation.id ? "true" : undefined}
                    onClick={() => {
                      setSelectedId(conversation.id);
                      if (window.matchMedia("(max-width: 1023px)").matches) threadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted ${
                      selectedId === conversation.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar className="size-8">
                          <AvatarFallback>
                            {initials(conversationLabel(conversation, me.id))}
                          </AvatarFallback>
                        </Avatar>
                        <p className="truncate text-sm font-medium">
                          {conversationLabel(conversation, me.id)}
                        </p>
                      </div>
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
              {conversations.length > 0 && conversations.length < conversationTotal && (
                <li key="load-older">
                  <button
                    type="button"
                    onClick={() => setConversationPage((prev) => prev + 1)}
                    className="w-full px-4 py-3 text-left text-xs text-muted-foreground hover:underline">
                    Load older conversations
                  </button>
                </li>
              )}
            </ul>
          )}
        </section>

        {/* Thread */}
        <section ref={threadRef} aria-label="Message thread" className="flex min-h-[28rem] min-w-0 w-full flex-col rounded-xl border border-border bg-card shadow-xs">
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
                        className={`max-w-[85%] rounded-xl border p-3.5 ${
                          own ? "border-primary/25 bg-primary/10" : "border-border bg-muted/40"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarFallback className="text-[10px]">
                              {initials(own ? me.fullName : (message.sender?.fullName ?? "Deleted user"))}
                            </AvatarFallback>
                          </Avatar>
                          <p className="text-xs font-medium text-muted-foreground">
                            {own ? "You" : (message.sender?.fullName ?? "Deleted user")}
                            <span className="ml-2 tabular-ledger">{formatTime(message.createdAt)}</span>
                          </p>
                        </div>
                        <p className="mt-1 text-sm whitespace-pre-wrap">{message.body}</p>
                        {message.attachmentKey && isImageAttachment(message.attachmentName) && (
                          <a
                            href={`/api/files/${message.attachmentKey}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block w-fit"
                          >
                            <img
                              src={`/api/files/${message.attachmentKey}`}
                              alt={message.attachmentName ?? "Image attachment"}
                              className="max-h-40 max-w-full rounded-lg border border-border object-cover"
                            />
                          </a>
                        )}
                        {message.attachmentKey && (
                          <a
                            href={`/api/files/${message.attachmentKey}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                          >
                            <Paperclip className="size-4" />
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
                <div className="flex items-end gap-2 rounded-lg border border-input bg-background p-2">
                  <label className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Paperclip className="size-4" />
                    <span className="sr-only">Attach file (≤ 5 MB)</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => {
                        setAttachment(e.target.files?.[0] ?? null);
                        setAttachmentError("");
                        e.target.value = "";
                      }}
                      aria-invalid={Boolean(attachmentError)}
                      aria-describedby={attachmentError ? "attachment-error" : undefined}
                    />
                  </label>
                  <Textarea
                    id="composer-body"
                    rows={2}
                    placeholder="Write a message..."
                    value={composer.values.body}
                    onChange={(e) => {
                      composer.setValues({ body: e.target.value });
                      setComposerError("");
                    }}
                    className="min-h-10 flex-1 resize-none border-0 bg-transparent p-1.5 shadow-none focus-visible:ring-0"
                    aria-label="Message"
                    aria-invalid={Boolean(composerError)}
                    aria-describedby={composerError ? "composer-error" : undefined}
                  />
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => void sendToExisting()}
                    disabled={sending}
                    aria-label="Send message"
                    className="size-10 shrink-0 rounded-lg"
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
                {composerError && <InlineError message={composerError} id="composer-error" />}
                {attachmentError && <InlineError message={attachmentError} id="attachment-error" />}
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
                <Select
                  items={[
                    { value: "BATCH", label: "Batch announcement" },
                    { value: "DIRECT", label: "Individual students" },
                  ]}
                  value={pickerMode}
                  onValueChange={(value) => setPickerMode(value === "BATCH" ? "BATCH" : "DIRECT")}
                >
                  <SelectTrigger id="picker-mode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BATCH">Batch announcement</SelectItem>
                    <SelectItem value="DIRECT">Individual students</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {pickerMode === "BATCH" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="picker-batch">Duty batch</Label>
                  <Select
                    items={[
                      { value: "NONE", label: "Select a batch" },
                      ...pickerBatches.map((batch) => ({
                        value: batch.id,
                        label: `${batch.name} (${batch.section})`,
                      })),
                    ]}
                    value={pickerBatchId || "NONE"}
                    onValueChange={(value) => {
                      setPickerBatchId(value === "NONE" ? "" : (value ?? ""));
                      setPickerFieldErrors((old) => ({ ...old, batch: "" }));
                    }}
                  >
                    <SelectTrigger
                      id="picker-batch"
                      className="w-full"
                      aria-invalid={Boolean(pickerFieldErrors.batch)}
                      aria-describedby={pickerFieldErrors.batch ? "picker-batch-error" : undefined}
                    >
                      <SelectValue placeholder="Select a batch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Select a batch</SelectItem>
                      {pickerBatches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          {batch.name} ({batch.section})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pickerFieldErrors.batch && (
                    <InlineError message={pickerFieldErrors.batch} id="picker-batch-error" />
                  )}
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
                        onChange={(e) => {
                          setPickerStudentIds((current) =>
                            e.target.checked
                              ? [...current, student.id]
                              : current.filter((id) => id !== student.id),
                          );
                          setPickerFieldErrors((old) => ({ ...old, recipients: "" }));
                        }}
                        className="size-4 accent-[var(--primary)]"
                      />
                      <UserRound className="size-3.5 text-muted-foreground" />
                      <span className="truncate">{student.fullName}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">{student.email}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {pickerFieldErrors.recipients && (
                <InlineError message={pickerFieldErrors.recipients} id="picker-recipients-error" />
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="picker-body">First message</Label>
                <Textarea
                  id="picker-body"
                  placeholder="Write the first message..."
                  value={pickerBody}
                  onChange={(e) => {
                    setPickerBody(e.target.value);
                    setPickerFieldErrors((old) => ({ ...old, body: "" }));
                  }}
                  className="min-h-20"
                  aria-invalid={Boolean(pickerFieldErrors.body)}
                  aria-describedby={pickerFieldErrors.body ? "picker-body-error" : undefined}
                />
                {pickerFieldErrors.body && (
                  <InlineError message={pickerFieldErrors.body} id="picker-body-error" />
                )}
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
              <Alert className="border-success-surface/40 bg-success-surface/10 text-success">
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
