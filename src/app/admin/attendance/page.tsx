"use client";

import * as React from "react";
import { StatusBadge } from "@/components/shell/StatusBadge";
import { AppShell } from "@/components/shell/AppShell";
import { EvidencePreview } from "@/components/shell/EvidencePreview";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { toast } from "sonner";
import { Image as ImageIcon, Edit, AlertTriangle, Loader2, Download, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTableToolbar } from "@/components/shell/DataTableToolbar";
import { InlineError } from "@/components/shell/InlineError";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [total, setTotal] = React.useState(0);
  const [remarks, setRemarks] = React.useState<Record<string, string>>({});
  const [remarkErrors, setRemarkErrors] = React.useState<Record<string, string>>({});
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [reviewItemId, setReviewItemId] = React.useState<string | null>(null);
  const [correctDialogOpen, setCorrectDialogOpen] = React.useState<string | null>(null);
  const [correctTimeIn, setCorrectTimeIn] = React.useState("");
  const [correctTimeOut, setCorrectTimeOut] = React.useState("");
  const [correctReason, setCorrectReason] = React.useState("");
  const [correctReasonError, setCorrectReasonError] = React.useState("");
  const [escalateDialogOpen, setEscalateDialogOpen] = React.useState<string | null>(null);
  const [escalateSummary, setEscalateSummary] = React.useState("");
  const [escalatePolicy, setEscalatePolicy] = React.useState("");
  const [escalateErrors, setEscalateErrors] = React.useState({ summary: "", policy: "" });

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
      if (records.ok) { const data = await records.json(); setItems(data.items); setTotal(data.total ?? data.items.length); }
    } catch {
      toast.error("Failed to load attendance queue");
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, statusFilter]);

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
        const response = await fetch(`/api/attendance?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Request failed");
        const data = await response.json();
        if (!controller.signal.aborted) { setItems(data.items); setTotal(data.total ?? data.items.length); }
      } catch {
        if (!controller.signal.aborted) toast.error("Failed to load attendance");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [page, pageSize, search, statusFilter]);

  const review = async (id: string, status: "APPROVED" | "REJECTED") => {
    const remark = remarks[id] ?? "";
    if (status === "REJECTED" && !remark.trim()) {
      setRemarkErrors((old) => ({ ...old, [id]: "Rejection remarks are mandatory." }));
      setReviewItemId(id);
      return;
    }
    setRemarkErrors((old) => ({ ...old, [id]: "" }));
    try {
      const response = await fetch(`/api/attendance/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, remarks: remark }),
      });
      if (response.ok) {
        toast.success(`Attendance ${status.toLowerCase()}`);
        setReviewItemId(null);
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
    if (!correctReason.trim()) {
      setCorrectReasonError("Correction reason is required.");
      return;
    }
    setCorrectReasonError("");
    try {
      const response = await fetch(`/api/attendance/${id}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeIn: new Date(correctTimeIn).toISOString(),
          timeOut: correctTimeOut ? new Date(correctTimeOut).toISOString() : null,
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
    const summaryError = escalateSummary.trim() ? "" : "Summary is required.";
    const policyError = escalatePolicy.trim() ? "" : "Policy details are required.";
    setEscalateErrors({ summary: summaryError, policy: policyError });
    if (summaryError || policyError) return;
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
  const reviewItem = items.find((item) => item.id === reviewItemId) ?? null;

  return (
    <AppShell user={user} title="Attendance Review Queue" subtitle="Review, correct, and escalate duty evidence.">
      <section className="rounded-xl border border-border bg-card p-5 shadow-xs lg:p-6">
        <CardContent className="space-y-4">
          <DataTableToolbar
            search={search}
            onSearchChange={(value) => { setPage(1); setSearch(value); }}
            searchPlaceholder="Search by student name or ID"
            filters={
              <Select
                items={[
                  { value: "ALL", label: "All statuses" },
                  { value: "PENDING", label: "Pending" },
                  { value: "APPROVED", label: "Approved" },
                  { value: "REJECTED", label: "Rejected" },
                  { value: "ESCALATED", label: "Escalated" },
                ]}
                value={statusFilter || "ALL"}
                onValueChange={(value) => { setPage(1); setStatusFilter(value === "ALL" ? "" : (value ?? "")); }}
              >
                <SelectTrigger size="sm" className="w-36" aria-label="Filter by status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="ESCALATED">Escalated</SelectItem>
                </SelectContent>
              </Select>
            }
          />

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
              <div className="min-w-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Shift date</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Review</TableHead>
                      <TableHead className="w-12 text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium">{item.student.fullName}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {item.student.studentIdNo}
                          </p>
                        </TableCell>
                        <TableCell className="tabular-ledger">
                          {new Date(item.shiftDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="tabular-ledger">
                          {item.recordedHours.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.isIrregular ? "IRREGULAR" : item.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Button variant="outline" size="sm" onClick={() => setReviewItemId(item.id)}>
                              <ImageIcon aria-hidden="true" className="size-4" />
                              Review
                            </Button>
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
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={<Button variant="ghost" size="icon" className="size-9" aria-label="More actions" />}
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  const toLocalInput = (iso: string) => {
                                    const d = new Date(iso);
                                    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                                  };
                                  setCorrectDialogOpen(item.id);
                                  setCorrectReasonError("");
                                  setCorrectTimeIn(toLocalInput(item.timeIn));
                                  setCorrectTimeOut(item.timeOut ? toLocalInput(item.timeOut) : "");
                                }}
                              >
                                <Edit className="size-4" />
                                Correct time
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setEscalateDialogOpen(item.id);
                                  setEscalateErrors({ summary: "", policy: "" });
                                }}
                              >
                                <AlertTriangle className="size-4" />
                                Escalate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                render={
                                  <a
                                    href={`/api/attendance/accreditation-pdf?studentId=${item.student.id}`}
                                    className="inline-flex w-full items-center gap-1.5"
                                  />
                                }
                              >
                                <Download className="size-4" />
                                Accreditation PDF
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
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

          {/* Review evidence: photos + remarks */}
          <Dialog open={reviewItemId !== null} onOpenChange={(open) => !open && setReviewItemId(null)}>
            <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Attendance evidence</DialogTitle>
                <DialogDescription>
                  {reviewItem?.student.fullName} ·{" "}
                  {reviewItem ? new Date(reviewItem.shiftDate).toLocaleDateString() : ""}
                </DialogDescription>
              </DialogHeader>
              {reviewItem && (
                <div className="grid gap-4">
                  <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Recorded Time In</p>
                      <p className="font-mono text-xs font-medium tabular-ledger">
                        {new Date(reviewItem.timeIn).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Recorded Time Out</p>
                      <p className="font-mono text-xs font-medium tabular-ledger">
                        {reviewItem.timeOut ? new Date(reviewItem.timeOut).toLocaleString() : "Open shift"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Recorded Duration</p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold tabular-ledger">
                          {reviewItem.recordedHours.toFixed(2)} hrs
                        </span>
                        <StatusBadge status={reviewItem.isIrregular ? "IRREGULAR" : reviewItem.status} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`remarks-${reviewItem.id}`}>Review remarks</Label>
                    <Textarea
                      id={`remarks-${reviewItem.id}`}
                      rows={3}
                      placeholder="Add a note for this review"
                      value={remarks[reviewItem.id] ?? ""}
                      onChange={(e) => {
                        setRemarks((old) => ({ ...old, [reviewItem.id]: e.target.value }));
                        setRemarkErrors((old) => ({ ...old, [reviewItem.id]: "" }));
                      }}
                      aria-invalid={Boolean(remarkErrors[reviewItem.id])}
                      aria-describedby={
                        remarkErrors[reviewItem.id] ? `remarks-${reviewItem.id}-error` : undefined
                      }
                    />
                    {remarkErrors[reviewItem.id] && (
                      <InlineError
                        message={remarkErrors[reviewItem.id]}
                        id={`remarks-${reviewItem.id}-error`}
                      />
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Time-In Photo</p>
                      <EvidencePreview
                        fileKey={reviewItem.photoInKey}
                        alt={`Time-In evidence for ${reviewItem.student.fullName}`}
                        emptyLabel="No Time-In photo recorded."
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Time-Out Photo</p>
                      <EvidencePreview
                        fileKey={reviewItem.photoOutKey}
                        alt={`Time-Out evidence for ${reviewItem.student.fullName}`}
                        emptyLabel="No Time-Out photo recorded yet."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    {reviewItem.status === "PENDING" && <>
                      <Button onClick={() => void review(reviewItem.id, "APPROVED")}>Approve</Button>
                      <Button variant="destructive" onClick={() => void review(reviewItem.id, "REJECTED")}>Reject</Button>
                    </>}
                    <Button variant="outline" onClick={() => setReviewItemId(null)}>
                      Close
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={correctDialogOpen !== null} onOpenChange={(open) => !open && setCorrectDialogOpen(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Correct Attendance Time</DialogTitle>
                <DialogDescription>Provide corrected time-in/out and mandatory reason</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {(() => {
                  const target = items.find((i) => i.id === correctDialogOpen);
                  if (!target) return null;
                  return (
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                      <p className="font-medium text-foreground">{target.student.fullName}</p>
                      <p className="mt-1 font-mono text-muted-foreground tabular-ledger">
                        Original In: {new Date(target.timeIn).toLocaleString()}
                        {target.timeOut ? ` · Out: ${new Date(target.timeOut).toLocaleString()}` : ""}
                      </p>
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  <Label htmlFor="correctTimeIn">Corrected Time-In</Label>
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
                    onChange={(e) => {
                      setCorrectReason(e.target.value);
                      setCorrectReasonError("");
                    }}
                    placeholder="Explain why the time needs correction"
                    rows={3}
                    aria-invalid={Boolean(correctReasonError)}
                    aria-describedby={correctReasonError ? "correctReason-error" : undefined}
                  />
                  {correctReasonError && (
                    <InlineError message={correctReasonError} id="correctReason-error" />
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCorrectDialogOpen(null)}>Cancel</Button>
                <Button onClick={() => correctDialogOpen && handleCorrect(correctDialogOpen)}>Save Correction</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={escalateDialogOpen !== null} onOpenChange={(open) => !open && setEscalateDialogOpen(null)}>
            <DialogContent className="sm:max-w-md">
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
                    onChange={(e) => {
                      setEscalateSummary(e.target.value);
                      setEscalateErrors((old) => ({ ...old, summary: "" }));
                    }}
                    placeholder="Brief summary of the issue"
                    rows={3}
                    aria-invalid={Boolean(escalateErrors.summary)}
                    aria-describedby={escalateErrors.summary ? "escalateSummary-error" : undefined}
                  />
                  {escalateErrors.summary && (
                    <InlineError message={escalateErrors.summary} id="escalateSummary-error" />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="escalatePolicy">Policy Details *</Label>
                  <Textarea
                    id="escalatePolicy"
                    value={escalatePolicy}
                    onChange={(e) => {
                      setEscalatePolicy(e.target.value);
                      setEscalateErrors((old) => ({ ...old, policy: "" }));
                    }}
                    placeholder="Relevant policy details and justification"
                    rows={4}
                    aria-invalid={Boolean(escalateErrors.policy)}
                    aria-describedby={escalateErrors.policy ? "escalatePolicy-error" : undefined}
                  />
                  {escalateErrors.policy && (
                    <InlineError message={escalateErrors.policy} id="escalatePolicy-error" />
                  )}
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
