import { getBackendSession } from "@/lib/backend-session";
import { roleDashboardPath } from "@/lib/rbac-policies";
import { redirect } from "next/navigation";

/**
 * 04W Role Dashboard Router — resolves the JWT role and forwards each
 * visitor to their dedicated dashboard (/student, /admin, /superadmin).
 */
export default async function DashboardPage() {
  const session = await getBackendSession();
  if (!session) {
    redirect("/login");
    return null;
  }
  redirect(roleDashboardPath(session.role));
  return null;
}
