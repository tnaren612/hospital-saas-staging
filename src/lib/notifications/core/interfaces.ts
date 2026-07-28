/**
 * Provider interfaces — business logic depends only on these.
 */

import type {
  NotificationChannel,
  NotificationProviderId,
  NotificationRecord,
  NotificationListQuery,
  NotificationPreferences,
  NotificationStats,
  RenderedTemplate,
  SendResult,
} from "@/lib/notifications/core/types";

export interface NotificationProvider {
  readonly id: NotificationProviderId;
  readonly channel: NotificationChannel;
  isConfigured(): boolean;
  send(input: {
    recipient: string;
    subject: string;
    text: string;
    html?: string;
    meta?: Record<string, unknown>;
  }): Promise<{
    ok: boolean;
    externalId?: string;
    preview?: string;
    error?: string;
    raw?: unknown;
  }>;
}

export interface EmailProvider extends NotificationProvider {
  channel: "email";
}

export interface WhatsAppProvider extends NotificationProvider {
  channel: "whatsapp";
}

export interface SmsProvider extends NotificationProvider {
  channel: "sms";
}

export interface TemplateService {
  render(
    templateId: string,
    vars: Record<string, string | number | boolean | undefined | null>
  ): RenderedTemplate;
  listTemplateIds(): string[];
}

export interface NotificationRepository {
  create(
    partial: Omit<NotificationRecord, "id" | "created_at" | "updated_at"> & {
      id?: string;
    }
  ): Promise<NotificationRecord>;
  update(
    id: string,
    patch: Partial<NotificationRecord>
  ): Promise<NotificationRecord | null>;
  findById(id: string): Promise<NotificationRecord | null>;
  list(
    query: NotificationListQuery
  ): Promise<{ data: NotificationRecord[]; total: number }>;
  stats(): Promise<NotificationStats>;
  getPreferences(patientId: string): Promise<NotificationPreferences | null>;
  savePreferences(
    patientId: string,
    prefs: NotificationPreferences
  ): Promise<NotificationPreferences>;
  listRetryable(limit?: number): Promise<NotificationRecord[]>;
}

export interface NotificationServicePort {
  send(input: {
    channel: NotificationChannel;
    templateId: string;
    recipient: string;
    vars: Record<string, string | number | boolean | undefined | null>;
    patientId?: string | null;
    appointmentId?: string | null;
    force?: boolean;
    subject?: string;
    meta?: Record<string, unknown>;
  }): Promise<SendResult>;
  retry(notificationId: string): Promise<SendResult>;
  processRetryQueue(limit?: number): Promise<{ processed: number; ok: number }>;
}
