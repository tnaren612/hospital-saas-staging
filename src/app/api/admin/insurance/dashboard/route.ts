import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const tenant = await getTenantContext();
  try {
    let providersQuery = gate.supabase.from("insurance_providers").select("id", { count: "exact", head: true }).eq("is_active", true);
    let policiesQuery = gate.supabase.from("patient_insurance").select("id", { count: "exact", head: true }).eq("is_active", true);
    let preauthsQuery = gate.supabase.from("pre_authorizations").select("id", { count: "exact", head: true }).in("status", ["draft", "submitted"]);
    let claimsQuery = gate.supabase.from("insurance_claims").select("id, claim_amount, approved_amount, settlement_amount, status");
    if (tenant.hospitalId) {
      providersQuery = providersQuery.eq("hospital_id", tenant.hospitalId);
      policiesQuery = policiesQuery.eq("hospital_id", tenant.hospitalId);
      preauthsQuery = preauthsQuery.eq("hospital_id", tenant.hospitalId);
      claimsQuery = claimsQuery.eq("hospital_id", tenant.hospitalId);
    }
    const [
      providersRes,
      policiesRes,
      preauthsRes,
      claimsRes,
    ] = await Promise.all([
      providersQuery,
      policiesQuery,
      preauthsQuery,
      claimsQuery,
    ]);

    type ClaimSummary = { status:string;claim_amount:number|null;settlement_amount:number|null };
    const claims = (claimsRes.data || []) as ClaimSummary[];
    const submittedClaims = claims.filter((c) => c.status === "submitted" || c.status === "in_process");
    const approvedClaims = claims.filter((c) => c.status === "approved" || c.status === "partially_approved");
    const settledClaims = claims.filter((c) => c.status === "settled");
    const rejectedClaims = claims.filter((c) => c.status === "rejected");

    const totalClaimAmount = claims.reduce((s, c) => s + Number(c.claim_amount || 0), 0);
    const totalSettledAmount = settledClaims.reduce((s, c) => s + Number(c.settlement_amount || 0), 0);
    const pendingApprovalAmount = submittedClaims.reduce((s, c) => s + Number(c.claim_amount || 0), 0);

    return NextResponse.json({
      data: {
        total_providers: providersRes.count || 0,
        active_policies: policiesRes.count || 0,
        pending_preauths: preauthsRes.count || 0,
        submitted_claims: submittedClaims.length,
        approved_claims: approvedClaims.length,
        settled_claims: settledClaims.length,
        rejected_claims: rejectedClaims.length,
        total_claim_amount: totalClaimAmount,
        total_settled_amount: totalSettledAmount,
        pending_approval_amount: pendingApprovalAmount,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Dashboard load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
