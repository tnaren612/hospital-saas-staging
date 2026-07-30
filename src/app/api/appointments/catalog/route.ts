/**
 * GET /api/appointments/catalog
 * Single public endpoint: departments + doctors (optional department filter).
 * Server-side Supabase with short CDN cache — avoids browser waterfall.
 */

import { NextResponse } from "next/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";
import { createClient } from "@supabase/supabase-js";
import { getDoctor, getSlots } from "@/lib/data";

export const revalidate = 60;

const FALLBACK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat"];

function fallbackDepartments() {
  return [
    {
      id: "dept-pulmonology",
      name: "Pulmonology",
      slug: "pulmonology",
      description: "Lung and respiratory care",
    },
    {
      id: "dept-critical-care",
      name: "Critical Care",
      slug: "critical-care",
      description: "ICU and critical care",
    },
    {
      id: "dept-general",
      name: "General Medicine",
      slug: "general-medicine",
      description: "General medical consultation",
    },
    {
      id: "dept-emergency",
      name: "Emergency",
      slug: "emergency",
      description: "24×7 emergency care",
    },
  ];
}

function fallbackDoctors() {
  const d = getDoctor();
  const slots = getSlots();
  const time_slots = [
    ...slots.morning,
    ...slots.afternoon,
    ...slots.evening,
  ];
  return [
    {
      id: d.id,
      name: d.name,
      title: d.title,
      department_id: "dept-pulmonology",
      department_name: "Pulmonology",
      photo_url: d.image || null,
      specializations: d.specializations || [],
      available_days: FALLBACK_DAYS,
      time_slots,
      consultation_fee: d.consultationFee || 500,
      status: "active",
    },
  ];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("departmentId") || "";

  const cacheHeaders = {
    "Cache-Control":
      "public, s-maxage=60, stale-while-revalidate=300, max-age=30",
  };

  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    const departments = fallbackDepartments();
    let doctors = fallbackDoctors();
    if (departmentId) {
      doctors = doctors.filter((d) => d.department_id === departmentId);
    }
    return NextResponse.json(
      { departments, doctors, mode: "local" },
      { headers: cacheHeaders }
    );
  }

  try {
    const supabase = createClient(getSupabaseUrl()!, getSupabaseAnonKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Parallel fetch — one round-trip pair instead of browser waterfall
    let doctorQuery = supabase
      .from("hospital_doctors")
      .select(
        "id, name, title, department_id, photo_url, specializations, available_days, time_slots, consultation_fee, status, departments(name)"
      )
      .eq("status", "active")
      .order("sort_order")
      .order("name");

    if (departmentId && departmentId.length > 10) {
      doctorQuery = doctorQuery.eq("department_id", departmentId);
    }

    const [deptRes, docRes] = await Promise.all([
      supabase
        .from("departments")
        .select("id, name, slug, description")
        .eq("status", "active")
        .order("name"),
      doctorQuery,
    ]);

    const departments =
      !deptRes.error && deptRes.data?.length
        ? deptRes.data.map((r) => ({
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: String(r.description || ""),
          }))
        : fallbackDepartments();

    const doctors =
      !docRes.error && docRes.data?.length
        ? docRes.data.map((r) => {
            const dept = r.departments as { name?: string } | null;
            return {
              id: String(r.id),
              name: String(r.name),
              title: String(r.title || "Consultant"),
              department_id: r.department_id
                ? String(r.department_id)
                : null,
              department_name: dept?.name || null,
              photo_url: r.photo_url ? String(r.photo_url) : null,
              specializations: Array.isArray(r.specializations)
                ? (r.specializations as string[])
                : [],
              available_days: Array.isArray(r.available_days)
                ? (r.available_days as string[])
                : FALLBACK_DAYS,
              time_slots: Array.isArray(r.time_slots)
                ? (r.time_slots as string[])
                : fallbackDoctors()[0].time_slots,
              consultation_fee: Number(r.consultation_fee) || 0,
              status: String(r.status || "active"),
            };
          })
        : fallbackDoctors().filter(
            (d) => !departmentId || d.department_id === departmentId
          );

    return NextResponse.json(
      { departments, doctors, mode: "supabase" },
      { headers: cacheHeaders }
    );
  } catch {
    const departments = fallbackDepartments();
    let doctors = fallbackDoctors();
    if (departmentId) {
      doctors = doctors.filter((d) => d.department_id === departmentId);
    }
    return NextResponse.json(
      { departments, doctors, mode: "fallback" },
      { headers: cacheHeaders }
    );
  }
}
