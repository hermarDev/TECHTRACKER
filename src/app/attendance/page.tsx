"use client";

import * as React from "react";
import Image from "next/image";
import { AppShell } from "@/components/shell/AppShell";
import { DataTablePagination } from "@/components/shell/DataTablePagination";
import { useDraftForm } from "@/hooks/useDraftForm";
import { toast } from "sonner";
import { Camera, Download, Image as ImageIcon, CheckCircle2, Loader2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type User = { id: string; fullName: string; email: string; role: "STUDENT"; studentIdNo?: string | null; section?: string | null; preOjtCompleted?: boolean };
type Attendance = { 
  id: string; 
  status: string; 
  timeIn: string; 
  timeOut?: string | null; 
  recordedHours: number; 
  isIrregular: boolean;
  studentId: string;
  photoInKey: string;
  photoOutKey?: string | null;
  schedule?: { label: string } | null;
};
type Schedule = { id: string; label: string; startTime: string; endTime: string; graceMinutes: number; batchId: string };

export default function AttendancePage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [items, setItems] = React.useState<Attendance[]>([]);
  const [total, setTotal] = React.useState(0);
  const [schedules, setSchedules] = React.useState<Schedule[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [cameraStream, setCameraStream] = React.useState<MediaStream | null>(null);
  const [isCameraOpen, setIsCameraOpen] = React.useState(false);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [previewPhoto, setPreviewPhoto] = React.useState<string | null>(null);
  
  const form = useDraftForm("techtracker-attendance-draft", { scheduleId: "", shiftDate: "" });

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [me, attendance] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/attendance?page=${page}&pageSize=${pageSize}`)
      ]);
      if (me.ok) setUser((await me.json()).user);
      if (attendance.ok) {
        const data = await attendance.json();
        setItems(data.items);
        setTotal(data.total ?? data.items.length);
        setSchedules(data.schedules || []);
      }
    } catch {
      toast.error("Failed to load attendance data");
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize]);

  React.useEffect(() => {
    let mounted = true;
    const doLoad = async () => {
      const [me, attendance] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/attendance?page=${page}&pageSize=${pageSize}`)
      ]);
      if (mounted) {
        if (me.ok) setUser((await me.json()).user);
        if (attendance.ok) {
          const data = await attendance.json();
          setItems(data.items);
          setTotal(data.total ?? data.items.length);
          setSchedules(data.schedules || []);
        }
        setIsLoading(false);
      }
    };
    doLoad();
    return () => { mounted = false; };
  }, [page, pageSize]);

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" },
        audio: false 
      });
      setCameraStream(stream);
      setIsCameraOpen(true);
    } catch {
      toast.error("Camera access denied. Please use file upload instead.");
    }
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
  };

  // Every close path (Escape, overlay, close button) must release the camera.
  const handleCameraOpenChange = (open: boolean) => {
    if (open) {
      void openCamera();
    } else {
      closeCamera();
    }
  };

  const takePhoto = async () => {
    if (!cameraStream) return;
    const video = document.createElement("video");
    video.srcObject = cameraStream;
    await video.play();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      // Convert to File
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], "attendance-photo.jpg", { type: "image/jpeg" });
          setPhotoFile(file);
          setPreviewPhoto(dataUrl);
        });
    }
    closeCamera();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      setPhotoFile(file);
      const url = URL.createObjectURL(file);
      setPreviewPhoto(url);
    }
  };

  const submit = async (action: "TIME_IN" | "TIME_OUT", attendanceId?: string) => {
    if (!photoFile) return toast.error("A photo is required.");
    setIsSubmitting(true);
    try {
      const data = new FormData();
      data.set("action", action);
      data.set("photo", photoFile);
      if (action === "TIME_IN") { 
        data.set("scheduleId", form.values.scheduleId); 
        data.set("shiftDate", form.values.shiftDate); 
      }
      if (attendanceId) data.set("attendanceId", attendanceId);
      const response = await fetch("/api/attendance", { method: "POST", body: data });
      const body = await response.json();
      if (response.ok) {
        toast.success(`Confirmed receipt: ${body.receipt.id}`);
        form.clearDraft();
        setPhotoFile(null);
        setPreviewPhoto(null);
        await load();
      } else {
        toast.error(body.error || "Failed to record attendance");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return <main className="p-8">Loading attendance...</main>;

  return (
    <AppShell user={user} title="Attendance" subtitle="Record duty and review the status of previous punches.">
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
        <section className="rounded-xl border border-border bg-card p-5 shadow-xs lg:p-6">
          <CardHeader className="px-0 pb-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Record duty</CardTitle>
              <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {items.some((item) => !item.timeOut) ? "Active shift" : "No active shift"}
              </span>
            </div>
            <CardDescription>Select a shift and evidence. No GPS is requested.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-0 pb-0">
            <div className="space-y-2">
              <Label htmlFor="scheduleId">Scheduled shift</Label>
              <Select
                items={schedules.map((schedule) => ({
                  value: schedule.id,
                  label: `${schedule.label} (${schedule.startTime}–${schedule.endTime})`,
                }))}
                value={form.values.scheduleId || ""}
                onValueChange={(value) => form.setValues({ scheduleId: value || "" })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select a scheduled shift">
                    {(value: string | null) => {
                      if (!value) return "Select a scheduled shift";
                      const schedule = schedules.find((item) => item.id === value);
                      return schedule
                        ? `${schedule.label} (${schedule.startTime}–${schedule.endTime})`
                        : "Scheduled shift unavailable";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {schedules.map((schedule) => (
                    <SelectItem key={schedule.id} value={schedule.id}>
                      {schedule.label} ({schedule.startTime}–{schedule.endTime})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="shiftDate">Shift date</Label>
              <Input
                id="shiftDate"
                type="date"
                className="h-11"
                value={form.values.shiftDate}
                onChange={(e) => form.setValues({ shiftDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Evidence photo</Label>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Dialog open={isCameraOpen} onOpenChange={handleCameraOpenChange}>
                    <DialogTrigger
                      render={
                        <button
                          type="button"
                          className={buttonVariants({ variant: "outline" })}
                          disabled={isCameraOpen}
                        />
                      }
                    >
                      <Camera className="size-4 mr-2" />
                      Open Camera
                    </DialogTrigger>
                    <DialogContent className="max-w-sm max-h-[90dvh]">
                      <DialogHeader>
                        <DialogTitle>Camera Capture</DialogTitle>
                        <DialogDescription>Position yourself in the frame and click Take Photo</DialogDescription>
                      </DialogHeader>
                      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                        {cameraStream && (
                          <video 
                            ref={(el) => { if (el) el.srcObject = cameraStream; }} 
                            autoPlay 
                            playsInline 
                            className="w-full h-full object-cover" 
                          />
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={closeCamera}>Cancel</Button>
                        <Button onClick={takePhoto} disabled={!cameraStream}>
                          <Camera className="size-4 mr-2" />
                          Take Photo
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button variant="outline" onClick={() => document.getElementById("photo-upload")?.click()}>
                    <ImageIcon className="size-4 mr-2" />
                    Choose File
                  </Button>
                </div>
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {previewPhoto && (
                  <div className="relative w-fit">
                    <Image src={previewPhoto} alt="Preview" width={96} height={96} unoptimized className="h-24 w-24 rounded-lg border object-cover" />
                    <button
                      type="button"
                      onClick={() => { setPhotoFile(null); setPreviewPhoto(null); }}
                      className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground size-6 hover:bg-destructive/90"
                      aria-label="Remove photo"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <Button 
              className="w-full min-h-11" 
              onClick={() => void submit("TIME_IN")} 
              disabled={isSubmitting || !form.values.scheduleId || !form.values.shiftDate || !photoFile}
            >
              {isSubmitting && <Loader2 className="size-4 mr-2 animate-spin" />}
              Confirm Time-In
            </Button>
          </CardContent>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-xs lg:p-6">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-0 pb-4">
            <div>
              <CardTitle>My attendance</CardTitle>
              <CardDescription>
                {user.preOjtCompleted
                  ? "Pre-OJT completed. Download your 100-Hour Internal Duty Accreditation Summary Log (PDF)."
                  : "Accreditation PDF unlocks after 100 credited hours and all assigned tasks are accepted."}
              </CardDescription>
            </div>
            {user.preOjtCompleted ? (
              <a
                href={`/api/attendance/accreditation-pdf?studentId=${user.id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Download className="size-3" />
                Download Accreditation Log (PDF)
              </a>
            ) : (
              <Button variant="outline" size="sm" disabled title="Requires 100 credited hours and all assigned tasks accepted">
                <Download className="size-3" />
                Accreditation PDF Locked
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No attendance records yet.
              </div>
            ) : (
              <>
                <div className="divide-y">
                  {items.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                      <div>
                        <p className="font-medium tabular-ledger">{new Date(item.timeIn).toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.schedule?.label && <span className="mr-2">{item.schedule.label} · </span>}
                          {item.recordedHours.toFixed(2)} hours
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={item.isIrregular ? "destructive" : item.status === "APPROVED" ? "default" : "secondary"}
                          className={item.isIrregular ? "bg-destructive/10 text-destructive" : ""}
                        >
                          {item.isIrregular ? "IRREGULAR" : item.status}
                        </Badge>
                        {!item.timeOut && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => void submit("TIME_OUT", item.id)}
                            disabled={isSubmitting}
                          >
                            Time-Out
                          </Button>
                        )}
                        {item.timeOut && (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="size-3 mr-1" />
                            Completed
                          </Badge>
                        )}
                      </div>
                    </div>
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
      </div>
    </AppShell>
  );
}
