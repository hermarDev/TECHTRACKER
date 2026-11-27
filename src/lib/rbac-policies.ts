import type { Role } from "@/lib/types";

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
