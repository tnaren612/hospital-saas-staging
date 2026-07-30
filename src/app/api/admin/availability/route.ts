import { NextResponse } from "next/server";
import { addDays, format, parseISO } from "date-fns";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  availabilityBulkSchema,
  availabilitySchema,
} from "@/lib/doctors/validation";
import { AVAILABILITY_WRITE_ROLES } from "@/lib/doctors/constants";
import { isAdmin } from "@/lib/auth/roles";
import { getTenantContext, withHospitalId } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

function canWriteAvailability(role: string | null | undefined): boolean {
  if (isAdmin(role)) return true;
  const r = String(role || "").toLowerCase();
  return (AVAILABILITY_WRITE_ROLES as readonly string[]).includes(r);
}

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const doctorId = searchParams.get("doctor_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const tenant = await getTenantContext();

  let query = gate.supabase
    .from("doctor_availability")
    .select("*, doctor:hospital_doctors(id, name)")
    .order("date");

  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }
  if (doctorId) query = query.eq("doctor_id", doctorId);
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin(
    AVAILABILITY_WRITE_ROLES as unknown as string[]
  );
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role;
  if (gate.session && !canWriteAvailability(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  // Bulk range mode
  if (body && typeof body === "object" && "from" in body && "to" in body) {
    const parsed = availabilityBulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { doctor_id, from, to, status, note } = parsed.data;
    const start = parseISO(from);
    const end = parseISO(to);
    const days =
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (days > 90) {
      return NextResponse.json(
        { error: "Bulk range cannot exceed 90 days" },
        { status: 400 }
      );
    }

    const rows: {
      doctor_id: string;
      date: string;
      status: string;
      note: string;
    }[] = [];
    for (let i = 0; i < days; i++) {
      rows.push({
        doctor_id,
        date: format(addDays(start, i), "yyyy-MM-dd"),
        status,
        note: note || "",
      });
    }

    const { data, error } = await gate.supabase
      .from("doctor_availability")
      .upsert(rows, { onConflict: "doctor_id,date" })
      .select("*, doctor:hospital_doctors(id, name)");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { data: data || [], count: rows.length },
      { status: 201 }
    );
  }

  const parsed = availabilitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tenant = await getTenantContext();
  const payload = withHospitalId(
    {
      doctor_id: parsed.data.doctor_id,
      date: parsed.data.date,
      status: parsed.data.status,
      note: parsed.data.note || "",
    },
    tenant.hospitalId
  );

  const { data, error } = await gate.supabase
    .from("doctor_availability")
    .upsert(payload, { onConflict: "doctor_id,date" })
    .select("*, doctor:hospital_doctors(id, name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
