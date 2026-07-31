/**
 * Centralized RBAC for Hospital Management System.
 * Single source of truth for roles, permissions, redirects, and route access.
 */

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  DOCTOR: "doctor",
  PATIENT: "patient",
  RECEPTIONIST: "receptionist",
  LAB_TECHNICIAN: "lab_technician",
  RADIOLOGY_TECHNICIAN: "radiology_technician",
  PHARMACIST: "pharmacist",
  BILLING: "billing",
  FINANCE: "finance",
  HR: "hr",
  MANAGER: "manager",
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

/** All valid application roles (no legacy "staff") */
export const ALL_ROLES: readonly AppRole[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.DOCTOR,
  ROLES.PATIENT,
  ROLES.RECEPTIONIST,
  ROLES.LAB_TECHNICIAN,
  ROLES.RADIOLOGY_TECHNICIAN,
  ROLES.PHARMACIST,
  ROLES.BILLING,
  ROLES.FINANCE,
  ROLES.HR,
  ROLES.MANAGER,
] as const;

/** Roles that may access hospital operations (non-patient) */
export const HOSPITAL_STAFF_ROLES: readonly AppRole[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.DOCTOR,
  ROLES.RECEPTIONIST,
  ROLES.LAB_TECHNICIAN,
  ROLES.RADIOLOGY_TECHNICIAN,
  ROLES.PHARMACIST,
  ROLES.BILLING,
  ROLES.FINANCE,
  ROLES.HR,
  ROLES.MANAGER,
] as const;

/** Full admin console (/admin/*) — super_admin + admin only for unrestricted admin area */
export const ADMIN_CONSOLE_ROLES: readonly AppRole[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
] as const;

