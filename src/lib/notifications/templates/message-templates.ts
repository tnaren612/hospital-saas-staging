/**
 * Plain-text templates for WhatsApp + SMS (free channels).
 */

import type { NotificationTemplateId } from "@/lib/notifications/core/types";

type Vars = Record<string, string | number | boolean | undefined | null>;

function v(vars: Vars, key: string, fallback = ""): string {
  const val = vars[key];
  if (val === undefined || val === null || val === "") return fallback;
  return String(val);
}

function hospital(vars: Vars): string {
  return v(vars, "hospitalName", "Hospital");
}

export function renderWhatsAppMessage(
  templateId: string,
  vars: Vars
): string {
  const id = templateId as NotificationTemplateId;
  switch (id) {
    case "appointment_confirmation":
      return [
        `Hello ${v(vars, "patientName")}`,
        ``,
        `Your appointment has been confirmed.`,
        ``,
        `Hospital:`,
        hospital(vars),
        ``,
        `Doctor:`,
        v(vars, "doctorName", "Doctor"),
        ``,
        `Department:`,
        v(vars, "departmentName", "Department"),
        ``,
        `Date:`,
        v(vars, "date"),
        ``,
        `Time:`,
        v(vars, "timeSlot"),
        ``,
        `Reference:`,
        v(vars, "appointmentId") || v(vars, "bookingRef") || "—",
        ``,
        `Please arrive 10–15 minutes before your appointment.`,
        ``,
        `Thank you.`,
      ].join("\n");

    case "appointment_reminder":
      return (
        `Reminder (${v(vars, "window", "soon")}): ${v(vars, "patientName")}, ` +
        `appointment with ${v(vars, "doctorName")} on ${v(vars, "date")} ` +
        `at ${v(vars, "timeSlot")}. — ${hospital(vars)}`
      );

    case "appointment_cancelled":
      return (
        `Your appointment on ${v(vars, "date")} ${v(vars, "timeSlot")} ` +
        `with ${v(vars, "doctorName")} was cancelled. — ${hospital(vars)}`
      );

    case "appointment_rescheduled":
      return (
        `Rescheduled: ${v(vars, "patientName")} with ${v(vars, "doctorName")} ` +
        `now on ${v(vars, "date")} at ${v(vars, "timeSlot")}. — ${hospital(vars)}`
      );

    case "payment_success":
      return (
        `${hospital(vars)}: Payment ${v(vars, "amountLabel", `Rs ${v(vars, "amount")}`)} received. ` +
        `Invoice ${v(vars, "invoiceNumber")}. Thank you, ${v(vars, "patientName")}.`
      );

    case "payment_failed":
      return (
        `${hospital(vars)}: Payment could not be completed` +
        (v(vars, "reason") ? ` (${v(vars, "reason")})` : "") +
        `. Please retry or visit reception.`
      );

    case "invoice":
      return (
        `${hospital(vars)} Invoice ${v(vars, "invoiceNumber")}: ` +
        `${v(vars, "amountLabel", v(vars, "amount"))}. ` +
        (v(vars, "pdfUrl") ? `PDF: ${v(vars, "pdfUrl")}` : "Collect from reception.")
      );

    case "prescription_ready":
      return [
        `Hello ${v(vars, "patientName")},`,
        ``,
        `Your prescription is ready.`,
        `Doctor: ${v(vars, "doctorName", "Doctor")}`,
        v(vars, "bookingRef") ? `Rx Ref: ${v(vars, "bookingRef")}` : "",
        ``,
        `You can view/print it from the patient portal or collect at reception.`,
        `— ${hospital(vars)}`,
      ]
        .filter(Boolean)
        .join("\n");

    case "lab_report_ready":
      return [
        `Hello ${v(vars, "patientName")},`,
        ``,
        `Your lab report is ready.`,
        `Report: ${v(vars, "reportTitle", "Lab Report")}`,
        v(vars, "bookingRef") ? `Ref: ${v(vars, "bookingRef")}` : "",
        ``,
        `Please download from the portal or collect at the lab counter.`,
        `— ${hospital(vars)}`,
      ]
        .filter(Boolean)
        .join("\n");

    case "bill_generated":
      return [
        `Hello ${v(vars, "patientName")},`,
        ``,
        `Your hospital bill has been generated.`,
        `Bill: ${v(vars, "invoiceNumber", v(vars, "bookingRef"))}`,
        `Amount: ${v(vars, "amountLabel", `Rs ${v(vars, "amount")}`)}`,
        `Status: ${v(vars, "status", "pending")}`,
        ``,
        `— ${hospital(vars)}`,
      ].join("\n");

    case "emergency":
      return (
        `URGENT — ${hospital(vars)}: ${v(vars, "message", "Please contact the hospital immediately.")} ` +
        `Call ${v(vars, "emergencyPhone", "reception")}.`
      );

    case "doctor_contact":
      return (
        `${hospital(vars)} — ${v(vars, "doctorName", "Doctor")}: ` +
        `${v(vars, "message", "Please contact the hospital.")}`
      );

    case "patient_registration":
    case "welcome":
      return (
        `Welcome ${v(vars, "patientName")} to ${hospital(vars)}. ` +
        `Your registration is complete. Book appointments online anytime.`
      );

    case "password_reset":
      return (
        `${hospital(vars)}: Password reset link: ${v(vars, "resetUrl")}`
      );

    default:
      return v(vars, "message", `Message from ${hospital(vars)}`);
  }
}

/** SMS — keep under ~160 chars when possible */
export function renderSmsMessage(templateId: string, vars: Vars): string {
  const id = templateId as NotificationTemplateId;
  const h = v(vars, "smsSignature", hospital(vars)).slice(0, 20);
  switch (id) {
    case "appointment_confirmation":
      return `${h}: Appt confirmed ${v(vars, "date")} ${v(vars, "timeSlot")} w/ ${v(vars, "doctorName")}.${v(vars, "bookingRef") ? ` Ref:${v(vars, "bookingRef")}` : ""}`;
    case "appointment_reminder":
      return `${h}: Reminder ${v(vars, "window", "")} ${v(vars, "date")} ${v(vars, "timeSlot")} Dr ${v(vars, "doctorName")}. Arrive 10min early.`.trim();
    case "payment_success":
      return `${h}: Paid Rs ${v(vars, "amount")} Inv ${v(vars, "invoiceNumber")}. Thanks ${v(vars, "patientName")}.`;
    case "payment_failed":
      return `${h}: Payment failed. Retry online or at reception.`;
    case "invoice":
      return `${h}: Invoice ${v(vars, "invoiceNumber")} Rs ${v(vars, "amount")}.`;
    case "lab_report_ready":
      return `${h}: Lab report ready. Check portal/reception.`;
    case "prescription_ready":
      return `${h}: Prescription ready for collection.`;
    case "emergency":
      return `${h} URGENT: ${v(vars, "message", "Contact hospital now.")}`.slice(0, 160);
    default:
      return `${h}: ${v(vars, "message", "Notification").slice(0, 140)}`;
  }
}
