/**
 * Public exports for the Notification subsystem.
 * Business code should import from here or notification-service.
 */

export { getNotificationService } from "@/lib/notifications/notification-service";
export { emailService } from "@/lib/notifications/email-service";
export { whatsAppService } from "@/lib/notifications/whatsapp-service";
export { generateWhatsAppLink } from "@/lib/notifications/providers/whatsapp/click-to-chat-provider";
export { smsService } from "@/lib/notifications/sms-service";
export { getNotificationFactory } from "@/lib/notifications/core/factory";
export { getNotificationRepository } from "@/lib/notifications/repository";
export { emailTemplateService } from "@/lib/notifications/templates/email-templates";
export type * from "@/lib/notifications/core/types";
