"use client";

import * as React from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { AppShell } from "@/components/shell/AppShell";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { formatSafeDate } from "@/lib/task-format";
import { DataTableToolbar } from "@/components/shell/DataTableToolbar";
import { toast } from "sonner";
import { Loader2, Plus, Users, Calendar } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDraftForm } from "@/hooks/useDraftForm";
import { FloatingInput } from "@/components/shell/FloatingInput";
import { InlineError } from "@/components/shell/InlineError";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const taskDraft = useDraftForm("techtracker-admin-task-draft", {
    title: "",
    category: "General Technical",
    instructions: "",
    deadline: "",
    batchId: "",
    studentIds: [] as string[],
  });
  const formData = taskDraft.values;
  const setFormData = taskDraft.setValues;
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [studentError, setStudentError] = React.useState("");
  const [authError, setAuthError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setAuthError("Your session expired. Please sign in again.");
          return null;
        }
        return response.json();
      })
      .then((data) => { if (data) setUser(data.user); })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setAuthError("Failed to load account. Please try again.");
          toast.error("Failed to load account");
        }
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(search && { search }), ...(statusFilter && { status: statusFilter }) });
        const response = await fetch(`/api/tasks?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Request failed");
        const data = await response.json();
        if (!controller.signal.aborted) { setTasks(data.items); setTotal(data.total ?? data.items.length); }
      } catch {
        if (!controller.signal.aborted) toast.error("Failed to load tasks");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [page, pageSize, search, statusFilter]);

  React.useEffect(() => {
    let mounted = true;
    if (isDialogOpen) {
      const doLoadDialog = async () => {
        try {
          const fetchAll = async <T,>(url: string): Promise<T[]> => {
            const all: T[] = [];
            let page = 1;
            while (true) {
              const response = await fetch(`${url}?page=${page}&pageSize=50`);
              if (!response.ok) throw new Error("Failed to load options");
              const data = await response.json() as { data: T[]; total: number };
              all.push(...data.data);
              if (all.length >= data.total || data.data.length === 0) return all;
              page++;
            }
          };
          const [studentList, batchList] = await Promise.all([
            fetchAll<Student>("/api/admin/students"),
            fetchAll<Batch>("/api/admin/batches"),
          ]);
          if (mounted) {
            setStudents(studentList);
            setBatches(batchList);
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
    if (formData.studentIds.length === 0) {
      setStudentError("Select at least one student to assign this task.");
      return;
    }
    setStudentError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          deadline: formData.deadline ? new Date(formData.deadline).toISOString() : "",
        }),
      });
      if (response.ok) {
        toast.success("Task assigned successfully");
        setIsDialogOpen(false);
        taskDraft.resetAll();
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

  if (!user) {
    if (authError) {
      return (
        <main className="flex min-h-screen items-center justify-center p-8">
          <div className="grid max-w-md gap-4 rounded-xl border border-border bg-card p-6 shadow-xs">
            <p className="text-sm font-medium text-destructive">{authError}</p>
            <div>
              <Link href="/login" className={buttonVariants({ size: "sm" })}>
                Sign in
              </Link>
            </div>
          </div>
        </main>
      );
    }
    return <main className="p-8">Loading task reports...</main>;
  }

  return (
    <AppShell user={user} title="Task Assignment & Review" subtitle="Assign technical work and review completion reports.">
      <section className="rounded-xl border border-border bg-card p-5 shadow-xs lg:p-6">
        <div className="flex flex-wrap items-center justify-end gap-2 pb-4 [&_button]:max-w-full [&_button]:whitespace-normal">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger render={<button type="button" className={buttonVariants()} />}>
              <Plus className="size-4 mr-2" />
              Assign New Task
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Assign New Task</DialogTitle>
                <DialogDescription>Create a new task and assign it to students</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <FloatingInput
                    id="title"
                    label="Title"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    items={[
                      { value: "PC Assembly", label: "PC Assembly" },
                      { value: "OS Configuration", label: "OS Configuration" },
                      { value: "Network Cabling", label: "Network Cabling" },
                      { value: "Hardware Diagnostics", label: "Hardware Diagnostics" },
                      { value: "Lab Maintenance", label: "Lab Maintenance" },
                      { value: "General Technical", label: "General Technical" },
                    ]}
                    value={formData.category || ""}
                    onValueChange={(value) => setFormData({ ...formData, category: value || "" })}
                  >
                    <SelectTrigger id="category" className="h-11">
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
                  <Textarea
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
                  <Select
                    items={[
                      { value: "ALL", label: "All batches" },
                      ...batches.map((batch) => ({ value: batch.id, label: `${batch.name} (${batch.section})` })),
                    ]}
                    value={formData.batchId || "ALL"}
                    onValueChange={(value) => setFormData({ ...formData, batchId: value === "ALL" ? "" : (value ?? "") })}
                  >
                    <SelectTrigger id="batchId" className="h-11">
                      <SelectValue placeholder="All batches">
                        {(value: string | null) => {
                          if (value === "ALL") return "All batches";
                          const batch = batches.find((item) => item.id === value);
                          return batch ? `${batch.name} (${batch.section})` : "Batch unavailable";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All batches</SelectItem>
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
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              studentIds: e.target.checked
                                ? [...formData.studentIds, student.id]
                                : formData.studentIds.filter((id) => id !== student.id)
                            });
                            setStudentError("");
                          }}
                        />
                        <span className="text-sm">{student.fullName} <span className="text-muted-foreground">({student.studentIdNo})</span></span>
                      </label>
                    ))}
                    {students.length === 0 && <p className="text-sm text-muted-foreground">No students available</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">{formData.studentIds.length} student(s) selected</p>
                  {studentError && <InlineError message={studentError} id="students-error" />}
                </div>
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="size-4 mr-2 animate-spin" />}
                    Assign Task
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <CardContent className="space-y-4">
          <DataTableToolbar
            search={search}
            onSearchChange={(value) => { setPage(1); setSearch(value); }}
            searchPlaceholder="Search tasks..."
            filters={
              <Select
                items={statusOptions.map((status) => ({
                  value: status,
                  label: status === "ALL" ? "All Statuses" : status.replace("_", " "),
                }))}
                value={statusFilter || "ALL"}
                onValueChange={(value) => { setPage(1); setStatusFilter(value === "ALL" ? "" : (value ?? "")); }}
              >
                <SelectTrigger size="sm" className="w-40" aria-label="Filter by status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === "ALL" ? "All Statuses" : status.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

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
              <div className="min-w-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="size-4" aria-hidden="true" />
                          Assignees
                        </span>
                      </TableHead>
                      <TableHead>
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="size-4" aria-hidden="true" />
                          Due date
                        </span>
                      </TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => {
                      const status = task.assignments[0]?.status ?? "ASSIGNED";
                      return (
                        <TableRow key={task.id}>
                          <TableCell className="font-medium">
                            <Link href={`/admin/tasks/${task.id}`} className="hover:underline">
                              {task.title}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{task.category}</TableCell>
                          <TableCell className="tabular-ledger">{task.assignments.length}</TableCell>
                          <TableCell className="tabular-ledger">
                            {formatSafeDate(task.deadline)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={status} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="min-w-0 max-w-full [&_div]:flex-wrap [&_button]:max-w-full [&_button]:whitespace-normal">
                <DataTablePagination
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
                />
              </div>
            </>
          )}
        </CardContent>
      </section>
    </AppShell>
  );
}
