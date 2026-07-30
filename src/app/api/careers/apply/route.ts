import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  getServiceRoleKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";
import { sanitizePlainText } from "@/lib/validation";
import { isEmailConfigured } from "@/lib/notifications/email";
import { getHospitalConfig } from "@/lib/hospital/service";

export const dynamic = "force-dynamic";

const applySchema = z.object({
  jobId: z.string().min(1).max(80),
  jobTitle: z.string().min(2).max(160),
  fullName: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-zA-Z\s.]+$/),
  email: z.string().email(),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  experienceYears: z.coerce.number().min(0).max(50).optional(),
  coverNote: z.string().min(20).max(2000),
  resumeUrl: z.string().url().optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`careers:${ip}`, 6, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many applications" }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = applySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid application", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = {
    job_id: parsed.data.jobId,
    job_title: sanitizePlainText(parsed.data.jobTitle, 160),
    full_name: sanitizePlainText(parsed.data.fullName, 80),
    email: parsed.data.email.trim().toLowerCase(),
    phone: parsed.data.phone,
    experience_years: parsed.data.experienceYears ?? null,
    cover_note: sanitizePlainText(parsed.data.coverNote, 2000),
    resume_url: parsed.data.resumeUrl || "",
    status: "new",
  };

  let stored = false;
  if (hasSupabaseConfig()) {
    try {
      const key = getServiceRoleKey() || getSupabaseAnonKey()!;
      const sb = createClient(getSupabaseUrl()!, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await sb.from("career_applications").insert(data);
      if (!error) stored = true;
    } catch {
      // fall through
    }
  }

  // Optional notify HR inbox
  if (isEmailConfigured()) {
    const config = await getHospitalConfig();
    const from =
      process.env.EMAIL_FROM ||
      process.env.RESEND_FROM ||
      `${config.email.from_name || config.branding.name} <onboarding@resend.dev>`;
    const inbox =
      process.env.CAREERS_INBOX ||
      process.env.HOSPITAL_INBOX ||
      config.contact.email;
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [inbox],
          subject: `Career application: ${data.job_title}`,
          html: `<p><strong>${data.full_name}</strong> applied for <strong>${data.job_title}</strong></p>
            <p>Phone: ${data.phone}<br/>Email: ${data.email}</p>
            <p>${data.cover_note}</p>`,
        }),
      });
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({
    ok: true,
    stored,
    demo: !stored,
    message: stored
      ? "Application submitted successfully."
      : "Application received (demo). Configure Supabase for production storage.",
  });
}