export function normalizeRole(role?: string | null): string {
  return String(role || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

/** Map legacy DB values to current roles */
export function canonicalizeRole(role?: string | null): AppRole | null {
  const r = normalizeRole(role);
  if (!r) return null;
  // Legacy: staff → receptionist (closest operational role; never keep "staff")
  if (r === "staff") return ROLES.RECEPTIONIST;
  if ((ALL_ROLES as readonly string[]).includes(r)) return r as AppRole;
  return null;
}

export function isValidRole(role?: string | null): role is AppRole {
  return canonicalizeRole(role) !== null;
}

// ---------------------------------------------------------------------------
// Role checks
// ---------------------------------------------------------------------------

export function isSuperAdmin(role?: string | null): boolean {
  return canonicalizeRole(role) === ROLES.SUPER_ADMIN;
}

export function isAdmin(role?: string | null): boolean {
  const r = canonicalizeRole(role);
  return r === ROLES.ADMIN || r === ROLES.SUPER_ADMIN;
}

/** @deprecated use isAdmin — kept for call-sites during transition */
export function isAdminRole(role?: string | null): boolean {
  return isAdmin(role);
}

export function isDoctor(role?: string | null): boolean {
  return canonicalizeRole(role) === ROLES.DOCTOR;
}

export function isPatient(role?: string | null): boolean {
  return canonicalizeRole(role) === ROLES.PATIENT;
}

export function isReceptionist(role?: string | null): boolean {
  return canonicalizeRole(role) === ROLES.RECEPTIONIST;
}

export function isLabTechnician(role?: string | null): boolean {
  return canonicalizeRole(role) === ROLES.LAB_TECHNICIAN;
}

export function isRadiologyTechnician(role?: string | null): boolean {
  return canonicalizeRole(role) === ROLES.RADIOLOGY_TECHNICIAN;
}

export function isPharmacist(role?: string | null): boolean {
  return canonicalizeRole(role) === ROLES.PHARMACIST;
}

export function isBilling(role?: string | null): boolean {
  return canonicalizeRole(role) === ROLES.BILLING;
}

export function isFinance(role?: string | null): boolean {
  return canonicalizeRole(role) === ROLES.FINANCE;
}

export function isHR(role?: string | null): boolean {
  return canonicalizeRole(role) === ROLES.HR;
}

export function isManager(role?: string | null): boolean {
  return canonicalizeRole(role) === ROLES.MANAGER;
}

/** Any non-patient hospital role (includes billing/finance/hr/manager) */
export function isHospitalStaff(role?: string | null): boolean {
  const r = canonicalizeRole(role);
  return r !== null && r !== ROLES.PATIENT;
}

/** @deprecated use isHospitalStaff — removes legacy "staff" naming */
export function isStaffRole(role?: string | null): boolean {
  return isHospitalStaff(role);
}

// ---------------------------------------------------------------------------
// Capability helpers
// ---------------------------------------------------------------------------

export function canAccessAdmin(role?: string | null): boolean {
  return isAdmin(role);
}

export function canAccessAdminConsole(role?: string | null): boolean {
  // Full /admin/* shell: admin + super_admin, plus operational roles
  // that use filtered nav (doctor, receptionist, lab, pharmacy, billing…)
  return isHospitalStaff(role);
}

export function canAccessBilling(role?: string | null): boolean {
  const r = canonicalizeRole(role);
  return (
    r === ROLES.BILLING ||
    r === ROLES.FINANCE ||
    r === ROLES.SUPER_ADMIN ||
    r === ROLES.ADMIN ||
    r === ROLES.RECEPTIONIST ||
    r === ROLES.MANAGER
  );
}

export function canAccessInsurance(role?: string | null): boolean {
  const r = canonicalizeRole(role);
  return (
    r === ROLES.BILLING ||
    r === ROLES.FINANCE ||
    r === ROLES.SUPER_ADMIN ||
    r === ROLES.ADMIN ||
    r === ROLES.MANAGER
  );
}

export function canAccessLaboratory(role?: string | null): boolean {
  const r = canonicalizeRole(role);
  return (
    r === ROLES.LAB_TECHNICIAN ||
    r === ROLES.SUPER_ADMIN ||
    r === ROLES.ADMIN ||
    r === ROLES.DOCTOR ||
    r === ROLES.MANAGER
  );
}

export function canAccessPharmacy(role?: string | null): boolean {
  const r = canonicalizeRole(role);
  return (
    r === ROLES.PHARMACIST ||
    r === ROLES.SUPER_ADMIN ||
    r === ROLES.ADMIN ||
    r === ROLES.MANAGER
  );
}

export function canAccessDoctorWorkspace(role?: string | null): boolean {
  return isDoctor(role) || isAdmin(role);
}

export function canAccessReception(role?: string | null): boolean {
  return (
    isReceptionist(role) || isAdmin(role) || isManager(role)
  );
}

export function canAccessFinance(role?: string | null): boolean {
  return isFinance(role) || isAdmin(role) || isManager(role);
}

export function canAccessHR(role?: string | null): boolean {
  return isHR(role) || isAdmin(role) || isManager(role);
}

export function canAccessManager(role?: string | null): boolean {
  return isManager(role) || isAdmin(role);
}

export function canAccessPatientPortal(role?: string | null): boolean {
  return isPatient(role) || isAdmin(role);
}

// ---------------------------------------------------------------------------
// Login / post-auth home paths
// ---------------------------------------------------------------------------

/**
 * Where to send a user after login.
 * Uses existing admin modules when available; portal placeholders for the rest.
 * Note: public marketing page lives at /doctor — clinical doctor home is /admin/dashboard
 * with doctor-filtered nav (avoids breaking public SEO page).
 */
export function homePathForRole(role?: string | null): string {
  const r = canonicalizeRole(role);
  switch (r) {
    case ROLES.SUPER_ADMIN:
    case ROLES.ADMIN:
      return "/admin/dashboard";
    case ROLES.DOCTOR:
      return "/admin/dashboard";
    case ROLES.PATIENT:
      return "/patient/dashboard";
    case ROLES.RECEPTIONIST:
      return "/reception";
    case ROLES.LAB_TECHNICIAN:
      return "/laboratory";
    case ROLES.RADIOLOGY_TECHNICIAN:
      return "/admin/radiology";
    case ROLES.PHARMACIST:
      return "/pharmacy";
    case ROLES.BILLING:
      return "/billing";
    case ROLES.FINANCE:
      return "/finance";
    case ROLES.HR:
      return "/hr";
    case ROLES.MANAGER:
      return "/manager";
    default:
      return "/";
  }
}

// ---------------------------------------------------------------------------
// Route protection matrix (pathname prefix → allowed roles)
// ---------------------------------------------------------------------------

export type RouteGuard = {
  prefix: string;
  /** If true, only these roles; empty = any authenticated hospital staff */
  roles: readonly AppRole[];
  /** Public path under same prefix that must stay open (e.g. login) */
  publicSuffixes?: string[];
};

/**
 * Protected app areas. First match wins (longest prefixes listed carefully).
 * H-04: settings / CMS / tenant APIs = admin console only.
 * Operational /admin modules still allow staff, then featureForAdminPath re-checks.
 * H-05: payment/invoice APIs guarded; public suffixes for create/verify/webhook/slots.
 */
export const ROUTE_GUARDS: RouteGuard[] = [
  {
    prefix: "/admin/followups",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.MANAGER],
  },
  {
    prefix: "/api/followups",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.MANAGER],
  },
  {
    prefix: "/admin/referrals",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.MANAGER],
  },
  {
    prefix: "/api/referrals",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.MANAGER],
  },
  {
    prefix: "/admin/discharge",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.BILLING, ROLES.FINANCE, ROLES.PHARMACIST, ROLES.RADIOLOGY_TECHNICIAN, ROLES.MANAGER],
  },
  {
    prefix: "/api/discharge",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.BILLING, ROLES.FINANCE, ROLES.PHARMACIST, ROLES.RADIOLOGY_TECHNICIAN, ROLES.MANAGER],
  },
  {
    prefix: "/admin/inventory",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PHARMACIST, ROLES.MANAGER, ROLES.BILLING],
  },
  {
    prefix: "/api/inventory",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PHARMACIST, ROLES.MANAGER, ROLES.BILLING],
  },
  {
    prefix: "/admin/radiology",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.RADIOLOGY_TECHNICIAN, ROLES.RECEPTIONIST, ROLES.MANAGER],
  },
  {
    prefix: "/api/radiology",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.RADIOLOGY_TECHNICIAN, ROLES.RECEPTIONIST, ROLES.MANAGER],
  },
  {
    prefix: "/admin/ipd",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.MANAGER],
  },
  {
    prefix: "/api/ipd",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.MANAGER],
  },
  {
    prefix: "/admin/encounters",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER],
  },
  {
    prefix: "/api/clinical/encounters",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER],
  },
  // --- Insurance module ---
  {
    prefix: "/admin/insurance",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.BILLING, ROLES.FINANCE, ROLES.MANAGER],
  },
  {
    prefix: "/api/admin/insurance",
    roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.BILLING, ROLES.FINANCE, ROLES.MANAGER],
  },
  // --- Strict admin console (H-04) — longest prefixes first via sort ---
  {
    prefix: "/admin/settings",
    roles: ADMIN_CONSOLE_ROLES,
  },
  {
    prefix: "/admin/blog",
    roles: ADMIN_CONSOLE_ROLES,
  },
  {
    prefix: "/admin/gallery",
    roles: ADMIN_CONSOLE_ROLES,
  },
  {
    prefix: "/admin/packages",
    roles: ADMIN_CONSOLE_ROLES,
  },
  {
    prefix: "/admin/testimonials",
    roles: ADMIN_CONSOLE_ROLES,
  },
  {
    prefix: "/admin/cms",
    roles: ADMIN_CONSOLE_ROLES,
  },
  {
    prefix: "/api/admin/cms",
    roles: ADMIN_CONSOLE_ROLES,
  },
  {
    prefix: "/api/admin/hospital-settings",
    roles: ADMIN_CONSOLE_ROLES,
  },
  {
    prefix: "/admin/data-management",
    roles: ADMIN_CONSOLE_ROLES,
  },
  {
    prefix: "/api/admin/datahub",
    roles: ADMIN_CONSOLE_ROLES,
  },
  {
    prefix: "/api/admin/tenant-audit",
    roles: ADMIN_CONSOLE_ROLES,
  },
  {
    prefix: "/api/admin/finance",
    roles: [
      ROLES.FINANCE,
      ROLES.MANAGER,
      ROLES.ADMIN,
      ROLES.SUPER_ADMIN,
    ],
  },
  {
    prefix: "/api/admin/hr",
    roles: [ROLES.HR, ROLES.MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  },
  {
    prefix: "/admin",
    roles: HOSPITAL_STAFF_ROLES,
    publicSuffixes: ["/admin/login", "/admin/forbidden"],
  },
  {
    prefix: "/api/admin",
    roles: HOSPITAL_STAFF_ROLES,
  },
  {
    prefix: "/api/phase2",
    roles: HOSPITAL_STAFF_ROLES,
  },
  // H-05: payments / invoices — authenticated staff or patient; public endpoints listed
  {
    prefix: "/api/payments",
    roles: [
      ...HOSPITAL_STAFF_ROLES,
      ROLES.PATIENT,
    ],
    publicSuffixes: [
      "/api/payments/create",
      "/api/payments/verify",
      "/api/payments/webhook",
    ],
  },
  {
    prefix: "/api/invoices",
    roles: [
      ...HOSPITAL_STAFF_ROLES,
      ROLES.PATIENT,
    ],
  },
  {
    prefix: "/laboratory",
    roles: [
      ROLES.LAB_TECHNICIAN,
      ROLES.ADMIN,
      ROLES.SUPER_ADMIN,
      ROLES.DOCTOR,
      ROLES.MANAGER,
    ],
  },
  {
    prefix: "/pharmacy",
    roles: [
      ROLES.PHARMACIST,
      ROLES.ADMIN,
      ROLES.SUPER_ADMIN,
      ROLES.MANAGER,
    ],
  },
  {
    prefix: "/billing",
    roles: [
      ROLES.BILLING,
      ROLES.FINANCE,
      ROLES.ADMIN,
      ROLES.SUPER_ADMIN,
      ROLES.RECEPTIONIST,
      ROLES.MANAGER,
    ],
  },
  {
    prefix: "/reception",
    roles: [
      ROLES.RECEPTIONIST,
      ROLES.ADMIN,
      ROLES.SUPER_ADMIN,
      ROLES.MANAGER,
    ],
  },
  {
    prefix: "/finance",
    roles: [ROLES.FINANCE, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MANAGER],
  },
  {
    prefix: "/hr",
    roles: [ROLES.HR, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.MANAGER],
  },
  {
    prefix: "/manager",
    roles: [ROLES.MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  },
  {
    prefix: "/patient",
    roles: [ROLES.PATIENT, ROLES.ADMIN, ROLES.SUPER_ADMIN],
    publicSuffixes: [
      "/patient/login",
      "/patient/reset-password",
    ],
  },
  {
    prefix: "/api/patient",
    roles: [ROLES.PATIENT, ROLES.ADMIN, ROLES.SUPER_ADMIN],
  },
];

/**
 * H-04: Map /admin and /api/admin paths to feature keys for fine-grained access.
 */
export function featureForAdminPath(pathname: string): FeatureKey | null {
  const path = (pathname.split("?")[0] || pathname).toLowerCase();
  if (!path.startsWith("/admin") && !path.startsWith("/api/admin")) {
    return null;
  }
  if (path.startsWith("/admin/settings") || path.startsWith("/api/admin/hospital-settings")) {
    return "settings";
  }
  if (
    path.startsWith("/admin/data-management") ||
    path.startsWith("/api/admin/datahub")
  ) {
    return "data";
  }
  if (
    path.startsWith("/admin/blog") ||
    path.startsWith("/admin/gallery") ||
    path.startsWith("/admin/packages") ||
    path.startsWith("/admin/testimonials") ||
    path.startsWith("/admin/cms") ||
    path.startsWith("/api/admin/cms")
  ) {
    return "cms";
  }
  if (path.startsWith("/admin/analytics") || path.startsWith("/api/admin/analytics")) {
    return "analytics";
  }
  if (path.startsWith("/admin/lab") || path.startsWith("/api/phase2/lab")) return "lab";
  if (path.startsWith("/admin/pharmacy") || path.startsWith("/api/phase2/pharmacy")) {
    return "pharmacy";
  }
  if (path.startsWith("/api/admin/pharmacy")) {
    return "pharmacy";
  }
  if (
    path.startsWith("/admin/prescriptions") ||
    path.startsWith("/api/phase2/prescriptions")
  ) {
    return "prescriptions";
  }
  if (
    path.startsWith("/admin/billing") ||
    path.startsWith("/admin/hospital-billing") ||
    path.startsWith("/api/phase2/bills")
  ) {
    return "billing";
  }
  if (path.startsWith("/admin/appointments") || path.startsWith("/api/admin/appointments")) {
    return "appointments";
  }
  if (path.startsWith("/admin/calendar")) return "calendar";
  if (path.startsWith("/admin/doctors") || path.startsWith("/api/admin/doctors")) {
    return "doctors";
  }
  if (path.startsWith("/admin/departments") || path.startsWith("/api/admin/departments")) {
    return "departments";
  }
  if (path.startsWith("/admin/patients") || path.startsWith("/api/admin/patients")) {
    return "patients";
  }
  if (path.startsWith("/admin/encounters") || path.startsWith("/api/clinical/encounters")) {
    return "encounters";
  }
  if (path.startsWith("/admin/ipd") || path.startsWith("/api/ipd")) return "ipd";
  if (path.startsWith("/admin/radiology") || path.startsWith("/api/radiology")) {
    return "radiology";
  }
  if (path.startsWith("/admin/inventory") || path.startsWith("/api/inventory")) return "inventory";
  if (path.startsWith("/admin/discharge") || path.startsWith("/api/discharge")) return "discharge";
  if (path.startsWith("/admin/referrals") || path.startsWith("/api/referrals")) return "referrals";
  if (path.startsWith("/admin/followups") || path.startsWith("/api/followups")) return "followups";
  if (path.startsWith("/admin/availability") || path.startsWith("/api/admin/availability")) {
    return "availability";
  }
  if (path.startsWith("/admin/reports") || path.startsWith("/api/admin/reports")) {
    return "reports";
  }
  if (path.startsWith("/admin/notifications") || path.startsWith("/api/admin/notifications")) {
    return "notifications";
  }
  if (path.startsWith("/api/admin/finance")) return "finance";
  if (path.startsWith("/api/admin/hr")) return "hr";
  if (path.startsWith("/admin/insurance") || path.startsWith("/api/admin/insurance")) {
    return "insurance";
  }
  if (path.startsWith("/admin/dashboard") || path === "/admin") return "dashboard";
  // Tenant audit / unknown admin API → settings privilege
  if (path.startsWith("/api/admin/tenant-audit")) return "settings";
  return "dashboard";
}

export function matchRouteGuard(pathname: string): RouteGuard | null {
  const path = pathname.split("?")[0] || pathname;
  // Longest prefix first
  const sorted = [...ROUTE_GUARDS].sort(
    (a, b) => b.prefix.length - a.prefix.length
  );
  for (const g of sorted) {
    if (path === g.prefix || path.startsWith(`${g.prefix}/`)) {
      return g;
    }
  }
  return null;
}

export function isPublicUnderGuard(
  pathname: string,
  guard: RouteGuard
): boolean {
  const path = pathname.split("?")[0] || pathname;
  return (guard.publicSuffixes || []).some(
    (p) => path === p || path.startsWith(`${p}/`)
  );
}

export function roleAllowedOnPath(
  role: string | null | undefined,
  pathname: string
): boolean {
  const guard = matchRouteGuard(pathname);
  if (!guard) return true; // public route
  if (isPublicUnderGuard(pathname, guard)) return true;
  const r = canonicalizeRole(role);
  if (!r) return false;
  if (!(guard.roles as readonly string[]).includes(r)) return false;

  // H-04: feature-level gate for /admin and /api/admin modules
  const feature = featureForAdminPath(pathname);
  if (feature && (pathname.startsWith("/admin") || pathname.startsWith("/api/admin"))) {
    if (!canAccessFeature(r, feature)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sidebar / feature keys (admin HMS shell)
// ---------------------------------------------------------------------------

export type FeatureKey =
  | "dashboard"
  | "appointments"
  | "calendar"
  | "billing"
  | "doctors"
  | "departments"
  | "patients"
  | "availability"
  | "reports"
  | "notifications"
  | "lab"
  | "pharmacy"
  | "prescriptions"
  | "analytics"
  | "settings"
  | "cms"
  | "hr"
  | "finance"
  | "manager"
  | "encounters"
  | "ipd"
  | "radiology"
  | "inventory"
  | "discharge"
  | "referrals"
  | "followups"
  | "insurance"
  | "data";

const ALL_ADMIN_FEATURES: FeatureKey[] = [
  "dashboard",
  "appointments",
  "calendar",
  "billing",
  "doctors",
  "departments",
  "patients",
  "availability",
  "reports",
  "notifications",
  "lab",
  "pharmacy",
  "prescriptions",
  "analytics",
  "settings",
  "cms",
  "hr",
  "finance",
  "manager",
  "encounters",
  "ipd",
  "radiology",
  "inventory",
  "discharge",
  "referrals",
  "followups",
  "insurance",
  "data",
];

const ROLE_FEATURES: Record<string, FeatureKey[]> = {
  [ROLES.SUPER_ADMIN]: ALL_ADMIN_FEATURES,
  [ROLES.ADMIN]: ALL_ADMIN_FEATURES,
  [ROLES.DOCTOR]: [
    "dashboard",
    "appointments",
    "calendar",
    "patients",
    "prescriptions",
    "lab",
    "reports",
    "encounters",
    "ipd",
    "radiology",
    "discharge",
    "referrals",
    "followups",
  ],
  [ROLES.RECEPTIONIST]: [
    "dashboard",
    "appointments",
    "calendar",
    "patients",
    "availability",
    "billing",
    "reports",
    "notifications",
    "ipd",
    "radiology",
    "discharge",
    "referrals",
    "followups",
  ],
  [ROLES.LAB_TECHNICIAN]: ["dashboard", "lab", "patients", "reports"],
  [ROLES.RADIOLOGY_TECHNICIAN]: ["dashboard", "radiology", "discharge", "patients", "reports"],
  [ROLES.PHARMACIST]: ["dashboard", "pharmacy", "prescriptions", "inventory", "discharge", "reports"],
  [ROLES.BILLING]: ["dashboard", "billing", "insurance", "inventory", "discharge", "patients", "reports"],
  [ROLES.FINANCE]: ["dashboard", "billing", "finance", "insurance", "discharge", "reports", "analytics"],
  [ROLES.HR]: ["dashboard", "hr", "doctors", "reports"],
  [ROLES.MANAGER]: [
    "dashboard",
    "appointments",
    "calendar",
    "doctors",
    "departments",
    "patients",
    "availability",
    "lab",
    "pharmacy",
    "billing",
    "insurance",
    "prescriptions",
    "reports",
    "analytics",
    "notifications",
    "encounters",
    "ipd",
    "radiology",
    "inventory",
    "discharge",
    "referrals",
    "followups",
  ],
  [ROLES.PATIENT]: [],
};

export function canAccessFeature(
  role: string | null | undefined,
  feature: FeatureKey
): boolean {
  const r = canonicalizeRole(role) || ROLES.PATIENT;
  const list = ROLE_FEATURES[r] || [];
  return list.includes(feature);
}

export function roleLabel(role?: string | null): string {
  switch (canonicalizeRole(role)) {
    case ROLES.SUPER_ADMIN:
      return "Super Admin";
    case ROLES.ADMIN:
      return "Administrator";
    case ROLES.DOCTOR:
      return "Doctor";
    case ROLES.RECEPTIONIST:
      return "Receptionist";
    case ROLES.LAB_TECHNICIAN:
      return "Lab Technician";
    case ROLES.RADIOLOGY_TECHNICIAN:
      return "Radiology Technician";
    case ROLES.PHARMACIST:
      return "Pharmacist";
    case ROLES.BILLING:
      return "Billing";
    case ROLES.FINANCE:
      return "Finance";
    case ROLES.HR:
      return "HR";
    case ROLES.MANAGER:
      return "Manager";
    case ROLES.PATIENT:
      return "Patient";
    default:
      return "User";
  }
}

/** Roles allowed for a phase2 API domain */
export function rolesForPhase2Module(
  module: "lab" | "pharmacy" | "prescriptions" | "bills" | "dashboard"
): AppRole[] {
  switch (module) {
    case "lab":
      return [
        ROLES.SUPER_ADMIN,
        ROLES.ADMIN,
        ROLES.DOCTOR,
        ROLES.LAB_TECHNICIAN,
        ROLES.RECEPTIONIST,
        ROLES.MANAGER,
      ];
    case "pharmacy":
      return [
        ROLES.SUPER_ADMIN,
        ROLES.ADMIN,
        ROLES.PHARMACIST,
        ROLES.RECEPTIONIST,
        ROLES.MANAGER,
      ];
    case "prescriptions":
      return [
        ROLES.SUPER_ADMIN,
        ROLES.ADMIN,
        ROLES.DOCTOR,
        ROLES.PHARMACIST,
        ROLES.RECEPTIONIST,
      ];
    case "bills":
      return [
        ROLES.SUPER_ADMIN,
        ROLES.ADMIN,
        ROLES.BILLING,
        ROLES.FINANCE,
        ROLES.RECEPTIONIST,
        ROLES.MANAGER,
      ];
    case "dashboard":
    default:
      return [...HOSPITAL_STAFF_ROLES];
  }
}
