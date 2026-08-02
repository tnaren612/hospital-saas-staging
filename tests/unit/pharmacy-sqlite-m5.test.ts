/**
 * M5 — Payments, patient info, invoices, receipts & reprints.
 * Payment status rules, split/partial/change/reference handling, and full
 * receipt generation (58mm / 80mm / A4 GST invoice) from SQLite sales.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { PharmacySqliteStore, offlinePaymentStatus } from "../../src/lib/pharmacy/sqlite-store";
import { fallbackSettingsForTest } from "../helpers/pharmacy-fixtures";
import {
  outstandingBalances,
  receiptDataFromSale,
  settlementReport,
} from "../../src/lib/pharmacy/pos-offline";
import { generateThermalReceipt, generateA4Receipt } from "../../src/lib/pharmacy/receipt";
import { enhanceReceiptWithScannables } from "../../src/lib/pharmacy/receipt-enhance";
import { computeTotals } from "../../src/lib/pharmacy/cart";
import type { CartLine } from "../../src/lib/pharmacy/cart";

function newStore(): PharmacySqliteStore {
  return new PharmacySqliteStore();
}

function seedMedicine(store: PharmacySqliteStore, over: Record<string, unknown> = {}) {
  const m = store.createMedicine({
    name: "Amoxicillin 500mg",
    manufacturer: "Sun Pharma",
    sku: "AMOX-500",
    barcode: "8901112223334",
    selling_price: 45,
    purchase_price: 25,
    ...over,
  });
  store.addBatch({
    medicine_id: String(m.id),
    batch_number: "AMX-2601",
    expiry_date: "2028-03-31",
    selling_price: 45,
    qty: 50,
  });
  return m;
}

function saleFor(
  store: PharmacySqliteStore,
  medId: string,
  over: Record<string, unknown> = {}
) {
  const cart: CartLine[] = [
    { name: "Amoxicillin 500mg", selling_price: 45, quantity: 2, gst_percent: 12 },
  ];
  const totals = computeTotals(cart, { currency: "INR" });
  return {
    patient_name: "Meena",
    patient_phone: "9876501234",
    patient_age: 34,
    sale_type: "walk_in" as const,
    cashier_name: "Rani",
    items: [
      {
        medicine_id: medId,
        name: "Amoxicillin 500mg",
        qty: 2,
        price: 45,
        gst_percent: 12,
        batch_number: "AMX-2601",
      },
    ],
    subtotal: totals.subtotal,
    tax: totals.tax,
    cgst: totals.summary.cgst,
    sgst: totals.summary.sgst,
    igst: totals.summary.igst,
    tax_type: "intra" as const,
    grand_total: totals.grand_total,
    ...over,
  };
}

const hospital = {
  name: "Sri Srinivasa Hospital",
  address: "Badvel, Andhra Pradesh",
  phone: "08574-123456",
  email: "care@ssh.example",
  gst: "37ABCDE1234F1Z5",
  drug_license: "DL-AP-2026-0042",
  logo_url: "",
};

test("M5: offline payment status rules (cash paid / upi-card unverified / credit-insurance pending)", () => {
  assert.equal(offlinePaymentStatus("cash"), "paid");
  assert.equal(offlinePaymentStatus("upi"), "unverified");
  assert.equal(offlinePaymentStatus("gpay"), "unverified");
  assert.equal(offlinePaymentStatus("credit_card"), "unverified");
  assert.equal(offlinePaymentStatus("credit"), "pending");
  assert.equal(offlinePaymentStatus("insurance"), "pending");
});

test("M5: patient / walk-in info captured (name, UHID, age, gender, doctor, prescription)", () => {
  const store = newStore();
  const m = seedMedicine(store);
  store.createSale(
    saleFor(store, String(m.id), {
      patient_name: "Meena",
      patient_phone: "9876501234",
      patient_age: 34,
      patient_gender: "Female",
      patient_uhid: "SSH-0001",
      sale_type: "prescription",
      doctor_name: "Dr. Reddy",
      prescription_number: "RX-778",
      payment_method: "cash",
      amount_paid: 101,
    })
  );

  const patients = store.listPatients();
  assert.equal(patients.length, 1);
  assert.equal(patients[0].name, "Meena");
  assert.equal(patients[0].uhid, "SSH-0001");
  assert.equal(Number(patients[0].age), 34);
  assert.equal(patients[0].gender, "Female");
  assert.equal(patients[0].doctor_name, "Dr. Reddy");
  assert.equal(patients[0].prescription_number, "RX-778");

  // Second sale with same UHID updates the patient instead of duplicating.
  store.createSale(
    saleFor(store, String(m.id), {
      patient_name: "Meena",
      patient_age: 35,
      patient_uhid: "SSH-0001",
      payment_method: "cash",
      amount_paid: 101,
    })
  );
  assert.equal(store.listPatients().length, 1);
  assert.equal(Number(store.listPatients()[0].age), 35);
});

test("M5: cash sale — paid status, amount paid, no balance", () => {
  const store = newStore();
  const m = seedMedicine(store);
  const sale = store.createSale(
    saleFor(store, String(m.id), { payment_method: "cash", amount_paid: 101 })
  );
  assert.equal(sale.payment_status, "paid");
  assert.equal(Number(sale.amount_paid), 101);
  const payment = store.listPayments({ saleNumber: String(sale.sale_number) })[0];
  assert.equal(payment.method, "cash");
  assert.equal(payment.status, "paid");
});

test("M5: UPI / card sale — unverified offline status, reference recorded", () => {
  const store = newStore();
  const m = seedMedicine(store);
  const upi = store.createSale(
    saleFor(store, String(m.id), {
      payment_method: "upi",
      amount_paid: 101,
      payments: [{ method: "upi", amount: 101, reference: "UPI-99110022" }],
      payment_reference: "UPI-99110022",
    })
  );
  const upiPay = store.listPayments({ saleNumber: String(upi.sale_number) })[0];
  assert.equal(upiPay.method, "upi");
  assert.equal(upiPay.status, "unverified");
  assert.equal(upiPay.reference, "UPI-99110022");

  const card = store.createSale(
    saleFor(store, String(m.id), {
      patient_name: "Kiran",
      patient_phone: "9000000001",
      payment_method: "credit_card",
      amount_paid: 101,
      payments: [{ method: "credit_card", amount: 101, reference: "CARD-3344" }],
    })
  );
  const cardPay = store.listPayments({ saleNumber: String(card.sale_number) })[0];
  assert.equal(cardPay.status, "unverified");
  assert.equal(cardPay.reference, "CARD-3344");
});

test("M5: credit sale — deferred, pending, full amount due tracked", () => {
  const store = newStore();
  const m = seedMedicine(store);
  const sale = store.createSale(
    saleFor(store, String(m.id), {
      patient_name: "Credit Customer",
      payment_method: "credit",
      amount_paid: 101,
      payments: [{ method: "credit", amount: 101 }],
      payment_status: "pending",
    })
  );
  assert.equal(sale.payment_status, "pending");
  const pay = store.listPayments({ saleNumber: String(sale.sale_number) })[0];
  assert.equal(pay.method, "credit");
  assert.equal(pay.status, "pending");
});

test("M5: insurance sale — pending + insurance payment line", () => {
  const store = newStore();
  const m = seedMedicine(store);
  const sale = store.createSale(
    saleFor(store, String(m.id), {
      patient_name: "Insured Patient",
      payment_method: "insurance",
      amount_paid: 101,
      payments: [{ method: "insurance", amount: 101, reference: "POL-8821" }],
      payment_status: "pending",
    })
  );
  assert.equal(sale.payment_status, "pending");
  const pay = store.listPayments({ saleNumber: String(sale.sale_number) })[0];
  assert.equal(pay.method, "insurance");
  assert.equal(pay.status, "pending");
  assert.equal(pay.reference, "POL-8821");
});

test("M5: split / mixed payment — one payment row per tender + change", () => {
  const store = newStore();
  const m = seedMedicine(store);
  const sale = store.createSale(
    saleFor(store, String(m.id), {
      payment_method: "cash",
      amount_paid: 101,
      payments: [
        { method: "cash", amount: 100 },
        { method: "upi", amount: 51, reference: "UPI-55" },
      ],
    })
  );
  const pays = store.listPayments({ saleNumber: String(sale.sale_number) });
  assert.equal(pays.length, 2);
  assert.ok(pays.some((p) => p.method === "cash"));
  assert.ok(pays.some((p) => p.method === "upi"));
  // 151 tendered vs 100.80 total -> 50.20 change on the primary tender.
  assert.equal(Number(sale.amount_returned), 50.2);
  assert.equal(sale.payment_status, "paid");
});

test("M5: partial payment — pending sale, outstanding balance computed", () => {
  const store = newStore();
  const m = seedMedicine(store);
  const sale = store.createSale(
    saleFor(store, String(m.id), {
      payment_method: "cash",
      amount_paid: 60,
      payments: [{ method: "cash", amount: 60 }],
    })
  );
  assert.equal(sale.payment_status, "pending");
  assert.equal(sale.amount_paid, 60);
  assert.equal(Number(sale.grand_total) - Number(sale.amount_paid), 40.8);

  // The pure outstanding helper (used by the settlement view) sees it too.
  const rows = outstandingBalances([sale]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].balance, 40.8);
});

test("M5: 80mm thermal receipt — branding, GSTIN, drug license, patient, batch/expiry, CGST/SGST, cashier", () => {
  const store = newStore();
  const m = seedMedicine(store);
  const settings = { ...fallbackSettingsForTest(), gst_number: "37ABCDE1234F1Z5", drug_license_number: "DL-AP-2026-0042", pharmacist_name: "Pharma Rani" };
  const sale = store.createSale(
    saleFor(store, String(m.id), {
      patient_name: "Meena",
      patient_phone: "9876501234",
      patient_age: 34,
      sale_type: "prescription",
      doctor_name: "Dr. Reddy",
      prescription_number: "RX-778",
      cashier_name: "Rani",
      payment_method: "cash",
      amount_paid: 101,
    })
  );

  const data = receiptDataFromSale(sale, {
    hospital,
    settings,
    cashierName: "Rani",
    pharmacistName: "Pharma Rani",
  });
  assert.ok(data);

  const html = generateThermalReceipt(data, "80mm");
  assert.match(html, /Sri Srinivasa Hospital/);
  assert.match(html, /37ABCDE1234F1Z5/); // GSTIN
  assert.match(html, /DL-AP-2026-0042/); // drug license
  assert.match(html, /Meena/); // patient
  assert.match(html, /Dr\. Reddy/); // doctor
  assert.match(html, /RX-778/); // prescription
  assert.match(html, /AMX-2601/); // batch
  assert.match(html, /CGST|IGST/);
  assert.match(html, /SGST/);
  assert.match(html, /Rani/); // cashier / pharmacist
  assert.match(html, /80mm/);
});

test("M5: 58mm receipt renders with narrow width; A4 invoice renders GST invoice", () => {
  const store = newStore();
  const m = seedMedicine(store);
  const settings = { ...fallbackSettingsForTest(), gst_number: "37ABCDE1234F1Z5" };
  const sale = store.createSale(
    saleFor(store, String(m.id), { payment_method: "cash", amount_paid: 101 })
  );
  const data = receiptDataFromSale(sale, { hospital, settings, cashierName: "Rani" })!;

  const small = generateThermalReceipt(data, "58mm");
  assert.match(small, /58mm/);
  assert.match(small, /Amoxicillin 500mg/);

  const a4 = generateA4Receipt(data);
  assert.match(a4, /INVOICE/);
  assert.match(a4, /Sri Srinivasa Hospital/);
  assert.match(a4, /37ABCDE1234F1Z5/);
  assert.match(a4, /GST|GSTIN/);
});

test("M5: inter-state sale shows IGST instead of CGST+SGST", () => {
  const store = newStore();
  const m = seedMedicine(store);
  const sale = store.createSale(
    saleFor(store, String(m.id), {
      payment_method: "cash",
      amount_paid: 101,
      cgst: 0,
      sgst: 0,
      igst: 10.8,
      tax_type: "inter",
    })
  );
  const data = receiptDataFromSale(sale, {
    hospital,
    settings: fallbackSettingsForTest(),
    cashierName: "Rani",
  })!;
  const html = generateThermalReceipt(data, "80mm");
  assert.match(html, /IGST/);
  assert.doesNotMatch(html, /CGST\s*₹|CGST&nbsp;/);
});

test("M5: QR / barcode scannables are rendered into the receipt", async () => {
  const store = newStore();
  const m = seedMedicine(store);
  const sale = store.createSale(
    saleFor(store, String(m.id), { payment_method: "cash", amount_paid: 101 })
  );
  const data = receiptDataFromSale(sale, {
    hospital,
    settings: fallbackSettingsForTest(),
    cashierName: "Rani",
  })!;
  const base = generateThermalReceipt(data, "80mm");
  assert.match(base, /\[QR Code\]/);
  const enhanced = await enhanceReceiptWithScannables(
    base,
    data,
    {
      qr: async () => "data:image/png;base64,QUITTA",
      barcode: async () => "data:image/png;base64,QkFSQ09ERQ==",
    }
  );
  assert.doesNotMatch(enhanced, /\[QR Code\]/);
  assert.doesNotMatch(enhanced, /\[Barcode:/);
  assert.match(enhanced, /data:image/);
});

test("M5: reprint — sale row rebuilds a full receipt for printing", () => {
  const store = newStore();
  const m = seedMedicine(store);
  const sale = store.createSale(
    saleFor(store, String(m.id), {
      patient_name: "Reprint Patient",
      payment_method: "cash",
      amount_paid: 101,
    })
  );

  // Simulate the reprint flow: fetch the persisted row, rebuild receipt data.
  const reloaded = store.getSale(String(sale.sale_number));
  assert.ok(reloaded);
  const data = receiptDataFromSale(reloaded!, { hospital, settings: fallbackSettingsForTest(), cashierName: "Rani" });
  assert.ok(data);
  assert.equal(data!.sale.sale_number, sale.sale_number);
  assert.equal(data!.customer_name, "Reprint Patient");
  const html = generateThermalReceipt(data!, "80mm");
  assert.match(html, /Reprint Patient/);
  assert.match(html, /Amoxicillin 500mg/);
});

test("M5: settlement report over SQLite rows aggregates split payments", () => {
  const store = newStore();
  const m = seedMedicine(store);
  store.createSale(
    saleFor(store, String(m.id), {
      payment_method: "cash",
      amount_paid: 101,
      payments: [
        { method: "cash", amount: 60 },
        { method: "upi", amount: 41, reference: "UPI-77" },
      ],
      notes: `payment_lines:${JSON.stringify([
        { method: "cash", amount: 60 },
        { method: "upi", amount: 41 },
      ])}`,
    })
  );
  const rows = store.listSales();
  const report = settlementReport(rows, []);
  assert.equal(report.transactionCount, 1);
  const cash = report.byMethod.find((b) => b.method === "cash");
  const upi = report.byMethod.find((b) => b.method === "upi");
  assert.equal(cash!.amount, 60);
  assert.equal(upi!.amount, 41);
});
