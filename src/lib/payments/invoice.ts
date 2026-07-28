/**
 * Invoice numbering + HTML invoice document (print / save as PDF).
 * No card data. No external PDF binary dependency.
 */

import type {
  InvoiceLineItem,
  InvoiceRecord,
  PaymentSettings,
} from "@/lib/payments/types";

export function buildInvoiceNumber(prefix: string, seq: number): string {
  const y = new Date().getFullYear();
  const n = String(seq).padStart(5, "0");
  return `${prefix || "SSH-INV"}-${y}-${n}`;
}

export type InvoiceHtmlExtras = {
  paymentMethod?: string;
  transactionId?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  logoUrl?: string;
};

export function buildInvoiceHtml(
  invoice: InvoiceRecord,
  settings: PaymentSettings,
  extras?: InvoiceHtmlExtras
): string {
  const rows = (invoice.line_items || [])
    .map(
      (li) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0">${escape(li.description)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center">${li.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">${fmt(li.unit_price, invoice.currency)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">${fmt(li.amount, invoice.currency)}</td>
      </tr>`
    )
    .join("");

  const qrData = encodeURIComponent(
    `INV:${invoice.invoice_number}|AMT:${invoice.grand_total}|${invoice.patient_phone}`
  );

  const logoUrl =
    extras?.logoUrl ||
    (process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/assets/images/hospital/logo.svg`
      : "/assets/images/hospital/logo.svg");

  const apptLine =
    extras?.appointmentDate
      ? `${extras.appointmentDate}${extras.appointmentTime ? ` ${extras.appointmentTime}` : ""}`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escape(invoice.invoice_number)}</title>
  <style>
    body { font-family: system-ui, Segoe UI, sans-serif; color: #0f172a; max-width: 800px; margin: 24px auto; padding: 0 16px; }
    h1 { color: #1a5ff5; margin: 0; }
    .muted { color: #64748b; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .totals td { padding: 6px 8px; }
    .badge { display:inline-block; padding:4px 10px; border-radius:999px; background:#ecfdf5; color:#047857; font-size:12px; font-weight:600; }
    @media print { .no-print { display:none } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <header style="display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #1a5ff5;padding-bottom:16px">
    <div style="display:flex;gap:12px;align-items:flex-start">
      <img src="${escape(logoUrl)}" alt="Hospital logo" width="56" height="56" style="object-fit:contain" />
      <div>
        <h1>${escape(settings.hospital_name)}</h1>
        <p class="muted">${escape(settings.hospital_address)}</p>
        ${settings.gstin ? `<p class="muted">GSTIN: ${escape(settings.gstin)}</p>` : ""}
      </div>
    </div>
    <div style="text-align:right">
      <div class="badge">${escape(invoice.status.toUpperCase())}</div>
      <p style="font-size:20px;font-weight:700;margin:8px 0 0">TAX INVOICE</p>
      <p class="muted">${escape(invoice.invoice_number)}</p>
      <p class="muted">${new Date(invoice.created_at).toLocaleString("en-IN")}</p>
    </div>
  </header>

  <section style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px">
    <div>
      <p style="font-weight:600;margin:0 0 6px">Bill To</p>
      <p style="margin:0">${escape(invoice.patient_name)}</p>
      <p class="muted">${escape(invoice.patient_phone)}</p>
      <p class="muted">${escape(invoice.patient_email)}</p>
    </div>
    <div>
      <p style="font-weight:600;margin:0 0 6px">Service</p>
      <p class="muted">Doctor: ${escape(invoice.doctor_name || "-")}</p>
      <p class="muted">Department: ${escape(invoice.department_name || "-")}</p>
      <p class="muted">Package: ${escape(invoice.package_name || "-")}</p>
      ${apptLine ? `<p class="muted">Appointment: ${escape(apptLine)}</p>` : ""}
      ${extras?.paymentMethod ? `<p class="muted">Payment method: ${escape(extras.paymentMethod)}</p>` : ""}
      ${extras?.transactionId ? `<p class="muted">Transaction ID: ${escape(extras.transactionId)}</p>` : ""}
    </div>
  </section>

  <table>
    <thead>
      <tr style="background:#f8fafc">
        <th style="text-align:left;padding:8px">Description</th>
        <th style="padding:8px">Qty</th>
        <th style="text-align:right;padding:8px">Rate</th>
        <th style="text-align:right;padding:8px">Amount</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="4" style="padding:12px" class="muted">Consultation / package services</td></tr>`}</tbody>
  </table>

  <table class="totals" style="width:280px;margin-left:auto;margin-top:16px">
    <tr><td class="muted">Subtotal</td><td style="text-align:right">${fmt(invoice.subtotal, invoice.currency)}</td></tr>
    <tr><td class="muted">Discount</td><td style="text-align:right">- ${fmt(invoice.discount, invoice.currency)}</td></tr>
    <tr><td class="muted">Tax</td><td style="text-align:right">${fmt(invoice.tax, invoice.currency)}</td></tr>
    <tr><td style="font-weight:700;border-top:1px solid #cbd5e1">Grand Total</td>
        <td style="text-align:right;font-weight:700;border-top:1px solid #cbd5e1">${fmt(invoice.grand_total, invoice.currency)}</td></tr>
  </table>

  <section style="margin-top:28px;display:flex;justify-content:space-between;gap:16px;align-items:flex-end">
    <div>
      <p style="font-weight:600;margin:0 0 6px">Terms &amp; Conditions</p>
      <p class="muted" style="max-width:420px">${escape(settings.terms || invoice.notes)}</p>
    </div>
    <div style="text-align:center">
      <img alt="Invoice QR" width="96" height="96"
        src="https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${qrData}" />
      <p class="muted">Scan for reference</p>
    </div>
  </section>

  <footer class="muted" style="margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px">
    Computer-generated invoice · ${escape(settings.hospital_name)} · Thank you for choosing us.
  </footer>
</body>
</html>`;
}

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(Number(n) || 0);
  } catch {
    return `₹${Number(n || 0).toFixed(2)}`;
  }
}

function escape(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function defaultLineItems(input: {
  description: string;
  amount: number;
}): InvoiceLineItem[] {
  return [
    {
      description: input.description,
      quantity: 1,
      unit_price: input.amount,
      amount: input.amount,
    },
  ];
}
