"use client";

import * as React from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { AppShell } from "@/components/shell/AppShell";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { toast } from "sonner";
import { DataTableToolbar } from "@/components/shell/DataTableToolbar";
import { Calendar, Loader2 } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type User = { id: string; fullName: string; email: string; role: "STUDENT" };
type Task = { 
  id: string; 
  title: string; 
  deadline: string; 
  category: string;
  assignments: Array<{ id: string; status: string }> 
};

export default function TasksPage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) setUser(data.user); })
      .catch((error) => { if (error.name !== "AbortError") toast.error("Failed to load account"); });
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

  const statusOptions = ["ALL", "ASSIGNED", "IN_PROGRESS", "SUBMITTED", "RETURNED", "ACCEPTED"];

  if (!user) return <main className="p-8">Loading tasks...</main>;

  return (
    <AppShell user={user} title="Technical Tasks" subtitle="Start, document, and resubmit assigned work.">
      <section className="rounded-sm border border-border bg-card p-4 lg:p-5">
        <CardHeader className="pb-4">
          <CardTitle>My Tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTableToolbar
            search={search}
            onSearchChange={(value) => { setPage(1); setSearch(value); }}
            searchPlaceholder="Search tasks..."
            filters={
              <Select
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
                            <Link href={`/tasks/${task.id}`} className="hover:underline">
                              {task.title}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{task.category}</TableCell>
                          <TableCell className="tabular-ledger">
                            {new Date(task.deadline).toLocaleDateString()}
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