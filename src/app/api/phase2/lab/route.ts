import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  createLabOrder,
  listLabOrders,
  listLabTests,
  updateLabOrderStatus,
} from "@/lib/phase2/service";
import { labOrderCreateSchema, labStatusSchema } from "@/lib/phase2/validation";
import { rolesForPhase2Module } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("laboratory");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(rolesForPhase2Module("lab"));
  if (gate.error) return gate.error;

  const tenant = await getTenantContext();
  const opts = { hospitalId: tenant.hospitalId };

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") || "orders";
  if (kind === "tests") {
    const tests = await listLabTests(opts);
    return NextResponse.json({ data: tests });
  }
  const orders = await listLabOrders(opts);
  return NextResponse.json({ data: orders });
}

export async function POST(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("laboratory");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(rolesForPhase2Module("lab"));
  if (gate.error) return gate.error;

  const tenant = await getTenantContext();
  const opts = { hospitalId: tenant.hospitalId };

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "create");

  if (action === "status") {
    const id = String(body.id || "");
    const parsed = labStatusSchema.safeParse(body);
    if (!id || !parsed.success) {
      return NextResponse.json(
        { error: "Invalid status payload" },
        { status: 400 }
      );
    }
    const updated = await updateLabOrderStatus(
      id,
      parsed.data.status,
      {
        report_url: parsed.data.report_url,
        findings: parsed.data.findings,
      },
      opts
    );
    if (!updated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ data: updated });
  }

  const parsed = labOrderCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const catalog = await listLabTests(opts);
  const tests = parsed.data.test_ids.map((tid, i) => {
    const found = catalog.find((t) => t.id === tid || t.slug === tid);
    return {
      id: found?.id,
      name: found?.name || parsed.data.test_names?.[i] || tid,
      price: found?.price ?? parsed.data.prices?.[i] ?? 0,
    };
  });

  const order = await createLabOrder(
    {
      patient_name: parsed.data.patient_name,
      patient_phone: parsed.data.patient_phone,
      patient_email: parsed.data.patient_email,
      doctor_name: parsed.data.doctor_name,
      notes: parsed.data.notes,
      priority: parsed.data.priority,
      tests,
    },
    opts
  );

  return NextResponse.json({ data: order }, { status: 201 });
}
