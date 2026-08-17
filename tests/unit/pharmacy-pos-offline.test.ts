import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals } from "../../src/lib/pharmacy/cart";
import {
  buildPosPayload,
  buildReceiptData,
  heldBillPayload,
  heldItemsToCart,
  localSaleNumber,
  outstandingBalances,
  receiptDataFromSale,
  settlementReport,
  toPosLineItems,
} from "../../src/lib/pharmacy/pos-offline";
import { fallbackSettingsForTest } from "../helpers/pharmacy-fixtures";

const cart = [
  {
    name: "Paracetamol 500mg",
    selling_price: 10,
    quantity: 2,
    gst_percent: 12,
  },
  {
    name: "ORS Sachet",
    selling_price: 20,
    quantity: 1,
    gst_percent: 0,
  },
];

const customer = {
  patientName: "Ravi",
  patientPhone: "9876543210",
  patientAge: 30,
  saleType: "walk_in" as const,
};

const totals = computeTotals(cart, { currency: "INR" });

function base() {
  return {
    customer,
    cashierName: "Cashier A",
    items: toPosLineItems(cart),
    cartLines: cart,
    totals,
    saleNumber: "LOC-20260731-100000-42",
  };
}

test("localSaleNumber format", () => {
  const n = localSaleNumber();
  assert.match(n, /^LOC-\d{8}-\d{6}-\d{2}$/);
});

test("cash exact payment → paid, no change", () => {
  const r = buildPosPayload({ ...base(), tenders: [{ methodId: "cash", amount: totals.grand_total }] });
  assert.equal(r.payload.payment_status, "paid");
  assert.equal(r.payload.amount_paid, totals.grand_total);
  assert.equal(r.payload.amount_returned, 0);
  assert.equal(r.balanceDue, 0);
  assert.equal(r.changeDue, 0);
  assert.equal(r.payload.payment_method, "cash");
  assert.equal(r.payload.patient_name, "Ravi");
  assert.equal(r.payload.grand_total, totals.grand_total);
});

test("cash overpayment → change returned", () => {
  const r = buildPosPayload({ ...base(), tenders: [{ methodId: "cash", amount: totals.grand_total + 50 }] });
  assert.equal(r.payload.amount_returned, 50);
  assert.equal(r.payload.payment_status, "paid");
});

test("split payment cash+UPI → breakdown recorded in notes", () => {
  const half = Math.round(totals.grand_total / 2);
  const r = buildPosPayload({
    ...base(),
    tenders: [
      { methodId: "cash", amount: half },
      { methodId: "upi", amount: totals.grand_total - half, reference: "TXN123" },
    ],
  });
  assert.equal(r.balanceDue, 0);
  assert.ok(r.payload.notes!.includes("payment_lines"));
  assert.ok(r.payload.notes!.includes('"method":"upi"'));
  assert.ok(r.payload.notes!.includes("TXN123"));
  assert.equal(r.primaryMethod, "cash");
  assert.equal(r.payload.payment_method, "cash");
});

test("mixed three tenders", () => {
  const third = totals.grand_total / 3;
  const r = buildPosPayload({
    ...base(),
    tenders: [
      { methodId: "cash", amount: third },
      { methodId: "gpay", amount: third },
      { methodId: "debit_card", amount: totals.grand_total - 2 * third },
    ],
  });
  assert.ok(Math.abs(r.balanceDue) < 0.01);
});

test("partial payment → pending + balance due", () => {
  const r = buildPosPayload({
    ...base(),
    tenders: [{ methodId: "cash", amount: Math.floor(totals.grand_total / 2) }],
  });
  assert.equal(r.payload.payment_status, "pending");
  assert.ok(r.balanceDue > 0);
  assert.ok(r.payload.notes!.includes(`balance_due:${r.balanceDue.toFixed(2)}`));
});

