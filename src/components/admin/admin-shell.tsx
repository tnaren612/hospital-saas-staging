"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarRange,
  BarChart3,
  FileText,
  Images,
  UserRound,
  Users,
  Building2,
  CalendarClock,
  FileBarChart,
  Bell,
  LogOut,
  Menu,
  X,
  Settings,
  Shield,
  Package,
  IndianRupee,
  MessageSquareQuote,
  FlaskConical,
} from "lucide-react";
import { adminLogoutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/admin/billing", label: "Billing", icon: IndianRupee },
  { href: "/admin/doctors", label: "Doctors", icon: UserRound },
  { href: "/admin/departments", label: "Departments", icon: Building2 },
  { href: "/admin/patients", label: "Patients", icon: Users },
  { href: "/admin/availability", label: "Availability", icon: CalendarClock },
  { href: "/admin/reports", label: "Reports", icon: FileBarChart },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/test-notifications", label: "Test Notify", icon: FlaskConical },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/blog", label: "Health Tips", icon: FileText },
  { href: "/admin/packages", label: "Packages", icon: Package },
  { href: "/admin/gallery", label: "Gallery", icon: Images },
  { href: "/admin/testimonials", label: "Testimonials", icon: MessageSquareQuote },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

type AdminShellProps = {
  children: React.ReactNode;
  adminEmail?: string | null;
  adminName?: string | null;
  mode?: "supabase" | "demo";
};

export function AdminShell({
  children,
  adminEmail,
  adminName,
  mode = "supabase",
}: AdminShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-[70vh] bg-muted/30">
      <div className="border-b border-border bg-card/95 backdrop-blur">
        <div className="container mx-auto flex min-w-0 items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border touch-manipulation lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle admin menu"
              aria-expanded={open}
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-hero-gradient text-xs font-bold text-white">
                SSH
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                  Hospital ERP
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                    <Shield className="h-3 w-3" />
                    {mode === "supabase" ? "Supabase" : "Demo"}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {adminName || adminEmail || "Administrator"} · Sri Srinivasa
                  Hospital
                </div>
              </div>
            </div>
          </div>
          <form action={adminLogoutAction}>
            <Button type="submit" variant="outline" size="sm" className="min-h-10">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </form>
        </div>
      </div>

      <div className="container mx-auto grid min-w-0 gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[240px_1fr] lg:px-8">
        <aside
          className={cn(
            "max-h-[calc(100vh-8rem)] space-y-1 overflow-y-auto lg:sticky lg:top-24 lg:block",
            open ? "block" : "hidden"
          )}
        >
          <nav aria-label="Admin navigation" className="space-y-1 pb-6">
            {links.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/admin/dashboard" &&
                  pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-primary-600 text-white shadow-soft"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <link.icon className="h-4 w-4 shrink-0" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
