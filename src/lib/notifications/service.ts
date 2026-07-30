/**
 * Backward-compatible unified notification facade.
 * New code should use getNotificationService() from notification-service.ts.
 * This module re-exports helpers used by appointments/payments.
 */

import { getNotificationService } from "@/lib/notifications/notification-service";
import {
  isEmailConfigured as isGmailOrResend,
} from "@/lib/notifications/email";
import {
  buildAppointmentWhatsAppMessage,
  isMetaWhatsAppEnabled,
  type WhatsAppConfirmPayload,
} from "@/lib/notifications/whatsapp";
import {
  isSmsConfigured,
  sendSms,
  type SmsPayload,
} from "@/lib/notifications/sms";
import type {
  AppointmentEmailPayload,
  PaymentEmailPayload,
} from "@/lib/notifications/email";
import {
  sendAppointmentConfirmationEmail,
  sendPaymentConfirmationEmail,
} from "@/lib/notifications/email";

export type NotificationChannel = "email" | "whatsapp" | "sms";

export type NotificationTemplate =
  | "appointment_reminder"
  | "appointment_confirmation"
  | "payment_confirmation"
  | "invoice_receipt"
  | "generic";

export type NotificationLogEntry = {
  id: string;
  channel: NotificationChannel;
  template: NotificationTemplate;
  to: string;
  status: "sent" | "failed" | "skipped" | "queued";
  attempts: number;
  error?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
};

/** @deprecated Prefer getNotificationService().list() */
export function getRecentNotificationLogs(limit = 50): NotificationLogEntry[] {
  // Best-effort sync empty — async history lives in repository
  void limit;
  return [];
}

export function getNotificationCapabilities() {
  return {
    email: isGmailOrResend() || Boolean(process.env.GMAIL_USER),
    sms: isSmsConfigured(),
    whatsapp: isMetaWhatsAppEnabled(),
  };
}

/** Appointment confirmation across configured channels (legacy API). */
export async function notifyAppointmentConfirmed(input: {
  email?: AppointmentEmailPayload;
  whatsapp?: WhatsAppConfirmPayload & { patientPhone?: string };
  sms?: { to: string; message: string };
}): Promise<{
  email?: { sent: boolean; error?: string };
  whatsapp?: {
    provider: string;
    channel: "whatsapp";
    status: string;
    ok: boolean;
    messageId?: string;
    notificationId?: string;
    error?: string;
  };
  sms?: { sent: boolean; error?: string };
}> {
  const svc = getNotificationService();
  const out: {
    email?: { sent: boolean; error?: string };
    whatsapp?: {
      provider: string;
      channel: "whatsapp";
      status: string;
      ok: boolean;
      messageId?: string;
      notificationId?: string;
      error?: string;
    };
    sms?: { sent: boolean; error?: string };
  } = {};

  if (input.email?.to) {
    const r = await svc.send({
      channel: "email",
      templateId: "appointment_confirmation",
      recipient: input.email.to,
      force: true,
      vars: {
        patientName: input.email.patientName,
        doctorName: input.email.doctorName,
        departmentName: input.email.departmentName,
        date: input.email.date,
        timeSlot: input.email.timeSlot,
        type: input.email.type,
        bookingRef: input.email.bookingRef,
        hospitalName: input.email.hospitalName,
      },
      meta: { vars: input.email },
    });
    out.email = { sent: r.ok && r.status !== "skipped", error: r.error };
    // Also try legacy Resend path if new stack used mock and Resend configured
    if (!out.email.sent) {
      const legacy = await sendAppointmentConfirmationEmail(input.email);
      if (legacy.sent) out.email = { sent: true };
    }
  }

  if (input.whatsapp?.patientPhone) {
    // Automatic Meta Cloud API send (not wa.me)
    const wa = await svc.send({
      channel: "whatsapp",
      templateId: "appointment_confirmation",
      recipient: input.whatsapp.patientPhone,
      force: true,
      provider: "meta",
      vars: {
        patientName: input.whatsapp.patientName,
        doctorName: input.whatsapp.doctorName,
        departmentName: input.whatsapp.departmentName,
        date: input.whatsapp.date,
        timeSlot: input.whatsapp.timeSlot,
        type: input.whatsapp.type,
        bookingRef: input.whatsapp.bookingRef,
        appointmentId: input.whatsapp.appointmentId,
        hospitalName: input.whatsapp.hospitalName,
      },
    });
    out.whatsapp = {
      provider: wa.provider || "meta",
      channel: "whatsapp",
      status: wa.ok ? "sent" : wa.status,
      ok: wa.ok,
      messageId: wa.messageId,
      notificationId: wa.notificationId,
      error: wa.error,
    };
  }

  if (input.sms?.to) {
    const r = await svc.send({
      channel: "sms",
      templateId: "appointment_confirmation",
      recipient: input.sms.to,
      force: true,
      vars: {
        message: input.sms.message,
        patientName: input.whatsapp?.patientName || input.email?.patientName,
        doctorName: input.whatsapp?.doctorName || input.email?.doctorName,
        date: input.whatsapp?.date || input.email?.date,
        timeSlot: input.whatsapp?.timeSlot || input.email?.timeSlot,
      },
    });
    out.sms = { sent: r.ok, error: r.error };
    if (!out.sms.sent) {
      const legacy = await sendSms({
        to: input.sms.to,
        message: input.sms.message,
      } as SmsPayload);
      out.sms = { sent: legacy.sent, error: legacy.error };
    }
  }

  return out;
}

