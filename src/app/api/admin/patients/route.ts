import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin } from "@/lib/hms/server";

export const dynamic = "force-dynamic";

const schema = z.object({
  full_name: z.string().min(2).max(120),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  email: z.string().email().optional().nullable(),
  age: z.coerce.number().min(0).max(120).optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  address: z.string().max(500).optional(),
  medical_history: z.string().max(5000).optional(),
  blood_group: z.string().max(10).optional().nullable(),
  emergency_contact: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase();

  const { data, error } = await gate.supabase
    .from("hospital_patients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let rows = data || [];
  if (q) {
    rows = rows.filter(
      (p) =>
        String(p.full_name).toLowerCase().includes(q) ||
        String(p.phone).includes(q) ||
        String(p.email || "")
          .toLowerCase()
          .includes(q)
    );
  }

  // Enrich with appointment counts from appointments table (by phone)
  const phones = rows.map((r) => r.phone);
  const apptByPhone: Record<string, number> = {};
  if (phones.length) {
    const { data: apts } = await gate.supabase
      .from("appointments")
      .select("phone")
      .in("phone", phones);
    (apts || []).forEach((a) => {
      apptByPhone[a.phone] = (apptByPhone[a.phone] || 0) + 1;
    });
  }

  const enriched = rows.map((p) => ({
    ...p,
    appointment_count: apptByPhone[p.phone] || 0,
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const d = parsed.data;
  const { data, error } = await gate.supabase
    .from("hospital_patients")
    .insert({
      full_name: d.full_name.trim(),
      phone: d.phone.trim(),
      email: d.email || null,
      age: d.age ?? null,
      gender: d.gender ?? null,
      address: d.address || "",
      medical_history: d.medical_history || "",
      blood_group: d.blood_group || null,
      emergency_contact: d.emergency_contact || null,
      notes: d.notes || "",
      status: d.status || "active",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
