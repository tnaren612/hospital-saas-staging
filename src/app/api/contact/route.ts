import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { contactSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  getServiceRoleKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
} from "@/lib/supabase/env";
import { sanitizePlainText } from "@/lib/validation";
import { isEmailConfigured } from "@/lib/notifications/email";

export const dynamic = "force-dynamic";

async function sendContactEmail(input: {
  name: string;
  phone: string;
  email: string;
  subject: string;
  message: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const from =
    process.env.EMAIL_FROM ||
    process.env.RESEND_FROM ||
    "Sri Srinivasa Hospital <onboarding@resend.dev>";
  const inbox =
    process.env.HOSPITAL_INBOX ||
    process.env.CONTACT_INBOX ||
    "info@srisrinivasahospital.com";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [inbox],
        reply_to: input.email,
        subject: `[Contact] ${input.subject}`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px">
            <h2>New contact message</h2>
            <p><strong>Name:</strong> ${escapeHtml(input.name)}</p>
            <p><strong>Phone:</strong> ${escapeHtml(input.phone)}</p>
            <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
            <p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
            <p><strong>Message:</strong></p>
            <p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>
          </div>
        `,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      return { sent: false, error: j.message || `HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    return {
      sent: false,
      error: e instanceof Error ? e.message : "Email failed",
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * POST /api/contact
 * Validates, rate-limits, stores in contact_messages, emails hospital inbox.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`contact:${ip}`, 8, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many messages. Please try again shortly." },
      { status: 429 }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = contactSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = {
    name: sanitizePlainText(parsed.data.name, 80),
    phone: parsed.data.phone,
    email: parsed.data.email.trim().toLowerCase(),
    subject: sanitizePlainText(parsed.data.subject, 120),
    message: sanitizePlainText(parsed.data.message, 1000),
  };

  let stored = false;
  let storeError: string | undefined;

  if (hasSupabaseConfig()) {
    try {
      const key = getServiceRoleKey() || getSupabaseAnonKey()!;
      const sb = createClient(getSupabaseUrl()!, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await sb.from("contact_messages").insert({
        name: data.name,
        phone: data.phone,
        email: data.email,
        subject: data.subject,
        message: data.message,
      });
      if (error) storeError = error.message;
      else stored = true;
    } catch (e) {
      storeError = e instanceof Error ? e.message : "Store failed";
    }
  }

  const email = await sendContactEmail(data);

  // Success if either channel works (or neither configured in local demo)
  const ok = stored || email.sent || (!hasSupabaseConfig() && !isEmailConfigured());

  if (!ok && storeError && !email.sent) {
    return NextResponse.json(
      {
        error: "Unable to deliver message right now. Please call the hospital.",
        details: { storeError, emailError: email.error },
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    stored,
    emailed: email.sent,
    demo: !stored && !email.sent,
    message: email.sent
      ? "Message sent. Our team will respond soon."
      : stored
        ? "Message received. Our team will respond soon."
        : "Message recorded (demo mode). Configure Supabase/Resend for production delivery.",
  });
}
