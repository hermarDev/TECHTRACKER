import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  "use server";
  await cookies();
  const auth = await requireApiSession(["ADMIN", "SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const params = await context.params;
  const inspection = await db.inspection.findUnique({ where: { id: params.id } });
  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }

  const updated = await db.inspection.update({
    where: { id: params.id },
    data: { status: "REVIEWED", reviewedById: user.id, reviewedAt: new Date() },
    include: { items: true, room: true },
  });

  await writeAuditLog({
    actorId: user.id,
    action: "INSPECTION_REVIEWED",
    entityType: "Inspection",
    entityId: params.id,
    details: { status: updated.status, reviewedBy: user.id },
  });

  return NextResponse.json({ inspection: updated }, { status: 200 });
}
