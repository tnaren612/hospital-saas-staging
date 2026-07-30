import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { getTenantContext } from "@/lib/hospital/tenant";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get("type") || "claims";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const providerId = searchParams.get("provider_id");
  const status = searchParams.get("status");

  const tenant = await getTenantContext();

  if (reportType === "provider-summary") {
    return getProviderSummary(gate.supabase, tenant, from, to);
  }

  // Default: claims report
  let query = gate.supabase
    .from("insurance_claims")
    .select(`
      id,
      claim_number,
      status,
      total_bill_amount,
      claim_amount,
      approved_amount,
      settlement_amount,
      submitted_date,
      settlement_date,
      created_at,
      rejection_reason,
      patient_insurance!inner(
        policy_number,
        insurance_providers(provider_name)
      ),
      hospital_patients(full_name)
    `)
    .order("created_at", { ascending: false });

  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }
  if (status) query = query.eq("status", status);
  if (providerId) {
    query = query.eq("patient_insurance.provider_id", providerId);
  }
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  type RawClaim = {
    id:string;claim_number:string;status:string;total_bill_amount:number;claim_amount:number;
    approved_amount:number|null;settlement_amount:number|null;submitted_date:string|null;settlement_date:string|null;
    created_at:string;patient_insurance?:{policy_number?:string;insurance_providers?:{provider_name?:string}|null}|null;
    hospital_patients?:{full_name?:string}|null;
  };
  const rows = (data as unknown as RawClaim[] || []).map((r) => ({
    id: r.id,
    claim_number: r.claim_number,
    patient_name: r.hospital_patients?.full_name || "—",
    provider_name: r.patient_insurance?.insurance_providers?.provider_name || "—",
    policy_number: r.patient_insurance?.policy_number || "—",
    claim_amount: Number(r.claim_amount || 0),
    approved_amount: r.approved_amount ? Number(r.approved_amount) : null,
    settlement_amount: r.settlement_amount ? Number(r.settlement_amount) : null,
    status: r.status,
    total_bill_amount: Number(r.total_bill_amount || 0),
    submitted_date: r.submitted_date,
    settlement_date: r.settlement_date,
    created_at: r.created_at,
  }));

  const summary = {
    total_claims: rows.length,
    total_claim_amount: rows.reduce((s, r) => s + r.claim_amount, 0),
    total_approved_amount: rows.reduce((s, r) => s + (r.approved_amount || 0), 0),
    total_settled_amount: rows.reduce((s, r) => s + (r.settlement_amount || 0), 0),
    pending_count: rows.filter((r) => ["draft", "submitted", "in_process"].includes(r.status)).length,
    approved_count: rows.filter((r) => ["approved", "partially_approved"].includes(r.status)).length,
    settled_count: rows.filter((r) => r.status === "settled").length,
    rejected_count: rows.filter((r) => r.status === "rejected").length,
    cancelled_count: rows.filter((r) => r.status === "cancelled").length,
  };

  return NextResponse.json({ data: rows, summary });
}

async function getProviderSummary(supabase: SupabaseClient, tenant: { hospitalId: string | null }, from?: string | null, to?: string | null) {
  let query = supabase
    .from("insurance_claims")
    .select(`
      id,
      claim_amount,
      approved_amount,
      settlement_amount,
      status,
      patient_insurance!inner(
        insurance_providers(provider_name, id)
      )
    `);

  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Group by provider
  type ProviderClaim = { claim_amount:number|null;approved_amount:number|null;settlement_amount:number|null;status:string;patient_insurance?:{insurance_providers?:{provider_name?:string;id?:string}|null}|null };
  type ProviderSummary = {provider_id?:string;provider_name?:string;total_claims:number;total_claim_amount:number;total_approved_amount:number;total_settled_amount:number;pending_claims:number;approved_claims:number;rejected_claims:number};
  const providerMap = new Map<string, ProviderSummary>();
  for (const row of (data || [])) {
    const r = row as unknown as ProviderClaim;
    const provider = r.patient_insurance?.insurance_providers;
    if (!provider) continue;

    const key = provider.id || provider.provider_name;
    if (!key) continue;
    if (!providerMap.has(key)) {
      providerMap.set(key, {
        provider_id: provider.id,
        provider_name: provider.provider_name,
        total_claims: 0,
        total_claim_amount: 0,
        total_approved_amount: 0,
        total_settled_amount: 0,
        pending_claims: 0,
        approved_claims: 0,
        rejected_claims: 0,
      });
    }

    const p = providerMap.get(key)!;
    p.total_claims++;
    p.total_claim_amount += Number(r.claim_amount || 0);
    p.total_approved_amount += Number(r.approved_amount || 0);
    p.total_settled_amount += Number(r.settlement_amount || 0);

    if (["draft", "submitted", "in_process"].includes(r.status)) p.pending_claims++;
    else if (["approved", "partially_approved"].includes(r.status)) p.approved_claims++;
    else if (r.status === "rejected") p.rejected_claims++;
  }

  return NextResponse.json({
    data: Array.from(providerMap.values()),
  });
}
