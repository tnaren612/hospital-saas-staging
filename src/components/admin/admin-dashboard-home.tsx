"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bell,
  Building2,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  FileText,
  FlaskConical,
  Images,
  Loader2,
  Package,
  Pill,
  Receipt,
  RefreshCw,
  Search,
  Stethoscope,
  Upload,
  UserPlus,
  Users,
  XCircle,
  IndianRupee,
} from "lucide-react";
import {
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/admin/ui/skeleton";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { Appointment } from "@/types";
import type {
  DashboardSummary,
  SearchResultGroup,
} from "@/lib/dashboard/service";
import { useAdminSession } from "@/components/admin/admin-session-context";
import {
  canViewWidgetSection,
  filterMetricCards,
  filterQuickActions,
} from "@/lib/dashboard/widgets";

const PIE_COLORS = [
  "#1a5ff5",
  "#0d9488",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#64748b",
  "#059669",
];

const ACTION_ICONS: Record<string, typeof CalendarPlus> = {
  "/admin/appointments": CalendarPlus,
  "/admin/doctors": UserPlus,
  "/admin/departments": Building2,
  "/admin/packages": Package,
  "/admin/blog": FileText,
  "/admin/gallery": Upload,
  "/admin/lab": FlaskConical,
  "/admin/pharmacy": Pill,
  "/admin/prescriptions": ClipboardList,
  "/admin/hospital-billing": Receipt,
  "/admin/notifications": Bell,
};

export function AdminDashboardHome() {
  const { role, mode } = useAdminSession();
  const [stats, setStats] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultGroup[]>([]);

  const quickActions = useMemo(
    () => filterQuickActions(role, mode),
    [role, mode]
  );
  const visibleCards = useMemo(
    () => filterMetricCards(stats?.cards || [], role, mode),
    [stats?.cards, role, mode]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/dashboard/stats", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Dashboard failed");
      setStats(json as DashboardSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 120_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/dashboard/search?q=${encodeURIComponent(q.trim())}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (res.ok) setSearchResults(json.data || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  const cardIcon = useMemo(
    () =>
      ({
        apts_total: CalendarDays,
        apts_today: CalendarDays,
        apts_upcoming: Activity,
        apts_cancelled: XCircle,
        apts_completed: CheckCircle2,
        doctors_total: Stethoscope,
        doctors_active: Users,
        departments: Building2,
        packages: Package,
        blog: FileText,
        gallery: Images,
        visitors: Users,
        rev_today: IndianRupee,
        rev_month: IndianRupee,
        lab_pending: FlaskConical,
        pharmacy_low_stock: Pill,
        rx_today: ClipboardList,
        ops_revenue: Receipt,
      }) as Record<string, typeof CalendarDays>,
    []
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Enterprise Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time hospital operations · appointments · CMS · notifications
            {stats?.generatedAt
              ? ` · updated ${new Date(stats.generatedAt).toLocaleTimeString()}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/calendar">
            <Button size="sm" variant="outline">
              Calendar
            </Button>
          </Link>
          <Link href="/admin/notifications">
            <Button size="sm" variant="outline">
              <Bell className="h-4 w-4" />
              Alerts
              {stats?.notifications?.length ? (
                <Badge className="ml-1" variant="secondary">
                  {stats.notifications.length}
                </Badge>
              ) : null}
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Global search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Global search: doctors, departments, packages, articles, appointments…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Global admin search"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {searchResults.length > 0 && (
            <ul className="mt-3 max-h-64 divide-y overflow-y-auto rounded-xl border">
              {searchResults.map((r, i) => (
                <li key={`${r.type}-${r.label}-${i}`}>
                  <Link
                    href={r.href}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/60"
                    onClick={() => setQ("")}
                  >
                    <div>
                      <span className="font-medium">{r.label}</span>
                      {r.subtitle ? (
                        <p className="text-xs text-muted-foreground">
                          {r.subtitle}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {r.type}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Quick actions (RBAC filtered) */}
      {canViewWidgetSection(role, "quick_actions", mode) &&
        quickActions.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Quick actions">
            {quickActions.map((a) => {
              const Icon = ACTION_ICONS[a.href] || Activity;
              return (
                <Link key={a.href + a.label} href={a.href}>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {a.label}
                  </Button>
                </Link>
              );
            })}
          </div>
        )}

      {error && (
        <div className="rounded-xl border border-emergency/30 bg-emergency/5 px-4 py-3 text-sm text-emergency">
          {error}
        </div>
      )}

      {/* Metric cards */}
      {loading && !stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visibleCards.map((c) => {
            const Icon = cardIcon[c.key] || Activity;
            const inner = (
              <Card className="h-full transition hover:shadow-lift">
                <CardContent className="flex items-start gap-3 p-5">
                  <div className="rounded-xl bg-primary-50 p-2.5 text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">
                      {c.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold tracking-tight">
                      {c.key.startsWith("rev_")
                        ? formatCurrency(Number(c.value) || 0)
                        : c.value}
                    </p>
                    {c.hint ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {c.hint}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
            return c.href ? (
              <Link key={c.key} href={c.href}>
                {inner}
              </Link>
            ) : (
              <div key={c.key}>{inner}</div>
            );
          })}
        </div>
      )}

      {stats && (
        <>
          {/* Appointment charts */}
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardContent className="p-4 md:p-6">
                <h2 className="mb-4 font-semibold">Daily appointments (14d)</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.appointments.daily}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="appointments"
                        stroke="#1a5ff5"
                        strokeWidth={2}
                        dot={false}
                        name="Booked"
                      />
                      <Line
                        type="monotone"
                        dataKey="completed"
                        stroke="#0d9488"
                        strokeWidth={2}
                        dot={false}
                        name="Completed"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <h2 className="mb-4 font-semibold">Weekly appointments</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.appointments.weekly}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar
                        dataKey="appointments"
                        fill="#1a5ff5"
                        radius={[8, 8, 0, 0]}
                        name="Appointments"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <h2 className="mb-4 font-semibold">Monthly appointments</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.appointments.monthly}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar
                        dataKey="appointments"
                        fill="#0d9488"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <h2 className="mb-4 font-semibold">Status breakdown</h2>
                <div className="h-64">
                  {stats.appointments.byStatus.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.appointments.byStatus}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label
                        >
                          {stats.appointments.byStatus.map((_, i) => (
                            <Cell
                              key={i}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Breakdown tables */}
          <div className="grid gap-6 lg:grid-cols-3">
            <RankList
              title="By department"
              rows={stats.appointments.byDepartment}
            />
            <RankList title="By doctor" rows={stats.appointments.byDoctor} />
            <Card>
              <CardContent className="p-4 md:p-6">
                <h2 className="mb-3 font-semibold">This month (legacy)</h2>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Appointments</span>
                    <span className="font-semibold">
                      {stats.month.appointments}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-semibold">
                      {stats.month.completed}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Cancelled</span>
                    <span className="font-semibold">
                      {stats.month.cancelled}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">
                      Revenue (est.)
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(stats.month.revenue)}
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Doctor analytics */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardContent className="p-4 md:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold">Doctor analytics</h2>
                  <div className="flex gap-2 text-xs">
                    <Badge variant="success">
                      Available today: {stats.doctors.availableToday}
                    </Badge>
                    <Badge variant="warning">
                      On leave: {stats.doctors.onLeaveToday}
                    </Badge>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <RankList
                    title="Most booked"
                    rows={stats.doctors.mostBooked}
                    compact
                  />
                  <RankList
                    title="Least booked"
                    rows={stats.doctors.leastBooked}
                    compact
                  />
                </div>
                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-medium">Availability today</h3>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {stats.doctors.availabilityToday.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm"
                      >
                        <span>{d.name}</span>
                        <Badge
                          variant={
                            d.status === "available" ? "success" : "warning"
                          }
                          className="capitalize"
                        >
                          {d.status.replace("_", " ")}
                        </Badge>
                      </div>
                    ))}
                    {stats.doctors.availabilityToday.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No active doctors found.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Department analytics */}
            <Card>
              <CardContent className="p-4 md:p-6">
                <h2 className="mb-4 font-semibold">Department analytics</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="pb-2">Department</th>
                        <th className="pb-2">Doctors</th>
                        <th className="pb-2">Packages</th>
                        <th className="pb-2">Appts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.departments.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-6 text-center text-muted-foreground"
                          >
                            No departments yet.
                          </td>
                        </tr>
                      ) : (
                        stats.departments.rows.map((r) => (
                          <tr key={r.id} className="border-t border-border">
                            <td className="py-2 font-medium">{r.name}</td>
                            <td className="py-2">{r.doctors}</td>
                            <td className="py-2">{r.packages}</td>
                            <td className="py-2">{r.appointments}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Packages + Blog + Gallery */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardContent className="p-4 md:p-6">
                <h2 className="mb-3 font-semibold">Health packages</h2>
                <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                  <MiniStat label="Total" value={stats.packages.total} />
                  <MiniStat label="Active" value={stats.packages.active} />
                  <MiniStat label="Featured" value={stats.packages.featured} />
                  <MiniStat label="Popular" value={stats.packages.popular} />
                </div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Most booked (from appointment notes)
                </h3>
                <RankList rows={stats.packages.mostBooked} compact />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Views: GA4 Phase 9 · {stats.packages.mostViewed[0]?.note}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <h2 className="mb-3 font-semibold">Blog / Health Tips</h2>
                <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                  <MiniStat label="Total" value={stats.blog.total} />
                  <MiniStat label="Published" value={stats.blog.published} />
                </div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Recent articles
                </h3>
                <ul className="space-y-2">
                  {stats.blog.recent.length === 0 ? (
                    <li className="text-sm text-muted-foreground">
                      No articles yet.
                    </li>
                  ) : (
                    stats.blog.recent.map((a) => (
                      <li key={a.id} className="text-sm">
                        <Link
                          href={`/blog/${a.slug}`}
                          target="_blank"
                          className="font-medium hover:underline"
                        >
                          {a.title}
                        </Link>
                        {a.published_at ? (
                          <p className="text-xs text-muted-foreground">
                            {String(a.published_at).slice(0, 10)}
                          </p>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 md:p-6">
                <h2 className="mb-3 font-semibold">Gallery</h2>
                <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                  <MiniStat label="Images" value={stats.gallery.total} />
                  <MiniStat
                    label="Storage est."
                    value={
                      stats.gallery.storageEstimateMb != null
                        ? `${stats.gallery.storageEstimateMb} MB`
                        : "—"
                    }
                  />
                </div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  By section
                </h3>
                <RankList rows={stats.gallery.bySection.slice(0, 6)} compact />
                <h3 className="mb-2 mt-3 text-xs font-semibold uppercase text-muted-foreground">
                  Recent uploads
                </h3>
                <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {stats.gallery.recent.map((g) => (
                    <li key={g.id}>
                      {g.section}/{g.key} · {g.title}
                    </li>
                  ))}
                  {stats.gallery.recent.length === 0 && (
                    <li>No gallery images yet.</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Activity + notifications + upcoming */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardContent className="p-4 md:p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Notifications</h2>
                  <Link
                    href="/admin/notifications"
                    className="text-xs font-medium text-primary-700 dark:text-primary-300"
                  >
                    View all
                  </Link>
                </div>
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {(stats.notifications.length
                    ? stats.notifications
                    : stats.activity.filter((a) =>
                        a.type.includes("appointment")
                      )
                  )
                    .slice(0, 10)
                    .map((n) => (
                      <li
                        key={n.id}
                        className="rounded-xl border px-3 py-2 text-sm"
                      >
                        <p className="font-medium">{n.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {n.message}
                        </p>
                      </li>
                    ))}
                  {stats.notifications.length === 0 &&
                    stats.activity.length === 0 && (
                      <li className="text-sm text-muted-foreground">
                        No alerts right now.
                      </li>
                    )}
                </ul>
              </CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardContent className="p-4 md:p-6">
                <h2 className="mb-3 font-semibold">Recent activity</h2>
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {stats.activity.length === 0 ? (
                    <li className="text-sm text-muted-foreground">
                      Activity will appear as the team uses the CMS.
                    </li>
                  ) : (
                    stats.activity.map((a) => (
                      <li
                        key={a.id}
                        className="border-l-2 border-primary-200 pl-3 text-sm dark:border-primary-800"
                      >
                        <p className="font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.message}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardContent className="p-4 md:p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Upcoming appointments</h2>
                  <Link
                    href="/admin/appointments"
                    className="text-xs font-medium text-primary-700 dark:text-primary-300"
                  >
                    Manage
                  </Link>
                </div>
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {(stats.upcoming as Appointment[]).length === 0 ? (
                    <li className="text-sm text-muted-foreground">
                      No upcoming bookings.
                    </li>
                  ) : (
                    (stats.upcoming as Appointment[]).map((a) => (
                      <li
                        key={a.id}
                        className="rounded-xl border px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{a.patientName}</span>
                          <Badge variant="outline" className="capitalize">
                            {a.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(a.date)} · {a.timeSlot}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.doctorName}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Visitors placeholder */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <h2 className="font-semibold">Monthly visitors</h2>
                <p className="text-sm text-muted-foreground">
                  {stats.visitorsPlaceholder.note}
                </p>
              </div>
              <Link href="/admin/analytics">
                <Button variant="outline" size="sm">
                  Open analytics
                </Button>
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function RankList({
  title,
  rows,
  compact,
}: {
  title?: string;
  rows: { name: string; value: number }[];
  compact?: boolean;
}) {
  const body = (
    <ul className={cn("space-y-1.5", compact && "text-sm")}>
      {rows.length === 0 ? (
        <li className="text-sm text-muted-foreground">No data yet.</li>
      ) : (
        rows.map((r) => (
          <li
            key={r.name}
            className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5"
          >
            <span className="truncate">{r.name}</span>
            <span className="font-semibold tabular-nums">{r.value}</span>
          </li>
        ))
      )}
    </ul>
  );
  if (compact && !title) return body;
  if (compact) {
    return (
      <div>
        {title ? (
          <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            {title}
          </h3>
        ) : null}
        {body}
      </div>
    );
  }
  return (
    <Card>
      <CardContent className="p-4 md:p-6">
        {title ? <h2 className="mb-3 font-semibold">{title}</h2> : null}
        {body}
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No chart data yet.
    </div>
  );
}
