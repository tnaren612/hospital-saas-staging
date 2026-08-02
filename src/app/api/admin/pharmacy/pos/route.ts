import { NextResponse } from "next/server";
import { requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { rolesForPhase2Module } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import { createPosSale } from "@/lib/pharmacy/service";
import { posSaleSchema } from "@/lib/pharmacy/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("pharmacy");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const tenant = await getTenantContext();
  const opts = { hospitalId: tenant.hospitalId };

  const body = await request.json().catch(() => ({}));
  const parsed = posSaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Sanity guard: for non-credit payment methods, tendered amount must cover
  // the grand total (partial settlement is only valid for credit/other).
  const method = parsed.data.payment_method;
  const isDeferred = method === "credit" || method === "insurance";
  if (!isDeferred && parsed.data.amount_paid < parsed.data.grand_total) {
    return NextResponse.json(
      { error: "Amount paid is less than the grand total" },
      { status: 400 }
    );
  }

  try {
    const sale = await createPosSale(parsed.data, opts);
    return NextResponse.json({ data: sale }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sale could not be completed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
