/**
 * Pure analytics builders for admin Analytics page.
 * Used by API routes and unit tests (no I/O).
 */

import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";

export type AnalyticsRange = "weekly" | "monthly" | "yearly";

export type AppointmentLike = {
  date: string;
  status?: string | null;
  consultation_fee?: number | null;
  department_name?: string | null;
  doctor_name?: string | null;
  type?: string | null;
};

export type AnalyticsSeriesPoint = {
  label: string;
  appointments: number;
  completed: number;
  cancelled: number;
  revenue: number;
};

export type AnalyticsPayload = {
  generatedAt: string;
  range: AnalyticsRange;
  series: AnalyticsSeriesPoint[];
  totals: {
    appointments: number;
    completed: number;
    cancelled: number;
    revenue: number;
    patientsApprox: number;
  };
  statusMix: { name: string; value: number }[];
  departmentMix: { name: string; value: number }[];
  typeMix: { name: string; value: number }[];
  topDoctors: { name: string; value: number }[];
  kpis: {
    completionRate: number;
    cancellationRate: number;
    avgRevenuePerCompleted: number;
  };
  source: "live" | "empty";
};

function feeOf(r: AppointmentLike): number {
  if (r.status === "cancelled") return 0;
  const n = Number(r.consultation_fee);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

function countMap(keys: string[]): { name: string; value: number }[] {
  const m = new Map<string, number>();
  for (const k of keys) {
    const key = k || "Unknown";
    m.set(key, (m.get(key) || 0) + 1);
  }
  return Array.from(m.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Build labeled buckets for the selected range.
 */
export function buildAnalyticsBuckets(
  range: AnalyticsRange,
  now = new Date()
): { label: string; start: string; end: string }[] {
  if (range === "weekly") {
    // Last 12 weeks
    const buckets: { label: string; start: string; end: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const end = addDays(start, 6);
      buckets.push({
        label: format(start, "dd MMM"),
        start: format(start, "yyyy-MM-dd"),
        end: format(end, "yyyy-MM-dd"),
      });
    }
    return buckets;
  }

  if (range === "monthly") {
    // Last 12 months
    const buckets: { label: string; start: string; end: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const m = subMonths(now, i);
      buckets.push({
        label: format(m, "MMM yy"),
        start: format(startOfMonth(m), "yyyy-MM-dd"),
        end: format(endOfMonth(m), "yyyy-MM-dd"),
      });
    }
    return buckets;
  }

  // yearly — last 5 calendar years
  const buckets: { label: string; start: string; end: string }[] = [];
  for (let i = 4; i >= 0; i--) {
    const y = subYears(now, i);
    buckets.push({
      label: format(y, "yyyy"),
      start: format(startOfYear(y), "yyyy-MM-dd"),
      end: format(endOfYear(y), "yyyy-MM-dd"),
    });
  }
  return buckets;
}

/** Inclusive date filter yyyy-MM-dd */
export function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function buildAnalyticsPayload(
  appointments: AppointmentLike[],
  range: AnalyticsRange,
  now = new Date()
): AnalyticsPayload {
  const buckets = buildAnalyticsBuckets(range, now);
  const windowStart = buckets[0]?.start || format(now, "yyyy-MM-dd");
  const windowEnd =
    buckets[buckets.length - 1]?.end || format(now, "yyyy-MM-dd");

  const inWindow = appointments.filter((a) =>
    inRange(String(a.date || ""), windowStart, windowEnd)
  );

  const series: AnalyticsSeriesPoint[] = buckets.map((b) => {
    const rows = inWindow.filter((a) =>
      inRange(String(a.date || ""), b.start, b.end)
    );
    const completed = rows.filter((r) => r.status === "completed");
    return {
      label: b.label,
      appointments: rows.length,
      completed: completed.length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      revenue: completed.reduce((s, r) => s + feeOf(r), 0),
    };
  });

  const completedAll = inWindow.filter((r) => r.status === "completed");
  const cancelledAll = inWindow.filter((r) => r.status === "cancelled");
  const revenue = completedAll.reduce((s, r) => s + feeOf(r), 0);
  const total = inWindow.length || 0;

  const statusMix = countMap(inWindow.map((r) => String(r.status || "unknown")));
  const departmentMix = countMap(
    inWindow
      .filter((r) => r.status !== "cancelled")
      .map((r) => String(r.department_name || "Unassigned"))
  ).slice(0, 8);
  const typeMix = countMap(
    inWindow.map((r) => String(r.type || "in-person"))
  );
  const topDoctors = countMap(
    inWindow
      .filter((r) => r.status !== "cancelled")
      .map((r) => String(r.doctor_name || "Unknown"))
  ).slice(0, 8);

  const completionRate =
    total > 0 ? Math.round((completedAll.length / total) * 1000) / 10 : 0;
  const cancellationRate =
    total > 0 ? Math.round((cancelledAll.length / total) * 1000) / 10 : 0;
  const avgRevenuePerCompleted =
    completedAll.length > 0
      ? Math.round(revenue / completedAll.length)
      : 0;

  // Unique phones not available on AppointmentLike — use count of rows as proxy only when phone absent
  const patientsApprox = inWindow.length;

  return {
    generatedAt: now.toISOString(),
    range,
    series,
    totals: {
      appointments: total,
      completed: completedAll.length,
      cancelled: cancelledAll.length,
      revenue,
      patientsApprox,
    },
    statusMix,
    departmentMix,
    typeMix,
    topDoctors,
    kpis: {
      completionRate,
      cancellationRate,
      avgRevenuePerCompleted,
    },
    source: total > 0 ? "live" : "empty",
  };
}

/** Daily last-N series (dashboard widget helper) */
export function buildDailySeries(
  appointments: AppointmentLike[],
  days = 14,
  now = new Date()
): AnalyticsSeriesPoint[] {
  const interval = eachDayOfInterval({
    start: subDays(now, days - 1),
    end: now,
  });
  return interval.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    const rows = appointments.filter((a) => String(a.date) === key);
    const completed = rows.filter((r) => r.status === "completed");
    return {
      label: format(d, "dd MMM"),
      appointments: rows.length,
      completed: completed.length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      revenue: completed.reduce((s, r) => s + feeOf(r), 0),
    };
  });
}
