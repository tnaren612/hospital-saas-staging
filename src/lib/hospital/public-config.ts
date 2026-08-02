import type { HospitalConfig } from "@/lib/hospital/types";

/**
 * Public configuration projection.
 *
 * Keep the complete shape for backward compatibility with the existing client
 * provider, but remove operational configuration that belongs only in
 * authenticated admin/server contexts.
 */
export function toPublicHospitalConfig(
  config: HospitalConfig
): HospitalConfig {
  return {
    ...config,
    payments: {
      ...config.payments,
      upi_id: "",
      bank_details: "",
    },
    email: {
      ...config.email,
      provider: "none",
      from_email: "",
      smtp_host_hint: "",
    },
    storage: {
      ...config.storage,
      provider: "supabase",
      public_base_url: "",
    },
    auth_providers: {
      ...config.auth_providers,
      google_login: false,
      microsoft_login: false,
      apple_login: false,
      mfa: false,
    },
    templates: {
      ...config.templates,
      email_footer: "",
      sms_signature: "",
      whatsapp_greeting: "",
      pdf_header: "",
      pdf_footer: "",
      invoice_note: "",
      prescription_note: "",
      report_note: "",
    },
    data_management: {
      ...config.data_management,
      modules: {},
      backup: { enabled: false, scheduleCron: null, keepCount: 0 },
    },
  };
}
