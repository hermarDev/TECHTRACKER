"use client";

import { BrandLogo } from "./BrandLogo";
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
import type { Role } from "@/lib/types";
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

type NavGroup = "Workspace" | "Management" | "Governance" | "Communication" | "Account";

interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  group: NavGroup;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string;
}

function getNavForRole(role: Role): NavItem[] {
  if (role === "SUPERADMIN") {
    return [
      { href: "/superadmin", label: "Console", group: "Workspace", icon: Shield },
      { href: "/admin/attendance", label: "Attendance", shortLabel: "Duty", group: "Workspace", icon: CalendarClock },
      { href: "/admin/tasks", label: "Tasks", group: "Workspace", icon: ClipboardCheck },
      { href: "/inspections", label: "Lab Units", group: "Workspace", icon: Laptop },
      { href: "/admin/batches", label: "Batches", group: "Management", icon: Layers },
      { href: "/admin/students", label: "Directory", group: "Management", icon: Users },
      { href: "/admin/reports", label: "Reports", group: "Management", icon: FileBarChart2 },
      { href: "/notifications", label: "Alerts", group: "Governance", icon: Bell },
      { href: "/profile", label: "Account Settings", group: "Account", icon: UserCircle },
    ];
  }
  if (role === "ADMIN") {
    return [
      { href: "/admin", label: "Dashboard", group: "Workspace", icon: Home },
      { href: "/admin/attendance", label: "Attendance", shortLabel: "Duty", group: "Workspace", icon: CalendarClock },
      { href: "/admin/tasks", label: "Tasks", group: "Workspace", icon: ClipboardCheck },
      { href: "/inspections", label: "Lab Audit", group: "Workspace", icon: Laptop },
      { href: "/admin/batches", label: "Batches", group: "Management", icon: Layers },
      { href: "/admin/students", label: "Directory", group: "Management", icon: Users },
      { href: "/admin/reports", label: "Reports", group: "Management", icon: FileBarChart2 },
      { href: "/messages", label: "Messages", group: "Communication", icon: MessageSquare },
      { href: "/notifications", label: "Notifications", group: "Communication", icon: Bell },
      { href: "/profile", label: "Account Settings", group: "Account", icon: UserCircle },
    ];
  }
  // STUDENT (04W Student Nav: Home, Attendance, Tasks, Lab Audit, Chat, Account settings)
  return [
    { href: "/student", label: "Home", group: "Workspace", icon: Home },
    { href: "/attendance", label: "Attendance", shortLabel: "Duty", group: "Workspace", icon: CalendarClock },
    { href: "/tasks", label: "Tasks", group: "Workspace", icon: ClipboardCheck },
    { href: "/inspections", label: "Lab Audit", group: "Workspace", icon: Laptop },
    { href: "/messages", label: "Chat", group: "Communication", icon: MessageSquare },
    { href: "/notifications", label: "Notifications", group: "Communication", icon: Bell },
    { href: "/profile", label: "Account Settings", group: "Account", icon: UserCircle },
  ];
}

export function AppShell({
  user,
  unreadNotifications,
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
  const [fallbackUnread, setFallbackUnread] = React.useState(0);
  React.useEffect(() => {
    if (unreadNotifications !== undefined) return;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/notifications?page=1&pageSize=50", { signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted) setFallbackUnread(typeof data.unread === "number" ? data.unread : (data.data ?? data.items ?? []).filter((item: { isRead: boolean }) => !item.isRead).length);
      } catch { /* An unavailable count must not block navigation. */ }
    };
    void refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { controller.abort(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [unreadNotifications]);
  const unread = unreadNotifications ?? fallbackUnread;
  const navItems = React.useMemo(() => getNavForRole(user.role), [user.role]);
  const mobilePrimary = navItems.slice(0, 4);
  const mobileOverflow = navItems.slice(4);
  const overflowActive = mobileOverflow.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));

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
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground h-screen sticky top-0 overflow-hidden">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
          <BrandLogo aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">TechTracker</p>
            <p className="truncate text-[11px] text-sidebar-foreground/70">ACLC Mandaue BSIT</p>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label="Primary navigation">
          {(["Workspace", "Management", "Governance", "Communication", "Account"] as const).map((group) => {
            const groupItems = navItems.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="space-y-1">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/55">
                  {group}
                </p>
                {groupItems.map((item) => {
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
                        "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          active ? "bg-sidebar-primary" : "bg-sidebar-foreground/30"
                        )}
                      />
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-4 space-y-3">
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
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-xs lg:px-8">
          <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="truncate text-foreground">{roleLabel}</span>
            <span aria-hidden="true">/</span>
            <span className="truncate">{title}</span>
          </div>
          <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-2 [&_button]:max-w-full [&_button]:whitespace-normal">
            <Link
              href="/notifications"
              aria-label={`Notifications (${unread} unread)`}
              className="relative inline-flex size-10 sm:size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-ledger">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <ThemeToggle />
            <Link
              href="/profile"
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted sm:inline-flex"
            >
              <UserCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Account</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-foreground lg:text-[28px]">{title}</h1>
              {subtitle && (
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {actions && (
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 [&_button]:max-w-full [&_button]:whitespace-normal">
                {actions}
              </div>
            )}
          </div>
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-border bg-card px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
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
                "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="truncate max-w-full">{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            render={
              <button
                type="button"
                className={cn("flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 text-[11px] font-medium", overflowActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}
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
