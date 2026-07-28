/**
 * Dashboard aggregation helpers (pure / shared types).
 * Data fetching lives in /api/admin/dashboard/* (admin session + RLS).
 */

export type MetricCard = {
  key: string;
  label: string;
  value: number | string;
  href?: string;
  hint?: string;
};

export type AppointmentMetrics = {
  total: number;
  today: number;
  upcoming: number;
  cancelled: number;
  completed: number;
  pending: number;
  confirmed: number;
  byStatus: { name: string; value: number }[];
  byDoctor: { name: string; value: number }[];
  byDepartment: { name: string; value: number }[];
  daily: { date: string; appointments: number; completed: number }[];
  weekly: { week: string; appointments: number }[];
  monthly: { month: string; appointments: number }[];
};

export type DoctorMetrics = {
  total: number;
  active: number;
  inactive: number;
  availableToday: number;
  onLeaveToday: number;
  mostBooked: { name: string; value: number }[];
  leastBooked: { name: string; value: number }[];
  availabilityToday: {
    id: string;
    name: string;
    status: string;
  }[];
};

export type DepartmentMetrics = {
  total: number;
  active: number;
  rows: {
    id: string;
    name: string;
    doctors: number;
    packages: number;
    appointments: number;
  }[];
};

export type PackageMetrics = {
  total: number;
  active: number;
  featured: number;
  popular: number;
  bookingEnabled: number;
  /** Placeholder until view tracking exists */
  mostViewed: { name: string; value: number; note?: string }[];
  mostBooked: { name: string; value: number }[];
  featuredPerformance: { name: string; popular: boolean; price: number }[];
};

export type BlogMetrics = {
  total: number;
  published: number;
  recent: { id: string; title: string; slug: string; published_at?: string }[];
  /** Views placeholder until GA */
  mostViewed: { title: string; value: number; note?: string }[];
  featured: number;
};

export type GalleryMetrics = {
  total: number;
  bySection: { name: string; value: number }[];
  recent: {
    id: string;
    title: string;
    section: string;
    key: string;
    image_url: string;
    created_at?: string;
  }[];
  storageEstimateMb: number | null;
};

export type DashboardActivity = {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
  meta?: Record<string, unknown>;
};

export type DashboardSummary = {
  generatedAt: string;
  cards: MetricCard[];
  appointments: AppointmentMetrics;
  doctors: DoctorMetrics;
  departments: DepartmentMetrics;
  packages: PackageMetrics;
  blog: BlogMetrics;
  gallery: GalleryMetrics;
  activity: DashboardActivity[];
  notifications: DashboardActivity[];
  visitorsPlaceholder: {
    monthly: number | null;
    note: string;
  };
  /** Backward-compatible shape used by older dashboard UI */
  today: {
    revenue: number;
    patients: number;
    appointments: number;
    completed: number;
  };
  month: {
    appointments: number;
    completed: number;
    revenue: number;
    cancelled: number;
  };
  upcoming: unknown[];
  doctor_availability: { id: string; name: string; status: string }[];
  monthly_series: { date: string; appointments: number; revenue: number }[];
};

export type SearchResultGroup = {
  type: "doctor" | "department" | "package" | "article" | "appointment";
  label: string;
  href: string;
  subtitle?: string;
};

export function emptyAppointmentMetrics(): AppointmentMetrics {
  return {
    total: 0,
    today: 0,
    upcoming: 0,
    cancelled: 0,
    completed: 0,
    pending: 0,
    confirmed: 0,
    byStatus: [],
    byDoctor: [],
    byDepartment: [],
    daily: [],
    weekly: [],
    monthly: [],
  };
}

export function countBy(
  items: { key: string }[]
): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = item.key || "Unknown";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
