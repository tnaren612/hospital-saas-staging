/**
 * Public Health Packages service — Supabase health_packages with JSON fallback.
 */

import { createClient as createSupabaseJs } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";
import { getPackages } from "@/lib/data";
import type {
  HealthPackageRecord,
  PackageFaq,
  PackageType,
} from "@/lib/health-packages/types";

const SELECT =
  "id, slug, name, subtitle, short_description, description, price, offer_price, currency, department_id, featured, popular, package_type, duration, report_time, preparation, tests_included, services_included, benefits, instructions, faqs, hero_image, banner_image, gallery_images, icon, brochure_pdf, booking_enabled, is_active, display_order, seo_title, seo_description, meta_keywords, payment_enabled, payment_amount, payment_currency, created_at, updated_at, department:departments(id, name, slug)";

const CACHE_TTL = 45_000;
let listCache: { at: number; data: HealthPackageRecord[] } | null = null;

function publicClient() {
  if (!hasSupabaseConfig()) return null;
  return createSupabaseJs(getSupabaseUrl()!, getSupabaseAnonKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return v.split("\n").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function asFaqs(v: unknown): PackageFaq[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const question = String(o.question || "").trim();
      const answer = String(o.answer || "").trim();
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter(Boolean) as PackageFaq[];
}

function mapRow(row: Record<string, unknown>): HealthPackageRecord {
  const dept = row.department as { name?: string } | null | undefined;
  return {
    id: String(row.id),
    slug: String(row.slug || ""),
    name: String(row.name || ""),
    subtitle: String(row.subtitle || ""),
    short_description: String(row.short_description || ""),
    description: String(row.description || ""),
    price: Number(row.price) || 0,
    offer_price:
      row.offer_price != null && row.offer_price !== ""
        ? Number(row.offer_price)
        : null,
    currency: String(row.currency || "INR"),
    department_id: row.department_id ? String(row.department_id) : null,
    department_name: dept?.name || null,
    featured: Boolean(row.featured),
    popular: Boolean(row.popular),
    package_type: (String(row.package_type || "general") as PackageType),
    duration: String(row.duration || ""),
    report_time: String(row.report_time || ""),
    preparation: String(row.preparation || ""),
    tests_included: asStringArray(row.tests_included),
    services_included: asStringArray(row.services_included),
    benefits: asStringArray(row.benefits),
    instructions: asStringArray(row.instructions),
    faqs: asFaqs(row.faqs),
    hero_image: String(row.hero_image || ""),
    banner_image: String(row.banner_image || ""),
    gallery_images: asStringArray(row.gallery_images),
    icon: String(row.icon || ""),
    brochure_pdf: String(row.brochure_pdf || ""),
    booking_enabled: row.booking_enabled !== false,
    is_active: row.is_active !== false,
    display_order: Number(row.display_order) || 0,
    seo_title: row.seo_title ? String(row.seo_title) : null,
    seo_description: row.seo_description
      ? String(row.seo_description)
      : null,
    meta_keywords: asStringArray(row.meta_keywords),
    payment_enabled: Boolean(row.payment_enabled),
    payment_amount:
      row.payment_amount != null ? Number(row.payment_amount) : null,
    payment_currency: String(row.payment_currency || "INR"),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function fallbackPackages(): HealthPackageRecord[] {
  return getPackages().map((p, i) => ({
    id: p.id,
    slug: p.id,
    name: p.name,
    subtitle: "",
    short_description: p.description,
    description: p.description,
    price: p.originalPrice || p.price,
    offer_price: p.price,
    currency: "INR",
    department_id: null,
    department_name: "Pulmonology",
    featured: Boolean(p.popular),
    popular: Boolean(p.popular),
    package_type: "respiratory" as PackageType,
    duration: "2–4 hours",
    report_time: "Same day / next day",
    preparation: "Bring previous reports and current medicines.",
    tests_included: p.includes || [],
    services_included: [],
    benefits: [],
    instructions: [],
    faqs: [],
    hero_image: p.image || "",
    banner_image: "",
    gallery_images: [],
    icon: "",
    brochure_pdf: "",
    booking_enabled: true,
    is_active: true,
    display_order: (i + 1) * 10,
    seo_title: `${p.name} | Sri Srinivasa Hospital`,
    seo_description: p.description.slice(0, 160),
    meta_keywords: ["health package", "badvel", "lung"],
  }));
}

export async function listPackages(options?: {
  departmentId?: string;
  packageType?: string;
  q?: string;
  featuredOnly?: boolean;
  popularOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
}): Promise<HealthPackageRecord[]> {
  let rows: HealthPackageRecord[] = [];

  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    rows = fallbackPackages();
  } else if (listCache && Date.now() - listCache.at < CACHE_TTL && !options?.departmentId) {
    rows = listCache.data;
  } else {
    const supabase = publicClient();
    if (!supabase) {
      rows = fallbackPackages();
    } else {
      const { data, error } = await supabase
        .from("health_packages")
        .select(SELECT)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        if (/schema cache|does not exist|could not find the table/i.test(error.message)) {
          console.warn("[packages] table missing — using JSON fallback");
          return filterPackages(fallbackPackages(), options);
        }
        console.warn("[packages] list:", error.message);
        return filterPackages(fallbackPackages(), options);
      }

      rows = (data || []).map((r) => mapRow(r as Record<string, unknown>));
      if (!options?.departmentId) {
        listCache = { at: Date.now(), data: rows };
      }
      if (!rows.length) rows = fallbackPackages();
    }
  }

  return filterPackages(rows, options);
}

function filterPackages(
  rows: HealthPackageRecord[],
  options?: {
    departmentId?: string;
    packageType?: string;
    q?: string;
    featuredOnly?: boolean;
    popularOnly?: boolean;
    minPrice?: number;
    maxPrice?: number;
  }
): HealthPackageRecord[] {
  let out = [...rows];
  if (options?.departmentId) {
    out = out.filter((p) => p.department_id === options.departmentId);
  }
  if (options?.packageType && options.packageType !== "all") {
    out = out.filter((p) => p.package_type === options.packageType);
  }
  if (options?.featuredOnly) out = out.filter((p) => p.featured);
  if (options?.popularOnly) out = out.filter((p) => p.popular);
  if (options?.minPrice != null) {
    out = out.filter((p) => {
      const price = p.offer_price ?? p.price;
      return price >= options.minPrice!;
    });
  }
  if (options?.maxPrice != null) {
    out = out.filter((p) => {
      const price = p.offer_price ?? p.price;
      return price <= options.maxPrice!;
    });
  }
  if (options?.q?.trim()) {
    const q = options.q.toLowerCase();
    out = out.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.short_description.toLowerCase().includes(q) ||
        p.package_type.toLowerCase().includes(q) ||
        (p.department_name || "").toLowerCase().includes(q) ||
        p.tests_included.some((t) => t.toLowerCase().includes(q))
    );
  }
  return out;
}

export async function getPackageBySlug(
  slug: string
): Promise<HealthPackageRecord | null> {
  if (!slug) return null;

  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return fallbackPackages().find((p) => p.slug === slug) || null;
  }

  const supabase = publicClient();
  if (!supabase) {
    return fallbackPackages().find((p) => p.slug === slug) || null;
  }

  const { data, error } = await supabase
    .from("health_packages")
    .select(SELECT)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    if (/schema cache|does not exist|could not find/i.test(error.message)) {
      return fallbackPackages().find((p) => p.slug === slug) || null;
    }
    console.warn("[packages] bySlug:", error.message);
    return fallbackPackages().find((p) => p.slug === slug) || null;
  }

  if (!data) {
    return fallbackPackages().find((p) => p.slug === slug) || null;
  }

  return mapRow(data as Record<string, unknown>);
}

