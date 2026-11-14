"use client";

import * as React from "react";
import { AppShell } from "@/components/shell/AppShell";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { toast } from "sonner";
import { Search, Image, Edit, AlertTriangle, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type User = { id: string; fullName: string; email: string; role: "ADMIN" | "SUPERADMIN" };
type Item = { 
  id: string; 
  status: string; 
  isIrregular: boolean; 
  recordedHours: number; 
  student: { id: string; fullName: string; studentIdNo: string | null };
  photoInKey: string;
  photoOutKey?: string | undefined;
  shiftDate: string;
  timeIn: string;
  timeOut?: string | null;
};

export default function AdminAttendancePage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [items, setItems] = React.useState<Item[]>([]);
  const [remarks, setRemarks] = React.useState<Record<string, string>>({});
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [correctDialogOpen, setCorrectDialogOpen] = React.useState<string | null>(null);
  const [correctTimeIn, setCorrectTimeIn] = React.useState("");
  const [correctTimeOut, setCorrectTimeOut] = React.useState("");
  const [correctReason, setCorrectReason] = React.useState("");
  const [escalateDialogOpen, setEscalateDialogOpen] = React.useState<string | null>(null);
  const [escalateSummary, setEscalateSummary] = React.useState("");
  const [escalatePolicy, setEscalatePolicy] = React.useState("");

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      });
      const [me, records] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/attendance?${params.toString()}`)
      ]);
      if (me.ok) setUser((await me.json()).user);
      if (records.ok) setItems((await records.json()).items);
    } catch {
      toast.error("Failed to load attendance queue");
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
      const [me, records] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/attendance?${params.toString()}`)
      ]);
      if (mounted) {
        if (me.ok) setUser((await me.json()).user);
        if (records.ok) setItems((await records.json()).items);
        setIsLoading(false);
      }
    };
    doLoad();
    return () => { mounted = false; };
  }, [page, pageSize, search, statusFilter]);

  const review = async (id: string, status: "APPROVED" | "REJECTED") => {
    const remark = remarks[id] ?? "";
    if (status === "REJECTED" && !remark.trim()) {
      toast.error("Rejection remarks are mandatory.");
      return;
    }
    try {
      const response = await fetch(`/api/attendance/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, remarks: remark }),
      });
      if (response.ok) {
        toast.success(`Attendance ${status.toLowerCase()}`);
        await load();
      } else {
        const body = await response.json();
        toast.error(body.error || "Failed to review");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const handleCorrect = async (id: string) => {
    if (!correctReason.trim()) return toast.error("Correction reason is required.");
    try {
      const response = await fetch(`/api/attendance/${id}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeIn: correctTimeIn,
          timeOut: correctTimeOut || null,
          correctionReason: correctReason,
        }),
      });
      if (response.ok) {
        toast.success("Attendance time corrected");
        setCorrectDialogOpen(null);
        setCorrectTimeIn("");
        setCorrectTimeOut("");
        setCorrectReason("");
        await load();
      } else {
        const body = await response.json();
        toast.error(body.error || "Failed to correct");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const handleEscalate = async (id: string) => {
    if (!escalateSummary.trim() || !escalatePolicy.trim()) {
      return toast.error("Summary and policy details are required.");
    }
    try {
      const response = await fetch(`/api/attendance/${id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: escalateSummary, policyDetails: escalatePolicy }),
      });
      if (response.ok) {
        toast.success("Escalated to SuperAdmin");
        setEscalateDialogOpen(null);
        setEscalateSummary("");
        setEscalatePolicy("");
        await load();
      } else {
        const body = await response.json();
        toast.error(body.error || "Failed to escalate");
      }
    } catch {
      toast.error("Network error");
    }
  };

  if (!user) return <main className="p-8">Loading review queue...</main>;

  return (
    <AppShell user={user} title="Attendance Review Queue" subtitle="Review, correct, and escalate duty evidence.">
      <section className="rounded-xl border border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle>Review Queue</CardTitle>
          <CardDescription>Filter and search attendance records for review</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder="Search by student name or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-64"
              />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value || "")}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="ESCALATED">Escalated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No attendance records found.
            </div>
          ) : (
            <>
              <div className="divide-y">
                {items.map((item) => (
                  <article key={item.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]">
                    <div>
                      <p className="font-medium">
                        {item.student.fullName} 
                        <span className="tabular-ledger text-muted-foreground ml-2">
                          {item.student.studentIdNo}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(item.shiftDate).toLocaleDateString()} · 
                        {item.recordedHours.toFixed(2)} recorded hours
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge 
                          variant={item.isIrregular ? "destructive" : item.status === "APPROVED" ? "default" : "secondary"}
                          className={item.isIrregular ? "bg-destructive/10 text-destructive" : ""}
                        >
                          {item.isIrregular ? "IRREGULAR" : item.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Dialog>
                        <DialogTrigger>
                          <Button variant="outline" size="sm">
                            <Image className="size-3 mr-1" />
                            View Photos
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90dvh]">
                          <DialogHeader>
                            <DialogTitle>Photo Evidence</DialogTitle>
                            <DialogDescription>
                              {item.student.fullName} · {new Date(item.shiftDate).toLocaleDateString()}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Time-In Photo</p>
                              <img 
                                src={`/api/files/${item.photoInKey}`} 
                                alt="Time-In" 
                                className="w-full h-auto rounded-lg border object-contain max-h-[60vh]"
                              />
                            </div>
                            {item.photoOutKey && (
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Time-Out Photo</p>
                                <img 
                                  src={`/api/files/${item.photoOutKey}`} 
                                  alt="Time-Out" 
                                  className="w-full h-auto rounded-lg border object-contain max-h-[60vh]"
                                />
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>

                      <input
                        aria-label="Review remarks"
                        className="h-10 rounded-md border bg-background px-3 w-48 sm:w-64"
                        placeholder="Remarks"
                        value={remarks[item.id] ?? ""}
                        onChange={(e) => setRemarks((old) => ({ ...old, [item.id]: e.target.value }))}
                      />
                      <Button 
                        size="sm" 
                        onClick={() => void review(item.id, "APPROVED")}
                        disabled={item.status !== "PENDING"}
                      >
                        Approve
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => void review(item.id, "REJECTED")}
                        disabled={item.status !== "PENDING"}
                      >
                        Reject
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => { setCorrectDialogOpen(item.id); setCorrectTimeIn(new Date(item.timeIn).toISOString().slice(0, 16)); setCorrectTimeOut(item.timeOut ? new Date(item.timeOut).toISOString().slice(0, 16) : ""); }}
                      >
                        <Edit className="size-3 mr-1" />
                        Correct Time
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setEscalateDialogOpen(item.id)}
                      >
                        <AlertTriangle className="size-3 mr-1" />
                        Escalate
                      </Button>
                      <Button variant="outline" size="sm" render={() => (
                        <a href={`/api/attendance/accreditation-pdf?studentId=${item.student.id}`} className="inline-flex items-center gap-1">
                          <Download className="size-3" />
                          Accreditation PDF
                        </a>
                      )} />
                    </div>
                  </article>
                ))}
              </div>
              <DataTablePagination 
                page={page} 
                pageSize={pageSize} 
                total={items.length} 
                onPageChange={setPage} 
                onPageSizeChange={setPageSize} 
              />
            </>
          )}

          <Dialog open={correctDialogOpen !== null} onOpenChange={(open) => !open && setCorrectDialogOpen(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Correct Attendance Time</DialogTitle>
                <DialogDescription>Provide corrected time-in/out and mandatory reason</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="correctTimeIn">Time-In *</Label>
                  <Input
                    id="correctTimeIn"
                    type="datetime-local"
                    value={correctTimeIn}
                    onChange={(e) => setCorrectTimeIn(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="correctTimeOut">Time-Out</Label>
                  <Input
                    id="correctTimeOut"
                    type="datetime-local"
                    value={correctTimeOut}
                    onChange={(e) => setCorrectTimeOut(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="correctReason">Correction Reason *</Label>
                  <Textarea
                    id="correctReason"
                    value={correctReason}
                    onChange={(e) => setCorrectReason(e.target.value)}
                    placeholder="Explain why the time needs correction"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCorrectDialogOpen(null)}>Cancel</Button>
                <Button onClick={() => correctDialogOpen && handleCorrect(correctDialogOpen)}>Save Correction</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={escalateDialogOpen !== null} onOpenChange={(open) => !open && setEscalateDialogOpen(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Escalate to SuperAdmin</DialogTitle>
                <DialogDescription>Provide summary and policy details for escalation</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="escalateSummary">Summary *</Label>
                  <Textarea
                    id="escalateSummary"
                    value={escalateSummary}
                    onChange={(e) => setEscalateSummary(e.target.value)}
                    placeholder="Brief summary of the issue"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="escalatePolicy">Policy Details *</Label>
                  <Textarea
                    id="escalatePolicy"
                    value={escalatePolicy}
                    onChange={(e) => setEscalatePolicy(e.target.value)}
                    placeholder="Relevant policy details and justification"
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEscalateDialogOpen(null)}>Cancel</Button>
                <Button variant="destructive" onClick={() => escalateDialogOpen && handleEscalate(escalateDialogOpen)}>Escalate</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </section>
    </AppShell>
  );
}