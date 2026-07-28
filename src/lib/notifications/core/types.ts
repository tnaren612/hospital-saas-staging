/**
 * Notification domain types — provider-agnostic.
 */

export type NotificationChannel = "email" | "whatsapp" | "sms" | "in_app";

export type NotificationStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "skipped"
  | "cancelled";

export type NotificationProviderId =
  | "gmail"
  | "resend"
  | "sendgrid"
  | "ses"
  | "mock_email"
  | "wa_me"
  | "whatsapp_cloud"
  | "meta"
  | "mock_sms"
  | "msg91"
  | "twilio"
  | "textlocal"
  | "sns"
  | "none";

export type NotificationTemplateId =
  | "welcome"
  | "appointment_confirmation"
  | "appointment_reminder"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "payment_success"
  | "payment_failed"
  | "invoice"
  | "password_reset"
  | "lab_report_ready"
  | "prescription_ready"
  | "emergency"
  | "doctor_contact"
  | "patient_registration"
  | "generic";

export type NotificationRecord = {
  id: string;
  patient_id: string | null;
  appointment_id: string | null;
  channel: NotificationChannel;
  provider: NotificationProviderId;
  recipient: string;
  subject: string;
  message: string;
  html?: string;
  status: NotificationStatus;
  error_message: string;
  retry_count: number;
  template_id: NotificationTemplateId | string;
  meta: Record<string, unknown>;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationPreferences = {
  patient_id?: string | null;
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
  /** When true, all channels follow individual flags; when all=true force enable */
  all: boolean;
};

export type SendNotificationInput = {
  channel: NotificationChannel;
  templateId: NotificationTemplateId | string;
  recipient: string;
  /** Template variables */
  vars: Record<string, string | number | boolean | undefined | null>;
  patientId?: string | null;
  appointmentId?: string | null;
  /** Force send even if preference disabled (admin tests) */
  force?: boolean;
  /** Override subject */
  subject?: string;
  meta?: Record<string, unknown>;
  /** Prefer provider id */
  provider?: NotificationProviderId;
};

export type SendResult = {
  ok: boolean;
  notificationId?: string;
  status: NotificationStatus;
  provider: NotificationProviderId;
  channel: NotificationChannel;
  /** Gateway message id (e.g. Meta WhatsApp wamid) */
  messageId?: string;
  preview?: string;
  error?: string;
  attempts?: number;
};

export type RenderedTemplate = {
  subject: string;
  text: string;
  html: string;
};

export type NotificationListQuery = {
  channel?: NotificationChannel;
  status?: NotificationStatus;
  provider?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
};

export type NotificationStats = {
  total: number;
  emails_sent: number;
  whatsapp_generated: number;
  sms_pending: number;
  sms_sent: number;
  failures: number;
  retries: number;
  success_rate: number;
  most_used_channel: NotificationChannel | "none";
  by_channel: Record<string, number>;
  by_status: Record<string, number>;
  recent: NotificationRecord[];
};

export type ReminderWindow = "24h" | "2h" | "30m";
