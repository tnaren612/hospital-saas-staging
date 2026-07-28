/**
 * Optional MSG91 SMS provider (future plug-in).
 */

import type { SmsProvider } from "@/lib/notifications/core/interfaces";
import type { NotificationProviderId } from "@/lib/notifications/core/types";

export function isMsg91Configured(): boolean {
  const key = process.env.MSG91_AUTH_KEY || process.env.MSG91_API_KEY || "";
  return Boolean(key && !key.includes("xxxx") && key !== "your_msg91_key");
}

export class Msg91SmsProvider implements SmsProvider {
  readonly id: NotificationProviderId = "msg91";
  readonly channel = "sms" as const;

  isConfigured(): boolean {
    return isMsg91Configured();
  }

  async send(input: {
    recipient: string;
    subject: string;
    text: string;
  }): Promise<{ ok: boolean; externalId?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: "MSG91 not configured" };
    }

    const mobile = input.recipient.replace(/\D/g, "");
    const mobiles = mobile.length === 10 ? `91${mobile}` : mobile;
    const authKey = process.env.MSG91_AUTH_KEY || process.env.MSG91_API_KEY!;
    const sender = process.env.MSG91_SENDER_ID || "SSHOSP";

    try {
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          authkey: authKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          template_id: process.env.MSG91_TEMPLATE_ID || "",
          short_url: "0",
          recipients: [{ mobiles, VAR1: input.text.slice(0, 30) }],
          sender,
          message: input.text,
          route: "4",
          mobiles,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        type?: string;
        message?: string;
        request_id?: string;
      };
      if (!res.ok || json.type === "error") {
        return {
          ok: false,
          error: json.message || `MSG91 HTTP ${res.status}`,
        };
      }
      return { ok: true, externalId: json.request_id || json.message };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "MSG91 failed",
      };
    }
  }
}
