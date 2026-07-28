/**
 * Public doctors service — reads hospital_doctors (+ departments).
 * Falls back to doctor.json when Supabase / HMS empty.
 */

import { createClient as createSupabaseJs } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";
import { getDoctor } from "@/lib/data";
import type { HospitalDoctor, DoctorFaq } from "@/lib/hms/types";

export type PublicDoctor = HospitalDoctor & {
  department_name?: string | null;
};

function publicClient() {
  if (!hasSupabaseConfig()) return null;
  return createSupabaseJs(getSupabaseUrl()!, getSupabaseAnonKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String).filter(Boolean);
}

function asFaqs(v: unknown): DoctorFaq[] {
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
    .filter(Boolean) as DoctorFaq[];
}

function mapRow(row: Record<string, unknown>): PublicDoctor {
  const dept = row.department as { name?: string } | null | undefined;
  return {
    id: String(row.id),
    slug: row.slug ? String(row.slug) : null,
    name: String(row.name || ""),
    title: String(row.title || "Consultant"),
    department_id: row.department_id ? String(row.department_id) : null,
    department_name: dept?.name || null,
    photo_url: row.photo_url ? String(row.photo_url) : null,
    qualifications: asStringArray(row.qualifications),
    degrees: asStringArray(row.degrees),
    certifications: asStringArray(row.certifications),
    specializations: asStringArray(row.specializations),
    experience_years: Number(row.experience_years) || 0,
    experience_notes: String(row.experience_notes || ""),
    experience_timeline: asStringArray(row.experience_timeline),
    awards: asStringArray(row.awards),
    memberships: asStringArray(row.memberships),
    languages: asStringArray(row.languages),
    treatments: asStringArray(row.treatments),
    services: asStringArray(row.services),
    faqs: asFaqs(row.faqs),
    consultation_fee: Number(row.consultation_fee) || 0,
    video_consultation_fee:
      row.video_consultation_fee != null
        ? Number(row.video_consultation_fee)
        : null,
    available_days: asStringArray(row.available_days),
    time_slots: asStringArray(row.time_slots),
    consultation_timings: String(row.consultation_timings || ""),
    biography: String(row.biography || ""),
    video_intro_url: row.video_intro_url ? String(row.video_intro_url) : null,
    is_featured: Boolean(row.is_featured),
    seo_title: row.seo_title ? String(row.seo_title) : null,
    seo_description: row.seo_description ? String(row.seo_description) : null,
    status: (row.status === "inactive" ? "inactive" : "active") as
      | "active"
      | "inactive",
    sort_order: Number(row.sort_order) || 0,
    department: dept
      ? {
          id: String(row.department_id || ""),
          name: String(dept.name || ""),
          slug: "",
          description: "",
          status: "active",
        }
      : null,
  };
}

function fallbackDoctor(): PublicDoctor {
  const d = getDoctor();
  // Same gallery asset as Home DoctorPreview (doctor.json image)
  // /images/doctors/lead-specialist.png
  const profilePhoto =
    d.image ||
    d.gallery?.[0] ||
    "/images/doctors/lead-specialist.png";
  return {
    id: d.id,
    slug: "dr-varaprasad-venkata-sumanth",
    name: d.name || "Dr. Varaprasad Venkata Sumanth",
    title:
      d.title || "Consultant Pulmonologist & Critical Care Specialist",
    department_id: null,
    department_name: "Pulmonology",
    photo_url: profilePhoto,
    qualifications: d.qualifications || [],
    degrees: d.qualifications || [],
    certifications: d.certificates || [],
    specializations: d.specializations || [],
    experience_years: 15,
    experience_notes: "",
    experience_timeline: d.experience || [],
    awards: d.awards || [],
    memberships: [],
    languages: d.languages || [],
    treatments: [
      "Asthma management",
      "COPD care",
      "Sleep apnea evaluation",
      "Critical care",
    ],
    services: ["OPD consultation", "Video consultation"],
    faqs: [
      {
        question: "When should I see a pulmonologist?",
        answer:
          "If you have persistent cough, breathlessness, wheezing, or known asthma/COPD needing specialist care.",
      },
    ],
    consultation_fee: d.consultationFee || 500,
    video_consultation_fee: d.videoConsultationFee || 400,
    available_days: ["mon", "tue", "wed", "thu", "fri", "sat"],
    time_slots: [],
    consultation_timings: "Mon–Sat · 9:00 AM – 8:00 PM",
    biography: d.bio,
    video_intro_url: null,
    is_featured: true,
    seo_title: `${d.name} | Pulmonologist, Badvel`,
    seo_description: d.bio.slice(0, 160),
    status: "active",
    sort_order: 0,
  };
}

const SELECT =
  "id, slug, name, title, department_id, photo_url, qualifications, degrees, certifications, specializations, experience_years, experience_notes, experience_timeline, awards, memberships, languages, treatments, services, faqs, consultation_fee, video_consultation_fee, available_days, time_slots, consultation_timings, biography, video_intro_url, is_featured, seo_title, seo_description, status, sort_order, department:departments(id, name, slug)";

export async function listPublicDepartments(): Promise<
  { id: string; name: string; slug: string }[]
> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return [
      { id: "dept-pulmonology", name: "Pulmonology", slug: "pulmonology" },
    ];
  }
  const supabase = publicClient();
  if (!supabase) {
    return [
      { id: "dept-pulmonology", name: "Pulmonology", slug: "pulmonology" },
    ];
  }
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, slug")
    .eq("status", "active")
    .order("name");
  if (error || !data?.length) {
    return [
      { id: "dept-pulmonology", name: "Pulmonology", slug: "pulmonology" },
    ];
  }
  return data.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
  }));
}

export async function listPublicDoctors(options?: {
  departmentId?: string;
  q?: string;
  specialization?: string;
  featuredOnly?: boolean;
}): Promise<PublicDoctor[]> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return [fallbackDoctor()];
  }

  const supabase = publicClient();
  if (!supabase) return [fallbackDoctor()];

  let query = supabase
    .from("hospital_doctors")
    .select(SELECT)
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (options?.departmentId) {
    query = query.eq("department_id", options.departmentId);
  }
  if (options?.featuredOnly) {
    query = query.eq("is_featured", true);
  }

  const { data, error } = await query;

  if (error) {
    // Columns from 008 may be missing — retry with core columns
    if (/column|schema cache/i.test(error.message)) {
      const legacy = await supabase
        .from("hospital_doctors")
        .select(
          "id, name, title, department_id, photo_url, qualifications, specializations, experience_years, experience_notes, consultation_fee, available_days, time_slots, biography, status, sort_order, department:departments(id, name, slug)"
        )
        .eq("status", "active")
        .order("sort_order")
        .order("name");
      if (legacy.error || !legacy.data?.length) return [fallbackDoctor()];
      return (legacy.data as Record<string, unknown>[]).map((r) =>
        mapRow({
          ...r,
          slug: null,
          is_featured: false,
          degrees: r.qualifications,
        })
      );
    }
    console.warn("[doctors] list:", error.message);
    return [fallbackDoctor()];
  }

  if (!data?.length) return [fallbackDoctor()];

  let rows = (data as Record<string, unknown>[]).map(mapRow);

  if (options?.specialization) {
    const s = options.specialization.toLowerCase();
    rows = rows.filter((d) =>
      d.specializations.some((x) => x.toLowerCase().includes(s))
    );
  }
  if (options?.q) {
    const q = options.q.toLowerCase();
    rows = rows.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        d.specializations.some((x) => x.toLowerCase().includes(q)) ||
        (d.department_name || "").toLowerCase().includes(q)
    );
  }

  return rows;
}

export async function getDoctorBySlug(
  slug: string
): Promise<PublicDoctor | null> {
  if (!slug) return null;

  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    const fb = fallbackDoctor();
    return fb.slug === slug || slug.includes("varaprasad") ? fb : null;
  }

  const supabase = publicClient();
  if (!supabase) {
    const fb = fallbackDoctor();
    return fb.slug === slug || slug.includes("varaprasad") ? fb : null;
  }

  const { data, error } = await supabase
    .from("hospital_doctors")
    .select(SELECT)
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (!error && data) return mapRow(data as Record<string, unknown>);

  // Fallback: match by id or name slugify
  const { data: all } = await supabase
    .from("hospital_doctors")
    .select(SELECT)
    .eq("status", "active");

  if (all?.length) {
    const mapped = (all as Record<string, unknown>[]).map(mapRow);
    const hit =
      mapped.find((d) => d.slug === slug) ||
      mapped.find((d) => d.id === slug) ||
      mapped.find((d) =>
        d.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .includes(slug.replace(/^dr-/, ""))
      );
    if (hit) return hit;
  }

  const fb = fallbackDoctor();
  if (slug.includes("varaprasad") || slug === fb.slug) return fb;
  return null;
}

export async function getFeaturedDoctor(): Promise<PublicDoctor> {
  const list = await listPublicDoctors({ featuredOnly: true });
  if (list[0]) return list[0];
  const all = await listPublicDoctors();
  return all[0] || fallbackDoctor();
}

export async function getRelatedDoctors(
  doctor: PublicDoctor,
  limit = 3
): Promise<PublicDoctor[]> {
  const all = await listPublicDoctors({
    departmentId: doctor.department_id || undefined,
  });
  return all.filter((d) => d.id !== doctor.id).slice(0, limit);
}

/** Whether doctor has clinic day today (rough online badge). */
export function isDoctorAvailableToday(doctor: PublicDoctor): boolean {
  const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const today = map[new Date().getDay()];
  const days = (doctor.available_days || []).map((d) => d.toLowerCase());
  if (!days.length) return true;
  return days.includes(today);
}

export function physicianJsonLd(doctor: PublicDoctor, siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Physician",
    name: doctor.name,
    description: doctor.seo_description || doctor.biography,
    url: `${siteUrl}/doctors/${doctor.slug || doctor.id}`,
    image: doctor.photo_url || undefined,
    medicalSpecialty: doctor.specializations,
    knowsLanguage: doctor.languages,
    hospitalAffiliation: {
      "@type": "Hospital",
      name: "Sri Srinivasa Hospital",
    },
    priceRange:
      doctor.consultation_fee > 0
        ? `₹${doctor.consultation_fee}`
        : undefined,
  };
}

export function breadcrumbJsonLd(
  items: { name: string; path: string }[],
  siteUrl: string
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  };
}
