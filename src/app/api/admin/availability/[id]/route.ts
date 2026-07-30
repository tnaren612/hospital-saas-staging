import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { error } = await gate.supabase
    .from("doctor_availability")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
