import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin, slugify } from "@/lib/hms/server";
import { getTenantContext, withHospitalId } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  slug: z.string().optional(),
});

export async function GET() {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const tenant = await getTenantContext();
  let query = gate.supabase.from("departments").select("*").order("name");
  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }

  let { data, error } = await query;
  if (error && /hospital_id|column/i.test(error.message)) {
    const retry = await gate.supabase
      .from("departments")
      .select("*")
      .order("name");
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const tenant = await getTenantContext();
  const slug = parsed.data.slug || slugify(parsed.data.name);
  const payload = withHospitalId(
    {
      name: parsed.data.name.trim(),
      slug,
      description: parsed.data.description || "",
      status: parsed.data.status || "active",
    },
    tenant.hospitalId
  );

  let { data, error } = await gate.supabase
    .from("departments")
    .insert(payload)
    .select()
    .single();

  if (error && /hospital_id|column/i.test(error.message)) {
    const { hospital_id: _h, ...legacy } = payload as Record<string, unknown>;
    void _h;
    const retry = await gate.supabase
      .from("departments")
      .insert(legacy)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
