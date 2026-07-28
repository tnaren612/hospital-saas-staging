/**
 * Mock SMS provider — free preview + DB persistence (no network send).
 */

import type { SmsProvider } from "@/lib/notifications/core/interfaces";
import type { NotificationProviderId } from "@/lib/notifications/core/types";

export class MockSmsProvider implements SmsProvider {
  readonly id: NotificationProviderId = "mock_sms";
  readonly channel = "sms" as const;

  isConfigured(): boolean {
    return true;
  }

  async send(input: {
    recipient: string;
    subject: string;
    text: string;
  }): Promise<{
    ok: boolean;
    externalId?: string;
    preview?: string;
    error?: string;
  }> {
    const digits = input.recipient.replace(/\D/g, "");
    if (digits.length < 10) {
      return { ok: false, error: "Invalid mobile number" };
    }
    const id = `mock_sms_${Date.now()}`;
    console.info(`[mock_sms] → ${digits}: ${input.text.slice(0, 160)}`);
    return {
      ok: true,
      externalId: id,
      preview: input.text,
    };
  }
}
