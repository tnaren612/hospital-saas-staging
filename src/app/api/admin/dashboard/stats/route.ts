/**
 * Enterprise admin dashboard stats — aggregates existing tables only.
 * Graceful when optional tables (health_packages, blog_articles) are missing.
 */

import { NextResponse } from "next/server";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { requireHmsAdmin } from "@/lib/hms/server";
import { mapDbAppointment } from "@/lib/admin/appointments";
import {
  countBy,
  emptyAppointmentMetrics,
  type DashboardSummary,
} from "@/lib/dashboard/service";

export const dynamic = "force-dynamic";

async function safeSelect(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: PromiseLike<{ data: any; error: { message: string } | null }>
) {
  try {
    const res = await query;
    if (res.error) {
      if (
        /schema cache|does not exist|could not find the table|column/i.test(
          res.error.message
        )
      ) {
        return { data: null as null, missing: true as const };
      }
      return { data: null as null, missing: false as const, error: res.error };
    }
    return { data: res.data, missing: false as const };
  } catch {
    return { data: null as null, missing: true as const };
  }
}

export async function GET() {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const sb = gate.supabase;
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const last30Start = format(subDays(new Date(), 29), "yyyy-MM-dd");
  const sixMonthsAgo = format(startOfMonth(subMonths(new Date(), 5)), "yyyy-MM-dd");

  const [
    aptsRes,
    doctorsRes,
    deptsRes,
    packagesRes,
    blogRes,
    blogLegacyRes,
    galleryRes,
    availRes,
    notifRes,
  ] = await Promise.all([
    safeSelect(
      sb
        .from("appointments")
        .select(
          "id, patient_name, phone, email, doctor_id, doctor_name, department_id, department_name, date, time_slot, period, type, status, consultation_fee, created_at, problem"
        )
        .gte("date", sixMonthsAgo)
        .order("date", { ascending: false })
        .limit(5000)
    ),
    safeSelect(
      sb
        .from("hospital_doctors")
        .select("id, name, status, department_id, is_featured")
    ),
    safeSelect(
      sb.from("departments").select("id, name, slug, status")
    ),
    safeSelect(
      sb
        .from("health_packages")
        .select(
          "id, name, slug, featured, popular, is_active, booking_enabled, price, offer_price, department_id"
        )
    ),
    safeSelect(
      sb
        .from("blog_articles")
        .select("id, title, slug, is_published, published_at, created_at")
        .order("published_at", { ascending: false })
        .limit(50)
    ),
    safeSelect(
      sb
        .from("articles")
        .select("id, title, slug, is_published, published_at, created_at")
        .order("published_at", { ascending: false })
        .limit(50)
    ),
    safeSelect(
      sb
        .from("gallery_images")
        .select(
          "id, title, section, key, image_url, public_url, storage_path, created_at, is_active"
        )
        .order("created_at", { ascending: false })
        .limit(500)
    ),
    safeSelect(
      sb
        .from("doctor_availability")
        .select("doctor_id, status, note, date")
        .eq("date", today)
    ),
    safeSelect(
      sb
        .from("admin_notifications")
        .select("id, type, title, message, meta, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(30)
    ),
  ]);

  if (aptsRes.error) {
    return NextResponse.json({ error: aptsRes.error.message }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appointments: any[] = aptsRes.data || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doctors: any[] = doctorsRes.data || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const departments: any[] = deptsRes.data || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const packages: any[] = packagesRes.data || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blogRows: any[] =
    blogRes.data || blogLegacyRes.data || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gallery: any[] = galleryRes.data || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const availToday: any[] = availRes.data || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifications: any[] = notifRes.data || [];

  const fee = (r: { consultation_fee?: number | null; status?: string }) => {
    if (r.status === "cancelled") return 0;
    const n = Number(r.consultation_fee);
    return Number.isFinite(n) && n > 0 ? n : 500;
  };

  const todayRows = appointments.filter((r) => r.date === today);
  const monthRows = appointments.filter(
    (r) => r.date >= monthStart && r.date <= monthEnd
  );
  const last30 = appointments.filter((r) => r.date >= last30Start);

  const upcomingRows = appointments
    .filter(
      (r) =>
        r.date >= today &&
        (r.status === "confirmed" ||
          r.status === "pending" ||
          r.status === "upcoming")
    )
    .sort((a, b) =>
      a.date === b.date
        ? String(a.time_slot).localeCompare(String(b.time_slot))
        : String(a.date).localeCompare(String(b.date))
    );

  const appointmentMetrics = emptyAppointmentMetrics();
  appointmentMetrics.total = appointments.length;
  appointmentMetrics.today = todayRows.length;
  appointmentMetrics.upcoming = upcomingRows.length;
  appointmentMetrics.cancelled = appointments.filter(
    (r) => r.status === "cancelled"
  ).length;
  appointmentMetrics.completed = appointments.filter(
    (r) => r.status === "completed"
  ).length;
  appointmentMetrics.pending = appointments.filter(
    (r) => r.status === "pending"
  ).length;
  appointmentMetrics.confirmed = appointments.filter(
    (r) => r.status === "confirmed"
  ).length;
  appointmentMetrics.byStatus = countBy(
    appointments.map((r) => ({ key: String(r.status || "unknown") }))
  );
  appointmentMetrics.byDoctor = countBy(
    appointments
      .filter((r) => r.status !== "cancelled")
      .map((r) => ({ key: String(r.doctor_name || "Unknown") }))
  ).slice(0, 8);
  appointmentMetrics.byDepartment = countBy(
    appointments
      .filter((r) => r.status !== "cancelled")
      .map((r) => ({
        key: String(r.department_name || "Unassigned"),
      }))
  ).slice(0, 8);

  // Daily last 14 days
  const dailyDays = eachDayOfInterval({
    start: subDays(new Date(), 13),
    end: new Date(),
  });
  appointmentMetrics.daily = dailyDays.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    const dayRows = appointments.filter((r) => r.date === key);
    return {
      date: format(d, "dd MMM"),
      appointments: dayRows.length,
      completed: dayRows.filter((r) => r.status === "completed").length,
    };
  });

  // Weekly last 8 weeks
  const weeks: { week: string; appointments: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const start = startOfWeek(subDays(new Date(), i * 7), { weekStartsOn: 1 });
    const end = addDays(start, 6);
    const s = format(start, "yyyy-MM-dd");
    const e = format(end, "yyyy-MM-dd");
    const count = appointments.filter(
      (r) => r.date >= s && r.date <= e
    ).length;
    weeks.push({
      week: format(start, "dd MMM"),
      appointments: count,
    });
  }
  appointmentMetrics.weekly = weeks;

  // Monthly last 6 months
  const monthly: { month: string; appointments: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = subMonths(new Date(), i);
    const s = format(startOfMonth(m), "yyyy-MM-dd");
    const e = format(endOfMonth(m), "yyyy-MM-dd");
    monthly.push({
      month: format(m, "MMM yy"),
      appointments: appointments.filter((r) => r.date >= s && r.date <= e)
        .length,
    });
  }
  appointmentMetrics.monthly = monthly;

  // Doctors
  const activeDoctors = doctors.filter((d) => d.status === "active");
  const availMap = new Map(
    availToday.map((a) => [String(a.doctor_id), String(a.status)])
  );
  const availabilityToday = activeDoctors.map((d) => ({
    id: String(d.id),
    name: String(d.name),
    status: (availMap.get(String(d.id)) as string) || "available",
  }));
  const onLeaveToday = availabilityToday.filter((d) =>
    ["on_leave", "holiday", "emergency"].includes(d.status)
  ).length;
  const availableToday = availabilityToday.filter(
    (d) => d.status === "available"
  ).length;

  const bookCounts = countBy(
    appointments
      .filter((r) => r.status !== "cancelled")
      .map((r) => ({ key: String(r.doctor_name || "Unknown") }))
  );
  const doctorNames = new Set(activeDoctors.map((d) => String(d.name)));
  for (const d of activeDoctors) {
    if (!bookCounts.find((b) => b.name === d.name)) {
      bookCounts.push({ name: String(d.name), value: 0 });
    }
  }
  const mostBooked = [...bookCounts]
    .filter((b) => doctorNames.has(b.name) || b.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const leastBooked = [...bookCounts]
    .filter((b) => doctorNames.has(b.name))
    .sort((a, b) => a.value - b.value)
    .slice(0, 5);

  // Departments
  const deptRows = departments.map((dep) => {
    const id = String(dep.id);
    return {
      id,
      name: String(dep.name),
      doctors: doctors.filter((d) => String(d.department_id) === id).length,
      packages: packages.filter((p) => String(p.department_id) === id).length,
      appointments: appointments.filter(
        (a) =>
          String(a.department_id) === id ||
          String(a.department_name || "") === String(dep.name)
      ).length,
    };
  });

  // Packages — bookings inferred from problem text / future payment table
  const packageBookHints = packages.map((p) => {
    const name = String(p.name);
    const slug = String(p.slug || "");
    const value = appointments.filter((a) => {
      const problem = String(a.problem || "").toLowerCase();
      return (
        problem.includes(name.toLowerCase()) ||
        (slug && problem.includes(slug.toLowerCase())) ||
        problem.includes("health package")
      );
    }).length;
    return { name, value };
  });

  // Blog
  const publishedBlog = blogRows.filter(
    (b) => b.is_published !== false
  );

  // Gallery
  const bySection = countBy(
    gallery.map((g) => ({ key: String(g.section || "gallery") }))
  );
  const storageEstimateMb =
    gallery.length > 0 ? Math.round((gallery.length * 0.35) * 10) / 10 : 0;

  // Activity = notifications + synthetic recent from data
  const activity = [
    ...notifications.map((n) => ({
      id: String(n.id),
      type: String(n.type || "info"),
      title: String(n.title || "Activity"),
      message: String(n.message || ""),
      created_at: String(n.created_at),
      meta: (n.meta || {}) as Record<string, unknown>,
    })),
    ...gallery.slice(0, 5).map((g) => ({
      id: `gal-${g.id}`,
      type: "gallery_upload",
      title: "Gallery image uploaded",
      message: `${g.section || "gallery"} / ${g.key || "image"} · ${g.title || ""}`,
      created_at: String(g.created_at || new Date().toISOString()),
      meta: { gallery_id: g.id },
    })),
    ...publishedBlog.slice(0, 3).map((b) => ({
      id: `blog-${b.id}`,
      type: "blog_published",
      title: "Blog article",
      message: String(b.title),
      created_at: String(
        b.published_at || b.created_at || new Date().toISOString()
      ),
      meta: { slug: b.slug },
    })),
  ]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20);

  const unreadNotifs = notifications
    .filter((n) => !n.is_read)
    .map((n) => ({
      id: String(n.id),
      type: String(n.type || "info"),
      title: String(n.title || "Alert"),
      message: String(n.message || ""),
      created_at: String(n.created_at),
      meta: (n.meta || {}) as Record<string, unknown>,
    }));

  const todayCompleted = todayRows.filter((r) => r.status === "completed");
  const todayRevenue = todayCompleted.reduce((s, r) => s + fee(r), 0);
  const todayPatients = new Set(todayRows.map((r) => r.phone)).size;
  const monthCompleted = monthRows.filter((r) => r.status === "completed");

  const days = eachDayOfInterval({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date()),
  });
  const monthly_series = days.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    const dayRows = monthRows.filter((r) => r.date === key);
    return {
      date: format(d, "dd MMM"),
      appointments: dayRows.length,
      revenue: dayRows
        .filter((r) => r.status === "completed")
        .reduce((s, r) => s + fee(r), 0),
    };
  });

  const cards = [
    {
      key: "apts_total",
      label: "Total Appointments",
      value: appointmentMetrics.total,
      href: "/admin/appointments",
    },
    {
      key: "apts_today",
      label: "Today's Appointments",
      value: appointmentMetrics.today,
      href: "/admin/appointments",
    },
    {
      key: "apts_upcoming",
      label: "Upcoming Appointments",
      value: appointmentMetrics.upcoming,
      href: "/admin/calendar",
    },
    {
      key: "apts_cancelled",
      label: "Cancelled Appointments",
      value: appointmentMetrics.cancelled,
      href: "/admin/appointments",
    },
    {
      key: "apts_completed",
      label: "Completed Appointments",
      value: appointmentMetrics.completed,
      href: "/admin/appointments",
    },
    {
      key: "doctors_total",
      label: "Total Doctors",
      value: doctors.length,
      href: "/admin/doctors",
    },
    {
      key: "doctors_active",
      label: "Active Doctors",
      value: activeDoctors.length,
      href: "/admin/doctors",
    },
    {
      key: "departments",
      label: "Total Departments",
      value: departments.length,
      href: "/admin/departments",
    },
    {
      key: "packages",
      label: "Total Health Packages",
      value: packages.length,
      href: "/admin/packages",
      hint: packagesRes.missing ? "Run migration 010" : undefined,
    },
    {
      key: "blog",
      label: "Total Blog Articles",
      value: blogRows.length,
      href: "/admin/blog",
    },
    {
      key: "gallery",
      label: "Gallery Images",
      value: gallery.length,
      href: "/admin/gallery",
    },
    {
      key: "visitors",
      label: "Monthly Visitors",
      value: "—",
      href: "/admin/analytics",
      hint: "Connect GA4 (Phase 9)",
    },
  ];

  // Optional billing revenue (Phase 7) — non-fatal if migration missing
  let billingToday = 0;
  let billingMonth = 0;
  try {
    const { getRevenue } = await import("@/lib/payments/payment-service");
    const rev = await getRevenue();
    billingToday = rev.today;
    billingMonth = rev.month;
  } catch {
    /* ignore */
  }

  const payload: DashboardSummary = {
    generatedAt: new Date().toISOString(),
    cards: [
      ...cards,
      {
        key: "rev_today",
        label: "Today's Revenue (Billing)",
        value: billingToday,
        href: "/admin/billing",
        hint: billingToday === 0 ? "Enable billing / migration 012" : undefined,
      },
      {
        key: "rev_month",
        label: "Monthly Revenue (Billing)",
        value: billingMonth,
        href: "/admin/billing",
      },
    ],
    appointments: appointmentMetrics,
    doctors: {
      total: doctors.length,
      active: activeDoctors.length,
      inactive: doctors.filter((d) => d.status !== "active").length,
      availableToday,
      onLeaveToday,
      mostBooked,
      leastBooked,
      availabilityToday,
    },
    departments: {
      total: departments.length,
      active: departments.filter((d) => d.status === "active").length,
      rows: deptRows,
    },
    packages: {
      total: packages.length,
      active: packages.filter((p) => p.is_active !== false).length,
      featured: packages.filter((p) => p.featured).length,
      popular: packages.filter((p) => p.popular).length,
      bookingEnabled: packages.filter((p) => p.booking_enabled !== false)
        .length,
      mostViewed: packages.slice(0, 5).map((p) => ({
        name: String(p.name),
        value: 0,
        note: "Views via GA4 (Phase 9)",
      })),
      mostBooked: packageBookHints
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
      featuredPerformance: packages
        .filter((p) => p.featured)
        .map((p) => ({
          name: String(p.name),
          popular: Boolean(p.popular),
          price: Number(p.offer_price ?? p.price) || 0,
        })),
    },
    blog: {
      total: blogRows.length,
      published: publishedBlog.length,
      featured: 0,
      recent: publishedBlog.slice(0, 6).map((b) => ({
        id: String(b.id),
        title: String(b.title),
        slug: String(b.slug),
        published_at: b.published_at
          ? String(b.published_at)
          : undefined,
      })),
      mostViewed: publishedBlog.slice(0, 5).map((b) => ({
        title: String(b.title),
        value: 0,
        note: "Views via GA4 (Phase 9)",
      })),
    },
    gallery: {
      total: gallery.length,
      bySection,
      recent: gallery.slice(0, 8).map((g) => ({
        id: String(g.id),
        title: String(g.title || g.alt_text || "Image"),
        section: String(g.section || "gallery"),
        key: String(g.key || "image"),
        image_url: String(g.image_url || g.public_url || ""),
        created_at: g.created_at ? String(g.created_at) : undefined,
      })),
      storageEstimateMb: storageEstimateMb || null,
    },
    activity,
    notifications: unreadNotifs,
    visitorsPlaceholder: {
      monthly: null,
      note: "Placeholder until Google Analytics 4 (Phase 9)",
    },
    // Legacy fields
    today: {
      revenue: todayRevenue,
      patients: todayPatients,
      appointments: todayRows.length,
      completed: todayCompleted.length,
    },
    month: {
      appointments: monthRows.length,
      completed: monthCompleted.length,
      revenue: monthCompleted.reduce((s, r) => s + fee(r), 0),
      cancelled: monthRows.filter((r) => r.status === "cancelled").length,
    },
    upcoming: upcomingRows
      .slice(0, 8)
      .map((r) => mapDbAppointment(r as Record<string, unknown>)),
    doctor_availability: availabilityToday,
    monthly_series,
  };

  // silence unused
  void last30;

  return NextResponse.json(payload);
}
