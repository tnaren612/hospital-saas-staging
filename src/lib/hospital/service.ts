/**
 * Hospital config service — single source of truth for multi-hospital SaaS.
 * Secrets never stored in settings JSON (env / vault only).
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig, getServiceRoleKey } from "@/lib/supabase/env";
import {
  buildDefaultHospitalConfig,
  deepMerge,
  getDefaultHospitalSlug,
} from "@/lib/hospital/defaults";
import type {
  HospitalConfig,
  HospitalSettingsPatch,
  HospitalType,
  ModuleKey,
} from "@/lib/hospital/types";
import { hexToHslChannels } from "@/lib/hospital/color";

let memoryCache: { at: number; config: HospitalConfig } | null = null;
/** Longer process cache — public reads are hot-path on appointment page */
const CACHE_MS = 120_000;

function canUseDb() {
  if (!hasSupabaseConfig()) return false;
  const key = getServiceRoleKey();
  return Boolean(key && key !== "your_service_role_key_here");
}

function client() {
  return createServiceRoleClient();
}

function mergeConfig(
  base: HospitalConfig,
  row: {
    hospital_id?: string;
    slug?: string;
    hospital_type?: string;
    branding?: Record<string, unknown>;
    contact?: Record<string, unknown>;
    localization?: Record<string, unknown>;
    legal?: Record<string, unknown>;
    modules?: Record<string, unknown>;
    prefixes?: Record<string, unknown>;
    payments?: Record<string, unknown>;
    email?: Record<string, unknown>;
    storage?: Record<string, unknown>;
    auth_providers?: Record<string, unknown>;
    templates?: Record<string, unknown>;
    seo?: Record<string, unknown>;
    social?: Record<string, unknown>;
    working_hours?: Record<string, unknown>;
    updated_at?: string;
  }
): HospitalConfig {
  return {
    ...base,
    hospital_id: row.hospital_id || base.hospital_id,
    slug: row.slug || base.slug,
    hospital_type: (row.hospital_type as HospitalType) || base.hospital_type,
    branding: deepMerge(base.branding, row.branding as never),
    contact: deepMerge(base.contact, row.contact as never),
    localization: deepMerge(base.localization, row.localization as never),
    legal: deepMerge(base.legal, row.legal as never),
    modules: deepMerge(base.modules, row.modules as never),
    prefixes: deepMerge(base.prefixes, row.prefixes as never),
    payments: deepMerge(base.payments, row.payments as never),
    email: deepMerge(base.email, row.email as never),
    storage: deepMerge(base.storage, row.storage as never),
    auth_providers: deepMerge(base.auth_providers, row.auth_providers as never),
    templates: deepMerge(base.templates, row.templates as never),
    seo: deepMerge(base.seo, row.seo as never),
    social: deepMerge(base.social, row.social as never),
    working_hours: deepMerge(base.working_hours, row.working_hours as never),
    source: "database",
    updated_at: row.updated_at,
  };
}

/**
 * Ensure default hospital + settings rows exist (idempotent).
 */
export async function ensureDefaultHospital(): Promise<string | null> {
  if (!canUseDb()) return null;
  const slug = getDefaultHospitalSlug();
  const defaults = buildDefaultHospitalConfig();
  try {
    const sb = client();
    const { data: existing } = await sb
      .from("hospitals")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    let hospitalId = existing?.id as string | undefined;
    if (!hospitalId) {
      const { data: created, error } = await sb
        .from("hospitals")
        .insert({
          slug,
          name: defaults.branding.name,
          hospital_type: defaults.hospital_type,
          status: "active",
        })
        .select("id")
        .single();
      if (error || !created) return null;
      hospitalId = created.id;
    }

    const { data: settings } = await sb
      .from("hospital_settings")
      .select("hospital_id")
      .eq("hospital_id", hospitalId)
      .maybeSingle();

    if (!settings) {
      await sb.from("hospital_settings").insert({
        hospital_id: hospitalId,
        branding: defaults.branding,
        contact: defaults.contact,
        localization: defaults.localization,
        legal: defaults.legal,
        modules: defaults.modules,
        prefixes: defaults.prefixes,
        payments: defaults.payments,
        email: defaults.email,
        storage: defaults.storage,
        auth_providers: defaults.auth_providers,
        templates: defaults.templates,
        seo: defaults.seo,
        social: defaults.social,
        working_hours: defaults.working_hours,
      });
    }

    return hospitalId ?? null;
  } catch {
    return null;
  }
}

