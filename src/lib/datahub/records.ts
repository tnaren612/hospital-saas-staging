/**
 * Backup metadata records (`datahub_backups`) — list / record / delete.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig, getServiceRoleKey } from "@/lib/supabase/env";

export type BackupRecord = {
  id: string;
  name: string;
  fileName: string | null;
  rows: number;
  sizeBytes: number;
  checksum: string;
  createdAt: string;
};

function canUseDb(): boolean {
  if (!hasSupabaseConfig()) return false;
  const key = getServiceRoleKey();
  return Boolean(key && key !== "your_service_role_key_here");
}

export async function listBackups(
  hospitalId: string | null,
  limit = 50
): Promise<BackupRecord[]> {
  if (!canUseDb()) return [];
  const sb = createServiceRoleClient();
  let q = sb.from("datahub_backups").select("*").order("created_at", { ascending: false }).limit(limit);
  if (hospitalId) q = q.eq("hospital_id", hospitalId);
  const { data, error } = await q;
  if (error) return [];
  return (data || []).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    fileName: String(r.file_name ?? ""),
    rows: Number(r.rows ?? 0),
    sizeBytes: Number(r.size_bytes ?? 0),
    checksum: String(r.checksum ?? ""),
    createdAt: String(r.created_at ?? ""),
  }));
}

export async function recordBackup(input: {
  name: string;
  fileName: string;
  rows: number;
  sizeBytes: number;
  checksum: string;
  hospitalId?: string | null;
}): Promise<void> {
  if (!canUseDb()) return;
  const sb = createServiceRoleClient();
  try {
    await sb.from("datahub_backups").insert({
      name: input.name,
      file_name: input.fileName,
      rows: input.rows,
      size_bytes: input.sizeBytes,
      checksum: input.checksum,
      status: "ok",
      ...(input.hospitalId ? { hospital_id: input.hospitalId } : {}),
    });
  } catch {
    // non-fatal
  }
}

export async function deleteBackup(
  id: string,
  hospitalId?: string | null
): Promise<boolean> {
  if (!canUseDb()) return false;
  const sb = createServiceRoleClient();
  let q = sb.from("datahub_backups").delete().eq("id", id);
  if (hospitalId) q = q.eq("hospital_id", hospitalId);
  const { error } = await q;
  return !error;
}
