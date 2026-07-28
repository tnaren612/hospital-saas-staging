/**
 * SMSService — Mock by default; MSG91 when configured.
 */

import { getNotificationFactory } from "@/lib/notifications/core/factory";
import { renderSmsMessage } from "@/lib/notifications/templates/message-templates";
import type { NotificationProviderId } from "@/lib/notifications/core/types";

export class SMSService {
  constructor(private factory = getNotificationFactory()) {}

  async getActiveProviderId(): Promise<NotificationProviderId> {
    return (await this.factory.getSmsProvider()).id;
  }

  async isLiveProvider(): Promise<boolean> {
    const id = await this.getActiveProviderId();
    return id !== "mock_sms";
  }

  preview(
    templateId: string,
    vars: Record<string, string | number | boolean | undefined | null>
  ): string {
    return renderSmsMessage(templateId, vars);
  }

  async send(input: {
    to: string;
    templateId: string;
    vars: Record<string, string | number | boolean | undefined | null>;
    preferProvider?: NotificationProviderId;
  }): Promise<{
    ok: boolean;
    provider: NotificationProviderId;
    preview: string;
    externalId?: string;
    error?: string;
  }> {
    const text = this.preview(input.templateId, input.vars);
    const provider = await this.factory.getSmsProvider(input.preferProvider);
    const result = await provider.send({
      recipient: input.to,
      subject: input.templateId,
      text,
    });
    return {
      ok: result.ok,
      provider: provider.id,
      preview: result.preview || text,
      externalId: result.externalId,
      error: result.error,
    };
  }
}

export const smsService = new SMSService();
