import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  createPharmacySale,
  listMedicines,
  saveMedicine,
} from "@/lib/phase2/service";
import { medicineSchema, pharmacySaleSchema } from "@/lib/phase2/validation";
import { demoPhase2 } from "@/lib/phase2/demo-store";
import { rolesForPhase2Module } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("pharmacy");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;

  const tenant = await getTenantContext();
  const opts = { hospitalId: tenant.hospitalId };

  const kind = new URL(request.url).searchParams.get("kind") || "medicines";
  if (kind === "sales") {
    return NextResponse.json({ data: demoPhase2.listSales() });
  }
  if (kind === "alerts") {
    const meds = await listMedicines(opts);
    const soon = new Date();
    soon.setDate(soon.getDate() + 90);
    const soonStr = soon.toISOString().slice(0, 10);
    return NextResponse.json({
      low_stock: meds.filter((m) => m.stock_qty <= m.reorder_level),
      expiring: meds.filter(
        (m) => m.expiry_date && m.expiry_date <= soonStr
      ),
    });
  }
  const data = await listMedicines(opts);
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("pharmacy");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;

  const tenant = await getTenantContext();
  const opts = { hospitalId: tenant.hospitalId };

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "medicine");

  if (action === "sale") {
    const parsed = pharmacySaleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const sale = await createPharmacySale(parsed.data, opts);
    return NextResponse.json({ data: sale }, { status: 201 });
  }

  const parsed = medicineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const med = await saveMedicine(
    {
      ...parsed.data,
      id: body.id,
      manufacturer: parsed.data.manufacturer || "",
      batch_number: parsed.data.batch_number || "",
      reorder_level: parsed.data.reorder_level ?? 10,
    },
    opts
  );
  return NextResponse.json({ data: med }, { status: 201 });
}
