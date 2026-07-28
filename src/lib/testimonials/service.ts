/**
 * Testimonials data layer.
 * Priority: Supabase CMS → localStorage CMS → static JSON defaults.
 */

import testimonialsJson from "@/data/testimonials.json";
import type { Testimonial } from "@/types";
import { getPatientAvatar } from "@/lib/assets/production-catalog";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";

const STORAGE_KEY = "ssh_testimonials_cms";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function mapRemote(row: Record<string, unknown>): Testimonial {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    role: String(row.role || ""),
    treatment: String(row.treatment || row.role || ""),
    content: String(row.content || ""),
    rating: Math.min(5, Math.max(1, Number(row.rating) || 5)),
    image: String(row.image_url || row.image || ""),
    date: String(row.review_date || row.date || "").slice(0, 10),
    featured: Boolean(row.featured),
    published: row.published !== false,
  };
}

function defaults(): Testimonial[] {
  return (testimonialsJson as Testimonial[]).map((t, i) => ({
    ...t,
    published: t.published !== false,
    featured: Boolean(t.featured),
    treatment: t.treatment || t.role,
    image:
      t.image?.startsWith("http") || t.image?.endsWith(".svg")
        ? t.image.startsWith("http")
          ? t.image
          : getPatientAvatar(i)
        : getPatientAvatar(i),
  }));
}

function readCms(): Testimonial[] | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Testimonial[];
    if (!Array.isArray(parsed) || !parsed.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCms(items: Testimonial[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

/** Fetch published testimonials from Supabase (client or server). */
export async function fetchTestimonialsFromSupabase(): Promise<
  Testimonial[] | null
> {
  if (!hasSupabaseConfig()) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(getSupabaseUrl()!, getSupabaseAnonKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb
      .from("testimonials")
      .select("*")
      .eq("published", true)
      .order("sort_order", { ascending: true })
      .order("review_date", { ascending: false });

    if (error || !data?.length) return null;
    return data.map((r) => mapRemote(r as Record<string, unknown>));
  } catch {
    return null;
  }
}

/** Sync helpers used by client components */
export function getPublishedTestimonials(): Testimonial[] {
  const cms = readCms();
  const all = cms && cms.length ? cms : defaults();
  return all
    .filter((t) => t.published !== false)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getFeaturedTestimonials(limit = 6): Testimonial[] {
  const published = getPublishedTestimonials();
  const featured = published.filter((t) => t.featured);
  const pool = featured.length >= 3 ? featured : published;
  return pool.slice(0, limit);
}

export function getAllTestimonials(): Testimonial[] {
  const cms = readCms();
  if (cms && cms.length > 0) return cms;
  return defaults();
}

export function saveAllTestimonials(items: Testimonial[]): void {
  writeCms(items);
}

export function createTestimonial(
  input: Omit<Testimonial, "id"> & { id?: string }
): Testimonial {
  const all = getAllTestimonials();
  const item: Testimonial = {
    id: input.id || `t_${Date.now()}`,
    name: input.name.trim(),
    role: input.role.trim(),
    content: input.content.trim(),
    rating: Math.min(5, Math.max(1, Number(input.rating) || 5)),
    image: input.image || getPatientAvatar(all.length),
    date: input.date || new Date().toISOString().slice(0, 10),
    treatment: input.treatment?.trim() || input.role.trim(),
    featured: Boolean(input.featured),
    published: input.published !== false,
  };
  all.unshift(item);
  saveAllTestimonials(all);
  return item;
}

export function updateTestimonial(
  id: string,
  patch: Partial<Testimonial>
): Testimonial | null {
  const all = getAllTestimonials();
  const idx = all.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    ...patch,
    id: all[idx].id,
    rating:
      patch.rating != null
        ? Math.min(5, Math.max(1, Number(patch.rating)))
        : all[idx].rating,
  };
  saveAllTestimonials(all);
  return all[idx];
}

export function deleteTestimonial(id: string): boolean {
  const all = getAllTestimonials();
  const next = all.filter((t) => t.id !== id);
  if (next.length === all.length) return false;
  saveAllTestimonials(next);
  return true;
}

export function resetTestimonialsToDefaults(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Merge remote Supabase rows into local CMS cache (client). */
export function hydrateTestimonialsFromRemote(rows: Testimonial[]): void {
  if (!rows.length) return;
  writeCms(rows);
}
