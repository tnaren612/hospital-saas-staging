/**
 * Pharmacy Receipt Generator
 * Generates thermal (58mm/80mm) and A4 receipts in HTML format
 */

import type { ReceiptData } from "./types";

function formatCurrency(amount: number, symbol = "₹"): string {
  return `${symbol}${Number(amount || 0).toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Optional CGST/SGST/IGST breakdown rows. Returns "" when no tax breakdown is
 * present, so existing receipts are byte-identical when the fields are absent.
 */
function taxBreakdownRows(data: ReceiptData, style: "row" | "boxed"): string {
  const { cgst, sgst, igst, tax_type } = data;
  const hasSplit = Number(cgst) > 0 || Number(sgst) > 0 || Number(igst) > 0;
  if (!hasSplit) return "";
  const row = (label: string, value: number) =>
    style === "row"
      ? `<div class="row"><span>${label}:</span><span>${formatCurrency(value)}</span></div>`
      : `<div class="totals-row"><span>${label}:</span><span>${formatCurrency(value)}</span></div>`;
  let html = "";
  if (tax_type === "inter") {
    html += row("IGST", Number(igst) || 0);
  } else {
    html += row("CGST", Number(cgst) || 0);
    html += row("SGST", Number(sgst) || 0);
  }
  return html;
}

/**
 * Generate thermal receipt (58mm or 80mm)
 */
export function generateThermalReceipt(
  data: ReceiptData,
  paperSize: "58mm" | "80mm" = "80mm"
): string {
  const width = paperSize === "58mm" ? "58mm" : "80mm";
  const { settings, hospital, items, sale } = data;
  const taxBreakdown = taxBreakdownRows(data, "row");

  const itemRows = items
    .map((item) => {
      const total = item.selling_price * item.quantity;
      const mrpLine =
        settings.show_mrp && item.mrp > item.selling_price
          ? `<div style="font-size:9px;color:#666;">MRP: ${formatCurrency(item.mrp)} | Save: ${formatCurrency(item.mrp - item.selling_price)}</div>`
          : "";
      const batchLine =
        settings.show_batch_details && item.batch_number
          ? `<div style="font-size:9px;color:#666;">Batch: ${escapeHtml(item.batch_number)}${settings.show_expiry && item.expiry_date ? ` | Exp: ${escapeHtml(item.expiry_date)}` : ""}</div>`
          : "";
      return `
        <div style="margin-bottom:6px;padding-bottom:4px;border-bottom:1px dashed #ccc;">
          <div style="font-weight:600;">${escapeHtml(item.name)}</div>
          ${batchLine}
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span>${item.quantity} × ${formatCurrency(item.selling_price)}</span>
            <span style="font-weight:600;">${formatCurrency(total)}</span>
          </div>
          ${mrpLine}
        </div>
      `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt - ${escapeHtml(sale.sale_number || "")}</title>
<style>
  @page { size: ${width} auto; margin: 0; }
  body { font-family: 'Courier New', monospace; width: ${width}; margin: 0 auto; padding: 4mm; font-size: 11px; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .row { display: flex; justify-content: space-between; }
  .divider { border-top: 1px dashed #000; margin: 4px 0; }
  .double-divider { border-top: 2px solid #000; margin: 4px 0; }
  h1 { font-size: 14px; margin: 4px 0; }
  h2 { font-size: 12px; margin: 2px 0; }
  .small { font-size: 9px; }
</style>
</head>
<body>
  ${settings.show_logo && hospital.logo_url ? `<div class="center"><img src="${escapeHtml(hospital.logo_url)}" style="max-width:60px;max-height:60px;" /></div>` : ""}
  <div class="center">
    <h1 class="bold">${escapeHtml(hospital.name)}</h1>
    ${settings.show_hospital_address && hospital.address ? `<div class="small">${escapeHtml(hospital.address)}</div>` : ""}
    ${settings.show_phone && hospital.phone ? `<div class="small">Ph: ${escapeHtml(hospital.phone)}</div>` : ""}
    ${settings.show_gst && hospital.gst ? `<div class="small">GST: ${escapeHtml(hospital.gst)}</div>` : ""}
    ${settings.show_drug_license && hospital.drug_license ? `<div class="small">DL: ${escapeHtml(hospital.drug_license)}</div>` : ""}
  </div>
  <div class="divider"></div>
  <div class="small">
    <div class="row"><span>Bill No:</span><span class="bold">${escapeHtml(sale.sale_number || "")}</span></div>
    <div class="row"><span>Date:</span><span>${formatDate(sale.created_at || new Date().toISOString())}</span></div>
    ${data.transaction_id ? `<div class="row"><span>Txn:</span><span>${escapeHtml(data.transaction_id)}</span></div>` : ""}
    ${data.cashier_name ? `<div class="row"><span>Cashier:</span><span>${escapeHtml(data.cashier_name)}</span></div>` : ""}
    ${data.pharmacist_name ? `<div class="row"><span>Pharmacist:</span><span>${escapeHtml(data.pharmacist_name)}</span></div>` : ""}
    ${data.printed_by ? `<div class="row"><span>Printed By:</span><span>${escapeHtml(data.printed_by)}</span></div>` : ""}
  </div>
  <div class="divider"></div>
  <div class="small">
    <div><span class="bold">Customer:</span> ${escapeHtml(data.customer_name || "Walk-in")}</div>
    ${data.patient_id ? `<div><span class="bold">Patient ID:</span> ${escapeHtml(data.patient_id)}</div>` : ""}
    ${data.customer_phone ? `<div><span class="bold">Phone:</span> ${escapeHtml(data.customer_phone)}</div>` : ""}
    ${data.patient_age ? `<div><span class="bold">Age:</span> ${escapeHtml(String(data.patient_age))}</div>` : ""}
    ${settings.show_doctor_name && data.doctor_name ? `<div><span class="bold">Doctor:</span> ${escapeHtml(data.doctor_name)}</div>` : ""}
    ${data.prescription_number ? `<div><span class="bold">Rx No:</span> ${escapeHtml(data.prescription_number)}</div>` : ""}
  </div>
  <div class="divider"></div>
  <div class="bold small" style="margin-bottom:4px;">ITEMS</div>
  ${itemRows}
  <div class="divider"></div>
  <div class="small">
    <div class="row"><span>Subtotal:</span><span>${formatCurrency(data.subtotal)}</span></div>
    ${data.discount > 0 ? `<div class="row"><span>Discount:</span><span>-${formatCurrency(data.discount)}</span></div>` : ""}
    ${data.tax > 0 ? `<div class="row"><span>Tax (GST):</span><span>${formatCurrency(data.tax)}</span></div>` : ""}
    ${taxBreakdown}
  </div>
  <div class="double-divider"></div>
  <div class="row bold" style="font-size:13px;">
    <span>TOTAL</span>
    <span>${formatCurrency(data.grand_total)}</span>
  </div>
  <div class="divider"></div>
  <div class="small">
    <div class="row"><span>Payment:</span><span class="bold">${escapeHtml(data.payment_method)}</span></div>
    ${data.payment_reference ? `<div class="row"><span>Ref:</span><span>${escapeHtml(data.payment_reference)}</span></div>` : ""}
    <div class="row"><span>Paid:</span><span>${formatCurrency(data.amount_paid)}</span></div>
    ${data.amount_returned > 0 ? `<div class="row"><span>Returned:</span><span>${formatCurrency(data.amount_returned)}</span></div>` : ""}
  </div>
  ${settings.show_qr_code ? `
  <div class="divider"></div>
  <div class="center small">
    <div>[QR Code]</div>
    <div>Scan to verify bill</div>
  </div>
  ` : ""}
  ${settings.show_barcode ? `
  <div class="center small" style="margin-top:4px;">
    <div>[Barcode: ${escapeHtml(sale.sale_number || "")}]</div>
  </div>
  ` : ""}
  ${settings.show_return_policy ? `
  <div class="divider"></div>
  <div class="center small" style="font-style:italic;">${escapeHtml(settings.return_policy_text)}</div>
  ` : ""}
  <div class="divider"></div>
  <div class="center small">${escapeHtml(settings.receipt_footer || "Thank you!")}</div>
  <div class="center small" style="margin-top:8px;">— Computer generated bill —</div>
</body>
</html>
  `.trim();
}

