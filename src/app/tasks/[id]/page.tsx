"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { useDraftForm } from "@/hooks/useDraftForm";
import { toast } from "sonner";
import { Loader2, File, Image as ImageIcon, Download, X, Upload, Eye, MessageSquare, CheckCircle2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

type User = { id: string; fullName: string; email: string; role: "STUDENT" };
type Submission = { 
  id: string; 
  version: number; 
  summary: string; 
  attachmentKeys: string[];
  submittedAt: string;
};
type Remark = { body: string; visibility: string; author: { fullName: string }; createdAt: string };
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
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = React.useState<string | null>(null);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [messageType, setMessageType] = React.useState<"success" | "error">("success");

  const draft = useDraftForm("techtracker-task-detail-" + params.id, { summary: "" });

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [me, result] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/tasks/${params.id}`)
      ]);
      if (me.ok) setUser((await me.json()).user);
      if (result.ok) setTask((await result.json()).task);
    } catch {
      toast.error("Failed to load task");
    } finally {
      setIsLoading(false);
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
        setIsLoading(false);
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
    <AppShell user={user} title={task.title} subtitle="Completion report and student-visible remarks.">
      <div className="max-w-3xl space-y-5">
        <section className="rounded-sm border border-border bg-card p-4 lg:p-5">
          <CardHeader className="pb-4">
            <CardTitle>{task.title}</CardTitle>
            <CardDescription>{task.category} · Due {new Date(task.deadline).toLocaleDateString()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-3">
              <Badge 
                variant={
                  assignment.status === "ACCEPTED" ? "default" :
                  assignment.status === "RETURNED" ? "destructive" :
                  assignment.status === "SUBMITTED" ? "secondary" :
                  "outline"
                }
                className={
                  assignment.status === "ACCEPTED" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
                  assignment.status === "RETURNED" ? "bg-destructive/10 text-destructive" :
                  ""
                }
              >
                {assignment.status.replace("_", " ")}
              </Badge>
              {assignment.startedAt && (
                <span className="text-sm text-muted-foreground">Started {new Date(assignment.startedAt).toLocaleString()}</span>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm">{task.instructions}</p>
            {assignment.status === "RETURNED" && (
              <div role="status" className="rounded-sm border border-destructive/40 bg-destructive/10 p-4 text-destructive">
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

        <section className="rounded-sm border border-border bg-card p-4 lg:p-5">
          <CardHeader className="pb-4">
            <CardTitle>Completion Report</CardTitle>
            <CardDescription>Submit your work summary and optional attachment (≤5MB)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="summary">Completion Summary</Label>
              <Textarea
                id="summary"
                className="min-h-36"
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
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted">
                    {attachmentPreview.startsWith("blob:") && attachment?.type.startsWith("image/") ? (
                      <img src={attachmentPreview} alt="Preview" className="h-16 w-16 object-cover rounded" />
                    ) : (
                      <File className="size-8 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{attachment?.name}</p>
                      <p className="text-sm text-muted-foreground">{(attachment?.size ?? 0) / 1024 / 1024} MB</p>
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
                className={`rounded-lg p-3 text-sm flex items-center gap-2 ${
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

        <section className="rounded-sm border border-border bg-card p-4 lg:p-5">
          <CardHeader className="pb-4">
            <CardTitle>Remarks</CardTitle>
            <CardDescription>Threaded student-visible remarks</CardDescription>
          </CardHeader>
          <CardContent>
            {assignment.remarks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No remarks yet.</p>
            ) : (
              <div className="space-y-4">
                {assignment.remarks.map((remark, index) => (
                  <div key={index} className="border-l-2 border-border pl-4">
                    <p className="text-xs text-muted-foreground">
                      {remark.author.fullName} · {new Date(remark.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{remark.body}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </section>

        <section className="rounded-sm border border-border bg-card p-4 lg:p-5">
          <CardHeader className="pb-4">
            <CardTitle>Submission History</CardTitle>
            <CardDescription>Previous versions of your completion reports</CardDescription>
          </CardHeader>
          <CardContent>
            {assignment.submissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            ) : (
              <div className="space-y-3">
                {assignment.submissions
                  .slice()
                  .sort((a, b) => b.version - a.version)
                  .map((submission) => (
                    <div key={submission.id} className="rounded-lg border bg-muted p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Version {submission.version}</span>
                        <span className="text-sm text-muted-foreground">
                          {new Date(submission.submittedAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{submission.summary}</p>
                      {submission.attachmentKeys.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {submission.attachmentKeys.map((key) => (
                            <Button 
                              key={key} 
                              variant="ghost" 
                              size="sm" 
                              render={() => (
                                <a href={`/api/files/${key}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                                  {key.match(/\.(jpg|jpeg|png|webp)$/i) ? <ImageIcon className="size-3" /> : <File className="size-3" />}
                                  Attachment
                                </a>
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </section>

        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[90dvh]">
            <DialogHeader>
              <DialogTitle>Attachment Preview</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center p-4">
              {previewImage && (
                <img 
                  src={previewImage} 
                  alt="Preview" 
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
              )}
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