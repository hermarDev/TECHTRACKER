"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CalendarClock,
  ClipboardCheck,
  FileBarChart2,
  Home,
  Laptop,
  LogOut,
  Menu,
  MessageSquare,
  Shield,
  UserCircle,
  Users,
  Layers,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "cn";

export interface ShellUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  studentIdNo?: string | null;
  section?: string | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string;
}

function getNavForRole(role: Role): NavItem[] {
  if (role === "SUPERADMIN") {
    return [
      { href: "/superadmin", label: "Console", icon: Shield },
      { href: "/admin/attendance", label: "Attendance", icon: CalendarClock },
      { href: "/admin/tasks", label: "Tasks", icon: ClipboardCheck },
      { href: "/inspections", label: "Lab Units", icon: Laptop },
      { href: "/admin/batches", label: "Batches", icon: Layers },
      { href: "/admin/students", label: "Directory", icon: Users },
      { href: "/admin/reports", label: "Reports", icon: FileBarChart2 },
      { href: "/notifications", label: "Alerts", icon: Bell },
      { href: "/profile", label: "Profile", icon: UserCircle },
    ];
  }
  if (role === "ADMIN") {
    return [
      { href: "/admin", label: "Dashboard", icon: Home },
      { href: "/admin/attendance", label: "Attendance", icon: CalendarClock },
      { href: "/admin/tasks", label: "Tasks", icon: ClipboardCheck },
      { href: "/inspections", label: "Lab Audit", icon: Laptop },
      { href: "/admin/batches", label: "Batches", icon: Layers },
      { href: "/admin/students", label: "Directory", icon: Users },
      { href: "/admin/reports", label: "Reports", icon: FileBarChart2 },
      { href: "/messages", label: "Messages", icon: MessageSquare },
      { href: "/profile", label: "Profile", icon: UserCircle },
    ];
  }
  // STUDENT (04W Student Nav: Home, Attendance, Tasks, Lab Audit, Chat, Profile)
  return [
    { href: "/student", label: "Home", icon: Home },
    { href: "/attendance", label: "Attendance", icon: CalendarClock },
    { href: "/tasks", label: "Tasks", icon: ClipboardCheck },
    { href: "/inspections", label: "Lab Audit", icon: Laptop },
    { href: "/messages", label: "Chat", icon: MessageSquare },
    { href: "/profile", label: "Profile", icon: UserCircle },
  ];
}

export function AppShell({
  user,
  unreadNotifications = 0,
  title,
  subtitle,
  actions,
  children,
}: {
  user: ShellUser;
  unreadNotifications?: number;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const navItems = React.useMemo(() => getNavForRole(user.role), [user.role]);
  const mobilePrimary = navItems.slice(0, 4);
  const mobileOverflow = navItems.slice(4);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };

  const roleLabel =
    user.role === "SUPERADMIN"
      ? "SuperAdmin"
      : user.role === "ADMIN"
        ? "Pre-OJT Coordinator"
        : "BSIT Trainee";

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Desktop Institutional Rail */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-mono text-sm font-semibold">
            TT
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">TechTracker</p>
            <p className="truncate text-[11px] text-sidebar-foreground/70">ACLC Mandaue BSIT</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/admin" &&
                item.href !== "/student" &&
                item.href !== "/superadmin" &&
                pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4 space-y-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="truncate text-xs text-sidebar-foreground/70">{roleLabel}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full min-h-11 justify-start gap-2 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" />
            <span>{loggingOut ? "Signing out..." : "Log out"}</span>
          </Button>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm lg:px-8">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight lg:text-xl">{title}</h1>
            {subtitle && (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <Link
              href="/notifications"
              aria-label={`Notifications (${unreadNotifications} unread)`}
              className="relative inline-flex size-11 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Bell className="size-4" />
              {unreadNotifications > 0 && (
                <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-ledger">
                  {unreadNotifications > 99 ? "99+" : unreadNotifications}
                </span>
              )}
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-8 lg:py-6">{children}</main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden"
      >
        {mobilePrimary.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/admin" &&
              item.href !== "/student" &&
              item.href !== "/superadmin" &&
              pathname.startsWith(item.href + "/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="truncate max-w-16">{item.label}</span>
            </Link>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            render={
              <button
                type="button"
                className="flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              />
            }
          >
            <Menu className="size-4" aria-hidden="true" />
            <span>More</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>
                {user.fullName} ({roleLabel})
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid gap-2 pb-4">
              {(mobileOverflow.length > 0 ? mobileOverflow : navItems).map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <Button
                type="button"
                variant="destructive"
                onClick={handleLogout}
                disabled={loggingOut}
                className="mt-2 min-h-11 justify-start gap-2"
              >
                <LogOut className="size-4" />
                <span>{loggingOut ? "Signing out..." : "Log out"}</span>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}
