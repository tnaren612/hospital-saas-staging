import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { data, error } = await gate.supabase
    .from("claim_status_history")
    .select("*")
    .eq("claim_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ data: data || [] });
}
