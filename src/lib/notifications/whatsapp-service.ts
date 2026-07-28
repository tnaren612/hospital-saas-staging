/**
 * WhatsAppService — Meta Cloud API for automatic delivery.
 * Does not use wa.me / actionUrl for booking confirmations.
 */

import { getNotificationFactory } from "@/lib/notifications/core/factory";
import { normalizeWhatsAppDigits } from "@/lib/notifications/providers/whatsapp/click-to-chat-provider";
import { renderWhatsAppMessage } from "@/lib/notifications/templates/message-templates";
import type { NotificationProviderId } from "@/lib/notifications/core/types";

export class WhatsAppService {
  constructor(private factory = getNotificationFactory()) {}

  buildMessage(
    templateId: string,
    vars: Record<string, string | number | boolean | undefined | null>
  ): string {
    return renderWhatsAppMessage(templateId, vars);
  }

  /**
   * Automatic send via Meta WhatsApp Cloud API.
   */
  async send(input: {
    phone: string;
    templateId: string;
    vars: Record<string, string | number | boolean | undefined | null>;
    preferProvider?: NotificationProviderId;
  }): Promise<{
    ok: boolean;
    provider: string;
    channel: "whatsapp";
    status: "sent" | "failed";
    messageId?: string;
    error?: string;
    preview: string;
  }> {
    const text = this.buildMessage(input.templateId, input.vars);
    try {
      const provider = await this.factory.getWhatsAppProvider(
        input.preferProvider || "meta"
      );
      const result = await provider.send({
        recipient: input.phone,
        subject: input.templateId,
        text,
        meta: {
          templateParams: [
            String(input.vars.patientName || ""),
            String(input.vars.doctorName || ""),
            String(input.vars.date || ""),
            String(input.vars.timeSlot || ""),
            String(input.vars.bookingRef || input.vars.appointmentId || ""),
          ],
        },
      });
      return {
        ok: result.ok,
        provider: provider.id,
        channel: "whatsapp",
        status: result.ok ? "sent" : "failed",
        messageId: result.externalId,
        error: result.error,
        preview: text,
      };
    } catch (e) {
      return {
        ok: false,
        provider: "meta",
        channel: "whatsapp",
        status: "failed",
        error: e instanceof Error ? e.message : "WhatsApp send failed",
        preview: text,
      };
    }
  }

  normalizePhone(phone: string): string {
    return normalizeWhatsAppDigits(phone);
  }
}

export const whatsAppService = new WhatsAppService();
