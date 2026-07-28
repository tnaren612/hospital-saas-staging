/**
 * WhatsApp phone normalization + optional manual deep-link helpers.
 * Automatic booking notifications use Meta Cloud API (meta-cloud-provider).
 * This module is NOT registered as an auto-send provider.
 */

export function normalizeWhatsAppDigits(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 10) d = `91${d}`;
  return d;
}

/** Manual UI only (floating chat / optional buttons). Not used for booking auto-send. */
export function generateWhatsAppLink(phone: string, text: string): string {
  const digits = normalizeWhatsAppDigits(phone);
  if (digits.length < 11) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function getHospitalWhatsAppNumber(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_HOSPITAL_WHATSAPP ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    "";
  return normalizeWhatsAppDigits(fromEnv);
}
