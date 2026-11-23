import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/rbac";
import { normalizePagination } from "@/lib/validation";

const taskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(1).max(10000),
  category: z.string().trim().min(1).max(80).default("General Technical"),
  targetLab: z.string().trim().max(120).optional().nullable(),
  targetUnits: z.string().trim().max(500).optional().nullable(),
  deadline: z.string().datetime(),
  studentIds: z.array(z.string().min(1)).min(1),
});

const TASK_STATUSES = ["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "RETURNED", "ACCEPTED"];

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(["STUDENT", "ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { searchParams } = request.nextUrl;
  const pagination = normalizePagination(searchParams.get("page"), searchParams.get("pageSize"));
  const search = searchParams.get("search")?.trim() ?? "";
  const rawStatus = searchParams.get("status") ?? "";
  // Status lives on the assignment, not the task; ignore unknown values instead of throwing.
  const status = TASK_STATUSES.includes(rawStatus) ? rawStatus : "";
  const where: Record<string, unknown> = {};
  if (auth.user.role === "STUDENT") where.assignments = { some: { studentId: auth.user.id, ...(status && { status }) } };
  if (auth.user.role === "ADMIN") where.createdById = auth.user.id;
  if (search) where.title = { contains: search, mode: "insensitive" };
  if (status && auth.user.role !== "STUDENT") where.assignments = { some: { status } };
  const [items, total] = await Promise.all([
    db.task.findMany({ where, include: { assignments: { where: auth.user.role === "STUDENT" ? { studentId: auth.user.id } : undefined, include: { student: { select: { id: true, fullName: true, studentIdNo: true } } } } }, orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.take }),
    db.task.count({ where }),
  ]);
  return NextResponse.json({ items, total, page: pagination.page, pageSize: pagination.pageSize });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(["ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const parsed = taskSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid task assignment.", details: parsed.error.flatten() }, { status: 400 });
  const students = await db.user.findMany({ where: { id: { in: parsed.data.studentIds }, role: "STUDENT", status: "ACTIVE", ...(auth.user.role === "ADMIN" ? { batch: { coordinatorId: auth.user.id } } : {}) }, select: { id: true } });
  if (students.length !== parsed.data.studentIds.length) return NextResponse.json({ error: "One or more students are outside your scope." }, { status: 403 });
  const task = await db.$transaction(async (tx) => {
    const created = await tx.task.create({ data: { title: parsed.data.title, instructions: parsed.data.instructions, category: parsed.data.category, targetLab: parsed.data.targetLab ?? null, targetUnits: parsed.data.targetUnits ?? null, deadline: new Date(parsed.data.deadline), createdById: auth.user.id } });
    await tx.taskAssignment.createMany({ data: students.map((student) => ({ taskId: created.id, studentId: student.id })) });
    await tx.notification.createMany({ data: students.map((student) => ({ userId: student.id, type: "ASSIGNMENT", title: "New task assigned", body: parsed.data.title, link: `/tasks/${created.id}` })) });
    return created;
  });
  return NextResponse.json({ task }, { status: 201 });
}
