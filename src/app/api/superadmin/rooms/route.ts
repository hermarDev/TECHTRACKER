import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const roomCreateSchema = z.object({
  name: z.string().trim().min(2, "Room name is required").max(120),
  building: z.string().trim().min(1, "Building is required").max(120),
  capacity: z.number().int().min(1, "Capacity must be at least 1").max(500).optional(),
  assignedAdminId: z.string().uuid("Invalid admin id").nullable().optional(),
  assignedStudentId: z.string().uuid("Invalid student id").nullable().optional(),
  units: z
    .array(
      z.object({
        unitCode: z.string().trim().min(1, "Unit code is required").max(40),
        specs: z.string().trim().max(200).optional(),
      })
    )
    .optional(),
});

const roomPatchSchema = z.object({
  roomId: z.string().uuid("Invalid room id").optional(),
  name: z.string().trim().min(2).max(120).optional(),
  building: z.string().trim().min(1).max(120).optional(),
  capacity: z.number().int().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
  assignedAdminId: z.string().uuid().nullable().optional(),
  assignedStudentId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid("Invalid unit id").optional(),
  unitCode: z.string().trim().min(1).max(40).optional(),
  specs: z.string().trim().max(200).optional(),
  condition: z.enum(["FUNCTIONING", "NEEDS_MAINTENANCE", "NEEDS_REPAIR"]).optional(),
  newUnits: z
    .array(
      z.object({
        unitCode: z.string().trim().min(1, "Unit code is required").max(40),
        specs: z.string().trim().max(200).optional(),
      })
    )
    .optional(),
});

async function listRoomsSorted() {
  return db.labRoom.findMany({
    orderBy: { name: "asc" },
    include: { units: { orderBy: { unitCode: "asc" } } },
  });
}

