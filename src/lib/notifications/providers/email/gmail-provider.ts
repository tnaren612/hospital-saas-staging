/**
 * Free Gmail SMTP via Nodemailer (App Password).
 * Env: GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_FROM
 */

import type { EmailProvider } from "@/lib/notifications/core/interfaces";
import type { NotificationProviderId } from "@/lib/notifications/core/types";

export function isGmailConfigured(): boolean {
  const user = process.env.GMAIL_USER || "";
  const pass = process.env.GMAIL_APP_PASSWORD || "";
  return Boolean(
    user &&
      pass &&
      !user.includes("example") &&
      pass.length >= 8 &&
      pass !== "your_app_password"
  );
}

export class GmailEmailProvider implements EmailProvider {
  readonly id: NotificationProviderId = "gmail";
  readonly channel = "email" as const;

  isConfigured(): boolean {
    return isGmailConfigured();
  }

  async send(input: {
    recipient: string;
    subject: string;
    text: string;
    html?: string;
    meta?: Record<string, unknown>;
  }): Promise<{
    ok: boolean;
    externalId?: string;
    error?: string;
    raw?: unknown;
  }> {
    if (!this.isConfigured()) {
      return { ok: false, error: "Gmail SMTP not configured" };
    }

    const user = process.env.GMAIL_USER!.trim();
    // App passwords may be pasted with spaces — strip for SMTP auth
    const pass = process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "");
    const from =
      process.env.EMAIL_FROM ||
      process.env.GMAIL_FROM ||
      `Hospital <${user}>`;

    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
      });

      const info = await transporter.sendMail({
        from,
        to: input.recipient,
        subject: input.subject,
        text: input.text,
        html: input.html || input.text.replace(/\n/g, "<br/>"),
      });

      return {
        ok: true,
        externalId: String(info.messageId || ""),
        raw: { accepted: info.accepted, rejected: info.rejected },
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Gmail send failed",
      };
    }
  }
}
