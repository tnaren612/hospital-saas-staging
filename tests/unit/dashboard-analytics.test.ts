import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalyticsPayload,
  buildAnalyticsBuckets,
  inRange,
  buildDailySeries,
} from "../../src/lib/dashboard/analytics";
import {
  filterMetricCards,
  filterQuickActions,
  canViewWidgetSection,
  canAccessAnalytics,
} from "../../src/lib/dashboard/widgets";
import type { MetricCard } from "../../src/lib/dashboard/service";

const sample = [
  {
    date: "2026-07-01",
    status: "completed",
    consultation_fee: 600,
    department_name: "Pulmonology",
    doctor_name: "Dr A",
    type: "in-person",
  },
  {
    date: "2026-07-02",
    status: "cancelled",
    consultation_fee: 500,
    department_name: "Cardiology",
    doctor_name: "Dr B",
    type: "video",
  },
  {
    date: "2026-07-02",
    status: "pending",
    consultation_fee: 500,
    department_name: "Pulmonology",
    doctor_name: "Dr A",
    type: "in-person",
  },
];

describe("dashboard analytics builders", () => {
  it("buildAnalyticsBuckets weekly has 12 points", () => {
    const b = buildAnalyticsBuckets("weekly", new Date("2026-07-15"));
    assert.equal(b.length, 12);
  });

  it("buildAnalyticsBuckets monthly has 12 points", () => {
    assert.equal(buildAnalyticsBuckets("monthly").length, 12);
  });

  it("buildAnalyticsBuckets yearly has 5 points", () => {
    assert.equal(buildAnalyticsBuckets("yearly").length, 5);
  });

  it("inRange inclusive", () => {
    assert.equal(inRange("2026-07-01", "2026-07-01", "2026-07-31"), true);
    assert.equal(inRange("2026-06-30", "2026-07-01", "2026-07-31"), false);
  });

  it("buildAnalyticsPayload aggregates sample", () => {
    const p = buildAnalyticsPayload(sample, "monthly", new Date("2026-07-15"));
    assert.ok(p.totals.appointments >= 3);
    assert.equal(p.totals.completed, 1);
    assert.equal(p.totals.cancelled, 1);
    assert.equal(p.totals.revenue, 600);
    assert.ok(p.statusMix.length >= 2);
    assert.ok(p.series.length === 12);
    assert.equal(p.source, "live");
  });

  it("empty payload source empty", () => {
    const p = buildAnalyticsPayload([], "weekly");
    assert.equal(p.source, "empty");
    assert.equal(p.totals.appointments, 0);
  });

  it("buildDailySeries length", () => {
    const d = buildDailySeries(sample, 7, new Date("2026-07-05"));
    assert.equal(d.length, 7);
  });
});

describe("dashboard widget RBAC", () => {
  const cards: MetricCard[] = [
    { key: "apts_today", label: "Today", value: 1 },
    { key: "blog", label: "Blog", value: 2 },
    { key: "lab_pending", label: "Lab", value: 3 },
    { key: "rev_today", label: "Rev", value: 4 },
  ];

  it("admin sees all cards", () => {
    assert.equal(filterMetricCards(cards, "admin").length, 4);
  });

  it("doctor does not see blog or billing revenue cards", () => {
    const filtered = filterMetricCards(cards, "doctor");
    const keys = filtered.map((c) => c.key);
    assert.ok(keys.includes("apts_today"));
    assert.ok(!keys.includes("blog"));
    assert.ok(!keys.includes("rev_today"));
  });

  it("pharmacist quick actions exclude doctors CMS", () => {
    const actions = filterQuickActions("pharmacist");
    const hrefs = actions.map((a) => a.href);
    assert.ok(hrefs.includes("/admin/pharmacy"));
    assert.ok(!hrefs.includes("/admin/blog"));
  });

  it("lab tech can view ops and lab sections", () => {
    assert.equal(canViewWidgetSection("lab_technician", "ops_kpis"), true);
    assert.equal(canViewWidgetSection("lab_technician", "blog"), false);
  });

  it("analytics access", () => {
    assert.equal(canAccessAnalytics("admin"), true);
    assert.equal(canAccessAnalytics("finance"), true);
    assert.equal(canAccessAnalytics("doctor"), false);
    assert.equal(canAccessAnalytics("doctor", "demo"), true);
  });
});
