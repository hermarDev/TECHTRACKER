import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { db } from "@/lib/db";

export async function GET() {
  "use server";
  await cookies();
  const auth = await requireApiSession(["SUPERADMIN"]);
  if (!auth.ok) return auth.response;

  const [users, batches, escalations, inspections, notifications] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { id: true } }),
    db.batch.aggregate({ _count: { id: true } }),
    db.escalationCase.groupBy({ by: ["status"], _count: { id: true } }),
    db.inspection.count(),
    db.notification.count({ where: { isRead: false } }),
  ]);

  return NextResponse.json({
    usersByRole: users,
    batchCount: batches._count.id,
    escalationsByStatus: escalations,
    inspectionCount: inspections,
    unreadNotifications: notifications,
  });
}
