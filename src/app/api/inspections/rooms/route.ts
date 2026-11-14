import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  "use server";
  const cookieStore = await cookies();
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  void cookieStore;

  const rooms = await db.labRoom.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { units: { orderBy: { unitCode: "asc" } } },
  });

  const accessible = rooms.filter((room) => {
    if (user.role === "SUPERADMIN") return true;
    if (user.role === "ADMIN") return room.assignedAdminId === null || room.assignedAdminId === user.id;
    return room.assignedStudentId === user.id;
  });

  await writeAuditLog({
    actorId: user.id,
    action: "INSPECTION_ROOMS_LISTED",
    entityType: "LabRoom",
    entityId: "all",
    details: { count: accessible.length },
  });

  return NextResponse.json({
    rooms: accessible.map((r) => ({
      id: r.id,
      name: r.name,
      building: r.building,
      units: r.units.map((u) => ({ id: u.id, unitCode: u.unitCode, condition: u.condition })),
    })),
  });
}
