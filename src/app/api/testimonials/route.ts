import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getServiceRoleKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import testimonialsJson from "@/data/testimonials.json";
import { getPatientAvatar } from "@/lib/assets/production-catalog";
import type { Testimonial } from "@/types";
import { getAdminSession } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

function defaults(): Testimonial[] {
  return (testimonialsJson as Testimonial[]).map((t, i) => ({
    ...t,
    image: getPatientAvatar(i),
    treatment: t.treatment || t.role,
    published: t.published !== false,
  }));
}

function mapRow(row: Record<string, unknown>): Testimonial {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    role: String(row.role || ""),
    treatment: String(row.treatment || ""),
    content: String(row.content || ""),
    rating: Number(row.rating) || 5,
    image: String(row.image_url || ""),
    date: String(row.review_date || "").slice(0, 10),
    featured: Boolean(row.featured),
    published: row.published !== false,
  };
}

/** GET — public published testimonials (Supabase or static defaults). */
export async function GET(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`testimonials-get:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const admin = searchParams.get("all") === "1";

  if (admin) {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!hasSupabaseConfig()) {
    const data = admin
      ? defaults()
      : defaults().filter((t) => t.published !== false);
    return NextResponse.json({ data, source: "static" });
  }

  try {
    const url = getSupabaseUrl()!;
    const key = admin
      ? getServiceRoleKey() || getSupabaseAnonKey()!
      : getSupabaseAnonKey()!;
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let q = sb
      .from("testimonials")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("review_date", { ascending: false });

    if (!admin) q = q.eq("published", true);

    const { data, error } = await q;
    if (error) {
      // Table may not exist yet
      const fallback = admin
        ? defaults()
        : defaults().filter((t) => t.published !== false);
      return NextResponse.json({
        data: fallback,
        source: "static",
        warning: error.message,
      });
    }

    if (!data?.length) {
      const fallback = admin
        ? defaults()
        : defaults().filter((t) => t.published !== false);
      return NextResponse.json({ data: fallback, source: "static" });
    }

    return NextResponse.json({
      data: data.map((r) => mapRow(r as Record<string, unknown>)),
      source: "supabase",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json(
      { data: defaults().filter((t) => t.published !== false), source: "static", error: message },
      { status: 200 }
    );
  }
}

/** POST — admin create (service role / admin session). */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const name = String(body.name || "").trim();
  const content = String(body.content || "").trim();
  if (name.length < 2 || content.length < 10) {
    return NextResponse.json(
      { error: "Name and review content are required" },
      { status: 400 }
    );
  }

  if (!hasSupabaseConfig() || !getServiceRoleKey()) {
    return NextResponse.json(
      {
        error:
          "Supabase service role required for server CMS write. Use local admin CMS fallback.",
      },
      { status: 503 }
    );
  }

  const sb = createClient(getSupabaseUrl()!, getServiceRoleKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const row = {
    name,
    role: String(body.role || "").trim(),
    treatment: String(body.treatment || body.role || "").trim(),
    content,
    rating: Math.min(5, Math.max(1, Number(body.rating) || 5)),
    image_url: String(body.image || body.image_url || ""),
    review_date:
      String(body.date || "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10),
    featured: Boolean(body.featured),
    published: body.published !== false,
    sort_order: Number(body.sort_order) || 0,
  };

  const { data, error } = await sb
    .from("testimonials")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: mapRow(data as Record<string, unknown>) });
}
