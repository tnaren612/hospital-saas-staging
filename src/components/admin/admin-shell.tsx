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
  Pill,
  ClipboardList,
  Stethoscope,
  BedDouble,
  ScanLine,
  Warehouse,
  LogOutIcon,
  Receipt,
  PanelsTopLeft,
  Send,
  CalendarCheck,
} from "lucide-react";
import { adminLogoutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  canAccessFeature,
  type FeatureKey,
  roleLabel,
} from "@/lib/auth/roles";
import { useHospitalConfig } from "@/components/hospital/hospital-config-provider";
import { isFeatureModuleEnabled } from "@/lib/hospital/modules";

const links: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  feature: FeatureKey;
}[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, feature: "dashboard" },
  { href: "/admin/appointments", label: "Appointments", icon: CalendarDays, feature: "appointments" },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarRange, feature: "calendar" },
  { href: "/admin/hospital-billing", label: "Hospital Bills", icon: Receipt, feature: "billing" },
  { href: "/admin/billing", label: "Payments", icon: IndianRupee, feature: "billing" },
  { href: "/admin/lab", label: "Laboratory", icon: FlaskConical, feature: "lab" },
  { href: "/admin/pharmacy", label: "Pharmacy", icon: Pill, feature: "pharmacy" },
  { href: "/admin/prescriptions", label: "Prescriptions", icon: ClipboardList, feature: "prescriptions" },
  { href: "/admin/encounters", label: "Clinical Encounters", icon: Stethoscope, feature: "encounters" },
  { href: "/admin/ipd", label: "IPD", icon: BedDouble, feature: "ipd" },
  { href: "/admin/radiology", label: "Radiology", icon: ScanLine, feature: "radiology" },
  { href: "/admin/inventory", label: "Inventory", icon: Warehouse, feature: "inventory" },
  { href: "/admin/discharge", label: "Discharge", icon: LogOutIcon, feature: "discharge" },
  { href: "/admin/referrals", label: "Referrals", icon: Send, feature: "referrals" },
  { href: "/admin/followups", label: "Follow-up", icon: CalendarCheck, feature: "followups" },
  { href: "/admin/insurance", label: "Insurance", icon: Shield, feature: "insurance" },
  { href: "/admin/doctors", label: "Doctors", icon: UserRound, feature: "doctors" },
  { href: "/admin/departments", label: "Departments", icon: Building2, feature: "departments" },
  { href: "/admin/patients", label: "Patients", icon: Users, feature: "patients" },
  { href: "/admin/availability", label: "Availability", icon: CalendarClock, feature: "availability" },
  { href: "/admin/reports", label: "Reports", icon: FileBarChart, feature: "reports" },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, feature: "notifications" },
  { href: "/admin/test-notifications", label: "Test Notify", icon: FlaskConical, feature: "notifications" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, feature: "analytics" },
  { href: "/admin/blog", label: "Health Tips", icon: FileText, feature: "cms" },
  { href: "/admin/packages", label: "Packages", icon: Package, feature: "cms" },
  { href: "/admin/gallery", label: "Gallery", icon: Images, feature: "cms" },
  { href: "/admin/testimonials", label: "Testimonials", icon: MessageSquareQuote, feature: "cms" },
  { href: "/admin/cms", label: "Website Pages", icon: PanelsTopLeft, feature: "cms" },
  { href: "/admin/settings", label: "Settings", icon: Settings, feature: "settings" },
];

type AdminShellProps = {
  children: React.ReactNode;
  adminEmail?: string | null;
  adminName?: string | null;
  mode?: "supabase" | "demo";
  role?: string | null;
};

export function AdminShell({
  children,
  adminEmail,
  adminName,
  mode = "supabase",
  role = "admin",
}: AdminShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { config } = useHospitalConfig();
  const visibleLinks = links.filter((l) => {
    const roleOk =
      mode === "demo" || canAccessFeature(role || "admin", l.feature);
    const moduleOk =
      mode === "demo" || isFeatureModuleEnabled(config, l.feature);
    return roleOk && moduleOk;
  });

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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-hero-gradient text-xs font-bold text-white">
                {config.branding.name
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 3)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                  <span className="truncate max-w-[10rem] sm:max-w-xs">
                    {config.branding.name}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                    <Shield className="h-3 w-3" />
                    {mode === "supabase" ? "Supabase" : "Demo"}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {adminName || adminEmail || "Administrator"} ·{" "}
                  {roleLabel(role)} · {config.branding.name}
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
            {visibleLinks.map((link) => {
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
