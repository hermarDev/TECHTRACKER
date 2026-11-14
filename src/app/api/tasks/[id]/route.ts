import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/rbac";

export function isStudentVisibleRemark(remark: { visibility: string }) {
  return remark.visibility === "STUDENT_VISIBLE";
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["STUDENT", "ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const task = await db.task.findUnique({ where: { id }, include: { assignments: { include: { student: { select: { id: true, fullName: true, studentIdNo: true } }, submissions: { orderBy: { version: "desc" } }, remarks: { orderBy: { createdAt: "asc" } } } } } });
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const visibleAssignments = auth.user.role === "STUDENT"
    ? task.assignments.filter((assignment) => assignment.studentId === auth.user.id).map((assignment) => ({ ...assignment, remarks: assignment.remarks.filter(isStudentVisibleRemark) }))
    : auth.user.role === "ADMIN"
      ? task.assignments.filter((assignment) => task.createdById === auth.user.id)
      : task.assignments;
  if (visibleAssignments.length === 0) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ task: { ...task, assignments: visibleAssignments } });
}
