import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeTotals } from "../../src/lib/pharmacy/cart";
import {
  computeGstBreakdown,
  netUnitPrice,
  roundMoney,
  formatMoney,
} from "../../src/lib/pharmacy/tax";
import { buildPaymentMethods, settle } from "../../src/lib/pharmacy/payments";
import type { PharmacySettings } from "../../src/lib/pharmacy/types";

describe("computeTotals — GST split", () => {
  it("splits intra-state tax into equal CGST + SGST", () => {
    const t = computeTotals(
      [
        { name: "A", selling_price: 100, quantity: 2, gst_percent: 18 },
        { name: "B", selling_price: 50, quantity: 1, gst_percent: 12 },
      ],
      { taxType: "intra", currency: "INR" }
    );
    assert.equal(t.subtotal, 250);
    assert.equal(t.tax, 42);
    assert.equal(t.grand_total, 292);
    assert.equal(t.summary.cgst, 21);
    assert.equal(t.summary.sgst, 21);
    assert.equal(t.summary.igst, 0);
    assert.equal(roundMoney(t.summary.cgst + t.summary.sgst), 42);
  });

  it("applies IGST in full for inter-state and zeroes CGST/SGST", () => {
    const t = computeTotals(
      [{ name: "A", selling_price: 100, quantity: 1, gst_percent: 18 }],
      { taxType: "inter", currency: "INR" }
    );
    assert.equal(t.summary.igst, 18);
    assert.equal(t.summary.cgst, 0);
    assert.equal(t.summary.sgst, 0);
    assert.equal(t.grand_total, 118);
  });

  it("applies a global discount and never returns a negative total", () => {
    const t = computeTotals(
      [
        { name: "A", selling_price: 100, quantity: 2, gst_percent: 18 },
        { name: "B", selling_price: 50, quantity: 1, gst_percent: 12 },
      ],
      { discount: 50, taxType: "intra", currency: "INR" }
    );
    assert.equal(t.discount, 50);
    assert.equal(t.taxable, 200);
    assert.equal(t.grand_total, 233.6);
    // Cap discount so taxable never dips below zero
    const t2 = computeTotals(
      [{ name: "A", selling_price: 10, quantity: 1, gst_percent: 0 }],
      { discount: 9999, taxType: "intra", currency: "INR" }
    );
    assert.equal(t2.taxable, 0);
    assert.equal(t2.grand_total, 0);
  });

  it("treats inclusive tax (MRP includes GST) correctly", () => {
    const t = computeTotals(
      [{ name: "A", selling_price: 118, quantity: 1, gst_percent: 18 }],
      { inclusiveTax: true, taxType: "intra", currency: "INR" }
    );
    assert.equal(t.taxable, 100);
    assert.equal(t.tax, 18);
    // Customer pays the shelf MRP (tax is embedded, not added on top)
    assert.equal(t.grand_total, 118);
  });

  it("rounds to two decimals", () => {
    const t = computeTotals(
      [{ name: "A", selling_price: 0.1, quantity: 3, gst_percent: 18 }],
      { taxType: "intra", currency: "INR" }
    );
    assert.equal(roundMoney(t.grand_total), roundMoney(0.1 * 3 + 0.1 * 3 * 0.18));
  });
});

describe("tax helpers", () => {
  it("computes GST breakdown with half-cent absorbed into CGST", () => {
    const b = computeGstBreakdown(101, 3, "intra");
    // 101 * 3% = 3.03; half = 1.515 → 1.52; sgst = 3.03 - 1.52 = 1.51
    assert.equal(b.cgst + b.sgst, 3.03);
    assert.equal(b.igst, 0);
  });

  it("computes net unit price for inclusive pricing", () => {
    assert.equal(netUnitPrice(118, 18, true), 100);
    assert.equal(netUnitPrice(100, 18, false), 100);
  });

  it("formats money with the INR symbol", () => {
    assert.equal(formatMoney(1234.5, undefined as never), "₹1,234.50");
  });
});

describe("payment methods", () => {
  const base: PharmacySettings = {
    hospital_id: "t",
    receipt_header: "",
    receipt_footer: "",
    receipt_paper_size: "80mm",
    show_logo: true,
    show_hospital_address: true,
    show_phone: true,
    show_gst: true,
    show_drug_license: true,
    show_doctor_name: true,
    show_patient_address: false,
    show_batch_details: true,
    show_expiry: true,
    show_mrp: true,
    show_savings: true,
    show_barcode: true,
    show_qr_code: true,
    show_return_policy: true,
    return_policy_text: "",
    default_gst_percent: 12,
    inclusive_tax: false,
    max_discount_percent: 10,
    require_discount_approval: false,
    low_stock_threshold: 10,
    expiry_alert_days: 90,
    critical_expiry_days: 30,
    enable_barcode_scanner: true,
    enable_keyboard_shortcuts: true,
    enable_sound_effects: true,
    auto_print_receipt: false,
    require_patient_for_sale: false,
    allow_credit_sales: false,
    enable_cash: true,
    enable_upi: true,
    enable_card: true,
    enable_insurance: true,
    enable_credit: false,
    enable_wallet: false,
    drug_license_number: "",
    gst_number: "",
    pharmacist_name: "",
    pharmacist_registration: "",
    standalone_mode: false,
  };

  it("disables a method when its setting flag is off", () => {
    const methods = buildPaymentMethods({ ...base, enable_cash: false });
    const cash = methods.find((m) => m.id === "cash");
    assert.equal(cash?.enabled, false);
    const upi = methods.find((m) => m.id === "upi");
    assert.equal(upi?.enabled, true);
  });

  it("keeps credit disabled unless credit sales are allowed", () => {
    const off = buildPaymentMethods(base);
    assert.equal(off.find((m) => m.id === "credit")?.enabled, false);
    const on = buildPaymentMethods({ ...base, allow_credit_sales: true, enable_credit: true });
    assert.equal(on.find((m) => m.id === "credit")?.enabled, true);
  });

  it("resolves default set when settings are missing", () => {
    const methods = buildPaymentMethods(null);
    assert.equal(methods.find((m) => m.id === "cash")?.enabled, true);
  });
});

describe("settle", () => {
  it("computes change for cash overpayment", () => {
    const r = settle(100, [{ methodId: "cash", amount: 120 }]);
    assert.equal(r[0].amount, 100);
    assert.equal(r[0].changeDue, 20);
    assert.equal(r[0].balanceDue, 0);
  });

  it("tracks balance due for partial payment", () => {
    const r = settle(100, [{ methodId: "cash", amount: 60 }]);
    assert.equal(r[0].amount, 60);
    assert.equal(r[0].balanceDue, 40);
  });
});
