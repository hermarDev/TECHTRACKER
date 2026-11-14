import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { normalizePagination } from "@/lib/validation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const escalationRulingSchema = z.object({
  escalationId: z.string().uuid("Invalid escalation id"),
  status: z.enum(["APPROVED", "UPHELD", "DISMISSED"], {
    message: "Ruling must be APPROVED, UPHELD or DISMISSED",
  }),
  rulingNote: z
    .string()
    .trim()
    .min(1, "A written ruling note is required")
    .max(2000, "Ruling note is too long"),
});

export async function GET(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession(["SUPERADMIN"]);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, skip, take } = normalizePagination(
    url.searchParams.get("page"),
    url.searchParams.get("pageSize")
  );
  const status = url.searchParams.get("status") || undefined;
  const sourceType = url.searchParams.get("sourceType") || undefined;

  const where: Prisma.EscalationCaseWhereInput = {};
  if (status && ["OPEN", "APPROVED", "UPHELD", "DISMISSED"].includes(status)) {
    where.status = status as "OPEN" | "APPROVED" | "UPHELD" | "DISMISSED";
  }
  if (sourceType && ["ATTENDANCE", "TASK_REVIEW"].includes(sourceType)) {
    where.sourceType = sourceType as "ATTENDANCE" | "TASK_REVIEW";
  }

  const [items, total] = await db.$transaction([
    db.escalationCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        student: { select: { id: true, fullName: true, email: true, studentIdNo: true } },
        raisedBy: { select: { id: true, fullName: true, role: true } },
        ruledBy: { select: { id: true, fullName: true, role: true } },
      },
    }),
    db.escalationCase.count({ where }),
  ]);

  return NextResponse.json({
    data: items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function PATCH(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession(["SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parse = escalationRulingSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { escalationId, status, rulingNote } = parse.data;

  const escalation = await db.escalationCase.findUnique({ where: { id: escalationId } });
  if (!escalation) {
    return NextResponse.json({ error: "Escalation case not found" }, { status: 404 });
  }
  if (escalation.status !== "OPEN") {
    return NextResponse.json(
      { error: `This escalation case was already ruled (${escalation.status})` },
      { status: 409 }
    );
  }

  // Ruling propagation: APPROVED/UPHELD finalise in the student's favour,
  // DISMISSED finalises the coordinator's original decision.
  const rulingInStudentsFavour = status === "APPROVED" || status === "UPHELD";
  const ruledAt = new Date();

  const updated = await db.$transaction(async (tx) => {
    if (escalation.sourceType === "ATTENDANCE") {
      const log = await tx.attendanceLog.findUnique({ where: { id: escalation.sourceId } });
      if (log) {
        await tx.attendanceLog.update({
          where: { id: log.id },
          data: {
            status: rulingInStudentsFavour ? "APPROVED" : "REJECTED",
            creditedHours: rulingInStudentsFavour ? log.recordedHours : 0,
            reviewerId: user.id,
            reviewedAt: ruledAt,
            reviewerRemarks: rulingNote,
          },
        });
      }
    } else {
      const assignment = await tx.taskAssignment.findUnique({ where: { id: escalation.sourceId } });
      if (assignment) {
        await tx.taskAssignment.update({
          where: { id: assignment.id },
          data: { status: rulingInStudentsFavour ? "ACCEPTED" : "RETURNED" },
        });
      }
    }

    const ruled = await tx.escalationCase.update({
      where: { id: escalation.id },
      data: {
        status,
        rulingNote,
        ruledById: user.id,
        ruledAt,
      },
      include: {
        student: { select: { id: true, fullName: true, email: true, studentIdNo: true } },
        raisedBy: { select: { id: true, fullName: true, role: true } },
        ruledBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    const notifications = [
      {
        userId: escalation.studentId,
        body: `Your escalated ${escalation.sourceType === "ATTENDANCE" ? "attendance" : "task"} case was ${status.toLowerCase()}. Ruling: ${rulingNote}`,
      },
    ];
    if (escalation.raisedById !== escalation.studentId) {
      notifications.push({
        userId: escalation.raisedById,
        body: `Escalation for ${ruled.student.fullName} (${ruled.student.studentIdNo ?? "student"}) was ruled ${status.toLowerCase()}.`,
      });
    }
    await tx.notification.createMany({
      data: notifications.map((n) => ({
        userId: n.userId,
        type: "ESCALATION" as const,
        title: `Escalation ruling: ${status}`,
        body: n.body,
        link: "/notifications",
      })),
    });

    return ruled;
  });

  await writeAuditLog({
    actorId: user.id,
    action: "ESCALATION_RULED",
    entityType: "EscalationCase",
    entityId: escalationId,
    details: {
      status,
      rulingNote,
      sourceType: escalation.sourceType,
      sourceId: escalation.sourceId,
      studentId: escalation.studentId,
    },
  });

  return NextResponse.json({ escalation: updated }, { status: 200 });
}
