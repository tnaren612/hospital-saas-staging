import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin, slugify } from "@/lib/hms/server";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  slug: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.name && !parsed.data.slug) {
    patch.slug = slugify(parsed.data.name);
  }

  const { data, error } = await gate.supabase
    .from("departments")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { error } = await gate.supabase
    .from("departments")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
