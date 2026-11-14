import { getSessionFromCookies } from "@/lib/auth";
import { roleDashboardPath } from "@/lib/rbac";
import { redirect } from "next/navigation";

/**
 * 04W Role Dashboard Router — resolves the JWT role and forwards each
 * visitor to their dedicated dashboard (/student, /admin, /superadmin).
 */
export default async function DashboardPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
    return null;
  }
  redirect(roleDashboardPath(session.role));
  return null;
}
