/**
 * NotificationFactory — selects providers without business logic coupling.
 * Server-only: do not import from Client Components.
 *
 * Email: Gmail → Resend → Mock
 * WhatsApp: Meta Cloud API when configured (required for auto-send)
 * SMS: MSG91 if configured → Mock
 */

import type {
  EmailProvider,
  NotificationProvider,
  SmsProvider,
  WhatsAppProvider,
} from "@/lib/notifications/core/interfaces";
import type {
  NotificationChannel,
  NotificationProviderId,
} from "@/lib/notifications/core/types";
import { isGmailConfigured } from "@/lib/notifications/providers/email/gmail-provider";
import { isResendConfigured } from "@/lib/notifications/providers/email/resend-provider";
import { MockEmailProvider } from "@/lib/notifications/providers/email/mock-email-provider";
import { isMetaWhatsAppConfigured } from "@/lib/notifications/providers/whatsapp/meta-cloud-provider";
import { MockSmsProvider } from "@/lib/notifications/providers/sms/mock-sms-provider";
import { isMsg91Configured } from "@/lib/notifications/providers/sms/msg91-provider";

export class NotificationFactory {
  private emailCache = new Map<string, EmailProvider>();
  private smsCache = new Map<string, SmsProvider>();
  private waCache = new Map<string, WhatsAppProvider>();

  private async loadEmailProvider(
    id: NotificationProviderId
  ): Promise<EmailProvider | null> {
    if (this.emailCache.has(id)) return this.emailCache.get(id)!;
    let p: EmailProvider | null = null;
    if (id === "gmail") {
      const { GmailEmailProvider } = await import(
        "@/lib/notifications/providers/email/gmail-provider"
      );
      p = new GmailEmailProvider();
    } else if (id === "resend") {
      const { ResendEmailProvider } = await import(
        "@/lib/notifications/providers/email/resend-provider"
      );
      p = new ResendEmailProvider();
    } else if (id === "mock_email") {
      p = new MockEmailProvider();
    }
    if (p) this.emailCache.set(id, p);
    return p;
  }

  private async loadSmsProvider(
    id: NotificationProviderId
  ): Promise<SmsProvider | null> {
    if (this.smsCache.has(id)) return this.smsCache.get(id)!;
    let p: SmsProvider | null = null;
    if (id === "msg91") {
      const { Msg91SmsProvider } = await import(
        "@/lib/notifications/providers/sms/msg91-provider"
      );
      p = new Msg91SmsProvider();
    } else if (id === "mock_sms") {
      p = new MockSmsProvider();
    }
    if (p) this.smsCache.set(id, p);
    return p;
  }

  private async loadWhatsAppProvider(
    id: NotificationProviderId
  ): Promise<WhatsAppProvider | null> {
    if (this.waCache.has(id)) return this.waCache.get(id)!;
    let p: WhatsAppProvider | null = null;
    if (id === "meta" || id === "whatsapp_cloud") {
      const { MetaWhatsAppProvider } = await import(
        "@/lib/notifications/providers/whatsapp/meta-cloud-provider"
      );
      p = new MetaWhatsAppProvider();
    }
    if (p) this.waCache.set(id, p);
    return p;
  }

  describeProviders(): Record<
    string,
    { id: string; configured: boolean; channel: string }[]
  > {
    return {
      email: [
        { id: "gmail", configured: isGmailConfigured(), channel: "email" },
        { id: "resend", configured: isResendConfigured(), channel: "email" },
        { id: "mock_email", configured: true, channel: "email" },
      ],
      whatsapp: [
        {
          id: "meta",
          configured: isMetaWhatsAppConfigured(),
          channel: "whatsapp",
        },
      ],
      sms: [
        { id: "msg91", configured: isMsg91Configured(), channel: "sms" },
        { id: "mock_sms", configured: true, channel: "sms" },
      ],
    };
  }

  async getEmailProvider(
    prefer?: NotificationProviderId
  ): Promise<EmailProvider> {
    const order: NotificationProviderId[] = prefer
      ? [prefer, "gmail", "resend", "mock_email"]
      : ["gmail", "resend", "mock_email"];

    for (const id of order) {
      if (id === "gmail" && !isGmailConfigured() && prefer !== "gmail") continue;
      if (id === "resend" && !isResendConfigured() && prefer !== "resend")
        continue;
      const p = await this.loadEmailProvider(id);
      if (p && p.isConfigured() && p.id !== "mock_email") return p;
    }
    return (await this.loadEmailProvider("mock_email"))!;
  }

  /**
   * WhatsApp auto-send: Meta Cloud API only.
   * Does NOT fall back to wa.me (preview links are not automatic delivery).
   */
  async getWhatsAppProvider(
    prefer?: NotificationProviderId
  ): Promise<WhatsAppProvider> {
    if (prefer === "meta" || prefer === "whatsapp_cloud" || !prefer) {
      const meta = await this.loadWhatsAppProvider("meta");
      if (meta?.isConfigured()) return meta;
    }
    // Return Meta provider even if not configured so send() returns clear error
    const meta = await this.loadWhatsAppProvider("meta");
    if (meta) return meta;
    throw new Error(
      "WhatsApp Cloud API not configured. Set WHATSAPP_PROVIDER=meta, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID."
    );
  }

  async getSmsProvider(prefer?: NotificationProviderId): Promise<SmsProvider> {
    if (prefer === "msg91" || (!prefer && isMsg91Configured())) {
      const p = await this.loadSmsProvider("msg91");
      if (p?.isConfigured()) return p;
    }
    return (await this.loadSmsProvider("mock_sms"))!;
  }

  async getProvider(
    channel: NotificationChannel,
    prefer?: NotificationProviderId
  ): Promise<NotificationProvider> {
    if (channel === "email") return this.getEmailProvider(prefer);
    if (channel === "whatsapp") return this.getWhatsAppProvider(prefer);
    if (channel === "sms") return this.getSmsProvider(prefer);
    throw new Error(`Unsupported channel: ${channel}`);
  }
}

let singleton: NotificationFactory | null = null;

export function getNotificationFactory(): NotificationFactory {
  if (!singleton) singleton = new NotificationFactory();
  return singleton;
}
