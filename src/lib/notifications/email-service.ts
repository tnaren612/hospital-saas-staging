/**
 * EmailService — uses NotificationFactory + templates only.
 */

import { getNotificationFactory } from "@/lib/notifications/core/factory";
import { emailTemplateService } from "@/lib/notifications/templates/email-templates";
import type { NotificationProviderId } from "@/lib/notifications/core/types";

export class EmailService {
  constructor(private factory = getNotificationFactory()) {}

  async isConfigured(): Promise<boolean> {
    const p = await this.factory.getEmailProvider();
    return p.id !== "mock_email" && p.isConfigured();
  }

  async getActiveProviderId(): Promise<NotificationProviderId> {
    return (await this.factory.getEmailProvider()).id;
  }

  render(
    templateId: string,
    vars: Record<string, string | number | boolean | undefined | null>
  ) {
    return emailTemplateService.render(templateId, vars);
  }

  async send(input: {
    to: string;
    templateId: string;
    vars: Record<string, string | number | boolean | undefined | null>;
    subject?: string;
    preferProvider?: NotificationProviderId;
  }): Promise<{
    ok: boolean;
    provider: NotificationProviderId;
    externalId?: string;
    error?: string;
    subject: string;
    text: string;
    html: string;
  }> {
    const rendered = emailTemplateService.render(input.templateId, input.vars);
    const subject = input.subject || rendered.subject;
    const provider = await this.factory.getEmailProvider(input.preferProvider);
    const result = await provider.send({
      recipient: input.to,
      subject,
      text: rendered.text,
      html: rendered.html,
    });
    return {
      ok: result.ok,
      provider: provider.id,
      externalId: result.externalId,
      error: result.error,
      subject,
      text: rendered.text,
      html: rendered.html,
    };
  }
}

export const emailService = new EmailService();
