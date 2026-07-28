/**
 * Optional transactional email (Resend).
 * Configure RESEND_API_KEY + EMAIL_FROM to enable.
 * Never throws to callers — returns { sent: false } on skip/failure.
 */

export type AppointmentEmailPayload = {
  to: string;
  patientName: string;
  doctorName: string;
  departmentName?: string;
  date: string;
  timeSlot: string;
  type: string;
  bookingRef?: string;
  hospitalName?: string;
  hospitalPhone?: string;
};

function isResendConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.RESEND_API_KEY !== "your_resend_api_key"
  );
}

function isGmailConfigured(): boolean {
  const user = process.env.GMAIL_USER || "";
  const pass = process.env.GMAIL_APP_PASSWORD || "";
  return Boolean(user && pass && pass.length >= 8);
}

/** True when any free/paid email path is available (Gmail or Resend). */
export function isEmailConfigured(): boolean {
  return isGmailConfigured() || isResendConfigured();
}

function isConfigured(): boolean {
  return isResendConfigured();
}

export async function sendAppointmentConfirmationEmail(
  payload: AppointmentEmailPayload
): Promise<{ sent: boolean; id?: string; error?: string }> {
  // Prefer enterprise NotificationService (Gmail → Resend → mock)
  try {
    const { getNotificationService } = await import(
      "@/lib/notifications/notification-service"
    );
    const r = await getNotificationService().send({
      channel: "email",
      templateId: "appointment_confirmation",
      recipient: payload.to,
      force: true,
      vars: {
        patientName: payload.patientName,
        doctorName: payload.doctorName,
        departmentName: payload.departmentName,
        date: payload.date,
        timeSlot: payload.timeSlot,
        type: payload.type,
        bookingRef: payload.bookingRef,
        hospitalName: payload.hospitalName,
        hospitalPhone: payload.hospitalPhone,
      },
    });
    if (r.ok && r.status !== "skipped") {
      return { sent: true, id: r.notificationId };
    }
    if (r.provider === "mock_email") {
      // fall through to Resend if mock was used and Resend exists
    } else if (!r.ok) {
      // continue to legacy Resend path below if configured
    } else {
      return { sent: true, id: r.notificationId };
    }
  } catch {
    // fall through
  }

  if (!isConfigured()) {
    return { sent: false, error: "Email not configured (Gmail/Resend)" };
  }

  const from =
    process.env.EMAIL_FROM ||
    process.env.RESEND_FROM ||
    "Sri Srinivasa Hospital <onboarding@resend.dev>";
  const hospital = payload.hospitalName || "Sri Srinivasa Hospital";
  const phone = payload.hospitalPhone || "";

  const subject = `Appointment confirmed — ${payload.date} ${payload.timeSlot}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2 style="color:#1a5ff5">Appointment confirmed</h2>
      <p>Dear ${escapeHtml(payload.patientName)},</p>
      <p>Your appointment at <strong>${escapeHtml(hospital)}</strong> is confirmed.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Doctor</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${escapeHtml(payload.doctorName)}</strong></td></tr>
        ${
          payload.departmentName
            ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Department</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.departmentName)}</td></tr>`
            : ""
        }
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Date</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.date)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Time</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.timeSlot)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Type</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.type)}</td></tr>
        ${
          payload.bookingRef
            ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Reference</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.bookingRef)}</td></tr>`
            : ""
        }
      </table>
      <p style="color:#64748b;font-size:14px">Please arrive 10–15 minutes early. For changes, call ${escapeHtml(phone) || "the hospital"}.</p>
      <p style="margin-top:24px">— ${escapeHtml(hospital)}</p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject,
        html,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (!res.ok) {
      console.warn("[email] Resend error:", json);
      return { sent: false, error: json.message || `HTTP ${res.status}` };
    }

    return { sent: true, id: json.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Email failed";
    console.warn("[email]", message);
    return { sent: false, error: message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PaymentEmailPayload = {
  to: string;
  patientName: string;
  hospitalName?: string;
  hospitalAddress?: string;
  doctorName?: string;
  departmentName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  invoiceNumber: string;
  transactionId?: string;
  paymentMethod?: string;
  paymentReference?: string;
  amount: number;
  currency?: string;
  pdfUrl?: string;
  invoiceHtml?: string;
};

/**
 * Appointment confirmation + invoice email after successful payment.
 * Optional PDF link (Supabase Storage). Never throws.
 */
export async function sendPaymentConfirmationEmail(
  payload: PaymentEmailPayload
): Promise<{ sent: boolean; id?: string; error?: string }> {
  if (!isConfigured()) {
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const from =
    process.env.EMAIL_FROM ||
    process.env.RESEND_FROM ||
    "Sri Srinivasa Hospital <onboarding@resend.dev>";
  const hospital = payload.hospitalName || "Sri Srinivasa Hospital";
  const currency = payload.currency || "INR";
  const amountLabel =
    currency === "INR"
      ? `Rs ${Number(payload.amount || 0).toFixed(2)}`
      : `${currency} ${Number(payload.amount || 0).toFixed(2)}`;

  const subject = `Payment received — Invoice ${payload.invoiceNumber}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2 style="color:#1a5ff5">Payment confirmation</h2>
      <p>Dear ${escapeHtml(payload.patientName)},</p>
      <p>Thank you. Your payment to <strong>${escapeHtml(hospital)}</strong> was successful and your appointment is confirmed.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Invoice</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${escapeHtml(payload.invoiceNumber)}</strong></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Amount</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${escapeHtml(amountLabel)}</strong></td></tr>
        ${
          payload.paymentReference
            ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Payment ref</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.paymentReference)}</td></tr>`
            : ""
        }
        ${
          payload.transactionId
            ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Transaction ID</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.transactionId)}</td></tr>`
            : ""
        }
        ${
          payload.paymentMethod
            ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Method</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.paymentMethod)}</td></tr>`
            : ""
        }
        ${
          payload.doctorName
            ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Doctor</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.doctorName)}</td></tr>`
            : ""
        }
        ${
          payload.departmentName
            ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Department</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.departmentName)}</td></tr>`
            : ""
        }
        ${
          payload.appointmentDate
            ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Appointment</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.appointmentDate)}${payload.appointmentTime ? ` ${escapeHtml(payload.appointmentTime)}` : ""}</td></tr>`
            : ""
        }
        ${
          payload.hospitalAddress
            ? `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Hospital</td><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(payload.hospitalAddress)}</td></tr>`
            : ""
        }
      </table>
      ${
        payload.pdfUrl
          ? `<p><a href="${escapeHtml(payload.pdfUrl)}" style="display:inline-block;background:#1a5ff5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Download invoice PDF</a></p>`
          : ""
      }
      <p style="color:#64748b;font-size:14px">Please arrive 10-15 minutes early. Keep this email for your records.</p>
      <p style="margin-top:24px">— ${escapeHtml(hospital)}</p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject,
        html,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (!res.ok) {
      console.warn("[email] payment confirmation Resend error:", json);
      return { sent: false, error: json.message || `HTTP ${res.status}` };
    }

    return { sent: true, id: json.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Email failed";
    console.warn("[email] payment confirmation", message);
    return { sent: false, error: message };
  }
}