export async function getHospitalConfig(
  opts?: {
    slug?: string;
    bypassCache?: boolean;
    /**
     * When true (default for public reads), never INSERT default rows.
     * Seeding only on admin/write paths via ensureDefaultHospital().
     */
    ensureExists?: boolean;
  }
): Promise<HospitalConfig> {
  const defaults = buildDefaultHospitalConfig();
  const slug = (opts?.slug || getDefaultHospitalSlug()).toLowerCase();

  if (!opts?.bypassCache && memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    if (memoryCache.config.slug === slug) return memoryCache.config;
  }

  if (!canUseDb()) {
    memoryCache = { at: Date.now(), config: { ...defaults, source: "defaults" } };
    return memoryCache.config;
  }

  try {
    // Public reads must stay fast — no write path
    if (opts?.ensureExists) {
      await ensureDefaultHospital();
    }
    const sb = client();
    // Parallel hospital + settings when we already know id is rare; single join-like flow
    const { data: hospital } = await sb
      .from("hospitals")
      .select("id, slug, name, hospital_type, status")
      .eq("slug", slug)
      .maybeSingle();

    if (!hospital || hospital.status !== "active") {
      // Fallback: try default slug without ensuring (fast)
      if (slug !== getDefaultHospitalSlug()) {
        return getHospitalConfig({
          slug: getDefaultHospitalSlug(),
          bypassCache: opts?.bypassCache,
          ensureExists: false,
        });
      }
      memoryCache = { at: Date.now(), config: defaults };
      return defaults;
    }

    const { data: settings } = await sb
      .from("hospital_settings")
      .select("*")
      .eq("hospital_id", hospital.id)
      .maybeSingle();

    const config = mergeConfig(defaults, {
      hospital_id: hospital.id,
      slug: hospital.slug,
      hospital_type: hospital.hospital_type,
      branding: {
        ...(settings?.branding as object),
        name:
          (settings?.branding as { name?: string })?.name || hospital.name,
      },
      contact: settings?.contact as never,
      localization: settings?.localization as never,
      legal: settings?.legal as never,
      modules: settings?.modules as never,
      prefixes: settings?.prefixes as never,
      payments: settings?.payments as never,
      email: settings?.email as never,
      storage: settings?.storage as never,
      auth_providers: settings?.auth_providers as never,
      templates: settings?.templates as never,
      seo: settings?.seo as never,
      social: settings?.social as never,
      working_hours: settings?.working_hours as never,
      updated_at: settings?.updated_at,
    });

    memoryCache = { at: Date.now(), config };
    return config;
  } catch {
    return defaults;
  }
}

export function invalidateHospitalConfigCache() {
  memoryCache = null;
}

export async function updateHospitalSettings(
  patch: HospitalSettingsPatch,
  updatedBy?: string | null
): Promise<HospitalConfig> {
  const current = await getHospitalConfig({ bypassCache: true });
  const next = mergeConfig(current, {
    hospital_id: current.hospital_id || undefined,
    slug: current.slug,
    hospital_type: patch.hospital_type || current.hospital_type,
    branding: { ...current.branding, ...patch.branding, name: patch.name || patch.branding?.name || current.branding.name },
    contact: { ...current.contact, ...patch.contact },
    localization: { ...current.localization, ...patch.localization },
    legal: { ...current.legal, ...patch.legal },
    modules: { ...current.modules, ...patch.modules },
    prefixes: { ...current.prefixes, ...patch.prefixes },
    payments: { ...current.payments, ...patch.payments },
    email: { ...current.email, ...patch.email },
    storage: { ...current.storage, ...patch.storage },
    auth_providers: { ...current.auth_providers, ...patch.auth_providers },
    templates: { ...current.templates, ...patch.templates },
    seo: { ...current.seo, ...patch.seo },
    social: { ...current.social, ...patch.social },
    working_hours: { ...current.working_hours, ...patch.working_hours },
  });

  if (!canUseDb()) {
    // Persist to memory for session (demo)
    memoryCache = { at: Date.now(), config: { ...next, source: "demo" } };
    return memoryCache.config;
  }

  const hospitalId =
    current.hospital_id || (await ensureDefaultHospital());
  if (!hospitalId) {
    memoryCache = { at: Date.now(), config: next };
    return next;
  }

  const sb = client();
  if (patch.name || patch.hospital_type) {
    await sb
      .from("hospitals")
      .update({
        name: next.branding.name,
        hospital_type: next.hospital_type,
      })
      .eq("id", hospitalId);
  }

  await sb.from("hospital_settings").upsert({
    hospital_id: hospitalId,
    branding: next.branding,
    contact: next.contact,
    localization: next.localization,
    legal: next.legal,
    modules: next.modules,
    prefixes: next.prefixes,
    payments: next.payments,
    email: next.email,
    storage: next.storage,
    auth_providers: next.auth_providers,
    templates: next.templates,
    seo: next.seo,
    social: next.social,
    working_hours: next.working_hours,
    updated_by: updatedBy || null,
  });

  invalidateHospitalConfigCache();
  return getHospitalConfig({ bypassCache: true });
}

export function isModuleEnabled(
  config: HospitalConfig,
  module: ModuleKey
): boolean {
  return Boolean(config.modules[module]);
}

/** CSS variables for theming without rebuild */
export function brandCssVariables(config: HospitalConfig): string {
  const p = config.branding.primary_color || "#1a5ff5";
  const s = config.branding.secondary_color || "#0d9488";
  const primaryHsl = hexToHslChannels(p) || "221 83% 53%";
  return (
    `:root{--hospital-primary:${p};--hospital-secondary:${s};` +
    `--brand-primary:${p};--primary:${primaryHsl};--ring:${primaryHsl};` +
    `--teal-brand:${s};}`
  );
}

/** Compat shape used by existing hospital.json consumers */
export function configToLegacyHospital(config: HospitalConfig) {
  return {
    name: config.branding.name,
    tagline: config.branding.tagline,
    address: {
      line1: config.contact.address_line1,
      line2: config.contact.address_line2,
      city: config.contact.city,
      state: config.contact.state,
      pincode: config.contact.pincode,
      country: config.contact.country,
    },
    phones: config.contact.phones,
    emergencyPhone: config.contact.emergency_phone,
    whatsapp: config.contact.whatsapp,
    email: config.contact.email,
    timings: {
      opd: config.working_hours.opd,
      emergency: config.working_hours.emergency,
    },
    geo: {
      lat: config.contact.lat ?? 0,
      lng: config.contact.lng ?? 0,
    },
    social: {
      facebook: config.social.facebook,
      instagram: config.social.instagram,
      youtube: config.social.youtube,
    },
  };
}
