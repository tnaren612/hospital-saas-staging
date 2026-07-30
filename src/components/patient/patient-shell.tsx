"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarDays,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  User,
  X,
  IndianRupee,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/patient/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/patient/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/patient/prescriptions", label: "Prescriptions", icon: FileText },
  { href: "/patient/payments", label: "Payments", icon: IndianRupee },
  { href: "/patient/reports", label: "Lab Reports", icon: FileText },
  { href: "/patient/documents", label: "Documents", icon: FolderOpen },
  { href: "/patient/notifications", label: "Notifications", icon: Bell },
  { href: "/patient/profile", label: "Profile", icon: User },
];

export function PatientShell({
  children,
  patientName,
}: {
  children: React.ReactNode;
  patientName?: string;
}) {
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
              aria-label="Toggle patient menu"
              aria-expanded={open}
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
                Patient Portal
              </p>
              <p className="truncate text-sm font-bold">
                {patientName || "My Care"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link href="/appointment">
              <Button size="sm" className="min-h-10 px-2.5 sm:px-3">
                <span className="hidden min-[400px]:inline">Book</span>
                <span className="min-[400px]:hidden">+</span>
                <span className="hidden sm:inline">&nbsp;appointment</span>
              </Button>
            </Link>
            <Link href="/patient/login">
              <Button size="sm" variant="outline" className="min-h-10">
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Exit</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto grid min-w-0 gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[220px_1fr] lg:px-8">
        <aside
          className={cn(
            "space-y-1 lg:block",
            open ? "block" : "hidden"
          )}
        >
          <nav aria-label="Patient portal" className="space-y-1">
            {links.map((l) => {
              const active =
                pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition touch-manipulation",
                    active
                      ? "bg-primary-600 text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <l.icon className="h-4 w-4 shrink-0" />
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
