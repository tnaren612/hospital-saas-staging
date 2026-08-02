"use client";

import { useState } from "react";
import { LayoutDashboard, Pill, Settings, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Button } from "@/components/ui/button";
import { PortalLogout } from "@/components/auth/portal-logout";
import { PharmacyDashboard } from "./pharmacy-dashboard";
import { PharmacyPos } from "./pharmacy-pos";
import { PharmacyManager } from "./pharmacy-manager";
import { PharmacySettingsView } from "./pharmacy-settings";

type Tab = "dashboard" | "pos" | "inventory" | "settings";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "pos", label: "POS", icon: <ShoppingCart className="h-4 w-4" /> },
  { id: "inventory", label: "Inventory", icon: <Pill className="h-4 w-4" /> },
  { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
];

export function PharmacyHub() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pharmacy"
        description="Dashboard, POS, inventory and configuration"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={tab === t.id ? "default" : "outline"}
                onClick={() => setTab(t.id)}
              >
                {t.icon} {t.label}
              </Button>
            ))}
            <PortalLogout />
          </div>
        }
      />
      {tab === "dashboard" && <PharmacyDashboard />}
      {tab === "pos" && <PharmacyPos />}
      {tab === "inventory" && <PharmacyManager />}
      {tab === "settings" && <PharmacySettingsView />}
    </div>
  );
}
