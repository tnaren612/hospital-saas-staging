"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  CalendarClock,
  Clock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
  Store,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdminSession } from "@/components/admin/admin-session-context";
import { formatMoney, getCurrency } from "@/lib/pharmacy/tax";
import type {
  PharmacyDashboardStats,
  PharmacySettings,
  PharmacyBranch,
} from "@/lib/pharmacy/types";
import type { HospitalConfig } from "@/lib/hospital/types";

type DashboardPayload = {
  stats: PharmacyDashboardStats;
  settings: PharmacySettings;
  branches: PharmacyBranch[];
  hospital: HospitalConfig;
};

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-rose-600"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export function PharmacyDashboard() {
  const session = useAdminSession();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/pharmacy/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (active && j.data) setData(j.data as DashboardPayload);
        else if (active) setError("Could not load pharmacy dashboard");
      })
      .catch(() => active && setError("Could not load pharmacy dashboard"));
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  }

  const { stats, settings, branches, hospital } = data;
  const currency = getCurrency(hospital.localization.currency);
  const branch = branches.find((b) => b.is_default) || branches[0];
  const contact = hospital.contact;
  const displayName = session.name || settings.pharmacist_name || "Pharmacist";
  const activeShift = stats.active_shift;
  const address = [contact.address_line1, contact.city, contact.state, contact.pincode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      {/* Branding header */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          {hospital.branding.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hospital.branding.logo_url}
              alt="Hospital logo"
              className="h-16 w-16 rounded-xl object-contain"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 text-2xl font-bold text-primary">
              {(hospital.branding.name || "H").charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight">
                {hospital.branding.name}
              </h2>
              <Badge className="bg-primary/10 text-primary">
                <Store className="mr-1 h-3 w-3" />
                {branch?.name || "Pharmacy"}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {address ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {address}
                </span>
              ) : null}
              {contact.phones?.[0] ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {contact.phones[0]}
                </span>
              ) : null}
              {contact.email ? (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {contact.email}
                </span>
              ) : null}
              {settings.gst_number ? (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> GST: {settings.gst_number}
                </span>
              ) : null}
              {settings.drug_license_number ? (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> DL:{" "}
                  {settings.drug_license_number}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-right text-sm">
            <span className="inline-flex items-center gap-1 font-medium">
              <User className="h-4 w-4" /> {displayName}
            </span>
            {activeShift ? (
              <Badge variant="outline" className="text-emerald-600">
                <CalendarClock className="mr-1 h-3 w-3" /> Shift:{" "}
                {activeShift.user_name || "Open"}
              </Badge>
            ) : (
              <Badge variant="outline">No open shift</Badge>
            )}
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {now.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "medium",
              })}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Key stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today's Sales" value={formatMoney(stats.today_sales, currency)} tone="success" />
        <StatCard label="Transactions" value={stats.today_transactions} />
        <StatCard label="Today's Returns" value={formatMoney(stats.today_returns, currency)} />
        <StatCard label="Pending Prescriptions" value={stats.pending_prescriptions} />
        <StatCard label="Low Stock" value={stats.low_stock_count} tone="warning" />
        <StatCard label="Expiring Soon" value={stats.expiring_count} tone="warning" />
        <StatCard label="Expired" value={stats.expired_count} tone="danger" />
        <StatCard label="Out of Stock" value={stats.out_of_stock_count} tone="danger" />
      </div>

      {/* Payment breakdown */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Payment Breakdown</h3>
          </div>
          {stats.payment_breakdown.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {stats.payment_breakdown.map((p) => (
                <div
                  key={p.method}
                  className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="capitalize text-muted-foreground">{p.method}</span>
                  <div className="font-semibold">{formatMoney(p.amount, currency)}</div>
                  <div className="text-xs text-muted-foreground">{p.count} txns</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No sales today yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Mode indicator */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Stethoscope className="h-3.5 w-3.5" />
        Operating mode:{" "}
        <Badge variant="outline">
          {settings.standalone_mode ? "Standalone Pharmacy" : "Integrated Hospital ERP"}
        </Badge>
      </div>
    </div>
  );
}
