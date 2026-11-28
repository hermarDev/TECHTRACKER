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
