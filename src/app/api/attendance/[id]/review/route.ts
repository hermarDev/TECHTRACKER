import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, canAccessStudentRecord } from "@/lib/rbac";
import { calculateSessionHours } from "@/lib/hours";
import { writeAuditLog } from "@/lib/audit";

const reviewSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]), remarks: z.string().max(2000).default("") });

export function canMarkPreOjtCompleted(creditedHours: number, requiredHours: number, allAssignedTasksAccepted: boolean) {
  return creditedHours >= requiredHours && allAssignedTasksAccepted;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const parsed = reviewSchema.safeParse(await request.json());
  if (!parsed.success || (parsed.data.status === "REJECTED" && !parsed.data.remarks.trim())) {
    return NextResponse.json({ error: "Rejection remarks are mandatory." }, { status: 400 });
  }
  const attendance = await db.attendanceLog.findUnique({ where: { id }, include: { batch: true } });
  if (!attendance || !canAccessStudentRecord(auth.user, attendance.studentId, attendance.batch.coordinatorId)) {
    return NextResponse.json({ error: "Attendance record not found." }, { status: 404 });
  }
  const credited = parsed.data.status === "APPROVED"
    ? calculateSessionHours(attendance.timeIn, attendance.timeOut)
    : 0;
  const updated = await db.$transaction(async (tx) => {
    const record = await tx.attendanceLog.update({
      where: { id },
      data: {
        status: parsed.data.status,
        creditedHours: credited,
        reviewerId: auth.user.id,
        reviewerRemarks: parsed.data.remarks.trim() || null,
        reviewedAt: new Date(),
      },
    });
    if (parsed.data.status === "APPROVED") {
      const student = await tx.user.findUnique({ where: { id: attendance.studentId }, select: { requiredHours: true } });
      const logs = await tx.attendanceLog.findMany({ where: { studentId: attendance.studentId }, select: { status: true, creditedHours: true } });
      const pendingTasks = await tx.taskAssignment.count({ where: { studentId: attendance.studentId, status: { not: "ACCEPTED" } } });
      const total = logs.reduce((sum, log) => sum + (log.status === "APPROVED" ? log.creditedHours : 0), 0);
      if (student && canMarkPreOjtCompleted(total, student.requiredHours, pendingTasks === 0)) {
        await tx.user.update({ where: { id: attendance.studentId }, data: { preOjtCompleted: true, preOjtCompletedAt: new Date() } });
      }
    }
    return record;
  });
  await writeAuditLog({ actorId: auth.user.id, action: `ATTENDANCE_${parsed.data.status}`, entityType: "AttendanceLog", entityId: id, details: { remarks: parsed.data.remarks } });
  return NextResponse.json({ attendance: updated });
}
