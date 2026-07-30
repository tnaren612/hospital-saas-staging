"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/admin/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import type {
  AnalyticsPayload,
  AnalyticsRange,
} from "@/lib/dashboard/analytics";
import { useAdminSession } from "@/components/admin/admin-session-context";
import { canAccessAnalytics } from "@/lib/dashboard/widgets";

const COLORS = [
  "#1a5ff5",
  "#0d9488",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#64748b",
];

export function AdminAnalytics() {
  const { role, mode } = useAdminSession();
  const allowed = canAccessAnalytics(role, mode);
  const [range, setRange] = useState<AnalyticsRange>("weekly");
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/analytics?range=${encodeURIComponent(range)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Analytics failed");
      setData(json as AnalyticsPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [range, allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!allowed) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-8 text-center"
        role="alert"
      >
        <h1 className="text-xl font-bold">Analytics</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your role does not include analytics access.
        </p>
      </div>
    );
  }

  const series = data?.series || [];
  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Live appointment and revenue analytics from hospital data
            {data?.generatedAt
              ? ` · updated ${new Date(data.generatedAt).toLocaleTimeString()}`
              : ""}
            {data?.source === "empty" ? " · no rows in range" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex gap-1 rounded-full bg-muted p-1"
            role="tablist"
            aria-label="Analytics range"
          >
            {(["weekly", "monthly", "yearly"] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                  range === r
                    ? "bg-primary-600 text-white"
                    : "text-muted-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh analytics"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl border border-emergency/30 bg-emergency/5 px-4 py-3 text-sm text-emergency"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Appointments"
            value={(totals?.appointments ?? 0).toLocaleString("en-IN")}
          />
          <StatCard
            label="Completed"
            value={(totals?.completed ?? 0).toLocaleString("en-IN")}
            hint={
              data
                ? `${data.kpis.completionRate}% completion`
                : undefined
            }
          />
          <StatCard
            label="Cancelled"
            value={(totals?.cancelled ?? 0).toLocaleString("en-IN")}
            hint={
              data
                ? `${data.kpis.cancellationRate}% cancel rate`
                : undefined
            }
          />
          <StatCard
            label="Revenue (completed)"
            value={formatCurrency(totals?.revenue ?? 0)}
            hint={
              data
                ? `Avg ${formatCurrency(data.kpis.avgRevenuePerCompleted)} / completed`
                : undefined
            }
          />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Appointments trend (line)">
          {series.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="appointments"
                  name="Booked"
                  stroke="#1a5ff5"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke="#0d9488"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Revenue (area)">
          {series.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) =>
                    formatCurrency(typeof v === "number" ? v : Number(v) || 0)
                  }
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#7c3aed"
                  fill="#7c3aed33"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Appointments by period (bar)">
          {series.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar
                  dataKey="appointments"
                  fill="#0d9488"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Status mix">
          {!data?.statusMix?.length ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.statusMix}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {data.statusMix.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Department mix">
          {!data?.departmentMix?.length ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.departmentMix} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip />
                <Bar dataKey="value" fill="#1a5ff5" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top doctors">
          {!data?.topDoctors?.length ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topDoctors}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#d97706" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {hint ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4 md:p-6">
        <h2 className="mb-4 font-semibold">{title}</h2>
        <div className="h-72">{children}</div>
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No data for this range
    </div>
  );
}
