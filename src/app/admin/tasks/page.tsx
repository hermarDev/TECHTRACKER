"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { toast } from "sonner";
import { Search, Loader2, Plus, Users, Calendar, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

type User = { id: string; fullName: string; email: string; role: "ADMIN" | "SUPERADMIN" };
type Task = { 
  id: string; 
  title: string; 
  deadline: string; 
  category: string;
  batchId?: string | null;
  assignments: Array<{ id: string; status: string; student: { fullName: string } }> 
};
type Student = { id: string; fullName: string; studentIdNo: string | null };
type Batch = { id: string; name: string; section: string };

export default function AdminTasksPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [batches, setBatches] = React.useState<Batch[]>([]);
  const [formData, setFormData] = React.useState({
    title: "",
    category: "General Technical",
    instructions: "",
    deadline: "",
    batchId: "",
    studentIds: [] as string[],
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const doLoad = async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      });
      const [me, result] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/tasks?${params.toString()}`)
      ]);
      if (mounted) {
        if (me.ok) setUser((await me.json()).user);
        if (result.ok) {
          const data = await result.json();
          setTasks(data.items);
          setTotal(data.total);
        }
        setIsLoading(false);
      }
    };
    doLoad();
    return () => { mounted = false; };
  }, [page, pageSize, search, statusFilter]);

  React.useEffect(() => {
    let mounted = true;
    if (isDialogOpen) {
      const doLoadDialog = async () => {
        try {
          const [studentsRes, batchesRes] = await Promise.all([
            fetch("/api/admin/students?page=1&pageSize=1000"),
            fetch("/api/admin/batches?page=1&pageSize=1000"),
          ]);
          if (mounted) {
            if (studentsRes.ok) {
              const data = await studentsRes.json();
              setStudents(data.data || []);
            }
            if (batchesRes.ok) {
              const data = await batchesRes.json();
              setBatches(data.data || []);
            }
          }
        } catch {
          toast.error("Failed to load dialog data");
        }
      };
      doLoadDialog();
    }
    return () => { mounted = false; };
  }, [isDialogOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.instructions.trim() || !formData.deadline || formData.studentIds.length === 0) {
      return toast.error("All fields are required, including at least one student.");
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        toast.success("Task assigned successfully");
        setIsDialogOpen(false);
        setFormData({ title: "", category: "General Technical", instructions: "", deadline: "", batchId: "", studentIds: [] });
        // Reload tasks by updating a dependency
        const params = new URLSearchParams({
          page: page.toString(),
          pageSize: pageSize.toString(),
          ...(search && { search }),
          ...(statusFilter && { status: statusFilter }),
        });
        const [me, result] = await Promise.all([
          fetch("/api/auth/me"),
          fetch(`/api/tasks?${params.toString()}`)
        ]);
        if (me.ok) setUser((await me.json()).user);
        if (result.ok) {
          const data = await result.json();
          setTasks(data.items);
          setTotal(data.total);
        }
      } else {
        const body = await response.json();
        toast.error(body.error || "Failed to assign task");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusOptions = ["ALL", "ASSIGNED", "IN_PROGRESS", "SUBMITTED", "RETURNED", "ACCEPTED"];

  if (!user) return <main className="p-8">Loading task reports...</main>;

  return (
    <AppShell user={user} title="Task Assignment & Review" subtitle="Assign technical work and review completion reports.">
      <section className="rounded-xl border border-border bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle>Task Assignment & Review</CardTitle>
            <CardDescription>Assign technical work and review completion reports</CardDescription>
          </div>
          <Dialog>
            <DialogTrigger>
              <Button>
                <Plus className="size-4 mr-2" />
                Assign New Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90dvh]">
              <DialogHeader>
                <DialogTitle>Assign New Task</DialogTitle>
                <DialogDescription>Create a new task and assign it to students</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    required
                    placeholder="Task title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={formData.category || ""} onValueChange={(value) => setFormData({ ...formData, category: value || "" })}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PC Assembly">PC Assembly</SelectItem>
                      <SelectItem value="OS Configuration">OS Configuration</SelectItem>
                      <SelectItem value="Network Cabling">Network Cabling</SelectItem>
                      <SelectItem value="Hardware Diagnostics">Hardware Diagnostics</SelectItem>
                      <SelectItem value="Lab Maintenance">Lab Maintenance</SelectItem>
                      <SelectItem value="General Technical">General Technical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instructions">Instructions *</Label>
                  <textarea
                    id="instructions"
                    required
                    rows={4}
                    className="w-full h-24 rounded-md border bg-background p-3 text-sm"
                    placeholder="Detailed instructions for the task..."
                    value={formData.instructions}
                    onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadline">Deadline *</Label>
                  <Input
                    id="deadline"
                    type="datetime-local"
                    required
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="batchId">Batch (optional)</Label>
                  <Select value={formData.batchId || ""} onValueChange={(value) => setFormData({ ...formData, batchId: value || "" })}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="All batches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All batches</SelectItem>
                      {batches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          {batch.name} ({batch.section})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Students *</Label>
                  <div className="max-h-48 overflow-y-auto border rounded-md p-2">
                    {students.map((student) => (
                      <label key={student.id} className="flex items-center gap-2 py-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.studentIds.includes(student.id)}
                          onChange={(e) => setFormData({
                            ...formData,
                            studentIds: e.target.checked
                              ? [...formData.studentIds, student.id]
                              : formData.studentIds.filter((id) => id !== student.id)
                          })}
                        />
                        <span className="text-sm">{student.fullName} <span className="text-muted-foreground">({student.studentIdNo})</span></span>
                      </label>
                    ))}
                    {students.length === 0 && <p className="text-sm text-muted-foreground">No students available</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">{formData.studentIds.length} student(s) selected</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => { setIsDialogOpen(false); setFormData({ title: "", category: "General Technical", instructions: "", deadline: "", batchId: "", studentIds: [] }); }}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="size-4 mr-2 animate-spin" />}
                    Assign Task
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value || "")}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status === "ALL" ? "" : status}>
                    {status === "ALL" ? "All Statuses" : status.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No tasks found.
            </div>
          ) : (
            <>
              <div className="grid gap-4">
                {tasks.map((task) => (
                  <Link 
                    href={`/admin/tasks/${task.id}`} 
                    key={task.id} 
                    className="rounded-xl border border-border bg-card p-5 hover:bg-muted transition-colors"
                  >
                    <div className="flex justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="font-semibold truncate">{task.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {task.category} · {task.assignments.length} assigned student(s) · Due {new Date(task.deadline).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge 
                        variant={
                          task.assignments[0]?.status === "ACCEPTED" ? "default" :
                          task.assignments[0]?.status === "RETURNED" ? "destructive" :
                          task.assignments[0]?.status === "SUBMITTED" ? "secondary" :
                          "outline"
                        }
                        className={
                          task.assignments[0]?.status === "ACCEPTED" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
                          task.assignments[0]?.status === "RETURNED" ? "bg-destructive/10 text-destructive" :
                          ""
                        }
                      >
                        {task.assignments[0]?.status?.replace("_", " ") || "ASSIGNED"}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
              <DataTablePagination 
                page={page} 
                pageSize={pageSize} 
                total={total} 
                onPageChange={setPage} 
                onPageSizeChange={setPageSize} 
              />
            </>
          )}
        </CardContent>
      </section>
    </AppShell>
  );
}