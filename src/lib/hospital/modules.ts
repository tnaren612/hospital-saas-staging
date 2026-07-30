/**
 * Map app features / routes → hospital module flags.
 */

import type { FeatureKey } from "@/lib/auth/roles";
import type { ModuleKey } from "@/lib/hospital/types";
import type { HospitalConfig } from "@/lib/hospital/types";

/** Admin nav feature → hospital module (if any) */
export const FEATURE_MODULE: Partial<Record<FeatureKey, ModuleKey>> = {
  appointments: "appointments",
  calendar: "appointments",
  billing: "billing",
  doctors: "doctors",
  departments: "doctors",
  patients: "patients",
  availability: "appointments",
  reports: "reports",
  notifications: "notifications",
  lab: "laboratory",
  pharmacy: "pharmacy",
  prescriptions: "pharmacy",
  analytics: "reports",
  cms: "cms",
  hr: "hr",
  finance: "finance",
  ipd: "ipd",
  radiology: "radiology",
  inventory: "inventory",
  discharge: "ipd",
  referrals: "ipd",
  followups: "ipd",
  insurance: "insurance",
};

/** Path prefix → module required (empty = always allowed for staff) */
export const PATH_MODULE: { prefix: string; module: ModuleKey }[] = [
  { prefix: "/admin/appointments", module: "appointments" },
  { prefix: "/admin/calendar", module: "appointments" },
  { prefix: "/admin/availability", module: "appointments" },
  { prefix: "/admin/lab", module: "laboratory" },
  { prefix: "/laboratory", module: "laboratory" },
  { prefix: "/admin/pharmacy", module: "pharmacy" },
  { prefix: "/pharmacy", module: "pharmacy" },
  { prefix: "/admin/prescriptions", module: "pharmacy" },
  { prefix: "/admin/hospital-billing", module: "billing" },
  { prefix: "/admin/billing", module: "billing" },
  { prefix: "/billing", module: "billing" },
  { prefix: "/admin/doctors", module: "doctors" },
  { prefix: "/admin/departments", module: "doctors" },
  { prefix: "/admin/patients", module: "patients" },
  { prefix: "/admin/reports", module: "reports" },
  { prefix: "/admin/analytics", module: "reports" },
  { prefix: "/admin/notifications", module: "notifications" },
  { prefix: "/admin/test-notifications", module: "notifications" },
  { prefix: "/admin/ipd", module: "ipd" },
  { prefix: "/api/ipd", module: "ipd" },
  { prefix: "/admin/radiology", module: "radiology" },
  { prefix: "/api/radiology", module: "radiology" },
  { prefix: "/admin/inventory", module: "inventory" },
  { prefix: "/api/inventory", module: "inventory" },
  { prefix: "/admin/discharge", module: "ipd" },
  { prefix: "/api/discharge", module: "ipd" },
  { prefix: "/admin/referrals", module: "ipd" },
  { prefix: "/api/referrals", module: "ipd" },
  { prefix: "/admin/followups", module: "ipd" },
  { prefix: "/api/followups", module: "ipd" },
  { prefix: "/admin/insurance", module: "insurance" },
  { prefix: "/api/admin/insurance", module: "insurance" },
  { prefix: "/admin/blog", module: "cms" },
  { prefix: "/admin/gallery", module: "cms" },
  { prefix: "/admin/packages", module: "cms" },
  { prefix: "/admin/testimonials", module: "cms" },
  { prefix: "/finance", module: "finance" },
  { prefix: "/api/admin/finance", module: "finance" },
  { prefix: "/hr", module: "hr" },
  { prefix: "/api/admin/hr", module: "hr" },
  { prefix: "/reception", module: "reception" },
  { prefix: "/api/admin/reception", module: "reception" },
  { prefix: "/api/phase2/lab", module: "laboratory" },
  { prefix: "/api/phase2/pharmacy", module: "pharmacy" },
  { prefix: "/api/phase2/prescriptions", module: "pharmacy" },
  { prefix: "/api/phase2/bills", module: "billing" },
  { prefix: "/patient", module: "patient_portal" },
  { prefix: "/appointment", module: "online_booking" },
  { prefix: "/video-consult", module: "video_consultation" },
];

export function moduleForPath(pathname: string): ModuleKey | null {
  const path = pathname.split("?")[0] || pathname;
  const sorted = [...PATH_MODULE].sort(
    (a, b) => b.prefix.length - a.prefix.length
  );
  for (const row of sorted) {
    if (path === row.prefix || path.startsWith(`${row.prefix}/`)) {
      return row.module;
    }
  }
  return null;
}

export function isPathModuleEnabled(
  config: HospitalConfig,
  pathname: string
): boolean {
  const mod = moduleForPath(pathname);
  if (!mod) return true;
  return Boolean(config.modules[mod]);
}

export function isFeatureModuleEnabled(
  config: HospitalConfig,
  feature: FeatureKey
): boolean {
  const mod = FEATURE_MODULE[feature];
  if (!mod) return true;
  return Boolean(config.modules[mod]);
}
