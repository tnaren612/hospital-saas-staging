import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInvoicePdf } from "../../src/lib/payments/pdf";
import type { InvoiceRecord, PaymentSettings } from "../../src/lib/payments/types";

const settings: PaymentSettings = {
  id: "default",
  online_payment_enabled: true,
  cash_enabled: true,
  razorpay_enabled: true,
  stripe_enabled: false,
  currency: "INR",
  tax_percentage: 0,
  hospital_name: "Sri Srinivasa Hospital",
  hospital_address: "Nellore Road, Badvel",
  invoice_prefix: "SSH-INV",
  gstin: "29AAAAA0000A1Z5",
  terms: "Refund policy applies.",
  razorpay_key_id: "",
  stripe_publishable_key: "",
};

const invoice: InvoiceRecord = {
  id: "inv-1",
  invoice_number: "SSH-INV-2026-00001",
  patient_id: null,
  patient_name: "Test Patient",
  patient_phone: "9876543210",
  patient_email: "test@example.com",
  appointment_id: null,
  package_id: null,
  package_name: "",
  doctor_name: "Dr. Test",
  department_name: "Pulmonology",
  subtotal: 500,
  discount: 0,
  tax: 0,
  grand_total: 500,
  currency: "INR",
  status: "paid",
  pdf_url: "",
  line_items: [
    {
      description: "Consultation",
      quantity: 1,
      unit_price: 500,
      amount: 500,
    },
  ],
  notes: "",
  created_at: new Date().toISOString(),
};

describe("buildInvoicePdf", () => {
  it("returns a buffer starting with PDF header", () => {
    const pdf = buildInvoicePdf({ invoice, settings });
    assert.ok(Buffer.isBuffer(pdf));
    assert.ok(pdf.length > 200);
    assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
    assert.ok(pdf.toString("utf8").includes("%%EOF"));
  });

  it("includes invoice number in content stream", () => {
    const pdf = buildInvoicePdf({ invoice, settings });
    const text = pdf.toString("utf8");
    assert.ok(text.includes("SSH-INV-2026-00001"));
    assert.ok(text.includes("Sri Srinivasa Hospital"));
  });
});
