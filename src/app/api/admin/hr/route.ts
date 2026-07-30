import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  createEmployee,
  createLeave,
  listAttendance,
  listEmployees,
  listLeaves,
  payrollSummary,
  updateLeaveStatus,
  upsertAttendance,
} from "@/lib/hr/service";
import {
  attendanceSchema,
  employeeCreateSchema,
  leaveCreateSchema,
  leaveStatusSchema,
} from "@/lib/hr/validation";
import { canAccessHR, isAdmin } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("hr");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(["hr", "manager", "admin", "super_admin"]);
  if (gate.error) return gate.error;

  const role = gate.session?.profile.role;
  if (gate.session && !canAccessHR(role) && !isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") || "employees";

  const { getTenantContext } = await import("@/lib/hospital/tenant");
  const tenant = await getTenantContext();

  if (kind === "leaves") {
    return NextResponse.json({
      data: await listLeaves(tenant.hospitalId),
      hospital_id: tenant.hospitalId,
    });
  }
  if (kind === "attendance") {
    return NextResponse.json({
      data: await listAttendance(
        searchParams.get("from") || undefined,
        searchParams.get("to") || undefined
      ),
      hospital_id: tenant.hospitalId,
    });
  }
  if (kind === "payroll") {
    return NextResponse.json({
      data: await payrollSummary(),
      hospital_id: tenant.hospitalId,
    });
  }
  return NextResponse.json({
    data: await listEmployees(tenant.hospitalId),
    hospital_id: tenant.hospitalId,
  });
}

export async function POST(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("hr");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(["hr", "manager", "admin", "super_admin"]);
  if (gate.error) return gate.error;

  const role = gate.session?.profile.role;
  if (gate.session && !canAccessHR(role) && !isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "employee");

  const { getTenantContext } = await import("@/lib/hospital/tenant");
  const tenant = await getTenantContext();

  if (action === "employee") {
    const parsed = employeeCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = await createEmployee(parsed.data, tenant.hospitalId);
    return NextResponse.json({ data }, { status: 201 });
  }

  if (action === "leave") {
    const parsed = leaveCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = await createLeave(parsed.data);
    return NextResponse.json({ data }, { status: 201 });
  }

  if (action === "leave_status") {
    const id = String(body.id || "");
    const parsed = leaveStatusSchema.safeParse(body);
    if (!id || !parsed.success) {
      return NextResponse.json({ error: "Invalid leave status" }, { status: 400 });
    }
    const data = await updateLeaveStatus(
      id,
      parsed.data.status,
      gate.session?.user.id || null
    );
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data });
  }

  if (action === "attendance") {
    const parsed = attendanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = await upsertAttendance(parsed.data);
    return NextResponse.json({ data }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
