import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSessionFromCookies, type SessionPayload } from "./auth";
import { db } from "./db";

export type AuthCheckResult =
  | { ok: true; session: SessionPayload; user: { id: string; role: Role; status: string; batchId: string | null; fullName: string; email: string } }
  | { ok: false; response: NextResponse };

export function roleDashboardPath(role: Role): string {
  switch (role) {
    case "SUPERADMIN":
      return "/superadmin";
    case "ADMIN":
      return "/admin";
    case "STUDENT":
    default:
      return "/student";
  }
}

export async function requireApiSession(allowedRoles?: Role[]): Promise<AuthCheckResult> {
  const session = await getSessionFromCookies();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      role: true,
      status: true,
      batchId: true,
      fullName: true,
      email: true,
    },
  });

  if (!user || user.status !== "ACTIVE") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Account is inactive, suspended, or pending verification" },
        { status: 403 }
      ),
    };
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: insufficient role permissions" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session: { ...session, role: user.role, batchId: user.batchId }, user };
}

export async function canAccessBatchScope(
  actor: { id: string; role: Role; batchId: string | null },
  targetBatchId: string | null
): Promise<boolean> {
  if (actor.role === "SUPERADMIN") return true;
  if (!targetBatchId) return actor.role === "ADMIN";
  if (actor.role === "STUDENT") {
    return actor.batchId === targetBatchId;
  }
  const batch = await db.batch.findUnique({
    where: { id: targetBatchId },
    select: { coordinatorId: true },
  });
  return batch?.coordinatorId === actor.id;
}

export function canAccessStudentRecord(
  actor: { id: string; role: Role },
  recordStudentId: string,
  batchCoordinatorId?: string | null
): boolean {
  if (actor.role === "SUPERADMIN") return true;
  if (actor.role === "STUDENT") return actor.id === recordStudentId;
  if (actor.role === "ADMIN") {
    return !batchCoordinatorId || batchCoordinatorId === actor.id;
  }
  return false;
}

export function canInspectRoom(
  actor: { id: string; role: Role },
  room: { assignedAdminId: string | null; assignedStudentId: string | null }
): boolean {
  if (actor.role === "SUPERADMIN") return true;
  if (actor.role === "ADMIN") {
    return room.assignedAdminId === null || room.assignedAdminId === actor.id;
  }
  return room.assignedStudentId === actor.id;
}

export function canUseMessaging(role: Role): boolean {
  // Charter Line 160 & Flowchart 11W: SuperAdmin receives alerts only, no chat access
  return role === "STUDENT" || role === "ADMIN";
}
