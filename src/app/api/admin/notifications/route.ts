import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "1";

  let query = gate.supabase
    .from("admin_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (unreadOnly) query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: data || [] });
}

export async function PATCH(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => ({}));
  if (body.mark_all_read) {
    const { error } = await gate.supabase
      .from("admin_notifications")
      .update({ is_read: true })
      .eq("is_read", false);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.id) {
    const { data, error } = await gate.supabase
      .from("admin_notifications")
      .update({ is_read: Boolean(body.is_read ?? true) })
      .eq("id", body.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: "Invalid body" }, { status: 400 });
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  if (!body?.title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const { data, error } = await gate.supabase
    .from("admin_notifications")
    .insert({
      type: body.type || "admin",
      title: body.title,
      message: body.message || "",
      meta: body.meta || {},
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
