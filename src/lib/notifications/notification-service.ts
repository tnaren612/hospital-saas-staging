/**
 * NotificationService — single entry for all channels.
 * Business code must only call this service (never Gmail/WhatsApp/SMS APIs).
 */

import type { NotificationServicePort } from "@/lib/notifications/core/interfaces";
import type {
  NotificationChannel,
  NotificationRecord,
  NotificationStatus,
  SendNotificationInput,
  SendResult,
  NotificationListQuery,
  NotificationStats,
  NotificationPreferences,
  ReminderWindow,
} from "@/lib/notifications/core/types";
import { getNotificationFactory } from "@/lib/notifications/core/factory";
import {
  getNotificationRepository,
} from "@/lib/notifications/repository";
import {
  isChannelAllowed,
  normalizePreferences,
  DEFAULT_PREFERENCES,
} from "@/lib/notifications/core/preferences";
import { emailService } from "@/lib/notifications/email-service";
import { whatsAppService } from "@/lib/notifications/whatsapp-service";
import { smsService } from "@/lib/notifications/sms-service";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 400;

function log(
  level: "info" | "warn" | "error",
  event: string,
  data: Record<string, unknown>
) {
  const line = JSON.stringify({
    type: "notification",
    level,
    event,
    ...data,
    ts: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export class NotificationService implements NotificationServicePort {
  constructor(
    private repo = getNotificationRepository(),
    private factory = getNotificationFactory()
  ) {}

  async send(input: SendNotificationInput): Promise<SendResult> {
    const channel = input.channel;

    // Preferences
    if (!input.force && input.patientId) {
      const prefs = await this.repo.getPreferences(input.patientId);
      if (!isChannelAllowed(prefs, channel)) {
        const skipped = await this.repo.create({
          patient_id: input.patientId || null,
          appointment_id: input.appointmentId || null,
          channel,
          provider: "none",
          recipient: input.recipient,
          subject: input.subject || String(input.templateId),
          message: "Skipped — channel disabled in preferences",
          status: "skipped",
          error_message: "preference_disabled",
          retry_count: 0,
          template_id: input.templateId,
          meta: input.meta || {},
          sent_at: null,
        });
        log("info", "notification.skipped_preference", {
          id: skipped.id,
          channel,
          patientId: input.patientId,
        });
        return {
          ok: true,
          notificationId: skipped.id,
          status: "skipped",
          provider: "none",
          channel,
        };
      }
    }

    // Create pending record
    let record = await this.repo.create({
      patient_id: input.patientId || null,
      appointment_id: input.appointmentId || null,
      channel,
      provider: "none",
      recipient: input.recipient,
      subject: input.subject || String(input.templateId),
      message: "",
      status: "pending",
      error_message: "",
      retry_count: 0,
      template_id: input.templateId,
      meta: input.meta || {},
      sent_at: null,
    });

    let lastError = "";
    let attempts = 0;
    let finalStatus: NotificationStatus = "failed";
    let preview: string | undefined;
    let messageId: string | undefined;
    let providerId = record.provider;

    for (let i = 1; i <= MAX_RETRIES; i++) {
      attempts = i;
      try {
        const result = await this.dispatch(channel, input);
        providerId = result.provider;
        preview = result.preview || result.message;
        messageId = result.externalId;

        if (result.ok) {
          finalStatus = "sent";

          record =
            (await this.repo.update(record.id, {
              status: finalStatus,
              provider: providerId,
              subject: result.subject || record.subject,
              message: result.message || preview || "",
              html: result.html,
              error_message: "",
              retry_count: attempts - 1,
              sent_at: new Date().toISOString(),
              meta: {
                ...record.meta,
                messageId: result.externalId,
                externalId: result.externalId,
              },
            })) || record;

          log("info", "notification.sent", {
            id: record.id,
            channel,
            provider: providerId,
            messageId: result.externalId,
            attempts,
          });

          return {
            ok: true,
            notificationId: record.id,
            status: finalStatus,
            provider: providerId,
            channel,
            messageId: result.externalId,
            preview,
            attempts,
          };
        }

        lastError = result.error || "Send failed";
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Send exception";
      }

      if (i < MAX_RETRIES) await sleep(RETRY_BASE_MS * i);
    }

    record =
      (await this.repo.update(record.id, {
        status: "failed",
        provider: providerId,
        error_message: lastError,
        retry_count: attempts,
        message: preview || record.message,
      })) || record;

    log("error", "notification.failed", {
      id: record.id,
      channel,
      error: lastError,
      attempts,
    });

    return {
      ok: false,
      messageId,
      notificationId: record.id,
      status: "failed",
      provider: providerId,
      channel,
      error: lastError,
      attempts,
      preview,
    };
  }

  private async dispatch(
    channel: NotificationChannel,
    input: SendNotificationInput
  ): Promise<{
    ok: boolean;
    provider: NotificationRecord["provider"];
    subject?: string;
    message?: string;
    html?: string;
    preview?: string;
    externalId?: string;
    error?: string;
  }> {
    if (channel === "email") {
      const r = await emailService.send({
        to: input.recipient,
        templateId: String(input.templateId),
        vars: input.vars,
        subject: input.subject,
        preferProvider: input.provider,
      });
      return {
        ok: r.ok,
        provider: r.provider,
        subject: r.subject,
        message: r.text,
        html: r.html,
        externalId: r.externalId,
        error: r.error,
      };
    }

    if (channel === "whatsapp") {
      const r = await whatsAppService.send({
        phone: input.recipient,
        templateId: String(input.templateId),
        vars: input.vars,
        preferProvider: input.provider || "meta",
      });
      return {
        ok: r.ok,
        provider: (r.provider || "meta") as NotificationRecord["provider"],
        message: r.preview,
        preview: r.preview,
        externalId: r.messageId,
        error: r.error,
      };
    }

    if (channel === "sms") {
      const r = await smsService.send({
        to: input.recipient,
        templateId: String(input.templateId),
        vars: input.vars,
        preferProvider: input.provider,
      });
      return {
        ok: r.ok,
        provider: r.provider,
        message: r.preview,
        preview: r.preview,
        externalId: r.externalId,
        error: r.error,
      };
    }

    return { ok: false, provider: "none", error: "Unsupported channel" };
  }

  async retry(notificationId: string): Promise<SendResult> {
    const existing = await this.repo.findById(notificationId);
    if (!existing) {
      return {
        ok: false,
        status: "failed",
        provider: "none",
        channel: "email",
        error: "Notification not found",
      };
    }

    return this.send({
      channel: existing.channel,
      templateId: existing.template_id,
      recipient: existing.recipient,
      vars: {
        ...(existing.meta?.vars as Record<string, string> | undefined),
        message: existing.message,
        subject: existing.subject,
      },
      patientId: existing.patient_id,
      appointmentId: existing.appointment_id,
      force: true,
      subject: existing.subject,
      meta: { ...existing.meta, retriedFrom: existing.id },
    });
  }

  async processRetryQueue(
    limit = 20
  ): Promise<{ processed: number; ok: number }> {
    const items = await this.repo.listRetryable(limit);
    let ok = 0;
    for (const item of items) {
      const r = await this.retry(item.id);
      if (r.ok) ok++;
    }
    return { processed: items.length, ok };
  }

  async list(query: NotificationListQuery) {
    return this.repo.list(query);
  }

  async stats(): Promise<NotificationStats> {
    return this.repo.stats();
  }

  async getPreferences(patientId: string): Promise<NotificationPreferences> {
    const p = await this.repo.getPreferences(patientId);
    return p || { ...DEFAULT_PREFERENCES, patient_id: patientId };
  }

  async savePreferences(
    patientId: string,
    prefs: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    return this.repo.savePreferences(
      patientId,
      normalizePreferences({ ...prefs, patient_id: patientId })
    );
  }

  /**
   * Multi-channel fan-out respecting preferences.
   */
  async notifyPatient(input: {
    patientId?: string | null;
    appointmentId?: string | null;
    templateId: string;
    vars: Record<string, string | number | boolean | undefined | null>;
    email?: string;
    phone?: string;
    channels?: NotificationChannel[];
    force?: boolean;
  }): Promise<SendResult[]> {
    const channels = input.channels || (["email", "whatsapp", "sms"] as const);
    const results: SendResult[] = [];

    for (const channel of channels) {
      const recipient =
        channel === "email" ? input.email || "" : input.phone || "";
      if (!recipient) continue;
      const r = await this.send({
        channel,
        templateId: input.templateId,
        recipient,
        vars: input.vars,
        patientId: input.patientId,
        appointmentId: input.appointmentId,
        force: input.force,
        meta: { vars: input.vars },
      });
      results.push(r);
    }
    return results;
  }

  /** Schedule-friendly reminder helper */
  async sendAppointmentReminder(input: {
    window: ReminderWindow;
    patientName: string;
    doctorName: string;
    date: string;
    timeSlot: string;
    type?: string;
    email?: string;
    phone?: string;
    patientId?: string;
    appointmentId?: string;
    hospitalName?: string;
  }): Promise<SendResult[]> {
    return this.notifyPatient({
      patientId: input.patientId,
      appointmentId: input.appointmentId,
      templateId: "appointment_reminder",
      email: input.email,
      phone: input.phone,
      vars: {
        patientName: input.patientName,
        doctorName: input.doctorName,
        date: input.date,
        timeSlot: input.timeSlot,
        type: input.type || "in-person",
        window: input.window,
        hospitalName: input.hospitalName,
      },
    });
  }

  describeProviders() {
    return this.factory.describeProviders();
  }
}

let serviceSingleton: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!serviceSingleton) serviceSingleton = new NotificationService();
  return serviceSingleton;
}

export function resetNotificationServiceForTests() {
  serviceSingleton = null;
}