export async function GET() {
  "use server";
  await cookies();
  const auth = await requireApiSession(["SUPERADMIN"]);
  if (!auth.ok) return auth.response;

  const rooms = await listRoomsSorted();

  // Rooms and their units are always presented sorted A-Z (Charter 16W).
  const sorted = rooms
    .map((room) => ({
      ...room,
      units: [...room.units].sort((a, b) => a.unitCode.localeCompare(b.unitCode)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ rooms: sorted });
}

export async function POST(req: Request) {
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

  const parse = roomCreateSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { name, building, capacity, assignedAdminId, assignedStudentId, units } = parse.data;

  const existing = await db.labRoom.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "A lab room with this name already exists" }, { status: 409 });
  }

  if (assignedAdminId) {
    const admin = await db.user.findUnique({ where: { id: assignedAdminId } });
    if (!admin || admin.role === "STUDENT") {
      return NextResponse.json({ error: "Assigned admin user not found" }, { status: 404 });
    }
  }
  if (assignedStudentId) {
    const student = await db.user.findUnique({ where: { id: assignedStudentId } });
    if (!student || student.role !== "STUDENT") {
      return NextResponse.json({ error: "Assigned student user not found" }, { status: 404 });
    }
  }

  if (units && units.length > 0) {
    const codes = units.map((u) => u.unitCode);
    if (new Set(codes).size !== codes.length) {
      return NextResponse.json({ error: "Duplicate unit codes in the request" }, { status: 400 });
    }
  }

  const created = await db.labRoom.create({
    data: {
      name,
      building,
      capacity: capacity ?? 40,
      assignedAdminId: assignedAdminId ?? null,
      assignedStudentId: assignedStudentId ?? null,
      ...(units && units.length > 0
        ? {
            units: {
              create: units.map((u) => ({ unitCode: u.unitCode, specs: u.specs ?? "Desktop Workstation" })),
            },
          }
        : {}),
    },
    include: { units: { orderBy: { unitCode: "asc" } } },
  });

  await writeAuditLog({
    actorId: user.id,
    action: "LABROOM_CREATED",
    entityType: "LabRoom",
    entityId: created.id,
    details: { name: created.name, building: created.building, unitCount: created.units.length },
  });

  return NextResponse.json({ room: created }, { status: 201 });
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

  const parse = roomPatchSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { roomId, unitId, newUnits, ...changes } = parse.data;

  if (!roomId && !unitId && !newUnits) {
    return NextResponse.json(
      { error: "Provide roomId (room/unit changes), unitId, or newUnits to add units" },
      { status: 400 }
    );
  }

  // ---- Unit-level configuration ----
  if (unitId) {
    if (roomId) {
      return NextResponse.json({ error: "Provide either unitId or roomId, not both" }, { status: 400 });
    }
    const unit = await db.computerUnit.findUnique({ where: { id: unitId }, include: { room: true } });
    if (!unit) {
      return NextResponse.json({ error: "Computer unit not found" }, { status: 404 });
    }
    if (changes.unitCode && changes.unitCode !== unit.unitCode) {
      const codeTaken = await db.computerUnit.findUnique({
        where: { roomId_unitCode: { roomId: unit.roomId, unitCode: changes.unitCode } },
      });
      if (codeTaken) {
        return NextResponse.json(
          { error: "Another unit in this room already uses that unit code" },
          { status: 409 }
        );
      }
    }
    const updatedUnit = await db.computerUnit.update({
      where: { id: unitId },
      data: {
        ...(changes.unitCode !== undefined ? { unitCode: changes.unitCode } : {}),
        ...(changes.specs !== undefined ? { specs: changes.specs } : {}),
        ...(changes.condition !== undefined ? { condition: changes.condition } : {}),
      },
    });
    await writeAuditLog({
      actorId: user.id,
      action: "UNIT_UPDATED",
      entityType: "ComputerUnit",
      entityId: unitId,
      details: { roomId: unit.roomId, room: unit.room.name, changes },
    });
    return NextResponse.json({ unit: updatedUnit }, { status: 200 });
  }

  // ---- Room-level configuration ----
  if (!roomId) {
    return NextResponse.json({ error: "roomId is required for room-level changes" }, { status: 400 });
  }

  const room = await db.labRoom.findUnique({ where: { id: roomId }, include: { units: true } });
  if (!room) {
    return NextResponse.json({ error: "Lab room not found" }, { status: 404 });
  }

  if (changes.name && changes.name !== room.name) {
    const nameTaken = await db.labRoom.findUnique({ where: { name: changes.name } });
    if (nameTaken) {
      return NextResponse.json({ error: "A lab room with this name already exists" }, { status: 409 });
    }
  }
  if (changes.assignedAdminId) {
    const admin = await db.user.findUnique({ where: { id: changes.assignedAdminId } });
    if (!admin || admin.role === "STUDENT") {
      return NextResponse.json({ error: "Assigned admin user not found" }, { status: 404 });
    }
  }
  if (changes.assignedStudentId) {
    const student = await db.user.findUnique({ where: { id: changes.assignedStudentId } });
    if (!student || student.role !== "STUDENT") {
      return NextResponse.json({ error: "Assigned student user not found" }, { status: 404 });
    }
  }
  if (newUnits && newUnits.length > 0) {
    const codes = newUnits.map((u) => u.unitCode);
    if (new Set(codes).size !== codes.length) {
      return NextResponse.json({ error: "Duplicate unit codes in the request" }, { status: 400 });
    }
    for (const code of codes) {
      const taken = await db.computerUnit.findUnique({
        where: { roomId_unitCode: { roomId, unitCode: code } },
      });
      if (taken) {
        return NextResponse.json(
          { error: `Unit code ${code} already exists in this room` },
          { status: 409 }
        );
      }
    }
  }

  const roomFields = {
    name: changes.name,
    building: changes.building,
    capacity: changes.capacity,
    isActive: changes.isActive,
    assignedAdminId: changes.assignedAdminId,
    assignedStudentId: changes.assignedStudentId,
  };
  const hasRoomFieldChange = Object.entries(roomFields).some(([, v]) => v !== undefined);

  const updated = await db.labRoom.update({
    where: { id: roomId },
    data: {
      ...(hasRoomFieldChange
        ? {
            ...(changes.name !== undefined ? { name: changes.name } : {}),
            ...(changes.building !== undefined ? { building: changes.building } : {}),
            ...(changes.capacity !== undefined ? { capacity: changes.capacity } : {}),
            ...(changes.isActive !== undefined ? { isActive: changes.isActive } : {}),
            ...(changes.assignedAdminId !== undefined ? { assignedAdminId: changes.assignedAdminId } : {}),
            ...(changes.assignedStudentId !== undefined
              ? { assignedStudentId: changes.assignedStudentId }
              : {}),
          }
        : {}),
      ...(newUnits && newUnits.length > 0
        ? {
            units: {
              create: newUnits.map((u) => ({ unitCode: u.unitCode, specs: u.specs ?? "Desktop Workstation" })),
            },
          }
        : {}),
    },
    include: { units: { orderBy: { unitCode: "asc" } } },
  });

  await writeAuditLog({
    actorId: user.id,
    action: newUnits && newUnits.length > 0 ? "UNITS_ADDED" : "LABROOM_UPDATED",
    entityType: "LabRoom",
    entityId: roomId,
    details: { room: room.name, changes: { ...roomFields, newUnits: newUnits?.length ?? 0 } },
  });

  return NextResponse.json({ room: updated }, { status: 200 });
}
