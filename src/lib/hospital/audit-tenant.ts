/**
 * Verify tenant isolation helpers (used by smoke / admin diagnostics).
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig, getServiceRoleKey } from "@/lib/supabase/env";

export type TenantAuditResult = {
  ok: boolean;
  defaultHospitalId: string | null;
  tables: {
    table: string;
    hasColumn: boolean;
    nullHospitalRows: number | null;
    totalRows: number | null;
    error?: string;
  }[];
};

const AUDIT_TABLES = [
  "appointments",
  "hospital_doctors",
  "hospital_patients",
  "departments",
  "lab_orders",
  "medicines",
  "prescriptions",
  "hospital_bills",
  "finance_expenses",
  "hr_employees",
  "profiles",
] as const;

export async function auditTenantColumns(): Promise<TenantAuditResult> {
  if (
    !hasSupabaseConfig() ||
    !getServiceRoleKey() ||
    getServiceRoleKey() === "your_service_role_key_here"
  ) {
    return { ok: false, defaultHospitalId: null, tables: [] };
  }

  const sb = createServiceRoleClient();
  let defaultHospitalId: string | null = null;
  try {
    const { data } = await sb
      .from("hospitals")
      .select("id")
      .eq("slug", "default")
      .maybeSingle();
    defaultHospitalId = data?.id ? String(data.id) : null;
  } catch {
    defaultHospitalId = null;
  }

  const tables: TenantAuditResult["tables"] = [];

  for (const table of AUDIT_TABLES) {
    try {
      const { count: total, error: tErr } = await sb
        .from(table)
        .select("*", { count: "exact", head: true });
      if (tErr) {
        tables.push({
          table,
          hasColumn: false,
          nullHospitalRows: null,
          totalRows: null,
          error: tErr.message,
        });
        continue;
      }
      const { count: nulls, error: nErr } = await sb
        .from(table)
        .select("*", { count: "exact", head: true })
        .is("hospital_id", null);
      tables.push({
        table,
        hasColumn: !nErr || !/column|hospital_id/i.test(nErr.message),
        nullHospitalRows: nErr ? null : nulls ?? 0,
        totalRows: total ?? 0,
        error: nErr?.message,
      });
    } catch (e) {
      tables.push({
        table,
        hasColumn: false,
        nullHospitalRows: null,
        totalRows: null,
        error: e instanceof Error ? e.message : "error",
      });
    }
  }

  const ok = tables.every(
    (t) =>
      t.error?.includes("does not exist") ||
      (t.hasColumn && (t.nullHospitalRows === 0 || t.totalRows === 0))
  );

  return { ok, defaultHospitalId, tables };
}
