/**
 * Minimal pure-ASCII PDF invoice builder (no external PDF dependency).
 * Produces a valid single-page PDF with hospital/invoice/payment details.
 */

import type { InvoiceRecord, PaymentRecord, PaymentSettings } from "@/lib/payments/types";

function escapePdfText(s: string): string {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

function money(n: number, currency: string): string {
  const c = currency || "INR";
  const v = Number(n || 0).toFixed(2);
  return c === "INR" ? `Rs ${v}` : `${c} ${v}`;
}

/**
 * Build a simple multi-line invoice PDF as a Buffer.
 */
export function buildInvoicePdf(input: {
  invoice: InvoiceRecord;
  settings: PaymentSettings;
  payment?: PaymentRecord | null;
  appointmentDate?: string;
  appointmentTime?: string;
  logoNote?: string;
}): Buffer {
  const { invoice, settings, payment } = input;
  const lines: string[] = [
    settings.hospital_name || "Hospital",
    settings.hospital_address || "",
    settings.gstin ? `GSTIN: ${settings.gstin}` : "",
    "",
    "TAX INVOICE",
    `Invoice: ${invoice.invoice_number}`,
    `Status: ${invoice.status}`,
    `Date: ${new Date(invoice.created_at).toISOString().slice(0, 10)}`,
    "",
    "Patient",
    `Name: ${invoice.patient_name}`,
    `Phone: ${invoice.patient_phone}`,
    `Email: ${invoice.patient_email || "-"}`,
    "",
    "Service",
    `Doctor: ${invoice.doctor_name || "-"}`,
    `Department: ${invoice.department_name || "-"}`,
    `Package: ${invoice.package_name || "-"}`,
    input.appointmentDate
      ? `Appointment: ${input.appointmentDate}${input.appointmentTime ? ` ${input.appointmentTime}` : ""}`
      : "",
    "",
    "Payment",
    `Method: ${payment?.payment_method || "-"}`,
    `Provider: ${payment?.payment_provider || "-"}`,
    `Transaction: ${payment?.transaction_id || "-"}`,
    `Reference: ${payment?.payment_reference || "-"}`,
    "",
    `Subtotal: ${money(invoice.subtotal, invoice.currency)}`,
    `Discount: ${money(invoice.discount, invoice.currency)}`,
    `Tax: ${money(invoice.tax, invoice.currency)}`,
    `Grand Total: ${money(invoice.grand_total, invoice.currency)}`,
    "",
    settings.terms || "Thank you for choosing our hospital.",
    input.logoNote || "Computer-generated invoice.",
  ].filter((l) => l !== undefined);

  const contentLines: string[] = ["BT", "/F1 10 Tf", "50 780 Td", "14 TL"];
  let first = true;
  for (const line of lines) {
    const t = escapePdfText(line);
    if (first) {
      contentLines.push(`(${t}) Tj`);
      first = false;
    } else {
      contentLines.push(`T* (${t}) Tj`);
    }
  }
  contentLines.push("ET");
  const stream = contentLines.join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push(
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
  );
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
  );
  objects.push(
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`
  );
  objects.push(
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
  );

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}
