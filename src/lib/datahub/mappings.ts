/**
 * CRUD for saved, reusable Excel-column -> DB-field mappings.
 *
 * Persisted to `datahub_mappings`, tenant-scoped so each hospital keeps its
 * own import mappings.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig, getServiceRoleKey } from "@/lib/supabase/env";
import type { SavedMapping } from "./types";

function canUseDb(): boolean {
  if (!hasSupabaseConfig()) return false;
  const key = getServiceRoleKey();
  return Boolean(key && key !== "your_service_role_key_here");
}

function mapRow(r: Record<string, unknown>): SavedMapping {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    moduleKey: String(r.module_key ?? ""),
    columnMap: (r.column_map as Record<string, string>) || {},
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

export async function listMappings(
  hospitalId: string | null,
  moduleKey?: string
): Promise<SavedMapping[]> {
  if (!canUseDb()) return [];
  const sb = createServiceRoleClient();
  let q = sb.from("datahub_mappings").select("*").order("updated_at", { ascending: false });
  if (hospitalId) q = q.eq("hospital_id", hospitalId);
  if (moduleKey) q = q.eq("module_key", moduleKey);
  const { data, error } = await q;
  if (error) return [];
  return (data || []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function getMapping(id: string): Promise<SavedMapping | null> {
  if (!canUseDb()) return null;
  const sb = createServiceRoleClient();
  const { data, error } = await sb.from("datahub_mappings").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function saveMapping(input: {
  id?: string;
  name: string;
  moduleKey: string;
  columnMap: Record<string, string>;
  hospitalId?: string | null;
  createdBy?: string | null;
}): Promise<SavedMapping | null> {
  if (!canUseDb()) return null;
  const sb = createServiceRoleClient();
  const payload = {
    name: input.name,
    module_key: input.moduleKey,
    column_map: input.columnMap,
    ...(input.hospitalId ? { hospital_id: input.hospitalId } : {}),
    ...(input.createdBy ? { created_by: input.createdBy } : {}),
  };

  if (input.id) {
    const { data, error } = await sb
      .from("datahub_mappings")
      .update(payload)
      .eq("id", input.id)
      .select()
      .single();
    if (error || !data) return null;
    return mapRow(data as Record<string, unknown>);
  }

  const { data, error } = await sb
    .from("datahub_mappings")
    .insert(payload)
    .select()
    .single();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function deleteMapping(
  id: string,
  hospitalId?: string | null
): Promise<boolean> {
  if (!canUseDb()) return false;
  const sb = createServiceRoleClient();
  let q = sb.from("datahub_mappings").delete().eq("id", id);
  if (hospitalId) q = q.eq("hospital_id", hospitalId);
  const { error } = await q;
  return !error;
}
