/**
 * Best-effort audit logging for Data Management operations.
 *
 * Every import / export / backup / restore / template / mapping action is
 * written to `datahub_audit`. Failures are logged, never thrown, so auditing
 * never breaks the happy path.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig, getServiceRoleKey } from "@/lib/supabase/env";
import type { DataAuditEntry } from "./types";

export type AuditInput = Omit<
  DataAuditEntry,
  "id" | "createdAt" | "meta"
> & {
  userId?: string | null;
  meta?: Record<string, unknown>;
  hospitalId?: string | null;
};

function canWrite(): boolean {
  if (!hasSupabaseConfig()) return false;
  const key = getServiceRoleKey();
  return Boolean(key && key !== "your_service_role_key_here");
}

export async function writeDataAudit(input: AuditInput): Promise<void> {
  if (!canWrite()) return;
  try {
    const sb = createServiceRoleClient();
    const { error } = await sb.from("datahub_audit").insert({
      hospital_id: input.hospitalId || null,
      user_id: input.userId || null,
      user_email: input.userEmail || null,
      action: input.action,
      module_key: input.moduleKey,
      file_name: input.fileName || null,
      rows_imported: input.rowsImported ?? 0,
      rows_exported: input.rowsExported ?? 0,
      rows_updated: input.rowsUpdated ?? 0,
      rows_failed: input.rowsFailed ?? 0,
      rows_duplicates: input.rowsDuplicates ?? 0,
      errors: input.errors ?? 0,
      ip_address: input.ipAddress || null,
      meta: input.meta || {},
    });
    if (error) console.warn("[datahub-audit]", error.message);
  } catch (e) {
    console.warn("[datahub-audit] write failed", e);
  }
}

/** Query recent audit entries (newest first). */
export async function listDataAudit(
  hospitalId: string | null,
  opts: { limit?: number; moduleKey?: string; action?: string } = {}
): Promise<DataAuditEntry[]> {
  if (!canWrite()) return [];
  try {
    const sb = createServiceRoleClient();
    let q = sb
      .from("datahub_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? 100);
    if (hospitalId) q = q.eq("hospital_id", hospitalId);
    if (opts.moduleKey) q = q.eq("module_key", opts.moduleKey);
    if (opts.action) q = q.eq("action", opts.action);
    const { data } = await q;
    return (data || []).map((r) => ({
      id: String(r.id),
      action: r.action,
      moduleKey: r.module_key,
      fileName: r.file_name,
      rowsImported: r.rows_imported,
      rowsExported: r.rows_exported,
      rowsUpdated: r.rows_updated,
      rowsFailed: r.rows_failed,
      rowsDuplicates: r.rows_duplicates,
      errors: r.errors,
      ipAddress: r.ip_address,
      userEmail: r.user_email,
      createdAt: r.created_at,
    }));
  } catch (e) {
    console.warn("[datahub-audit] list failed", e);
    return [];
  }
}
