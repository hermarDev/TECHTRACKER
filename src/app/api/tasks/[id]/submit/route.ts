import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/rbac";
import { saveUploadedObject, validateUploadFile } from "@/lib/storage";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["STUDENT"]);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const form = await request.formData();
  const summary = String(form.get("summary") ?? "").trim();
  if (!summary) return NextResponse.json({ error: "Completion summary is required." }, { status: 400 });
  const assignment = await db.taskAssignment.findFirst({ where: { taskId: id, studentId: auth.user.id } });
  if (!assignment) return NextResponse.json({ error: "Task assignment not found." }, { status: 404 });
  if (!["IN_PROGRESS", "RETURNED"].includes(assignment.status)) return NextResponse.json({ error: "Task is not ready for submission." }, { status: 409 });
  const files = form.getAll("attachments").filter((value): value is File => value instanceof File);
  const keys: string[] = [];
  for (const file of files) {
    const valid = validateUploadFile(file);
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
    keys.push((await saveUploadedObject("tasks", file)).key);
  }
  const version = (await db.taskSubmission.count({ where: { assignmentId: assignment.id } })) + 1;
  const submission = await db.$transaction(async (tx) => {
    const created = await tx.taskSubmission.create({ data: { assignmentId: assignment.id, version, summary, attachmentKeys: keys } });
    await tx.taskAssignment.update({ where: { id: assignment.id }, data: { status: "SUBMITTED" } });
    return created;
  });
  return NextResponse.json({ submission }, { status: 201 });
}