test("credit sale → deferred, payment_status pending, amount_paid = total", () => {
  const r = buildPosPayload({
    ...base(),
    tenders: [{ methodId: "credit", amount: totals.grand_total }],
  });
  assert.equal(r.payload.payment_status, "pending");
  assert.equal(r.payload.amount_paid, totals.grand_total);
  assert.equal(r.payload.payment_method, "credit");
});

test("insurance sale → deferred", () => {
  const r = buildPosPayload({
    ...base(),
    tenders: [{ methodId: "insurance", amount: totals.grand_total }],
  });
  assert.equal(r.payload.payment_status, "pending");
  assert.equal(r.payload.payment_method, "insurance");
});

test("no valid tenders → no throw, balance due = full total", () => {
  const r = buildPosPayload({ ...base(), tenders: [] });
  assert.equal(r.balanceDue, totals.grand_total);
  assert.equal(r.payload.payment_status, "pending");
});

test("schema shape: items use qty/price keys", () => {
  const r = buildPosPayload({ ...base(), tenders: [{ methodId: "cash", amount: totals.grand_total }] });
  assert.equal(r.payload.items[0].name, "Paracetamol 500mg");
  assert.equal(r.payload.items[0].qty, 2);
  assert.equal(r.payload.items[0].price, 10);
});

test("buildReceiptData maps totals + customer", () => {
  const receipt = buildReceiptData({
    sale: { sale_number: "LOC-1" },
    hospital: { name: "H", address: "A", phone: "P", email: "E", gst: "G", drug_license: "DL", logo_url: "" },
    settings: fallbackSettingsForTest(),
    cartLines: cart,
    totals,
    amountPaid: totals.grand_total,
    amountReturned: 0,
    paymentMethod: "cash",
    cashierName: "Cashier A",
    pharmacistName: "Ph",
    customer,
  });
  assert.equal(receipt.customer_name, "Ravi");
  assert.equal(receipt.grand_total, totals.grand_total);
  assert.equal(receipt.items.length, 2);
  assert.equal(receipt.sale.sale_number, "LOC-1");
});

test("receiptDataFromSale rebuilds from a cached row", () => {
  const row = {
    id: "s1",
    sale_number: "PH-123",
    created_at: "2026-07-31T10:00:00Z",
    patient_name: "Ravi",
    patient_phone: "9876543210",
    sale_type: "walk_in",
    payment_method: "cash",
    payment_status: "paid",
    grand_total: 40,
    amount_paid: 40,
    amount_returned: 0,
    subtotal: 40,
    discount: 0,
    tax: 0,
    line_items: [{ name: "ORS", qty: 1, price: 40, selling_price: 40 }],
  };
  const data = receiptDataFromSale(row, {
    hospital: { name: "H", address: "", phone: "", email: "", gst: "", drug_license: "", logo_url: "" },
    settings: fallbackSettingsForTest(),
    cashierName: "Cashier A",
  });
  assert.ok(data);
  assert.equal(data!.sale.sale_number, "PH-123");
  assert.equal(data!.items[0].name, "ORS");
  assert.equal(data!.grand_total, 40);
});

test("receiptDataFromSale rebuilds from queued payload that stores items not line_items", () => {
  const row = {
    sale_number: "LOC-1",
    patient_name: "Walk-in Customer",
    grand_total: 40,
    amount_paid: 40,
    subtotal: 40,
    discount: 0,
    tax: 0,
    payment_method: "cash",
    items: [{ name: "Acceptance Sale Med", qty: 1, price: 40, selling_price: 40 }],
  };
  const data = receiptDataFromSale(row, {
    hospital: { name: "H", address: "", phone: "", email: "", gst: "", drug_license: "", logo_url: "" },
    settings: fallbackSettingsForTest(),
    cashierName: "Cashier A",
  });
  assert.ok(data, "reprint must work from the queued sale payload");
  assert.equal(data!.items.length, 1);
  assert.equal(data!.items[0].name, "Acceptance Sale Med");
});

