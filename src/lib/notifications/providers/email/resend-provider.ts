/**
 * Optional Resend provider (future / paid-tier friendly free tier).
 * Does not break when RESEND_API_KEY missing — factory skips it.
 */

import type { EmailProvider } from "@/lib/notifications/core/interfaces";
import type { NotificationProviderId } from "@/lib/notifications/core/types";

export function isResendConfigured(): boolean {
  const key = process.env.RESEND_API_KEY || "";
  return Boolean(key && key !== "your_resend_api_key" && !key.includes("xxxx"));
}

export class ResendEmailProvider implements EmailProvider {
  readonly id: NotificationProviderId = "resend";
  readonly channel = "email" as const;

  isConfigured(): boolean {
    return isResendConfigured();
  }

  async send(input: {
    recipient: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ ok: boolean; externalId?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: "Resend not configured" };
    }
    const from =
      process.env.EMAIL_FROM ||
      process.env.RESEND_FROM ||
      "Hospital <onboarding@resend.dev>";

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [input.recipient],
          subject: input.subject,
          html: input.html || input.text.replace(/\n/g, "<br/>"),
          text: input.text,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
      };
      if (!res.ok) {
        return { ok: false, error: json.message || `HTTP ${res.status}` };
      }
      return { ok: true, externalId: json.id };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Resend failed",
      };
    }
  }
}
