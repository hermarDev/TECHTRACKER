import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession, canInspectRoom } from "@/lib/rbac";
import { normalizePagination } from "@/lib/validation";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const itemSchema = z.object({
  unitId: z.string().uuid("Invalid unit"),
  condition: z.enum(["FUNCTIONING", "NEEDS_MAINTENANCE", "NEEDS_REPAIR"]),
  remarks: z.string().optional().nullable(),
  photoKey: z.string().optional().nullable(),
});

const inspectionCreateSchema = z.object({
  roomId: z.string().uuid("Invalid room"),
  summaryNote: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, "At least one unit item is required"),
});

export async function GET(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const url = new URL(req.url);
  const { page, pageSize, skip, take } = normalizePagination(url.searchParams.get("page"), url.searchParams.get("pageSize"));
  const roomId = url.searchParams.get("roomId") || undefined;
  const status = url.searchParams.get("status") || undefined;

  const where: any = {};
  if (roomId) where.roomId = roomId;
  if (status) where.status = status;

  const [items, total] = await db.$transaction([
    db.inspection.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { items: { orderBy: { id: "asc" } }, room: true, inspector: { select: { id: true, fullName: true, email: true } } },
    }),
    db.inspection.count({ where }),
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
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parse = inspectionCreateSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { roomId, summaryNote, items } = parse.data;

  const room = await db.labRoom.findUnique({ where: { id: roomId } });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (
    !canInspectRoom(
      { id: user.id, role: user.role },
      { assignedAdminId: room.assignedAdminId, assignedStudentId: room.assignedStudentId },
    )
  ) {
    return NextResponse.json({ error: "Forbidden: you are not assigned to inspect this room" }, { status: 403 });
  }

  // Charter: mandatory defect remarks for NEEDS_MAINTENANCE / NEEDS_REPAIR. No urgent alert/ticket dispatch.
  for (const item of items) {
    if (
      (item.condition === "NEEDS_MAINTENANCE" || item.condition === "NEEDS_REPAIR") &&
      (!item.remarks || item.remarks.trim() === "")
    ) {
      return NextResponse.json(
        { error: "Defect remarks are required for units flagged NEEDS_MAINTENANCE or NEEDS_REPAIR" },
        { status: 400 },
      );
    }
  }

  const inspection = await db.inspection.create({
    data: {
      roomId,
      inspectorId: user.id,
      status: "SUBMITTED",
      summaryNote: summaryNote ?? null,
      items: {
        create: items.map((i) => ({
          unitId: i.unitId,
          condition: i.condition,
          remarks: i.remarks ?? null,
          photoKey: i.photoKey ?? null,
        })),
      },
    },
    include: { items: { orderBy: { id: "asc" } } },
  });

  await writeAuditLog({
    actorId: user.id,
    action: "INSPECTION_SUBMITTED",
    entityType: "Inspection",
    entityId: inspection.id,
    details: { roomId, itemCount: items.length },
  });

  return NextResponse.json({ inspection }, { status: 201 });
}
