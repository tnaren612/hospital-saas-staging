/**
 * Seed defaults — overlaid by DB hospital_settings.
 * Prefer env overrides for white-label deploy without DB.
 */

import type {
  HospitalConfig,
  ModuleFlags,
  ModuleKey,
} from "@/lib/hospital/types";
import { MODULE_KEYS } from "@/lib/hospital/types";

function envList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function allModules(enabled: boolean): ModuleFlags {
  const m = {} as ModuleFlags;
  for (const k of MODULE_KEYS) m[k as ModuleKey] = enabled;
  // Core clinical stack on by default
  m.appointments = true;
  m.reception = true;
  m.doctors = true;
  m.patients = true;
  m.laboratory = true;
  m.pharmacy = true;
  m.billing = true;
  m.finance = true;
  m.hr = true;
  m.reports = true;
  m.cms = true;
  m.notifications = true;
  m.online_booking = true;
  m.patient_portal = true;
  m.doctor_portal = true;
  m.opd = true;
  m.emergency = true;
  m.video_consultation = true;
  m.telemedicine = true;
  // Advanced modules off until configured
  m.radiology = false;
  m.blood_bank = false;
  m.dialysis = false;
  m.operation_theatre = false;
  m.icu = true;
  m.ipd = false;
  m.ambulance = true;
  m.insurance = true;
  m.inventory = true;
  m.payroll = true;
  m.attendance = true;
  m.api = true;
  return m;
}

export function getDefaultHospitalSlug(): string {
  return (
    process.env.NEXT_PUBLIC_HOSPITAL_SLUG ||
    process.env.HOSPITAL_SLUG ||
    "default"
  ).toLowerCase();
}

