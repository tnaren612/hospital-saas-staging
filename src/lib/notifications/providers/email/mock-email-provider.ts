/**
 * Mock email provider — always "sends" for local/dev without credentials.
 */

import type { EmailProvider } from "@/lib/notifications/core/interfaces";
import type { NotificationProviderId } from "@/lib/notifications/core/types";

export class MockEmailProvider implements EmailProvider {
  readonly id: NotificationProviderId = "mock_email";
  readonly channel = "email" as const;

  isConfigured(): boolean {
    return true;
  }

  async send(input: {
    recipient: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{
    ok: boolean;
    externalId?: string;
    preview?: string;
    error?: string;
  }> {
    const id = `mock_email_${Date.now()}`;
    console.info(
      `[mock_email] → ${input.recipient} | ${input.subject}\n${input.text.slice(0, 200)}`
    );
    return {
      ok: true,
      externalId: id,
      preview: input.text,
    };
  }
}
