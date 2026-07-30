"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Building2,
  Users,
  FileText,
  CheckCircle2,
  XCircle,
  IndianRupee,
  Shield,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/ui/page-header";
import { hmsGet } from "@/lib/hms/client-api";
import { formatCurrency } from "@/lib/utils";
import type { InsuranceDashboardStats } from "@/lib/insurance/types";

export function InsuranceDashboard() {
  const [stats, setStats] = useState<InsuranceDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hmsGet<{ data: InsuranceDashboardStats }>(
        "/api/admin/insurance/dashboard"
      );
      setStats(res.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tiles = stats
    ? [
        {
          label: "Active Providers",
          value: stats.total_providers,
          icon: Building2,
          color: "text-blue-600 bg-blue-50 dark:bg-blue-950",
          href: "/admin/insurance/providers",
        },
        {
          label: "Active Policies",
          value: stats.active_policies,
          icon: Shield,
          color: "text-teal-600 bg-teal-50 dark:bg-teal-950",
          href: "/admin/insurance",
        },
        {
          label: "Pending Pre-auth",
          value: stats.pending_preauths,
          icon: FileText,
          color: "text-amber-600 bg-amber-50 dark:bg-amber-950",
          href: "/admin/insurance",
        },
        {
          label: "Submitted Claims",
          value: stats.submitted_claims,
          icon: Users,
          color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950",
          href: "/admin/insurance/claims",
        },
        {
          label: "Approved",
          value: stats.approved_claims,
          icon: CheckCircle2,
          color: "text-green-600 bg-green-50 dark:bg-green-950",
          href: "/admin/insurance/claims",
        },
        {
          label: "Settled",
          value: stats.settled_claims,
          icon: IndianRupee,
          color: "text-purple-600 bg-purple-50 dark:bg-purple-950",
          href: "/admin/insurance/claims",
        },
        {
          label: "Rejected",
          value: stats.rejected_claims,
          icon: XCircle,
          color: "text-red-600 bg-red-50 dark:bg-red-950",
          href: "/admin/insurance/claims",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insurance Dashboard"
        description="Overview of insurance operations"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <>
            <Link href="/admin/insurance/providers">
              <Button size="sm" variant="outline">
                <Building2 className="mr-1.5 h-4 w-4" />
                Providers
              </Button>
            </Link>
            <Link href="/admin/insurance/claims">
              <Button size="sm" variant="outline">
                <FileText className="mr-1.5 h-4 w-4" />
                Claims
              </Button>
            </Link>
          </>
        }
      />

      {loading && !stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-muted/80"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href}>
              <Card className="transition hover:shadow-md cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className={`rounded-xl p-2.5 ${t.color}`}>
                      <t.icon className="h-5 w-5" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-4">
                    <div className="text-2xl font-bold">{t.value}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {t.label}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Claim Financials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Claim Amount</span>
                <span className="font-semibold">
                  {formatCurrency(stats.total_claim_amount)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Settled</span>
                <span className="font-semibold text-green-600">
                  {formatCurrency(stats.total_settled_amount)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pending Approval</span>
                <span className="font-semibold text-amber-600">
                  {formatCurrency(stats.pending_approval_amount)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/admin/insurance/providers">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Building2 className="mr-2 h-4 w-4" />
                  Manage Providers
                </Button>
              </Link>
              <Link href="/admin/insurance/claims">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <FileText className="mr-2 h-4 w-4" />
                  View Claims
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
