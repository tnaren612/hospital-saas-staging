"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateWhatsAppLink } from "@/lib/notifications/providers/whatsapp/click-to-chat-provider";
import { renderWhatsAppMessage } from "@/lib/notifications/templates/message-templates";

type Props = {
  phone: string;
  templateId?: string;
  vars?: Record<string, string | number | boolean | undefined | null>;
  /** Raw message overrides template */
  message?: string;
  label?: string;
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "whatsapp" | "outline" | "default";
};

/**
 * "Send via WhatsApp" — free wa.me deep link.
 * Client-safe: does not import Nodemailer / server factory.
 */
export function WhatsAppSendButton({
  phone,
  templateId = "generic",
  vars = {},
  message,
  label = "Send via WhatsApp",
  className,
  size = "sm",
  variant = "whatsapp",
}: Props) {
  const text =
    message ||
    renderWhatsAppMessage(templateId, {
      ...vars,
      message: vars.message || message,
    });
  const href = generateWhatsAppLink(phone, text);

  if (!href) {
    return (
      <Button
        type="button"
        size={size}
        variant="outline"
        disabled
        className={className}
        title="Invalid phone number"
      >
        <MessageCircle className="h-4 w-4" />
        WhatsApp
      </Button>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex", className)}
    >
      <Button type="button" size={size} variant={variant} className="min-h-10">
        <MessageCircle className="h-4 w-4" aria-hidden />
        {label}
      </Button>
    </a>
  );
}
