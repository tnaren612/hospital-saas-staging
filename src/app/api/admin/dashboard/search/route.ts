/**
 * Global admin search across doctors, departments, packages, articles, appointments.
 */

import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import type { SearchResultGroup } from "@/lib/dashboard/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 2) {
    return NextResponse.json({ data: [] as SearchResultGroup[] });
  }

  const sb = gate.supabase;
  const lower = q.toLowerCase();
  const results: SearchResultGroup[] = [];

  const safe = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: () => PromiseLike<{ data: any; error: { message: string } | null }>
  ) => {
    try {
      const res = await fn();
      if (res.error) return [];
      return res.data || [];
    } catch {
      return [];
    }
  };

  const [doctors, departments, packages, blogA, blogB, appointments] =
    await Promise.all([
      safe(() =>
        sb
          .from("hospital_doctors")
          .select("id, name, title, slug, status")
          .limit(80)
      ),
      safe(() =>
        sb.from("departments").select("id, name, slug, status").limit(50)
      ),
      safe(() =>
        sb
          .from("health_packages")
          .select("id, name, slug, package_type")
          .limit(80)
      ),
      safe(() =>
        sb
          .from("blog_articles")
          .select("id, title, slug")
          .limit(80)
      ),
      safe(() =>
        sb.from("articles").select("id, title, slug").limit(80)
      ),
      safe(() =>
        sb
          .from("appointments")
          .select(
            "id, patient_name, phone, doctor_name, date, time_slot, status"
          )
          .order("created_at", { ascending: false })
          .limit(120)
      ),
    ]);

  for (const d of doctors) {
    const hay = `${d.name} ${d.title || ""} ${d.slug || ""}`.toLowerCase();
    if (hay.includes(lower)) {
      results.push({
        type: "doctor",
        label: String(d.name),
        subtitle: String(d.title || d.status || ""),
        href: "/admin/doctors",
      });
    }
  }

  for (const d of departments) {
    if (String(d.name).toLowerCase().includes(lower)) {
      results.push({
        type: "department",
        label: String(d.name),
        subtitle: String(d.slug || ""),
        href: "/admin/departments",
      });
    }
  }

  for (const p of packages) {
    const hay = `${p.name} ${p.slug || ""} ${p.package_type || ""}`.toLowerCase();
    if (hay.includes(lower)) {
      results.push({
        type: "package",
        label: String(p.name),
        subtitle: String(p.package_type || p.slug || ""),
        href: "/admin/packages",
      });
    }
  }

  const articles = [...(blogA || []), ...(blogB || [])];
  const seen = new Set<string>();
  for (const a of articles) {
    const id = String(a.id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (String(a.title).toLowerCase().includes(lower)) {
      results.push({
        type: "article",
        label: String(a.title),
        subtitle: a.slug ? `/blog/${a.slug}` : "",
        href: "/admin/blog",
      });
    }
  }

  for (const a of appointments) {
    const hay =
      `${a.patient_name} ${a.phone} ${a.doctor_name} ${a.date}`.toLowerCase();
    if (hay.includes(lower)) {
      results.push({
        type: "appointment",
        label: String(a.patient_name),
        subtitle: `${a.date} ${a.time_slot} · ${a.status}`,
        href: "/admin/appointments",
      });
    }
  }

  return NextResponse.json({
    data: results.slice(0, 25),
    q,
  });
}
