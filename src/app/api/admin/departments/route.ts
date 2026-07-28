import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin, slugify } from "@/lib/hms/server";

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

  const { data, error } = await gate.supabase
    .from("departments")
    .select("*")
    .order("name");

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

  const slug = parsed.data.slug || slugify(parsed.data.name);
  const { data, error } = await gate.supabase
    .from("departments")
    .insert({
      name: parsed.data.name.trim(),
      slug,
      description: parsed.data.description || "",
      status: parsed.data.status || "active",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