/**
 * Generate A4 receipt (full page)
 */
export function generateA4Receipt(data: ReceiptData): string {
  const { settings, hospital, items, sale } = data;
  const taxBreakdown = taxBreakdownRows(data, "boxed");

  const itemRows = items
    .map((item, idx) => {
      const total = item.selling_price * item.quantity;
      return `
        <tr>
          <td style="padding:6px;border-bottom:1px solid #eee;">${idx + 1}</td>
          <td style="padding:6px;border-bottom:1px solid #eee;">
            <div style="font-weight:600;">${escapeHtml(item.name)}</div>
            ${settings.show_batch_details && item.batch_number ? `<div style="font-size:11px;color:#666;">Batch: ${escapeHtml(item.batch_number)}${settings.show_expiry && item.expiry_date ? ` | Exp: ${escapeHtml(item.expiry_date)}` : ""}</div>` : ""}
            ${item.manufacturer ? `<div style="font-size:11px;color:#666;">${escapeHtml(item.manufacturer)}</div>` : ""}
          </td>
          <td style="padding:6px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
          <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.selling_price)}</td>
          ${settings.show_mrp ? `<td style="padding:6px;border-bottom:1px solid #eee;text-align:right;color:#999;">${formatCurrency(item.mrp)}</td>` : ""}
          <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${formatCurrency(total)}</td>
        </tr>
      `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice - ${escapeHtml(sale.sale_number || "")}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; max-width: 180mm; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a5ff5; padding-bottom: 12px; margin-bottom: 16px; }
  .hospital-info h1 { margin: 0; font-size: 22px; color: #1a5ff5; }
  .hospital-info p { margin: 2px 0; font-size: 12px; color: #555; }
  .invoice-info { text-align: right; }
  .invoice-info h2 { margin: 0; font-size: 18px; color: #1a5ff5; }
  .invoice-info p { margin: 2px 0; font-size: 12px; }
  .customer-section { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 6px; }
  .customer-section h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; color: #666; }
  .customer-section p { margin: 2px 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #1a5ff5; color: white; padding: 8px; text-align: left; font-size: 12px; }
  th.center { text-align: center; }
  th.right { text-align: right; }
  .totals { display: flex; justify-content: flex-end; }
  .totals-box { width: 240px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .totals-row.grand { border-top: 2px solid #1a5ff5; margin-top: 8px; padding-top: 8px; font-size: 18px; font-weight: bold; color: #1a5ff5; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #666; }
  .signature { margin-top: 48px; display: flex; justify-content: space-between; }
  .signature div { text-align: center; font-size: 12px; }
  .signature .line { border-top: 1px solid #333; width: 160px; padding-top: 4px; }
</style>
</head>
<body>
  <div class="header">
    <div class="hospital-info">
      ${settings.show_logo && hospital.logo_url ? `<img src="${escapeHtml(hospital.logo_url)}" style="max-height:60px;margin-bottom:8px;" />` : ""}
      <h1>${escapeHtml(hospital.name)}</h1>
      ${settings.show_hospital_address && hospital.address ? `<p>${escapeHtml(hospital.address)}</p>` : ""}
      ${settings.show_phone && hospital.phone ? `<p>Phone: ${escapeHtml(hospital.phone)}</p>` : ""}
      ${hospital.email ? `<p>Email: ${escapeHtml(hospital.email)}</p>` : ""}
      ${settings.show_gst && hospital.gst ? `<p><strong>GST:</strong> ${escapeHtml(hospital.gst)}</p>` : ""}
      ${settings.show_drug_license && hospital.drug_license ? `<p><strong>Drug License:</strong> ${escapeHtml(hospital.drug_license)}</p>` : ""}
    </div>
    <div class="invoice-info">
      <h2>INVOICE</h2>
      <p><strong>Bill No:</strong> ${escapeHtml(sale.sale_number || "")}</p>
      <p><strong>Date:</strong> ${formatDate(sale.created_at || new Date().toISOString())}</p>
      ${data.transaction_id ? `<p><strong>Txn:</strong> ${escapeHtml(data.transaction_id)}</p>` : ""}
      ${data.cashier_name ? `<p><strong>Cashier:</strong> ${escapeHtml(data.cashier_name)}</p>` : ""}
      ${data.printed_by ? `<p><strong>Printed By:</strong> ${escapeHtml(data.printed_by)}</p>` : ""}
    </div>
  </div>

  <div class="customer-section">
    <div>
      <h3>Bill To</h3>
      <p><strong>${escapeHtml(data.customer_name || "Walk-in Customer")}</strong></p>
      ${data.patient_id ? `<p>Patient ID: ${escapeHtml(data.patient_id)}</p>` : ""}
      ${data.customer_phone ? `<p>Phone: ${escapeHtml(data.customer_phone)}</p>` : ""}
      ${data.patient_age ? `<p>Age: ${escapeHtml(String(data.patient_age))}</p>` : ""}
    </div>
    <div>
      ${settings.show_doctor_name && data.doctor_name ? `<h3>Prescribed By</h3><p><strong>${escapeHtml(data.doctor_name)}</strong></p>` : ""}
      ${data.prescription_number ? `<p>Rx No: ${escapeHtml(data.prescription_number)}</p>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;">#</th>
        <th>Medicine</th>
        <th class="center" style="width:60px;">Qty</th>
        <th class="right" style="width:90px;">Price</th>
        ${settings.show_mrp ? '<th class="right" style="width:90px;">MRP</th>' : ""}
        <th class="right" style="width:100px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><span>Subtotal:</span><span>${formatCurrency(data.subtotal)}</span></div>
      ${data.discount > 0 ? `<div class="totals-row"><span>Discount:</span><span>-${formatCurrency(data.discount)}</span></div>` : ""}
      ${data.tax > 0 ? `<div class="totals-row"><span>Tax (GST):</span><span>${formatCurrency(data.tax)}</span></div>` : ""}
      ${taxBreakdown}
      <div class="totals-row grand"><span>Grand Total:</span><span>${formatCurrency(data.grand_total)}</span></div>
      <div class="totals-row" style="margin-top:8px;padding-top:8px;border-top:1px solid #ddd;"><span>Payment Method:</span><span><strong>${escapeHtml(data.payment_method)}</strong></span></div>
      <div class="totals-row"><span>Amount Paid:</span><span>${formatCurrency(data.amount_paid)}</span></div>
      ${data.amount_returned > 0 ? `<div class="totals-row"><span>Returned:</span><span>${formatCurrency(data.amount_returned)}</span></div>` : ""}
    </div>
  </div>

  ${settings.show_return_policy ? `<p style="margin-top:24px;padding:8px;background:#fff3cd;border-radius:4px;font-size:11px;font-style:italic;">${escapeHtml(settings.return_policy_text)}</p>` : ""}

  <div class="signature">
    <div><div class="line">Customer Signature</div></div>
    <div><div class="line">For ${escapeHtml(hospital.name)}</div></div>
  </div>

  <div class="footer">
    <p>${escapeHtml(settings.receipt_footer || "Thank you for your purchase!")}</p>
    <p>This is a computer-generated invoice</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate receipt based on settings
 */
export function generateReceipt(data: ReceiptData): string {
  if (data.settings.receipt_paper_size === "A4") {
    return generateA4Receipt(data);
  }
  return generateThermalReceipt(data, data.settings.receipt_paper_size);
}

/**
 * Open print dialog
 */
export function printReceipt(html: string): void {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 250);
}

/**
 * Download receipt as HTML
 */
export function downloadReceipt(html: string, filename: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
