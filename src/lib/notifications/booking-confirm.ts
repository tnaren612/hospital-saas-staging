/**
 * Appointment confirmation fan-out:
 *   Save (caller) → Email → Meta WhatsApp (automatic) → log
 */

import { sendAppointmentConfirmationEmail } from "@/lib/notifications/email";
import { getNotificationService } from "@/lib/notifications/notification-service";

export type BookingConfirmInput = {
  patientName: string;
  phone: string;
  email: string;
  doctorName: string;
  departmentName?: string;
  date: string;
  timeSlot: string;
  type?: string;
  bookingRef?: string;
  appointmentId?: string | null;
  hospitalName?: string;
  hospitalPhone?: string;
};

export type BookingConfirmResult = {
  email: { sent: boolean; error?: string; id?: string };
  whatsapp: {
    provider: string;
    channel: "whatsapp";
    status: string;
    ok: boolean;
    messageId?: string;
    notificationId?: string;
    error?: string;
  };
};

/**
 * Send confirmation email + automatic Meta WhatsApp after appointment is saved.
 * Never throws — returns status for each channel.
 */
export async function sendBookingConfirmations(
  input: BookingConfirmInput
): Promise<BookingConfirmResult> {
  const hospitalName = input.hospitalName || "Sri Srinivasa Hospital";
  const doctorName =
    input.doctorName || "Dr. Varaprasad Venkata Sumanth";
  const departmentName = input.departmentName || "Pulmonology";
  const bookingRef = input.bookingRef || input.appointmentId || "";

  // 1) Email
  let email: BookingConfirmResult["email"] = { sent: false };
  try {
    const r = await sendAppointmentConfirmationEmail({
      to: input.email.toLowerCase().trim(),
      patientName: input.patientName,
      doctorName,
      departmentName,
      date: input.date,
      timeSlot: input.timeSlot,
      type: input.type || "in-person",
      bookingRef: bookingRef || undefined,
      hospitalName,
      hospitalPhone: input.hospitalPhone,
    });
    email = { sent: r.sent, error: r.error, id: r.id };
  } catch (e) {
    email = {
      sent: false,
      error: e instanceof Error ? e.message : "Email failed",
    };
  }

  // 2) WhatsApp Meta Cloud API (automatic — not wa.me)
  let whatsapp: BookingConfirmResult["whatsapp"] = {
    provider: "meta",
    channel: "whatsapp",
    status: "failed",
    ok: false,
  };

  try {
    const phone = String(input.phone || "").trim();
    if (!phone || phone.replace(/\D/g, "").length < 10) {
      whatsapp = {
        provider: "meta",
        channel: "whatsapp",
        status: "failed",
        ok: false,
        error: "Invalid patient phone for WhatsApp",
      };
    } else {
      const notify = getNotificationService();
      const wa = await notify.send({
        channel: "whatsapp",
        templateId: "appointment_confirmation",
        recipient: phone,
        force: true,
        patientId: null,
        appointmentId: input.appointmentId
          ? String(input.appointmentId)
          : null,
        provider: "meta",
        vars: {
          patientName: input.patientName,
          doctorName,
          departmentName,
          date: input.date,
          timeSlot: input.timeSlot,
          type: input.type || "in-person",
          bookingRef,
          appointmentId: input.appointmentId || bookingRef,
          hospitalName,
        },
        meta: {
          source: "appointment_booking",
          booking_ref: bookingRef,
          vars: {
            patientName: input.patientName,
            doctorName,
            date: input.date,
            timeSlot: input.timeSlot,
          },
        },
      });

      whatsapp = {
        provider: wa.provider || "meta",
        channel: "whatsapp",
        status: wa.ok ? "sent" : wa.status || "failed",
        ok: Boolean(wa.ok),
        messageId: wa.messageId,
        notificationId: wa.notificationId,
        error: wa.error,
      };
    }
  } catch (e) {
    whatsapp = {
      provider: "meta",
      channel: "whatsapp",
      status: "failed",
      ok: false,
      error: e instanceof Error ? e.message : "WhatsApp failed",
    };
  }

  console.info(
    JSON.stringify({
      type: "booking_confirmations",
      email: email.sent,
      whatsapp: whatsapp.ok,
      whatsappProvider: whatsapp.provider,
      whatsappError: whatsapp.error || null,
      bookingRef,
      ts: new Date().toISOString(),
    })
  );

  return { email, whatsapp };
}