export function buildDefaultHospitalConfig(): HospitalConfig {
  const name =
    process.env.NEXT_PUBLIC_HOSPITAL_NAME || "Hospital";
  const email =
    process.env.NEXT_PUBLIC_HOSPITAL_EMAIL || "contact@hospital.invalid";
  const primary =
    process.env.NEXT_PUBLIC_BRAND_PRIMARY || "#1a5ff5";
  const secondary =
    process.env.NEXT_PUBLIC_BRAND_SECONDARY || "#0d9488";

  return {
    hospital_id: null,
    slug: getDefaultHospitalSlug(),
    hospital_type: "multi_specialty",
    branding: {
      name,
      tagline:
        process.env.NEXT_PUBLIC_HOSPITAL_TAGLINE || "Excellence in Care",
      logo_url: process.env.NEXT_PUBLIC_HOSPITAL_LOGO || "/icons/icon-192.svg",
      favicon_url: "/favicon.ico",
      banner_url: "",
      primary_color: primary,
      secondary_color: secondary,
      theme: "default",
      dark_mode_default: false,
      watermark_url: "",
      digital_signature_url: "",
      loading_logo_url: "",
    },
    contact: {
      email,
      support_email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || email,
      billing_email: process.env.NEXT_PUBLIC_BILLING_EMAIL || email,
      phones: envList(process.env.NEXT_PUBLIC_HOSPITAL_PHONES),
      emergency_phone: process.env.NEXT_PUBLIC_EMERGENCY_PHONE || "",
      whatsapp: process.env.NEXT_PUBLIC_WHATSAPP || "",
      website:
        process.env.NEXT_PUBLIC_SITE_URL ||
        "https://example-hospital.com",
      address_line1: process.env.NEXT_PUBLIC_ADDRESS_LINE1 || "",
      address_line2: process.env.NEXT_PUBLIC_ADDRESS_LINE2 || "",
      city: process.env.NEXT_PUBLIC_HOSPITAL_CITY || "",
      state: process.env.NEXT_PUBLIC_HOSPITAL_STATE || "",
      pincode: process.env.NEXT_PUBLIC_HOSPITAL_PINCODE || "",
      country: process.env.NEXT_PUBLIC_HOSPITAL_COUNTRY || "",
      maps_url: process.env.NEXT_PUBLIC_HOSPITAL_MAPS_URL || "",
      lat: envNumber(process.env.NEXT_PUBLIC_HOSPITAL_LAT),
      lng: envNumber(process.env.NEXT_PUBLIC_HOSPITAL_LNG),
    },
    localization: {
      timezone: process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Kolkata",
      language: "en",
      currency: "INR",
      currency_symbol: "₹",
      date_format: "dd MMM yyyy",
      time_format: "12h",
      week_start: "monday",
      financial_year_start_month: 4,
    },
    legal: {
      tax_percent: 0,
      gst_number: "",
      pan_number: "",
      license_number: "",
      registration_number: "",
      nabh_number: "",
      nabl_number: "",
      footer_text: `© ${new Date().getFullYear()} ${name}. All rights reserved.`,
      terms_url: "/terms",
      privacy_url: "/privacy",
    },
    modules: allModules(true),
    prefixes: {
      appointment: "APT",
      patient: "PAT",
      invoice: "INV",
      receipt: "RCT",
      prescription: "RX",
      lab_report: "LAB",
      employee: "EMP",
      doctor: "DR",
      barcode: "BC",
    },
    payments: {
      razorpay_enabled: true,
      stripe_enabled: false,
      paypal_enabled: false,
      cash_enabled: true,
      upi_enabled: true,
      bank_transfer_enabled: true,
      insurance_enabled: true,
      custom_gateway_enabled: false,
      upi_id: "",
      bank_details: "",
    },
    email: {
      provider: "gmail",
      from_name: name,
      from_email: process.env.NEXT_PUBLIC_HOSPITAL_FROM_EMAIL || email,
      smtp_host_hint: "",
    },
    storage: {
      provider: "supabase",
      public_base_url: "",
    },
    auth_providers: {
      email_login: true,
      phone_login: true,
      otp_login: true,
      google_login: false,
      microsoft_login: false,
      apple_login: false,
      magic_link: false,
      mfa: false,
    },
    templates: {
      email_footer: `Thank you for choosing ${name}.`,
      sms_signature: name.slice(0, 20),
      whatsapp_greeting: `Hello, this is ${name}.`,
      pdf_header: name,
      pdf_footer: process.env.NEXT_PUBLIC_HOSPITAL_CITY
        ? `${name} · ${process.env.NEXT_PUBLIC_HOSPITAL_CITY}`
        : name,
      invoice_note: "Thank you for your payment.",
      prescription_note: "Follow dosage instructions carefully.",
      report_note: "This report is computer generated.",
    },
    seo: {
      meta_title: name,
      meta_description:
        process.env.NEXT_PUBLIC_HOSPITAL_TAGLINE || name,
      og_image_url: "",
      keywords: "hospital, healthcare, clinic",
    },
    social: {
      facebook: process.env.NEXT_PUBLIC_FACEBOOK_URL || "",
      instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL || "",
      youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL || "",
      twitter: process.env.NEXT_PUBLIC_TWITTER_URL || "",
      linkedin: process.env.NEXT_PUBLIC_LINKEDIN_URL || "",
    },
    working_hours: {
      opd: process.env.NEXT_PUBLIC_OPD_HOURS || "",
      emergency: process.env.NEXT_PUBLIC_EMERGENCY_HOURS || "24×7",
    },
    source: "defaults",
  };
}

export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  patch: Partial<T> | null | undefined
): T {
  if (!patch) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    const key = k as keyof T;
    if (
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof base[key] === "object" &&
      base[key] !== null &&
      !Array.isArray(base[key])
    ) {
      out[key] = deepMerge(
        base[key] as Record<string, unknown>,
        v as Record<string, unknown>
      ) as T[keyof T];
    } else {
      out[key] = v as T[keyof T];
    }
  }
  return out;
}
