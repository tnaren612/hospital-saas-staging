/**
 * Production provider configuration helpers.
 * Never exposes secrets — only readiness flags for health / admin UI.
 */

export type ProviderStatus = {
  configured: boolean;
  mode: "live" | "test" | "mock" | "disabled";
  hint: string;
};

export function getRazorpayStatus(): ProviderStatus {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!keyId || !secret || keyId.includes("xxxx") || secret.includes("your_")) {
    return {
      configured: false,
      mode: "mock",
      hint: "Set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET. Webhook: POST /api/payments/webhook with RAZORPAY_WEBHOOK_SECRET.",
    };
  }
  const live = keyId.startsWith("rzp_live_");
  return {
    configured: true,
    mode: live ? "live" : "test",
    hint: live
      ? "Live Razorpay keys detected. Ensure webhook is registered in Razorpay Dashboard."
      : "Test Razorpay keys detected. Switch to rzp_live_* for production charges.",
  };
}

export function getEmailStatus(): ProviderStatus {
  const key = process.env.RESEND_API_KEY || "";
  if (!key || key.includes("xxxx") || key === "your_resend_api_key") {
    return {
      configured: false,
      mode: "disabled",
      hint: "Set RESEND_API_KEY + EMAIL_FROM. Optional HOSPITAL_INBOX for contact form.",
    };
  }
  return {
    configured: true,
    mode: "live",
    hint: "Resend configured for transactional email.",
  };
}

export function getSmsStatus(): ProviderStatus {
  const key = process.env.MSG91_AUTH_KEY || "";
  if (!key || key.includes("xxxx")) {
    return {
      configured: false,
      mode: "disabled",
      hint: "Set MSG91_AUTH_KEY + MSG91_SENDER_ID (+ MSG91_TEMPLATE_ID for DLT).",
    };
  }
  return {
    configured: true,
    mode: "live",
    hint: "MSG91 SMS configured.",
  };
}

export function getWhatsAppStatus(): ProviderStatus {
  const provider = (process.env.WHATSAPP_PROVIDER || "meta").toLowerCase();
  const token = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const metaReady =
    (provider === "meta" || provider === "whatsapp_cloud") &&
    Boolean(
      token &&
        phoneId &&
        token !== "your_whatsapp_token" &&
        !token.includes("xxxx")
    );

  if (metaReady) {
    return {
      configured: true,
      mode: "live",
      hint: "Meta WhatsApp Cloud API configured — automatic appointment confirmations.",
    };
  }

  return {
    configured: false,
    mode: "disabled",
    hint: "Set WHATSAPP_PROVIDER=meta, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID for automatic sends.",
  };
}

export function getAnalyticsStatus(): ProviderStatus {
  const ga = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
  if (!ga || ga.includes("XXXX")) {
    return {
      configured: false,
      mode: "disabled",
      hint: "Set NEXT_PUBLIC_GA_MEASUREMENT_ID (G-XXXXXXXX). Web Vitals still report to /api/monitoring/vitals.",
    };
  }
  return {
    configured: true,
    mode: "live",
    hint: "Google Analytics 4 enabled.",
  };
}

export function getAllProviderStatuses() {
  return {
    razorpay: getRazorpayStatus(),
    email: getEmailStatus(),
    sms: getSmsStatus(),
    whatsapp: getWhatsAppStatus(),
    analytics: getAnalyticsStatus(),
  };
}