test("outstanding balances from partial/credit rows", () => {
  const rows = [
    { sale_number: "S1", patient_name: "A", grand_total: 100, amount_paid: 60, payment_method: "cash", created_at: "2026-07-31T09:00:00Z" },
    { sale_number: "S2", patient_name: "B", grand_total: 50, amount_paid: 50, payment_method: "cash", created_at: "2026-07-31T09:10:00Z" },
    { sale_number: "S3", patient_name: "C", grand_total: 200, amount_paid: 0, payment_method: "credit", created_at: "2026-07-31T09:20:00Z" },
  ];
  const out = outstandingBalances(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0].saleNumber, "S3");
  assert.equal(out[0].balance, 200);
  assert.equal(out[1].balance, 40);
});

test("settlementReport aggregates methods, refunds, outstanding, cash drawer", () => {
  const sales = [
    { sale_number: "S1", grand_total: 100, payment_method: "cash", amount_paid: 100, created_at: "2026-07-31T09:00:00Z" },
    { sale_number: "S2", grand_total: 200, payment_method: "upi", amount_paid: 200, created_at: "2026-07-31T09:30:00Z" },
    { sale_number: "S3", grand_total: 50, payment_method: "cash", amount_paid: 20, created_at: "2026-07-31T10:00:00Z" },
    { sale_number: "S4", grand_total: 999, payment_method: "cash", created_at: "2026-06-01T10:00:00Z" },
    // split payment encoded in notes
    { sale_number: "S5", grand_total: 100, payment_method: "cash", amount_paid: 100, created_at: "2026-07-31T11:00:00Z", notes: 'payment_lines:[{"method":"cash","amount":60},{"method":"upi","amount":40}]' },
  ];
  const returns = [
    { return_number: "R1", refund_amount: 25, created_at: "2026-07-31T12:00:00Z" },
    { return_number: "R2", refund_amount: 10, created_at: "2026-06-01T12:00:00Z" },
  ];
  const r = settlementReport(sales, returns, { since: "2026-07-31T00:00:00", until: "2026-07-31T23:59:59" });
  assert.equal(r.transactionCount, 4);
  assert.equal(r.totalSales, 450);
  const cash = r.byMethod.find((m) => m.method === "cash")!;
  const upi = r.byMethod.find((m) => m.method === "upi")!;
  assert.equal(cash.amount, 210);
  assert.equal(upi.amount, 240);
  assert.equal(r.refunds, 25);
  assert.equal(r.returnCount, 1);
  assert.equal(r.outstandingCount, 1);
  assert.equal(r.outstandingTotal, 30);
  assert.equal(r.cashDrawer, 185);
});

test("heldBillPayload + heldItemsToCart round-trip", () => {
  const payload = heldBillPayload(
    {
      reference: "HLD-1",
      customerName: "Ravi",
      items: cart,
      discount: 5,
      notes: "will return",
      heldByName: "Cashier A",
    },
    "h1"
  );
  assert.equal(payload.reference, "HLD-1");
  assert.equal(payload.hospital_id, "h1");
  assert.equal(payload.items.length, 2);
  const back = heldItemsToCart(payload as unknown as Record<string, unknown>);
  assert.equal(back.length, 2);
  assert.equal(back[0].name, "Paracetamol 500mg");
  assert.equal(back[0].quantity, 2);
});

test("held bill round-trip preserves tender payment state", () => {
  const payload = heldBillPayload(
    {
      reference: "HLD-PAY",
      customerName: "Hold Patient",
      items: cart,
      discount: 0,
      heldByName: "Cashier A",
      tenders: [{ methodId: "cash", amount: 44.8 }],
    },
    "local"
  );
  const withTenders = payload as typeof payload & { tenders?: { methodId: string; amount: number }[] };
  assert.equal(withTenders.tenders?.length, 1);
  assert.equal(withTenders.tenders?.[0]?.methodId, "cash");
  assert.equal(withTenders.tenders?.[0]?.amount, 44.8);
});

test("toPosLineItems maps cart lines", () => {
  const items = toPosLineItems(cart);
  assert.equal(items.length, 2);
  assert.equal(items[0].qty, 2);
  assert.equal(items[0].gst_percent, 12);
});
