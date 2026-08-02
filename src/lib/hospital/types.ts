/**
 * Multi-hospital configuration contract.
 * All keys optional in partial updates; merged with defaults at runtime.
 */

export const HOSPITAL_TYPES = [
  "clinic",
  "diagnostic_center",
  "dental_clinic",
  "eye_hospital",
  "children_hospital",
  "cardiology",
  "orthopedic",
  "cancer_hospital",
  "government_hospital",
  "private_hospital",
  "multi_specialty",
  "super_specialty",
  "veterinary",
  "home_care",
  "telemedicine",
] as const;

export type HospitalType = (typeof HOSPITAL_TYPES)[number];

export const MODULE_KEYS = [
  "appointments",
  "reception",
  "doctors",
  "patients",
  "laboratory",
  "radiology",
  "pharmacy",
  "inventory",
  "billing",
  "finance",
  "insurance",
  "hr",
  "payroll",
  "attendance",
  "ambulance",
  "emergency",
  "blood_bank",
  "dialysis",
  "operation_theatre",
  "icu",
  "ipd",
  "opd",
  "reports",
  "cms",
  "notifications",
  "api",
  "telemedicine",
  "video_consultation",
  "online_booking",
  "patient_portal",
  "doctor_portal",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type HospitalBranding = {
  name: string;
  tagline: string;
  logo_url: string;
  favicon_url: string;
  banner_url: string;
  primary_color: string;
  secondary_color: string;
  theme: "default" | "clinical" | "warm" | "custom";
  dark_mode_default: boolean;
  watermark_url: string;
  digital_signature_url: string;
  loading_logo_url: string;
};

export type HospitalContact = {
  email: string;
  support_email: string;
  billing_email: string;
  phones: string[];
  emergency_phone: string;
  whatsapp: string;
  website: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  maps_url: string;
  lat: number | null;
  lng: number | null;
};

export type HospitalLocalization = {
  timezone: string;
  language: string;
  currency: string;
  currency_symbol: string;
  date_format: string;
  time_format: "12h" | "24h";
  week_start: "sunday" | "monday";
  financial_year_start_month: number;
};

export type HospitalLegal = {
  tax_percent: number;
  gst_number: string;
  pan_number: string;
  license_number: string;
  registration_number: string;
  nabh_number: string;
  nabl_number: string;
  footer_text: string;
  terms_url: string;
  privacy_url: string;
};

export type HospitalPrefixes = {
  appointment: string;
  patient: string;
  invoice: string;
  receipt: string;
  prescription: string;
  lab_report: string;
  employee: string;
  doctor: string;
  barcode: string;
};

export type HospitalPayments = {
  razorpay_enabled: boolean;
  stripe_enabled: boolean;
  paypal_enabled: boolean;
  cash_enabled: boolean;
  upi_enabled: boolean;
  bank_transfer_enabled: boolean;
  insurance_enabled: boolean;
  custom_gateway_enabled: boolean;
  upi_id: string;
  bank_details: string;
};

export type HospitalEmailConfig = {
  provider: "gmail" | "smtp" | "sendgrid" | "mailgun" | "ses" | "microsoft" | "resend" | "none";
  from_name: string;
  from_email: string;
  /** Non-secret hints only — secrets stay in env / vault */
  smtp_host_hint: string;
};

export type HospitalStorageConfig = {
  provider: "supabase" | "s3" | "r2" | "azure" | "gcs" | "local";
  public_base_url: string;
};

export type HospitalAuthConfig = {
  email_login: boolean;
  phone_login: boolean;
  otp_login: boolean;
  google_login: boolean;
  microsoft_login: boolean;
  apple_login: boolean;
  magic_link: boolean;
  mfa: boolean;
};

export type HospitalSeo = {
  meta_title: string;
  meta_description: string;
  og_image_url: string;
  keywords: string;
};

export type HospitalSocial = {
  facebook: string;
  instagram: string;
  youtube: string;
  twitter: string;
  linkedin: string;
};

export type HospitalWorkingHours = {
  opd: string;
  emergency: string;
};

export type HospitalTemplates = {
  email_footer: string;
  sms_signature: string;
  whatsapp_greeting: string;
  pdf_header: string;
  pdf_footer: string;
  invoice_note: string;
  prescription_note: string;
  report_note: string;
};

export type ModuleFlags = Record<ModuleKey, boolean>;

export type HospitalConfig = {
  hospital_id: string | null;
  slug: string;
  hospital_type: HospitalType;
  /** Data Management & Import/Export engine configuration. */
  data_management: import("@/lib/datahub/types").DataManagementConfig;
  branding: HospitalBranding;
  contact: HospitalContact;
  localization: HospitalLocalization;
  legal: HospitalLegal;
  modules: ModuleFlags;
  prefixes: HospitalPrefixes;
  payments: HospitalPayments;
  email: HospitalEmailConfig;
  storage: HospitalStorageConfig;
  auth_providers: HospitalAuthConfig;
  templates: HospitalTemplates;
  seo: HospitalSeo;
  social: HospitalSocial;
  working_hours: HospitalWorkingHours;
  source: "database" | "defaults" | "demo";
  updated_at?: string;
};

export type HospitalSettingsPatch = {
  name?: string;
  hospital_type?: HospitalType;
  data_management?: Partial<
    import("@/lib/datahub/types").DataManagementConfig
  >;
  branding?: Partial<HospitalBranding>;
  contact?: Partial<HospitalContact>;
  localization?: Partial<HospitalLocalization>;
  legal?: Partial<HospitalLegal>;
  modules?: Partial<ModuleFlags>;
  prefixes?: Partial<HospitalPrefixes>;
  payments?: Partial<HospitalPayments>;
  email?: Partial<HospitalEmailConfig>;
  storage?: Partial<HospitalStorageConfig>;
  auth_providers?: Partial<HospitalAuthConfig>;
  templates?: Partial<HospitalTemplates>;
  seo?: Partial<HospitalSeo>;
  social?: Partial<HospitalSocial>;
  working_hours?: Partial<HospitalWorkingHours>;
};
