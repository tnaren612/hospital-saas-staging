/**
 * Centralized image CMS — ALL site images from public.gallery_images.
 * Public reads use the anon key (no cookies required).
 *
 * Cache rules:
 * - Successful non-empty results: TTL 60s
 * - Empty results: TTL 3s (avoids sticky "no image" after admin upload)
 * - Errors: never cached
 * - clearImageCache() after admin mutations
 */

import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";

export type CmsImage = {
  id: string;
  section: string;
  key: string;
  title: string;
  alt_text: string;
  category: string;
  image_url: string;
  storage_path: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

const CACHE_TTL_MS = 60_000;
const EMPTY_CACHE_TTL_MS = 3_000;
const cache = new Map<string, { expires: number; data: CmsImage[] }>();

export const IMAGE_SECTIONS = [
  "home",
  "about",
  "gallery",
  "services",
  "doctors",
  "doctor",
  "departments",
  "facilities",
  "emergency",
  "contact",
  "testimonials",
  "appointment",
  "packages",
  "package",
  "insurance",
  "faq",
  "blog",
  "footer",
  "logo",
] as const;

export const IMAGE_KEYS = [
  "hero",
  "banner",
  "background",
  "doctor",
  "building",
  "hospital",
  "profile",
  "reception",
  "icu",
  "opd",
  "ambulance",
  "image",
  "logo",
  "og",
  "gallery",
  "icon",
  "brochure",
] as const;

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function publicClient() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase is not configured");
  }
  return createClient(getSupabaseUrl()!, getSupabaseAnonKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapRow(row: Record<string, unknown>): CmsImage {
  const image_url = String(row.image_url || row.public_url || "").trim();
  const alt_text = String(row.alt_text || row.alt || row.title || "").trim();
  return {
    id: String(row.id),
    section: normalize(String(row.section || "gallery")),
    key: normalize(String(row.key || "image")),
    title: String(row.title || ""),
    alt_text,
    category: String(row.category || ""),
    image_url,
    storage_path: String(row.storage_path || ""),
    sort_order: Number(row.sort_order) || 0,
    // Treat null/undefined as active (legacy rows before is_active existed)
    is_active: row.is_active !== false && row.is_active !== "false",
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

/** Prefer columns that always existed; include CMS columns when present. */
const SELECT_COLS =
  "id, section, key, title, alt_text, alt, category, image_url, public_url, storage_path, sort_order, is_active, created_at, updated_at";

const SELECT_LEGACY =
  "id, public_url, storage_path, alt, category, sort_order, created_at";

function sortImages(rows: CmsImage[]): CmsImage[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
}

/**
 * Core fetch. Filters active images; normalizes section/key case.
 * Falls back to legacy select if CMS columns are missing.
 */
async function queryActive(filters: {
  section?: string;
  key?: string;
}): Promise<CmsImage[]> {
  const section = filters.section ? normalize(filters.section) : undefined;
  const key = filters.key ? normalize(filters.key) : undefined;
  const cacheKey = `q:${section || "*"}:${key || "*"}`;

  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) {
    return hit.data;
  }

  if (!hasSupabaseConfig()) {
    cache.set(cacheKey, {
      expires: Date.now() + EMPTY_CACHE_TTL_MS,
      data: [],
    });
    return [];
  }

  try {
    const supabase = publicClient();
    let rawRows: Record<string, unknown>[] = [];

    // Fetch by section (ilike for case-safety); key filtered in JS after normalize.
    let q = supabase
      .from("gallery_images")
      .select(SELECT_COLS)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (section) {
      q = q.ilike("section", section);
    }

    const primary = await q;

    if (primary.error) {
      // Legacy schema fallback (pre-migration 005)
      console.warn("[image-service] primary select failed:", primary.error.message);
      const legacyRes = await supabase
        .from("gallery_images")
        .select(SELECT_LEGACY)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (legacyRes.error) {
        console.warn(
          "[image-service] legacy select failed:",
          legacyRes.error.message
        );
        return [];
      }

      rawRows = (legacyRes.data || []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: row.id,
          public_url: row.public_url,
          storage_path: row.storage_path,
          alt: row.alt,
          category: row.category,
          sort_order: row.sort_order,
          created_at: row.created_at,
          section: "gallery",
          key: "image",
          title: "",
          alt_text: String(row.alt || ""),
          image_url: String(row.public_url || ""),
          is_active: true,
          updated_at: row.created_at,
        };
      });
    } else {
      rawRows = (primary.data || []) as Record<string, unknown>[];
    }

    let rows = rawRows.map((r) => mapRow(r));

    // Active only
    rows = rows.filter((r) => r.is_active);

    // Exact normalized match
    if (section) {
      rows = rows.filter((r) => r.section === section);
    }
    if (key) {
      rows = rows.filter((r) => r.key === key);
    }

    // Drop rows without a usable URL
    rows = rows.filter((r) => Boolean(r.image_url));

    rows = sortImages(rows);

    const ttl = rows.length > 0 ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS;
    cache.set(cacheKey, { expires: Date.now() + ttl, data: rows });
    return rows;
  } catch (e) {
    console.warn("[image-service]", e);
    return [];
  }
}

/** Clear in-memory cache (call after admin mutations). */
export function clearImageCache() {
  cache.clear();
}

/** All active images for a section (any key), sorted. */
export async function getImages(section: string): Promise<CmsImage[]> {
  return queryActive({ section });
}

/**
 * All active images for section + key (e.g. home/hero carousel).
 * Sorted by sort_order.
 */
export async function getImagesByKey(
  section: string,
  key: string
): Promise<CmsImage[]> {
  return queryActive({ section, key });
}

/** First active image for section + key, or null. */
export async function getImage(
  section: string,
  key: string
): Promise<CmsImage | null> {
  const rows = await getImagesByKey(section, key);
  return rows[0] || null;
}

/**
 * Banner helper for page headers.
 * Tries key=banner, then background, then first active image in section.
 * This keeps About/Contact/etc. working even if admins used a nearby key.
 */
export async function getBanner(section: string): Promise<CmsImage | null> {
  const s = normalize(section);
  const banner = await getImage(s, "banner");
  if (banner) return banner;

  const background = await getImage(s, "background");
  if (background) return background;

  // Last resort: first image tagged to this section (any key)
  const sectionImages = await getImages(s);
  return sectionImages[0] || null;
}

/** Convenience URL string (empty if missing). */
export async function getImageUrl(
  section: string,
  key: string
): Promise<string> {
  const img = await getImage(section, key);
  return img?.image_url || "";
}
