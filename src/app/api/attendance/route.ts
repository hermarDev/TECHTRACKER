import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, canAccessBatchScope } from "@/lib/rbac";
import { db } from "@/lib/db";
import { saveUploadedObject, validateUploadFile } from "@/lib/storage";
import { calculateSessionHours, evaluateScheduleWindow } from "@/lib/hours";
import { normalizePagination } from "@/lib/validation";

export const attendanceInputSchema = z.object({
  action: z.enum(["TIME_IN", "TIME_OUT"]),
  scheduleId: z.string().min(1).optional(),
  attendanceId: z.string().min(1).optional(),
  shiftDate: z.string().min(1).optional(),
}).strict();

export function evaluateAttendanceSchedule(
  timeIn: Date,
  schedule: { startTime: string; endTime: string; graceMinutes: number }
) {
  return evaluateScheduleWindow({
    timeIn,
    scheduleStart: schedule.startTime,
    scheduleEnd: schedule.endTime,
    graceMinutes: schedule.graceMinutes,
  });
}

export function isMandatoryReviewRemarkValid(status: string, remarks: string) {
  return status !== "REJECTED" || remarks.trim().length > 0;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["STUDENT", "ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { searchParams } = request.nextUrl;
  const pagination = normalizePagination(searchParams.get("page"), searchParams.get("pageSize"));
  const search = searchParams.get("search")?.trim() ?? "";
  const status = searchParams.get("status") ?? undefined;
  const irregular = searchParams.get("irregular");
  const where: Record<string, unknown> = {};

  if (auth.user.role === "STUDENT") where.studentId = auth.user.id;
  if (search) {
    where.student = { fullName: { contains: search, mode: "insensitive" } };
  }
  if (status) where.status = status;
  if (irregular === "true") where.isIrregular = true;
  if (auth.user.role === "ADMIN") {
    where.batch = { coordinatorId: auth.user.id };
  }

  const [items, total] = await Promise.all([
    db.attendanceLog.findMany({
      where,
      include: { student: { select: { id: true, fullName: true, studentIdNo: true } }, schedule: true },
      orderBy: [{ shiftDate: "desc" }, { createdAt: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    db.attendanceLog.count({ where }),
  ]);
  return NextResponse.json({ items, total, page: pagination.page, pageSize: pagination.pageSize });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(["STUDENT"]);
  if (!auth.ok) return auth.response;
  const form = await request.formData();
  const forbiddenFields = ["latitude", "longitude", "geolocation", "gps", "location"];
  if (forbiddenFields.some((field) => form.has(field))) {
    return NextResponse.json({ error: "GPS and geolocation fields are not accepted." }, { status: 400 });
  }
  const parsed = attendanceInputSchema.safeParse({
    action: form.get("action"),
    scheduleId: form.get("scheduleId") || undefined,
    attendanceId: form.get("attendanceId") || undefined,
    shiftDate: form.get("shiftDate") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid attendance request. GPS fields are not supported." }, { status: 400 });
  }
  const photo = form.get("photo");
  if (!(photo instanceof File)) return NextResponse.json({ error: "A photo is required." }, { status: 400 });
  const validPhoto = validateUploadFile(photo);
  if (!validPhoto.ok || !photo.type.startsWith("image/")) {
    return NextResponse.json({ error: "Time-In and Time-Out photos must be valid images up to 5 MB." }, { status: 400 });
  }

  if (parsed.data.action === "TIME_IN") {
    if (!parsed.data.scheduleId || !parsed.data.shiftDate) {
      return NextResponse.json({ error: "Schedule and shift date are required." }, { status: 400 });
    }
    const batchId = auth.user.batchId;
    if (!batchId) return NextResponse.json({ error: "Student is not assigned to a batch." }, { status: 400 });
    const schedule = await db.schedule.findFirst({ where: { id: parsed.data.scheduleId, batchId, isActive: true } });
    if (!schedule) return NextResponse.json({ error: "Scheduled shift not found." }, { status: 404 });
    const shiftDate = parseDate(parsed.data.shiftDate);
    if (!shiftDate) return NextResponse.json({ error: "Invalid shift date." }, { status: 400 });
    const now = new Date();
    const evaluation = evaluateAttendanceSchedule(now, schedule);
    const upload = await saveUploadedObject("attendance", photo);
    const record = await db.attendanceLog.create({
      data: {
        studentId: auth.user.id,
        batchId,
        scheduleId: schedule.id,
        shiftDate,
        timeIn: now,
        photoInKey: upload.key,
        isIrregular: evaluation.isIrregular,
        irregularReason: evaluation.irregularReason,
      },
    });
    return NextResponse.json({ receipt: { id: record.id, action: "TIME_IN", confirmedAt: record.createdAt }, attendance: record }, { status: 201 });
  }

  if (!parsed.data.attendanceId) return NextResponse.json({ error: "Attendance record is required." }, { status: 400 });
  const existing = await db.attendanceLog.findFirst({ where: { id: parsed.data.attendanceId, studentId: auth.user.id } });
  if (!existing) return NextResponse.json({ error: "Attendance record not found." }, { status: 404 });
  if (existing.timeOut) return NextResponse.json({ error: "This attendance record is already timed out." }, { status: 409 });
  const now = new Date();
  const upload = await saveUploadedObject("attendance", photo);
  const record = await db.attendanceLog.update({
    where: { id: existing.id },
    data: { timeOut: now, photoOutKey: upload.key, recordedHours: calculateSessionHours(existing.timeIn, now) },
  });
  return NextResponse.json({ receipt: { id: record.id, action: "TIME_OUT", confirmedAt: record.updatedAt }, attendance: record });
}
