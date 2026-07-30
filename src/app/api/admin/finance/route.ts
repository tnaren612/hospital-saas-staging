import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  createExpense,
  deleteExpense,
  getFinanceSummary,
  listExpenses,
} from "@/lib/finance/service";
import { expenseCreateSchema } from "@/lib/finance/validation";
import { canAccessFinance, isAdmin } from "@/lib/auth/roles";
import { format, startOfMonth, endOfMonth } from "date-fns";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("finance");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(["finance", "manager", "admin", "super_admin"]);
  if (gate.error) return gate.error;

  const role = gate.session?.profile.role;
  if (gate.session && !canAccessFinance(role) && !isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") || "summary";
  const from =
    searchParams.get("from") ||
    format(startOfMonth(new Date()), "yyyy-MM-dd");
  const to =
    searchParams.get("to") || format(endOfMonth(new Date()), "yyyy-MM-dd");

  const { getTenantContext } = await import("@/lib/hospital/tenant");
  const tenant = await getTenantContext();

  if (kind === "expenses") {
    const data = await listExpenses({
      from,
      to,
      hospitalId: tenant.hospitalId,
    });
    return NextResponse.json({ data, from, to, hospital_id: tenant.hospitalId });
  }

  const summary = await getFinanceSummary(from, to);
  const expenses = await listExpenses({
    from,
    to,
    hospitalId: tenant.hospitalId,
  });
  return NextResponse.json({
    summary,
    expenses,
    hospital_id: tenant.hospitalId,
  });
}

export async function POST(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("finance");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(["finance", "manager", "admin", "super_admin"]);
  if (gate.error) return gate.error;

  const role = gate.session?.profile.role;
  if (gate.session && !canAccessFinance(role) && !isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "create");

  if (action === "delete") {
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await deleteExpense(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const parsed = expenseCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { getTenantContext } = await import("@/lib/hospital/tenant");
  const tenant = await getTenantContext();
  const data = await createExpense(
    parsed.data,
    gate.session?.user.id || null,
    tenant.hospitalId
  );
  return NextResponse.json({ data }, { status: 201 });
}