export async function notifyPaymentSuccess(input: {
  email?: PaymentEmailPayload;
  sms?: SmsPayload;
}): Promise<{
  email?: { sent: boolean; error?: string };
  sms?: { sent: boolean; error?: string };
}> {
  const svc = getNotificationService();
  const out: {
    email?: { sent: boolean; error?: string };
    sms?: { sent: boolean; error?: string };
  } = {};

  if (input.email?.to) {
    const r = await svc.send({
      channel: "email",
      templateId: "payment_success",
      recipient: input.email.to,
      force: true,
      vars: {
        patientName: input.email.patientName,
        invoiceNumber: input.email.invoiceNumber,
        amount: input.email.amount,
        amountLabel:
          input.email.currency === "INR"
            ? `Rs ${Number(input.email.amount).toFixed(2)}`
            : `${input.email.currency || ""} ${input.email.amount}`,
        transactionId: input.email.transactionId,
        paymentMethod: input.email.paymentMethod,
        doctorName: input.email.doctorName,
        hospitalName: input.email.hospitalName,
        pdfUrl: input.email.pdfUrl,
      },
    });
    out.email = { sent: r.ok, error: r.error };
    if (!out.email.sent) {
      const legacy = await sendPaymentConfirmationEmail(input.email);
      if (legacy.sent) out.email = { sent: true };
    }
  }

  if (input.sms?.to) {
    const r = await svc.send({
      channel: "sms",
      templateId: "payment_success",
      recipient: input.sms.to,
      force: true,
      vars: { message: input.sms.message },
    });
    out.sms = { sent: r.ok, error: r.error };
  }

  return out;
}

export function buildAppointmentReminderMessage(input: {
  patientName: string;
  doctorName: string;
  date: string;
  timeSlot: string;
  hospitalName?: string;
}): string {
  const hospital = input.hospitalName || "Hospital";
  return (
    `Reminder: ${input.patientName}, your appointment with ${input.doctorName} ` +
    `at ${hospital} is on ${input.date} at ${input.timeSlot}. ` +
    `Please arrive 10–15 minutes early.`
  );
}

export async function notifyAppointmentReminder(input: {
  toPhone?: string;
  toEmail?: string;
  patientName: string;
  doctorName: string;
  date: string;
  timeSlot: string;
  hospitalName?: string;
}): Promise<void> {
  const svc = getNotificationService();
  await svc.sendAppointmentReminder({
    window: "24h",
    patientName: input.patientName,
    doctorName: input.doctorName,
    date: input.date,
    timeSlot: input.timeSlot,
    email: input.toEmail,
    phone: input.toPhone,
    hospitalName: input.hospitalName,
  });
}

export function getWhatsAppPreviewText(
  payload: WhatsAppConfirmPayload
): string {
  return buildAppointmentWhatsAppMessage(payload);
}

export { getNotificationService };
