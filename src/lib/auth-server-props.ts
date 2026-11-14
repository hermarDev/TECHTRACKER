import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getSessionFromCookies } from "./auth";
import { db } from "./db";
import { roleDashboardPath } from "./rbac";

export async function requirePageUser(allowedRoles?: Role[]) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      status: true,
      studentIdNo: true,
      program: true,
      section: true,
      phone: true,
      batchId: true,
      requiredHours: true,
      preOjtCompleted: true,
    },
  });

  if (!user || user.status !== "ACTIVE") {
    redirect("/login");
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    redirect(roleDashboardPath(user.role));
  }

  const unreadNotifications = await db.notification.count({
    where: { userId: user.id, isRead: false },
  });

  return { user, unreadNotifications };
}
