export type PackageType =
  | "general"
  | "executive"
  | "senior"
  | "women"
  | "men"
  | "child"
  | "cardiac"
  | "diabetes"
  | "respiratory"
  | "preventive"
  | "pre-employment"
  | "other";

export type PackageFaq = {
  question: string;
  answer: string;
};

export type HealthPackageRecord = {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  short_description: string;
  description: string;
  price: number;
  offer_price: number | null;
  currency: string;
  department_id: string | null;
  department_name?: string | null;
  featured: boolean;
  popular: boolean;
  package_type: PackageType;
  duration: string;
  report_time: string;
  preparation: string;
  tests_included: string[];
  services_included: string[];
  benefits: string[];
  instructions: string[];
  faqs: PackageFaq[];
  hero_image: string;
  banner_image: string;
  gallery_images: string[];
  icon: string;
  brochure_pdf: string;
  booking_enabled: boolean;
  is_active: boolean;
  display_order: number;
  seo_title: string | null;
  seo_description: string | null;
  meta_keywords: string[];
  payment_enabled?: boolean;
  payment_amount?: number | null;
  payment_currency?: string;
  created_at?: string;
  updated_at?: string;
};

export const PACKAGE_TYPES: { value: PackageType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "executive", label: "Executive" },
  { value: "senior", label: "Senior" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "child", label: "Child" },
  { value: "cardiac", label: "Cardiac" },
  { value: "diabetes", label: "Diabetes" },
  { value: "respiratory", label: "Respiratory / Lung" },
  { value: "preventive", label: "Preventive" },
  { value: "pre-employment", label: "Pre-Employment" },
  { value: "other", label: "Other" },
];

/** Display price: offer when set, else list price */
export function packageDisplayPrice(pkg: HealthPackageRecord): number {
  if (pkg.offer_price != null && pkg.offer_price > 0) return Number(pkg.offer_price);
  return Number(pkg.price) || 0;
}

export function packageHasDiscount(pkg: HealthPackageRecord): boolean {
  return (
    pkg.offer_price != null &&
    pkg.offer_price > 0 &&
    pkg.price > 0 &&
    pkg.offer_price < pkg.price
  );
}

/** Appointment deep-link with package context (no server imports). */
export function packageBookingHref(pkg: {
  slug: string;
  name: string;
  department_id?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("package", pkg.slug);
  params.set("packageName", pkg.name);
  if (pkg.department_id) params.set("department", pkg.department_id);
  return `/appointment?${params.toString()}`;
}
