import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, canAccessStudentRecord } from "@/lib/rbac";

const escalationSchema = z.object({ summary: z.string().trim().min(1).max(2000), policyDetails: z.string().trim().min(1).max(4000) });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const parsed = escalationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Summary and policy details are required." }, { status: 400 });
  const attendance = await db.attendanceLog.findUnique({ where: { id }, include: { batch: true } });
  if (!attendance || !canAccessStudentRecord(auth.user, attendance.studentId, attendance.batch.coordinatorId)) return NextResponse.json({ error: "Attendance record not found." }, { status: 404 });
  const result = await db.$transaction(async (tx) => {
    const escalation = await tx.escalationCase.create({ data: { sourceType: "ATTENDANCE", sourceId: id, raisedById: auth.user.id, studentId: attendance.studentId, summary: parsed.data.summary, policyDetails: parsed.data.policyDetails } });
    await tx.attendanceLog.update({ where: { id }, data: { status: "ESCALATED" } });
    return escalation;
  });
  return NextResponse.json({ escalation: result }, { status: 201 });
}
