import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/rbac";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["STUDENT"]);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const assignment = await db.taskAssignment.findFirst({ where: { taskId: id, studentId: auth.user.id } });
  if (!assignment) return NextResponse.json({ error: "Task assignment not found." }, { status: 404 });
  if (assignment.status !== "ASSIGNED" && assignment.status !== "RETURNED") return NextResponse.json({ error: "Task cannot be started in its current state." }, { status: 409 });
  const updated = await db.taskAssignment.update({ where: { id: assignment.id }, data: { status: "IN_PROGRESS", startedAt: assignment.startedAt ?? new Date() } });
  return NextResponse.json({ assignment: updated });
}
