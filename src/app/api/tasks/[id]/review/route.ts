import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/rbac";

export const taskReviewInputSchema = z.object({
  assignmentId: z.string().min(1).optional(),
  status: z.enum(["ACCEPTED", "RETURNED"]),
  studentRemark: z.string().trim().max(4000).optional(),
  internalNote: z.string().trim().max(4000).optional(),
}).superRefine((value, ctx) => {
  if (value.status === "RETURNED" && !value.studentRemark) ctx.addIssue({ code: "custom", path: ["studentRemark"], message: "Student-visible return remarks are mandatory." });
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const parsed = taskReviewInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A student-visible remark is mandatory when returning a task.", details: parsed.error.flatten() }, { status: 400 });
  const task = await db.task.findUnique({ where: { id }, select: { id: true, createdById: true } });
  if (!task || (auth.user.role === "ADMIN" && task.createdById !== auth.user.id)) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const assignment = await db.taskAssignment.findFirst({ where: { taskId: id, ...(parsed.data.assignmentId ? { id: parsed.data.assignmentId } : {}) } });
  if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.taskAssignment.update({ where: { id: assignment.id }, data: { status: parsed.data.status, acceptedAt: parsed.data.status === "ACCEPTED" ? new Date() : null } });
    const remarks = [];
    if (parsed.data.studentRemark) remarks.push({ assignmentId: assignment.id, authorId: auth.user.id, visibility: "STUDENT_VISIBLE" as const, body: parsed.data.studentRemark });
    if (parsed.data.internalNote) remarks.push({ assignmentId: assignment.id, authorId: auth.user.id, visibility: "INTERNAL_STAFF_ONLY" as const, body: parsed.data.internalNote });
    if (remarks.length) await tx.taskRemark.createMany({ data: remarks });
    await tx.notification.create({ data: { userId: assignment.studentId, type: "TASK_REVIEW", title: parsed.data.status === "ACCEPTED" ? "Task accepted" : "Task returned for revision", body: parsed.data.studentRemark ?? "Your task review was updated.", link: `/tasks/${id}` } });
    return result;
  });
  return NextResponse.json({ assignment: updated });
}
