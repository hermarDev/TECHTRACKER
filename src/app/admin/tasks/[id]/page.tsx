"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { toast } from "sonner";
import { Loader2, File, Image as ImageIcon, Download, X, Upload, Eye, MessageSquare, CheckCircle2, CircleAlert, Edit, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

type User = { id: string; fullName: string; email: string; role: "ADMIN" | "SUPERADMIN" };
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
  student: { id: string; fullName: string }; 
  submissions: Submission[];
  remarks: Remark[];
  startedAt?: string | null;
  acceptedAt?: string | null;
};
type Task = { 
  title: string; 
  instructions: string; 
  category: string; 
  deadline: string; 
  createdById: string;
  assignments: Assignment[] 
};

export default function AdminTaskDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = React.useState<User | null>(null);
  const [task, setTask] = React.useState<Task | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [remarks, setRemarks] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);

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

  const review = async (assignmentId: string, status: "ACCEPTED" | "RETURNED") => {
    const studentRemark = remarks[assignmentId] ?? "";
    const internalNote = notes[assignmentId] ?? "";
    
    if (status === "RETURNED" && !studentRemark.trim()) {
      return toast.error("Student-visible return remarks are mandatory.");
    }

    try {
      const response = await fetch(`/api/tasks/${params.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, status, studentRemark, internalNote }),
      });
      if (response.ok) {
        toast.success(`Task ${status.toLowerCase()}`);
        await load();
      } else {
        const body = await response.json();
        toast.error(body.error || "Failed to review");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const openPreview = (url: string) => {
    setPreviewImage(url);
    setIsPreviewOpen(true);
  };

  if (!user || !task) return <main className="p-8">Loading task review...</main>;

  return (
    <AppShell user={user} title={task.title} subtitle="Student-visible return remarks and private staff notes.">
      <div className="space-y-4">
        {task.assignments.map((assignment) => (
          <article key={assignment.id} className="rounded-xl border border-border bg-card">
            <CardContent className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-semibold">{assignment.student.fullName}</h2>
                  <p className="text-sm text-muted-foreground">Student ID: {assignment.student.id}</p>
                </div>
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
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="font-medium">Latest Submission</p>
                <div className="rounded-lg border bg-muted p-4">
                  {assignment.submissions.length > 0 ? (
                    <>
                      <p className="whitespace-pre-wrap text-sm">{assignment.submissions[0].summary}</p>
                      {assignment.submissions[0].attachmentKeys.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {assignment.submissions[0].attachmentKeys.map((key) => (
                            <Button 
                              key={key} 
                              variant="outline" 
                              size="sm" 
                              onClick={() => openPreview(`/api/files/${key}`)}
                            >
                              {key.match(/\.(jpg|jpeg|png|webp)$/i) ? <ImageIcon className="size-3 mr-1" /> : <File className="size-3 mr-1" />}
                              Attachment
                            </Button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No submission yet.</p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`remarks-${assignment.id}`}>Student-Visible Remarks (required on return)</Label>
                  <Textarea
                    id={`remarks-${assignment.id}`}
                    value={remarks[assignment.id] ?? ""}
                    onChange={(e) => setRemarks((old) => ({ ...old, [assignment.id]: e.target.value }))}
                    placeholder="Enter remarks visible to the student..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`notes-${assignment.id}`}>Private Internal Notes</Label>
                  <Textarea
                    id={`notes-${assignment.id}`}
                    value={notes[assignment.id] ?? ""}
                    onChange={(e) => setNotes((old) => ({ ...old, [assignment.id]: e.target.value }))}
                    placeholder="Enter private notes for staff only..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={() => void review(assignment.id, "ACCEPTED")}
                  disabled={assignment.status === "ACCEPTED"}
                >
                  <CheckCircle2 className="size-3 mr-1" />
                  Accept
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => void review(assignment.id, "RETURNED")}
                  disabled={assignment.status === "RETURNED"}
                >
                  <AlertTriangle className="size-3 mr-1" />
                  Return
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="font-medium">Remarks History</p>
                {assignment.remarks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No remarks yet.</p>
                ) : (
                  <div className="space-y-3">
                    {assignment.remarks.map((remark, index) => (
                      <div key={index} className="rounded-lg border bg-muted p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">
                            {remark.visibility === "STUDENT_VISIBLE" ? (
                              <Badge variant="secondary" className="bg-primary/10 text-primary">Student Visible</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-amber/10 text-amber-700">Internal Only</Badge>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {remark.author.fullName} · {new Date(remark.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm">{remark.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="font-medium">Submission History</p>
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
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => openPreview(`/api/files/${key}`)}
                                >
                                  {key.match(/\.(jpg|jpeg|png|webp)$/i) ? <ImageIcon className="size-3 mr-1" /> : <File className="size-3 mr-1" />}
                                  Attachment
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </CardContent>
          </article>
        ))}

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