"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { useDraftForm } from "@/hooks/useDraftForm";
import { toast } from "sonner";
import { Search, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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

  const draft = useDraftForm("techtracker-task-search", { search: "" });

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
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
    } catch {
      toast.error("Failed to load tasks");
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, statusFilter]);

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

  const statusOptions = ["ALL", "ASSIGNED", "IN_PROGRESS", "SUBMITTED", "RETURNED", "ACCEPTED"];

  if (!user) return <main className="p-8">Loading tasks...</main>;

  return (
    <AppShell user={user} title="Technical Tasks" subtitle="Start, document, and resubmit assigned work.">
      <section className="rounded-xl border border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle>My Tasks</CardTitle>
          <CardDescription>Filter and search your assigned technical tasks</CardDescription>
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
                {tasks.map((task) => {
                  const assignment = task.assignments[0];
                  const status = assignment?.status ?? "ASSIGNED";
                  return (
                    <Link 
                      href={`/tasks/${task.id}`} 
                      key={task.id} 
                      className="rounded-xl border border-border bg-card p-5 hover:bg-muted transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h2 className="font-semibold truncate">{task.title}</h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {task.category} · Due {new Date(task.deadline).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge 
                          variant={
                            status === "ACCEPTED" ? "default" :
                            status === "RETURNED" ? "destructive" :
                            status === "SUBMITTED" ? "secondary" :
                            "outline"
                          }
                          className={
                            status === "ACCEPTED" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
                            status === "RETURNED" ? "bg-destructive/10 text-destructive" :
                            ""
                          }
                        >
                          {status.replace("_", " ")}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
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