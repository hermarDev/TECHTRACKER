"use client";

import * as React from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { EvidencePreview } from "@/components/shell/EvidencePreview";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { formatSafeDate, formatSafeDateTime, normalizeTaskAttachments, type RawAttachmentEntry } from "@/lib/task-format";
import { useDraftForm } from "@/hooks/useDraftForm";
import { toast } from "sonner";
import { Loader2, File, Image as ImageIcon, X, Upload, CheckCircle2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type User = { id: string; fullName: string; email: string; role: "STUDENT" };
type Submission = { 
  id: string; 
  version: number; 
  summary: string; 
  attachmentKeys: RawAttachmentEntry[];
  submittedAt: string;
};
type Remark = { body: string; visibility: string; author?: { fullName?: string | null } | null; createdAt: string };
type Assignment = { 
  id: string; 
  status: string; 
  student: { fullName: string }; 
  submissions: Submission[];
  remarks: Remark[];
  startedAt?: string | null;
};
type Task = { title: string; instructions: string; category: string; deadline: string; assignments: Assignment[] };

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = React.useState<User | null>(null);
  const [task, setTask] = React.useState<Task | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = React.useState<string | null>(null);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [messageType, setMessageType] = React.useState<"success" | "error">("success");

  const draft = useDraftForm("techtracker-task-detail-" + params.id, { summary: "" });

  const load = React.useCallback(async () => {
    try {
      const [me, result] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/tasks/${params.id}`)
      ]);
      if (me.ok) setUser((await me.json()).user);
      if (result.ok) setTask((await result.json()).task);
    } catch {
      toast.error("Failed to load task");
    }
  }, [params.id]);

  React.useEffect(() => {
    let mounted = true;
    const doLoad = async () => {
      const [me, result] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/tasks/${params.id}`)
      ]);
      if (mounted) {
        if (me.ok) setUser((await me.json()).user);
        if (result.ok) setTask((await result.json()).task);
      }
    };
    doLoad();
    return () => { mounted = false; };
  }, [params.id]);

  const start = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tasks/${params.id}/start`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Task could not be started.");
        return;
      }
      toast.success("Task started");
      await load();
    } catch {
      toast.error("Failed to start task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File must be 5MB or less");
        return;
      }
      setAttachment(file);
      const url = URL.createObjectURL(file);
      setAttachmentPreview(url);
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentPreview(null);
  };

  const submit = async () => {
    if (!draft.values.summary.trim()) {
      return toast.error("Completion summary is required.");
    }
    setIsSubmitting(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("summary", draft.values.summary);
      if (attachment) body.set("attachments", attachment);
      const response = await fetch(`/api/tasks/${params.id}/submit`, { method: "POST", body });
      const data = await response.json();
      if (response.ok) {
        setMessage("Completion report submitted successfully.");
        setMessageType("success");
        toast.success("Submitted");
        draft.clearDraft();
        setAttachment(null);
        setAttachmentPreview(null);
        await load();
      } else {
        setMessage(data.error || "Failed to submit");
        setMessageType("error");
        toast.error(data.error || "Failed to submit");
      }
    } catch {
      setMessage("Network error. Please try again.");
      setMessageType("error");
      toast.error("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPreview = (url: string) => {
    setPreviewImage(url);
    setIsPreviewOpen(true);
  };

  if (!user || !task) return <main className="p-8">Loading task...</main>;
  const assignment = task.assignments[0];
  // A task can only be submitted while it is in progress or awaiting revision.
  const canSubmit = ["IN_PROGRESS", "RETURNED"].includes(assignment.status);
  const latestRemark = assignment.remarks[assignment.remarks.length - 1];

  return (
    <AppShell user={user} title={task.title} subtitle="Technical task / Detail and submission history">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs lg:p-6">
            <CardHeader className="px-0 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Task instructions</CardTitle>
                <StatusBadge status={assignment.status} />
              </div>
              <CardDescription>{task.category} · Due {formatSafeDate(task.deadline)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 px-0 pb-0">
              {assignment.startedAt && (
                <p className="text-xs text-muted-foreground">Started {formatSafeDateTime(assignment.startedAt)}</p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-6">{task.instructions}</p>
              {assignment.status === "RETURNED" && (
                <div role="status" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">
                  <p className="font-medium">Returned for revision</p>
                  {latestRemark && (
                    <p className="mt-1 whitespace-pre-wrap text-sm">{latestRemark.body}</p>
                  )}
                </div>
              )}
              {["ASSIGNED", "RETURNED"].includes(assignment.status) && (
                <Button onClick={start} disabled={isSubmitting}>
                  Start task
                </Button>
              )}
            </CardContent>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs lg:p-6">
            <CardHeader className="px-0 pb-4">
              <CardTitle>Completion Report</CardTitle>
              <CardDescription>Submit your work summary and optional attachment (≤5MB)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-0 pb-0">
              <div className="space-y-2">
                <Label htmlFor="summary">Completion Summary</Label>
                <Textarea
                  id="summary"
                  className="min-h-36 rounded-lg"
                  value={draft.values.summary}
                  onChange={(e) => draft.setValues({ summary: e.target.value })}
                  placeholder="Describe what you completed, any issues encountered, and results..."
                />
              </div>

              <div className="space-y-2">
                <Label>Attachment (optional, ≤5MB)</Label>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => document.getElementById("task-attachment")?.click()}>
                      <Upload className="size-4 mr-2" />
                      Choose File
                    </Button>
                    <input
                      id="task-attachment"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                  {attachmentPreview && (
                    <div className="flex items-center gap-3 rounded-lg border bg-muted p-3">
                      {attachmentPreview.startsWith("blob:") && attachment?.type.startsWith("image/") ? (
                        <Image src={attachmentPreview} alt="Preview" width={64} height={64} unoptimized className="h-16 w-16 rounded-md object-cover" />
                      ) : (
                        <File className="size-8 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{attachment?.name}</p>
                        <p className="text-sm text-muted-foreground">{((attachment?.size ?? 0) / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={removeAttachment}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <Button className="w-full min-h-11" onClick={submit} disabled={isSubmitting || !canSubmit}>
                {isSubmitting && <Loader2 className="size-4 mr-2 animate-spin" />}
                Submit / Resubmit
              </Button>

              {!canSubmit && (
                <p className="text-sm text-muted-foreground">
                  {assignment.status === "ASSIGNED"
                    ? "Start the task before submitting your completion report."
                    : "This report has already been submitted. Wait for the coordinator's review."}
                </p>
              )}

              {message && (
                <div
                  role="alert"
                  className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                    messageType === "success"
                      ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border border-destructive/40 bg-destructive/10 text-destructive"
                  }`}
                >
                  {messageType === "success" ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
                  {message}
                </div>
              )}
            </CardContent>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs lg:p-6">
            <CardHeader className="px-0 pb-4">
              <CardTitle>Remarks</CardTitle>
              <CardDescription>Coordinator feedback &amp; threaded remarks</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {assignment.remarks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No remarks yet. Feedback appears after coordinator review.</p>
              ) : (
                <div className="space-y-4">
                  {assignment.remarks.map((remark, index) => (
                    <div key={index} className="border-l-2 border-primary/50 pl-4">
                      <p className="text-xs text-muted-foreground">
                        {remark.author?.fullName ?? "Coordinator"} · {formatSafeDateTime(remark.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{remark.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs lg:p-6">
            <CardHeader className="px-0 pb-4">
              <CardTitle>Submission History</CardTitle>
              <CardDescription>Previous versions of your completion reports</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {assignment.submissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No submissions yet.</p>
              ) : (
                <div className="space-y-3">
                  {assignment.submissions
                    .slice()
                    .sort((a, b) => b.version - a.version)
                    .map((submission) => {
                      const attachments = normalizeTaskAttachments(submission.attachmentKeys);
                      return (
                        <div key={submission.id} className="rounded-lg border border-border bg-muted/50 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">Version {submission.version}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatSafeDateTime(submission.submittedAt)}
                            </span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm">{submission.summary}</p>
                          {attachments.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {attachments.map((att) => (
                                <Button
                                  key={att.key}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openPreview(att.key)}
                                >
                                  {att.isImage ? <ImageIcon className="size-3 mr-1" /> : <File className="size-3 mr-1" />}
                                  {att.name}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </section>
        </div>

        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[90dvh]">
            <DialogHeader>
              <DialogTitle>Attachment Preview</DialogTitle>
            </DialogHeader>
            <div className="p-2">
              <EvidencePreview fileKey={previewImage} alt="Submission attachment preview" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}