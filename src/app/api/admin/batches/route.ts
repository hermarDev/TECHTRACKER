import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { normalizePagination } from "@/lib/validation";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const batchCreateSchema = z.object({
  batch: z.object({
    name: z.string().min(2, "Batch name is required"),
    section: z.string().min(1, "Section is required"),
    academicYear: z.string().min(1, "Academic year is required"),
    isActive: z.boolean().optional(),
    coordinatorId: z.string().uuid("Invalid coordinator").optional(),
  }),
  schedule: z.object({
    label: z.string().min(1, "Schedule label is required"),
    startTime: z.string(),
    endTime: z.string(),
    graceMinutes: z.number().int().min(0).optional(),
  }),
  students: z.array(
    z.object({
      email: z.string().email(),
      studentIdNo: z.string().min(1),
      fullName: z.string().min(2),
      program: z.string().optional(),
      section: z.string().optional(),
    }),
  ).optional(),
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
  const isActive = url.searchParams.get("isActive");

  const where: Prisma.BatchWhereInput = {};
  if (search) {
    where.OR = [{ name: { contains: search, mode: "insensitive" } }, { section: { contains: search, mode: "insensitive" } }];
  }
  if (isActive !== null && isActive !== undefined) where.isActive = isActive === "true";
  // Non-superadmin admins only see batches they coordinate
  if (user.role === "ADMIN") where.coordinatorId = user.id;

  const [items, total] = await db.$transaction([
    db.batch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { coordinator: { select: { id: true, fullName: true, email: true } }, students: { select: { id: true, studentIdNo: true, fullName: true } } },
    }),
    db.batch.count({ where }),
  ]);

  return NextResponse.json({
    data: items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function POST(req: Request) {
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

  const parse = batchCreateSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { batch, schedule, students } = parse.data;

  const existing = await db.batch.findUnique({ where: { name: batch.name } });
  if (existing) {
    return NextResponse.json({ error: "A batch with this name already exists" }, { status: 409 });
  }

  const coordinatorId =
    user.role === "SUPERADMIN" ? (batch.coordinatorId ?? user.id) : user.id;

  const result = await db.$transaction(async (tx) => {
    const createdBatch = await tx.batch.create({
      data: {
        name: batch.name,
        section: batch.section,
        academicYear: batch.academicYear,
        isActive: batch.isActive ?? true,
        coordinatorId,
      },
    });

    await tx.schedule.create({
      data: {
        batchId: createdBatch.id,
        label: schedule.label,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        graceMinutes: schedule.graceMinutes ?? 15,
      },
    });

    if (students && students.length) {
      for (const s of students) {
        let student = await tx.user.findUnique({ where: { email: s.email } });
        if (!student) {
          student = await tx.user.create({
            data: {
              email: s.email,
              passwordHash: "",
              fullName: s.fullName,
              role: "STUDENT",
              status: "PENDING_VERIFICATION",
              studentIdNo: s.studentIdNo,
              program: s.program ?? null,
              section: s.section ?? null,
              batchId: createdBatch.id,
            },
          });
        } else {
          await tx.user.update({ where: { id: student.id }, data: { batchId: createdBatch.id } });
        }
      }
    }

    return createdBatch;
  });

  await writeAuditLog({
    actorId: user.id,
    action: "BATCH_CREATED",
    entityType: "Batch",
    entityId: result.id,
    details: { name: result.name, coordinatorId },
  });

  return NextResponse.json({ batch: result }, { status: 201 });
}
