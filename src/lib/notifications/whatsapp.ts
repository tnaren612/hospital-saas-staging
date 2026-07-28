/**
 * WhatsApp message helpers.
 * Automatic delivery uses Meta Cloud API (see meta-cloud-provider + whatsapp-service).
 * Manual UI deep-links (floating chat / optional buttons) may still use wa.me.
 */

export type WhatsAppConfirmPayload = {
  patientName: string;
  doctorName: string;
  departmentName?: string;
  date: string;
  timeSlot: string;
  type: string;
  bookingRef?: string;
  appointmentId?: string;
  hospitalName?: string;
};

/** Hospital WhatsApp number digits (no +). From hospital.json / env. */
export function getHospitalWhatsAppDigits(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "");
  if (fromEnv && fromEnv.length >= 10) return fromEnv;
  // Default Badvel hospital pattern from site data — override via env
  return process.env.NEXT_PUBLIC_HOSPITAL_WHATSAPP?.replace(/\D/g, "") || "";
}

export function buildAppointmentWhatsAppMessage(
  payload: WhatsAppConfirmPayload
): string {
  const hospital = payload.hospitalName || "Sri Srinivasa Hospital";
  return [
    `Hello ${payload.patientName}`,
    ``,
    `Your appointment has been confirmed.`,
    ``,
    `Hospital:`,
    hospital,
    ``,
    `Doctor:`,
    payload.doctorName || "Dr. Varaprasad Venkata Sumanth",
    ``,
    `Department:`,
    payload.departmentName || "Pulmonology",
    ``,
    `Date:`,
    payload.date,
    ``,
    `Time:`,
    payload.timeSlot,
    ``,
    `Reference:`,
    payload.appointmentId || payload.bookingRef || "—",
    ``,
    `Please arrive 10–15 minutes before your appointment.`,
    ``,
    `Thank you.`,
  ].join("\n");
}

/**
 * @deprecated Automatic booking notifications use Meta Cloud API.
 * Kept for optional manual “open WhatsApp” UI buttons only.
 */
export function buildPatientWhatsAppUrl(
  patientPhone10: string,
  payload: WhatsAppConfirmPayload
): string | null {
  const digits = patientPhone10.replace(/\D/g, "");
  if (digits.length !== 10) return null;
  const text = encodeURIComponent(buildAppointmentWhatsAppMessage(payload));
  return `https://wa.me/91${digits}?text=${text}`;
}

/**
 * @deprecated Prefer Meta Cloud API admin alerts.
 * Kept for optional staff deep-link tools.
 */
export function buildHospitalNotifyWhatsAppUrl(
  payload: WhatsAppConfirmPayload & { patientPhone: string }
): string | null {
  const hospital = getHospitalWhatsAppDigits();
  if (!hospital) return null;
  const msg = encodeURIComponent(
    [
      `New appointment booking`,
      `Patient: ${payload.patientName}`,
      `Phone: ${payload.patientPhone}`,
      `Doctor: ${payload.doctorName}`,
      payload.departmentName ? `Dept: ${payload.departmentName}` : "",
      `When: ${payload.date} ${payload.timeSlot}`,
      `Type: ${payload.type}`,
      payload.bookingRef ? `Ref: ${payload.bookingRef}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );
  const num = hospital.startsWith("91") ? hospital : `91${hospital.slice(-10)}`;
  return `https://wa.me/${num}?text=${msg}`;
}

/** True when Meta Cloud API is configured for automatic sends. */
export function isMetaWhatsAppEnabled(): boolean {
  const provider = (process.env.WHATSAPP_PROVIDER || "meta").toLowerCase();
  if (provider !== "meta" && provider !== "whatsapp_cloud") return false;
  const token = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  return Boolean(
    token && phoneId && token !== "your_whatsapp_token" && !token.includes("xxxx")
  );
}

/** @deprecated Use isMetaWhatsAppEnabled for automatic delivery. */
export function isWhatsAppOptionalEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WHATSAPP_NOTIFY !== "false";
}
