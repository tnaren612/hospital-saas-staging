/**
 * Optional SMS via MSG91 (India DLT-friendly).
 * Configure MSG91_AUTH_KEY + MSG91_SENDER_ID to enable.
 * Never throws — returns { sent: false } on skip/failure.
 */

export type SmsPayload = {
  to: string;
  message: string;
  templateId?: string;
};

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function isSmsConfigured(): boolean {
  const key = process.env.MSG91_AUTH_KEY || "";
  return Boolean(key && key !== "your_msg91_key");
}

export async function sendSms(
  payload: SmsPayload
): Promise<{ sent: boolean; id?: string; error?: string }> {
  if (!isSmsConfigured()) {
    return { sent: false, error: "MSG91_AUTH_KEY not configured" };
  }

  const mobile = digitsOnly(payload.to);
  if (mobile.length < 10) {
    return { sent: false, error: "Invalid mobile number" };
  }

  const mobiles = mobile.length === 10 ? `91${mobile}` : mobile;
  const sender = process.env.MSG91_SENDER_ID || "SSHOSP";
  const authKey = process.env.MSG91_AUTH_KEY!;

  try {
    // MSG91 Flow API (v5) — simple transactional send
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        authkey: authKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        template_id: payload.templateId || process.env.MSG91_TEMPLATE_ID || "",
        short_url: "0",
        recipients: [
          {
            mobiles,
            // Fallback: if no DLT template vars, some accounts use raw route
            VAR1: payload.message.slice(0, 30),
          },
        ],
        // Also support route 4 style when template empty — best-effort
        sender,
        message: payload.message,
        route: "4",
        mobiles,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      type?: string;
      message?: string;
      request_id?: string;
    };

    if (!res.ok) {
      return {
        sent: false,
        error: json.message || `MSG91 HTTP ${res.status}`,
      };
    }

    // If template_id missing MSG91 may error — treat as soft fail
    if (json.type === "error") {
      return { sent: false, error: json.message || "MSG91 error" };
    }

    return { sent: true, id: json.request_id || json.message };
  } catch (e) {
    const message = e instanceof Error ? e.message : "SMS failed";
    return { sent: false, error: message };
  }
}

/** Build short payment receipt SMS (160-ish chars friendly). */
export function buildPaymentSms(input: {
  patientName: string;
  amount: number;
  invoiceNumber: string;
  hospitalName?: string;
}): string {
  const hospital = input.hospitalName || "Sri Srinivasa Hospital";
  return (
    `${hospital}: Payment Rs ${Number(input.amount).toFixed(0)} received. ` +
    `Invoice ${input.invoiceNumber}. Thank you, ${input.patientName}.`
  );
}

export function buildAppointmentSms(input: {
  patientName: string;
  doctorName: string;
  date: string;
  timeSlot: string;
  bookingRef?: string;
}): string {
  const ref = input.bookingRef ? ` Ref:${input.bookingRef}` : "";
  return (
    `SSH Hospital: Appt confirmed for ${input.patientName} with ${input.doctorName} ` +
    `on ${input.date} ${input.timeSlot}.${ref}`
  );
}
