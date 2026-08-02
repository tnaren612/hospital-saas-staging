"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Pill,
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Upload,
  Download,
  BarChart3,
  Settings,
  Wallet,
  Users,
  Truck,
  ShoppingBag,
  RotateCcw,
  Cloud,
  RefreshCw,
  Wifi,
  WifiOff,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOfflineSync } from "@/lib/pharmacy/offline";

const sections = [
  { href: "/admin/pharmacy", label: "Hub", icon: Pill },
  { href: "/admin/pharmacy/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/pharmacy/pos", label: "POS", icon: ShoppingCart },
  { href: "/admin/pharmacy/inventory", label: "Inventory", icon: Boxes },
  { href: "/admin/pharmacy/import", label: "Import", icon: Upload },
  { href: "/admin/pharmacy/export", label: "Export", icon: Download },
  { href: "/admin/pharmacy/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/pharmacy/payments", label: "Payments", icon: Wallet },
  { href: "/admin/pharmacy/customers", label: "Customers", icon: Users },
  { href: "/admin/pharmacy/suppliers", label: "Suppliers", icon: Truck },
  { href: "/admin/pharmacy/purchases", label: "Purchases", icon: ShoppingBag },
  { href: "/admin/pharmacy/returns", label: "Returns", icon: RotateCcw },
  { href: "/admin/pharmacy/labels", label: "Labels", icon: Tags },
  { href: "/admin/pharmacy/settlement", label: "Settlement", icon: Wallet },
  { href: "/admin/pharmacy/settings", label: "Settings", icon: Settings },
  { href: "/admin/pharmacy/offline-sync", label: "Offline Sync", icon: Cloud },
];

export function PharmacyPageShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { online, stats, syncing, syncNow } = useOfflineSync({
    autoSync: true,
    pullEntities: ["sale", "return", "held_bill", "branch", "shift", "settings"],
  });

  const pending = stats.pendingCount + stats.failedCount;

  return (
    <div className="space-y-5">
      <div className="sticky top-14 z-30 -mx-3 border-b border-border bg-background/95 px-3 backdrop-blur sm:top-16 sm:-mx-6 sm:px-6 lg:top-[4.25rem] lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-2 py-2">
          <nav
            aria-label="Pharmacy sections"
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          >
            {sections.map((s) => {
              const active =
                pathname === s.href ||
                (s.href !== "/admin/pharmacy" && pathname.startsWith(s.href));
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <s.icon className="h-3.5 w-3.5" aria-hidden />
                  {s.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "gap-1 whitespace-nowrap",
                online ? "text-emerald-600" : "text-amber-600"
              )}
            >
              {online ? (
                <Wifi className="h-3 w-3" aria-hidden />
              ) : (
                <WifiOff className="h-3 w-3" aria-hidden />
              )}
              {online ? "Online" : "Offline"}
            </Badge>
            {pending > 0 && (
              <Badge variant="outline" className="gap-1 whitespace-nowrap text-amber-600">
                {pending} queued
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-2.5 text-xs"
              onClick={() => void syncNow()}
              disabled={!online || syncing}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", syncing && "animate-spin")}
                aria-hidden
              />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