export async function getFeaturedPackages(): Promise<HealthPackageRecord[]> {
  return listPackages({ featuredOnly: true });
}

export async function getPopularPackages(): Promise<HealthPackageRecord[]> {
  return listPackages({ popularOnly: true });
}

export async function getPackagesByDepartment(
  departmentId: string
): Promise<HealthPackageRecord[]> {
  return listPackages({ departmentId });
}

export async function searchPackages(
  q: string
): Promise<HealthPackageRecord[]> {
  return listPackages({ q });
}

export async function getRelatedPackages(
  pkg: HealthPackageRecord,
  limit = 3
): Promise<HealthPackageRecord[]> {
  const all = await listPackages({
    packageType: pkg.package_type,
  });
  return all.filter((p) => p.id !== pkg.id).slice(0, limit);
}

export function packageJsonLd(
  pkg: HealthPackageRecord,
  siteUrl: string
) {
  const price = pkg.offer_price ?? pkg.price;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: pkg.name,
    description: pkg.seo_description || pkg.short_description || pkg.description,
    image: pkg.hero_image || pkg.banner_image || undefined,
    url: `${siteUrl}/health-packages/${pkg.slug}`,
    brand: {
      "@type": "MedicalOrganization",
      name: "Sri Srinivasa Hospital",
    },
    offers: {
      "@type": "Offer",
      priceCurrency: pkg.currency || "INR",
      price: String(price),
      availability: pkg.booking_enabled
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `${siteUrl}/health-packages/${pkg.slug}`,
    },
  };
}

export function packageServiceJsonLd(
  pkg: HealthPackageRecord,
  siteUrl: string
) {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalProcedure",
    name: pkg.name,
    description: pkg.short_description || pkg.description,
    url: `${siteUrl}/health-packages/${pkg.slug}`,
    procedureType: pkg.package_type,
    provider: {
      "@type": "Hospital",
      name: "Sri Srinivasa Hospital",
    },
  };
}

export function packageBreadcrumbJsonLd(
  pkg: HealthPackageRecord,
  siteUrl: string
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${siteUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Health Packages",
        item: `${siteUrl}/health-packages`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: pkg.name,
        item: `${siteUrl}/health-packages/${pkg.slug}`,
      },
    ],
  };
}

export function clearPackageCache() {
  listCache = null;
}

export { packageBookingHref } from "@/lib/health-packages/types";
