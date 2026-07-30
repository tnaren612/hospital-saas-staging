/**
 * Role-aware dashboard widgets, metric cards, and quick actions.
 */

import {
  canAccessFeature,
  canonicalizeRole,
  isAdmin,
  type FeatureKey,
} from "@/lib/auth/roles";
import type { MetricCard } from "@/lib/dashboard/service";

export type QuickAction = {
  href: string;
  label: string;
  feature: FeatureKey;
};

export const DASHBOARD_QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/admin/appointments",
    label: "New Appointment",
    feature: "appointments",
  },
  { href: "/admin/doctors", label: "Add Doctor", feature: "doctors" },
  {
    href: "/admin/departments",
    label: "Add Department",
    feature: "departments",
  },
  { href: "/admin/packages", label: "Add Package", feature: "cms" },
  { href: "/admin/blog", label: "Add Blog", feature: "cms" },
  { href: "/admin/gallery", label: "Upload Image", feature: "cms" },
  { href: "/admin/lab", label: "Lab orders", feature: "lab" },
  { href: "/admin/pharmacy", label: "Pharmacy", feature: "pharmacy" },
  {
    href: "/admin/prescriptions",
    label: "Prescriptions",
    feature: "prescriptions",
  },
  {
    href: "/admin/hospital-billing",
    label: "Hospital bill",
    feature: "billing",
  },
  {
    href: "/admin/notifications",
    label: "Notifications",
    feature: "notifications",
  },
];

/** Map metric card keys to the feature required to see them */
const CARD_FEATURE: Record<string, FeatureKey> = {
  apts_total: "appointments",
  apts_today: "appointments",
  apts_upcoming: "appointments",
  apts_cancelled: "appointments",
  apts_completed: "appointments",
  doctors_total: "doctors",
  doctors_active: "doctors",
  departments: "departments",
  packages: "cms",
  blog: "cms",
  gallery: "cms",
  visitors: "analytics",
  rev_today: "billing",
  rev_month: "billing",
  lab_pending: "lab",
  pharmacy_low_stock: "pharmacy",
  rx_today: "prescriptions",
  ops_revenue: "billing",
};

export type WidgetSection =
  | "search"
  | "quick_actions"
  | "metric_cards"
  | "appointment_charts"
  | "doctor_analytics"
  | "department_analytics"
  | "packages"
  | "blog"
  | "gallery"
  | "activity"
  | "notifications"
  | "ops_kpis"
  | "upcoming";

const SECTION_FEATURE: Record<WidgetSection, FeatureKey | null> = {
  search: "dashboard",
  quick_actions: "dashboard",
  metric_cards: "dashboard",
  appointment_charts: "appointments",
  doctor_analytics: "doctors",
  department_analytics: "departments",
  packages: "cms",
  blog: "cms",
  gallery: "cms",
  activity: "dashboard",
  notifications: "notifications",
  ops_kpis: "dashboard",
  upcoming: "appointments",
};

export function canViewWidgetSection(
  role: string | null | undefined,
  section: WidgetSection,
  mode: "supabase" | "demo" = "supabase"
): boolean {
  if (mode === "demo") return true;
  const feature = SECTION_FEATURE[section];
  if (!feature) return true;
  // Ops KPIs: show if user has any clinical/ops feature
  if (section === "ops_kpis") {
    return (
      canAccessFeature(role, "lab") ||
      canAccessFeature(role, "pharmacy") ||
      canAccessFeature(role, "prescriptions") ||
      canAccessFeature(role, "billing") ||
      isAdmin(role)
    );
  }
  return canAccessFeature(role, feature);
}

export function filterQuickActions(
  role: string | null | undefined,
  mode: "supabase" | "demo" = "supabase"
): QuickAction[] {
  if (mode === "demo") return DASHBOARD_QUICK_ACTIONS;
  return DASHBOARD_QUICK_ACTIONS.filter((a) =>
    canAccessFeature(role, a.feature)
  );
}

export function filterMetricCards(
  cards: MetricCard[],
  role: string | null | undefined,
  mode: "supabase" | "demo" = "supabase"
): MetricCard[] {
  if (mode === "demo") return cards;
  const r = canonicalizeRole(role);
  if (isAdmin(r)) return cards;
  return cards.filter((c) => {
    const feature = CARD_FEATURE[c.key] || "dashboard";
    return canAccessFeature(role, feature);
  });
}

export function canAccessAnalytics(
  role: string | null | undefined,
  mode: "supabase" | "demo" = "supabase"
): boolean {
  if (mode === "demo") return true;
  return canAccessFeature(role, "analytics") || isAdmin(role);
}

export function canAccessNotifications(
  role: string | null | undefined,
  mode: "supabase" | "demo" = "supabase"
): boolean {
  if (mode === "demo") return true;
  return canAccessFeature(role, "notifications") || isAdmin(role);
}
