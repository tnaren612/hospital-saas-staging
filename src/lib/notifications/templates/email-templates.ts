/**
 * HTML-responsive email templates (free, no external assets required).
 */

import type { NotificationTemplateId, RenderedTemplate } from "@/lib/notifications/core/types";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title: string, bodyHtml: string, hospitalName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.08)">
        <tr><td style="background:linear-gradient(135deg,#142257,#1a5ff5 55%,#0d9488);padding:20px 24px;color:#fff">
          <div style="font-size:18px;font-weight:700">${esc(hospitalName)}</div>
          <div style="font-size:12px;opacity:.9;margin-top:4px">Pulmonology · Respiratory Care · Badvel</div>
        </td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${esc(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f8fafc;font-size:12px;color:#64748b;line-height:1.5">
          This is an automated message from ${esc(hospitalName)}. For emergencies call the hospital immediately.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function rows(pairs: [string, string][]): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
    ${pairs
      .map(
        ([k, v]) =>
          `<tr>
            <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;width:40%">${esc(k)}</td>
            <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600">${esc(v)}</td>
          </tr>`
      )
      .join("")}
  </table>`;
}

type Vars = Record<string, string | number | boolean | undefined | null>;

function v(vars: Vars, key: string, fallback = ""): string {
  const val = vars[key];
  if (val === undefined || val === null || val === "") return fallback;
  return String(val);
}

function hospital(vars: Vars): string {
  return v(vars, "hospitalName", "Sri Srinivasa Hospital");
}

const builders: Record<
  NotificationTemplateId,
  (vars: Vars) => RenderedTemplate
> = {
  welcome: (vars) => {
    const subject = `Welcome to ${hospital(vars)}`;
    const text = `Welcome ${v(vars, "patientName")}. Thank you for registering with ${hospital(vars)}.`;
    const html = layout(
      "Welcome",
      `<p>Dear ${esc(v(vars, "patientName"))},</p>
       <p>Welcome to <strong>${esc(hospital(vars))}</strong>. Your patient profile is ready.</p>
       <p style="color:#64748b;font-size:14px">You can book appointments online and manage care from the patient portal.</p>`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  appointment_confirmation: (vars) => {
    const subject = `Appointment confirmed — ${v(vars, "date")} ${v(vars, "timeSlot")}`;
    const text = `Appointment confirmed for ${v(vars, "patientName")} with ${v(vars, "doctorName")} on ${v(vars, "date")} at ${v(vars, "timeSlot")}. Ref: ${v(vars, "bookingRef")}`;
    const html = layout(
      "Appointment confirmed",
      `<p>Dear ${esc(v(vars, "patientName"))},</p>
       <p>Your appointment is confirmed.</p>
       ${rows([
         ["Doctor", v(vars, "doctorName")],
         ["Department", v(vars, "departmentName", "—")],
         ["Date", v(vars, "date")],
         ["Time", v(vars, "timeSlot")],
         ["Type", v(vars, "type", "in-person")],
         ["Reference", v(vars, "bookingRef", "—")],
       ])}
       <p style="color:#64748b;font-size:14px">Please arrive 10–15 minutes early.</p>`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  appointment_reminder: (vars) => {
    const windowLabel = v(vars, "window", "soon");
    const subject = `Reminder (${windowLabel}): appointment ${v(vars, "date")} ${v(vars, "timeSlot")}`;
    const text = `Reminder: ${v(vars, "patientName")}, appointment with ${v(vars, "doctorName")} on ${v(vars, "date")} at ${v(vars, "timeSlot")}.`;
    const html = layout(
      "Appointment reminder",
      `<p>Dear ${esc(v(vars, "patientName"))},</p>
       <p>This is a reminder for your upcoming appointment (${esc(windowLabel)}).</p>
       ${rows([
         ["Doctor", v(vars, "doctorName")],
         ["Date", v(vars, "date")],
         ["Time", v(vars, "timeSlot")],
         ["Type", v(vars, "type", "in-person")],
       ])}`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  appointment_cancelled: (vars) => {
    const subject = `Appointment cancelled — ${v(vars, "date")}`;
    const text = `Your appointment on ${v(vars, "date")} at ${v(vars, "timeSlot")} was cancelled.`;
    const html = layout(
      "Appointment cancelled",
      `<p>Dear ${esc(v(vars, "patientName"))},</p>
       <p>Your appointment has been cancelled.</p>
       ${rows([
         ["Doctor", v(vars, "doctorName")],
         ["Date", v(vars, "date")],
         ["Time", v(vars, "timeSlot")],
         ["Reason", v(vars, "reason", "—")],
       ])}
       <p>You may book a new slot online anytime.</p>`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  appointment_rescheduled: (vars) => {
    const subject = `Appointment rescheduled — ${v(vars, "date")} ${v(vars, "timeSlot")}`;
    const text = `Rescheduled to ${v(vars, "date")} ${v(vars, "timeSlot")} with ${v(vars, "doctorName")}.`;
    const html = layout(
      "Appointment rescheduled",
      `<p>Dear ${esc(v(vars, "patientName"))},</p>
       <p>Your appointment has been rescheduled.</p>
       ${rows([
         ["Doctor", v(vars, "doctorName")],
         ["New date", v(vars, "date")],
         ["New time", v(vars, "timeSlot")],
         ["Previous", `${v(vars, "oldDate", "—")} ${v(vars, "oldTime", "")}`.trim()],
       ])}`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  payment_success: (vars) => {
    const subject = `Payment received — Invoice ${v(vars, "invoiceNumber")}`;
    const text = `Payment of ${v(vars, "amountLabel", v(vars, "amount"))} received. Invoice ${v(vars, "invoiceNumber")}.`;
    const html = layout(
      "Payment successful",
      `<p>Dear ${esc(v(vars, "patientName"))},</p>
       <p>We received your payment. Thank you.</p>
       ${rows([
         ["Invoice", v(vars, "invoiceNumber")],
         ["Amount", v(vars, "amountLabel", v(vars, "amount"))],
         ["Method", v(vars, "paymentMethod", "—")],
         ["Transaction", v(vars, "transactionId", "—")],
         ["Doctor", v(vars, "doctorName", "—")],
       ])}`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  payment_failed: (vars) => {
    const subject = `Payment failed — ${v(vars, "invoiceNumber", "attempt")}`;
    const text = `Payment failed for ${v(vars, "patientName")}. Reason: ${v(vars, "reason", "unknown")}.`;
    const html = layout(
      "Payment failed",
      `<p>Dear ${esc(v(vars, "patientName"))},</p>
       <p>We could not complete your payment.</p>
       ${rows([
         ["Amount", v(vars, "amountLabel", v(vars, "amount", "—"))],
         ["Reason", v(vars, "reason", "Payment declined or cancelled")],
       ])}
       <p>You can retry payment from the patient portal or reception.</p>`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  invoice: (vars) => {
    const subject = `Invoice ${v(vars, "invoiceNumber")} — ${hospital(vars)}`;
    const text = `Invoice ${v(vars, "invoiceNumber")} total ${v(vars, "amountLabel", v(vars, "amount"))}.`;
    const pdfLink = v(vars, "pdfUrl");
    const html = layout(
      "Invoice",
      `<p>Dear ${esc(v(vars, "patientName"))},</p>
       <p>Please find your invoice details below.</p>
       ${rows([
         ["Invoice", v(vars, "invoiceNumber")],
         ["Amount", v(vars, "amountLabel", v(vars, "amount"))],
         ["Status", v(vars, "status", "—")],
       ])}
       ${
         pdfLink
           ? `<p><a href="${esc(pdfLink)}" style="display:inline-block;background:#1a5ff5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Download PDF</a></p>`
           : ""
       }`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  password_reset: (vars) => {
    const subject = `Password reset — ${hospital(vars)}`;
    const text = `Reset your password using this link: ${v(vars, "resetUrl")}`;
    const html = layout(
      "Password reset",
      `<p>Dear ${esc(v(vars, "patientName", "User"))},</p>
       <p>We received a request to reset your password.</p>
       <p><a href="${esc(v(vars, "resetUrl"))}" style="display:inline-block;background:#1a5ff5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Reset password</a></p>
       <p style="color:#64748b;font-size:14px">If you did not request this, ignore this email.</p>`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  lab_report_ready: (vars) => {
    const subject = `Lab report ready — ${v(vars, "reportTitle", "Report")}`;
    const text = `Your lab report "${v(vars, "reportTitle")}" is ready.`;
    const html = layout(
      "Lab report ready",
      `<p>Dear ${esc(v(vars, "patientName"))},</p>
       <p>Your laboratory report is ready for review.</p>
       ${rows([
         ["Report", v(vars, "reportTitle", "Lab report")],
         ["Date", v(vars, "date", "—")],
       ])}
       <p style="color:#64748b;font-size:14px">Log in to the patient portal or visit reception to collect.</p>`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  prescription_ready: (vars) => {
    const subject = `Prescription ready — ${hospital(vars)}`;
    const text = `Your prescription from ${v(vars, "doctorName", "your doctor")} is ready.`;
    const html = layout(
      "Prescription ready",
      `<p>Dear ${esc(v(vars, "patientName"))},</p>
       <p>Your prescription is ready.</p>
       ${rows([
         ["Doctor", v(vars, "doctorName", "—")],
         ["Date", v(vars, "date", "—")],
       ])}`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  emergency: (vars) => {
    const subject = `URGENT — ${v(vars, "subject", "Emergency notice")}`;
    const text = v(vars, "message", "Emergency notification from the hospital.");
    const html = layout(
      "Emergency notification",
      `<p style="color:#dc2626;font-weight:700">Urgent notice</p>
       <p>${esc(v(vars, "message", "Please contact the hospital immediately."))}</p>
       <p>Emergency phone: <strong>${esc(v(vars, "emergencyPhone", "8121864863"))}</strong></p>`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  doctor_contact: (vars) => {
    const subject = `Message regarding ${v(vars, "patientName", "patient")}`;
    const text = v(vars, "message", "Please contact the hospital.");
    const html = layout(
      "Doctor contact",
      `<p>${esc(v(vars, "message"))}</p>
       ${rows([
         ["Doctor", v(vars, "doctorName", "—")],
         ["Patient", v(vars, "patientName", "—")],
       ])}`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  patient_registration: (vars) => {
    const subject = `Registration complete — ${hospital(vars)}`;
    const text = `Hi ${v(vars, "patientName")}, your registration is complete.`;
    const html = layout(
      "Registration complete",
      `<p>Dear ${esc(v(vars, "patientName"))},</p>
       <p>Your registration at ${esc(hospital(vars))} is complete.</p>
       ${rows([
         ["Phone", v(vars, "phone", "—")],
         ["Email", v(vars, "email", "—")],
       ])}`,
      hospital(vars)
    );
    return { subject, text, html };
  },

  generic: (vars) => {
    const subject = v(vars, "subject", `Message from ${hospital(vars)}`);
    const text = v(vars, "message", "");
    const html = layout(
      subject,
      `<p>${esc(text).replace(/\n/g, "<br/>")}</p>`,
      hospital(vars)
    );
    return { subject, text, html };
  },
};

export class EmailTemplateService {
  render(
    templateId: string,
    vars: Record<string, string | number | boolean | undefined | null>
  ): RenderedTemplate {
    const id = (templateId || "generic") as NotificationTemplateId;
    const builder = builders[id] || builders.generic;
    return builder(vars);
  }

  listTemplateIds(): string[] {
    return Object.keys(builders);
  }
}

export const emailTemplateService = new EmailTemplateService();
