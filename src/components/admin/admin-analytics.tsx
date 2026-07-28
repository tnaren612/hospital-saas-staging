"use client";

import { useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { getAnalytics } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";

const COLORS = ["#1a5ff5", "#0d9488", "#d97706", "#dc2626", "#7c3aed", "#64748b"];

export function AdminAnalytics() {
  const data = getAnalytics();
  const [range, setRange] = useState<"weekly" | "monthly" | "yearly">("weekly");
  const series = data[range];

  const totals = series.reduce(
    (acc, p) => ({
      visitors: acc.visitors + p.visitors,
      appointments: acc.appointments + p.appointments,
      revenue: acc.revenue + p.revenue,
    }),
    { visitors: 0, appointments: 0, revenue: 0 }
  );

  return (
          <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Demo visitors, appointments, and revenue charts.
            </p>
          </div>
          <div className="flex gap-2">
            {(["weekly", "monthly", "yearly"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                  range === r
                    ? "bg-primary-600 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Visitors" value={totals.visitors.toLocaleString("en-IN")} />
          <StatCard
            label="Appointments"
            value={totals.appointments.toLocaleString("en-IN")}
          />
          <StatCard label="Revenue (Demo)" value={formatCurrency(totals.revenue)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardContent className="p-4 md:p-6">
              <h2 className="mb-4 font-semibold">Visitors (Line)</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="visitors"
                      stroke="#1a5ff5"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 md:p-6">
              <h2 className="mb-4 font-semibold">Appointments (Bar)</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="appointments" fill="#0d9488" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 md:p-6">
              <h2 className="mb-4 font-semibold">Revenue (Area)</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 md:p-6">
              <h2 className="mb-4 font-semibold">Service Mix (Pie)</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.serviceMix}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label
                    >
                      {data.serviceMix.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
