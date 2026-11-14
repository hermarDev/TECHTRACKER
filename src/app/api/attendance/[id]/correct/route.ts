import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, canAccessStudentRecord } from "@/lib/rbac";
import { calculateSessionHours } from "@/lib/hours";
import { writeAuditLog } from "@/lib/audit";

const correctionSchema = z.object({
  timeIn: z.string().datetime(),
  timeOut: z.string().datetime().nullable().optional(),
  correctionReason: z.string().trim().min(1).max(2000),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const parsed = correctionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Time-In, Time-Out, and correction reason are required." }, { status: 400 });
  const existing = await db.attendanceLog.findUnique({ where: { id }, include: { batch: true } });
  if (!existing || !canAccessStudentRecord(auth.user, existing.studentId, existing.batch.coordinatorId)) return NextResponse.json({ error: "Attendance record not found." }, { status: 404 });
  const timeIn = new Date(parsed.data.timeIn);
  const timeOut = parsed.data.timeOut ? new Date(parsed.data.timeOut) : null;
  if (timeOut && timeOut <= timeIn) return NextResponse.json({ error: "Time-Out must be after Time-In." }, { status: 400 });
  const updated = await db.attendanceLog.update({
    where: { id },
    data: { timeIn, timeOut, recordedHours: calculateSessionHours(timeIn, timeOut), correctedById: auth.user.id, correctionReason: parsed.data.correctionReason, correctedAt: new Date() },
  });
  await writeAuditLog({ actorId: auth.user.id, action: "ATTENDANCE_CORRECTED", entityType: "AttendanceLog", entityId: id, details: { before: { timeIn: existing.timeIn.toISOString(), timeOut: existing.timeOut?.toISOString() ?? null }, after: { timeIn: timeIn.toISOString(), timeOut: timeOut?.toISOString() ?? null }, reason: parsed.data.correctionReason } });
  return NextResponse.json({ attendance: updated });
}
