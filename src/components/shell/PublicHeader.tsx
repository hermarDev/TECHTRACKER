import Link from "next/link";
import { LayoutDashboard, LogIn } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { ThemeToggle } from "./ThemeToggle";
import { buttonVariants } from "@/components/ui/button";
import type { Role } from "@/lib/types";
import { roleDashboardPath } from "@/lib/rbac-policies";
import { cn } from "cn";

const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: "SuperAdmin console",
  ADMIN: "Coordinator dashboard",
  STUDENT: "Student dashboard",
};

/**
 * Shared institutional public header for landing and auth entry routes.
 */
export function PublicHeader({
  sessionRole,
  showSignIn = true,
}: {
  sessionRole?: Role | null;
  showSignIn?: boolean;
}) {
  return (
    <header className="border-b border-border bg-card/90 backdrop-blur-xs">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
          <BrandLogo />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">TechTracker</p>
            <p className="truncate text-xs text-muted-foreground">ACLC College of Mandaue</p>
          </div>
        </Link>

        <nav aria-label="Account entry" className="flex items-center gap-2.5">
          <ThemeToggle />
          {sessionRole ? (
            <Link
              href={roleDashboardPath(sessionRole)}
              className={cn(buttonVariants({ variant: "default" }), "gap-2")}
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">
                {ROLE_LABEL[sessionRole] ?? "Dashboard"}
              </span>
              <span className="sm:hidden">Dashboard</span>
            </Link>
          ) : (
            showSignIn && (
              <Link href="/login" className={cn(buttonVariants({ variant: "default" }), "gap-2")}>
                <LogIn className="size-4" aria-hidden="true" />
                <span>Sign in</span>
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
