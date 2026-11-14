import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { normalizePagination } from "@/lib/validation";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const verifySchema = z.object({
  studentId: z.string().uuid("Invalid student id"),
});

export async function GET(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const url = new URL(req.url);
  const { page, pageSize, skip, take } = normalizePagination(url.searchParams.get("page"), url.searchParams.get("pageSize"));
  const search = url.searchParams.get("search") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const program = url.searchParams.get("program") || undefined;
  const section = url.searchParams.get("section") || undefined;

  const where: any = { role: "STUDENT" };
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { studentIdNo: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;
  if (program) where.program = program;
  if (section) where.section = section;
  if (user.role === "ADMIN") where.batch = { coordinatorId: user.id };

  const [items, total] = await db.$transaction([
    db.user.findMany({
      where,
      orderBy: { fullName: "asc" },
      skip,
      take,
      select: {
        id: true, fullName: true, email: true, studentIdNo: true, program: true, section: true,
        status: true, batchId: true, requiredHours: true, preOjtCompleted: true, createdAt: true,
        batch: { select: { id: true, name: true, section: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  return NextResponse.json({ data: items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
}

export async function PATCH(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession(["ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parse = verifySchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const student = await db.user.findUnique({ where: { id: parse.data.studentId, role: "STUDENT" } });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const updated = await db.user.update({
    where: { id: student.id },
    data: { status: "ACTIVE", verificationToken: null, verificationSentAt: null },
  });

  await writeAuditLog({
    actorId: user.id,
    action: "STUDENT_VERIFIED",
    entityType: "User",
    entityId: student.id,
    details: { email: student.email, previousStatus: student.status },
  });

  return NextResponse.json({ student: updated }, { status: 200 });
}
