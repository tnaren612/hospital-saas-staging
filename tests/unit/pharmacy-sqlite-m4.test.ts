/**
 * M4 — Pharmacy SQLite store: inventory transactional integrity.
 * Everything runs against an in-memory (or temp-file) SQLite database with
 * the internet completely unavailable — no network, no Supabase.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PharmacySqliteStore,
  closePharmacySqlite,
  medicineErrorMessage,
} from "../../src/lib/pharmacy/sqlite-store";

function newStore(path?: string): PharmacySqliteStore {
  return new PharmacySqliteStore(path);
}

const med = (over: Record<string, unknown> = {}) => ({
  name: "Paracetamol 500mg",
  manufacturer: "Cipla",
  sku: "PARA-500",
  barcode: "8901234567890",
  purchase_price: 4,
  selling_price: 10,
  mrp: 12.5,
  min_stock_level: 10,
  reorder_level: 5,
  ...over,
});

before(() => {
  closePharmacySqlite();
});

test("M4: medicine creation works and duplicates are blocked", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  assert.ok(m.id);
  assert.equal(m.name, "Paracetamol 500mg");
  assert.equal(Number(m.stock_qty), 0);

  // Same name + manufacturer -> blocked.
  assert.throws(
    () => store.createMedicine(med()),
    new RegExp(medicineErrorMessage("Paracetamol 500mg", "Cipla").replace(/[()]/g, "\\$&"))
  );

  // Same SKU with different name -> blocked.
  assert.throws(
    () => store.createMedicine(med({ name: "Paracetamol 650mg" })),
    /SKU already exists/
  );

  // Same barcode -> blocked.
  assert.throws(
    () => store.createMedicine(med({ name: "Paracetamol 650mg", sku: "PARA-650" })),
    /Barcode already exists/
  );

  // Different manufacturer + sku is allowed.
  const m2 = store.createMedicine(
    med({ name: "Paracetamol 500mg", manufacturer: "GSK", sku: "PARA-500-GSK", barcode: "999" })
  );
  assert.ok(m2.id);
  assert.equal(store.listMedicines().length, 2);
});

test("M4: batch management — add batch, duplicate batch blocked, opening stock movement", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  const batch = store.addBatch({
    medicine_id: String(m.id),
    batch_number: "B-01",
    expiry_date: "2028-12-31",
    purchase_price: 4,
    selling_price: 10,
    qty: 100,
  });
  assert.equal(Number(batch.qty), 100);

  assert.throws(
    () =>
      store.addBatch({
        medicine_id: String(m.id),
        batch_number: "B-01",
        expiry_date: "2028-12-31",
        qty: 10,
      }),
    /Batch already exists/
  );

  assert.throws(
    () =>
      store.addBatch({
        medicine_id: String(m.id),
        batch_number: "B-02",
        qty: -5,
      }),
    /cannot be negative/
  );

  // Opening stock lands on the ledger as an immutable 'in' movement.
  const movements = store.listMovements({ medicineId: String(m.id) });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].movement_type, "in");
  assert.equal(movements[0].reference_type, "opening");
  assert.equal(Number(movements[0].quantity), 100);
});

test("M4: add stock to a batch and re-stock", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  store.addBatch({ medicine_id: String(m.id), batch_number: "B-01", qty: 10 });
  const after = store.addStock({
    medicine_id: String(m.id),
    batch_number: "B-01",
    qty: 25,
    notes: "Extra stock",
  });
  assert.equal(Number(after.qty), 35);
  const ledger = store.listMovements({ medicineId: String(m.id) });
  assert.equal(ledger.length, 2);
  assert.ok(ledger.some((mv) => mv.reference_type === "add"));
  assert.ok(ledger.some((mv) => mv.reference_type === "opening"));
});

test("M4: purchase receipt adds batch stock and ledger rows atomically", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  const po = store.createPurchase({
    supplier_name: "MedSource",
    invoice_number: "INV-9",
    subtotal: 800,
    items: [
      {
        medicine_id: String(m.id),
        medicine_name: "Paracetamol 500mg",
        batch_number: "PUR-1",
        expiry_date: "2029-06-30",
        qty: 200,
        unit_price: 4,
        gst_percent: 12,
      },
    ],
  });
  assert.ok(po.purchase_number);
  const batch = store.getBatch(String(m.id), "PUR-1");
  assert.equal(Number(batch!.qty), 200);
  assert.equal(batch!.expiry_date, "2029-06-30");

  // Second purchase into the SAME batch adds up.
  store.createPurchase({
    supplier_name: "MedSource",
    items: [
      {
        medicine_id: String(m.id),
        medicine_name: "Paracetamol 500mg",
        batch_number: "PUR-1",
        qty: 50,
        unit_price: 4,
      },
    ],
  });
  assert.equal(Number(store.getBatch(String(m.id), "PUR-1")!.qty), 250);

  const movements = store.listMovements({ medicineId: String(m.id) });
  assert.equal(movements.length, 2);
  assert.ok(movements.every((mv) => mv.reference_type === "purchase"));
  assert.equal(store.listPurchases().length, 2);
});

test("M4: stock adjustment — increase, decrease, negative blocked, ledger signed", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  store.addBatch({ medicine_id: String(m.id), batch_number: "B-01", qty: 30 });

  const up = store.adjustStock({
    medicine_id: String(m.id),
    batch_number: "B-01",
    quantity: 5,
    reason: "Found stock",
  });
  assert.equal(Number(up.qty), 35);

  const down = store.adjustStock({
    medicine_id: String(m.id),
    batch_number: "B-01",
    quantity: -10,
    reason: "Damaged goods",
  });
  assert.equal(Number(down.qty), 25);

  assert.throws(
    () =>
      store.adjustStock({
        medicine_id: String(m.id),
        batch_number: "B-01",
        quantity: -100,
        reason: "Over-adjust",
      }),
    /negative/
  );

  const ledger = store.listMovements({ medicineId: String(m.id) });
  const adjustments = ledger.filter((mv) => mv.movement_type === "adjust");
  assert.equal(adjustments.length, 2);
  assert.equal(Number(adjustments[0].quantity), -10);
  assert.equal(Number(adjustments[1].quantity), 5);
});

test("M4: POS local sale is atomic — sale, items, stock deduction, ledger", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  store.addBatch({
    medicine_id: String(m.id),
    batch_number: "B-01",
    expiry_date: "2029-01-01",
    selling_price: 10,
    qty: 20,
  });

  const sale = store.createSale({
    patient_name: "Ravi",
    patient_phone: "9876543210",
    patient_age: 30,
    sale_type: "walk_in",
    cashier_name: "Rani",
    items: [{ medicine_id: String(m.id), name: "Paracetamol 500mg", qty: 2, price: 10, gst_percent: 12 }],
    subtotal: 20,
    tax: 2.4,
    cgst: 1.2,
    sgst: 1.2,
    tax_type: "intra",
    grand_total: 22.4,
    payment_method: "cash",
    amount_paid: 22.4,
  });

  assert.ok(sale.sale_number.startsWith("PH-"));
  assert.equal(sale.line_items.length, 1);
  assert.equal(Number(sale.line_items[0].qty), 2);
  assert.equal(sale.line_items[0].batch_number, "B-01");

  // Stock deducted from the correct batch.
  assert.equal(Number(store.getBatch(String(m.id), "B-01")!.qty), 18);
  assert.equal(Number(store.getMedicine(String(m.id))!.stock_qty), 18);

  // Ledger has opening + sale-out entries.
  const ledger = store.listMovements({ medicineId: String(m.id) });
  assert.equal(ledger.length, 2);
  const out = ledger.find((mv) => mv.movement_type === "out")!;
  assert.equal(Number(out.quantity), 2);
  assert.equal(out.reference_type, "sale");
});

test("M4: quantity above available stock is blocked and rolls back everything", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  store.addBatch({ medicine_id: String(m.id), batch_number: "B-01", qty: 5 });

  assert.throws(
    () =>
      store.createSale({
        patient_name: "X",
        items: [{ medicine_id: String(m.id), name: "Paracetamol 500mg", qty: 6, price: 10 }],
        subtotal: 60,
        tax: 0,
        grand_total: 60,
        payment_method: "cash",
        amount_paid: 60,
      }),
    /Insufficient stock for Paracetamol 500mg. Available: 5/
  );

  // Nothing persisted: no sale, no movement, stock untouched.
  assert.equal(store.listSales().length, 0);
  assert.equal(
    store.listMovements({ medicineId: String(m.id) }).filter((mv) => mv.movement_type === "out").length,
    0
  );
  assert.equal(Number(store.getBatch(String(m.id), "B-01")!.qty), 5);
});

test("M4: expired batch cannot be sold", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  store.addBatch({
    medicine_id: String(m.id),
    batch_number: "OLD",
    expiry_date: "2020-01-01",
    qty: 10,
  });

  assert.throws(
    () =>
      store.createSale({
        patient_name: "X",
        items: [
          { medicine_id: String(m.id), name: "Paracetamol 500mg", qty: 1, price: 10, batch_number: "OLD" },
        ],
        subtotal: 10,
        tax: 0,
        grand_total: 10,
        payment_method: "cash",
        amount_paid: 10,
      }),
    /Cannot sell expired batch OLD/
  );
  assert.equal(Number(store.getBatch(String(m.id), "OLD")!.qty), 10);
});

test("M4: mid-sale failure rolls back the entire transaction (no partial state)", () => {
  const store = newStore();
  const a = store.createMedicine(med());
  const b = store.createMedicine(
    med({ name: "ORS Sachet", sku: "ORS-1", barcode: "9991", selling_price: 20 })
  );
  store.addBatch({ medicine_id: String(a.id), batch_number: "A-1", qty: 10 });
  store.addBatch({ medicine_id: String(b.id), batch_number: "B-1", qty: 3 });

  assert.throws(
    () =>
      store.createSale({
        patient_name: "X",
        items: [
          { medicine_id: String(a.id), name: "Paracetamol 500mg", qty: 4, price: 10 },
          { medicine_id: String(b.id), name: "ORS Sachet", qty: 9, price: 20 },
        ],
        subtotal: 220,
        tax: 0,
        grand_total: 220,
        payment_method: "cash",
        amount_paid: 220,
      }),
    /Insufficient stock/
  );

  // First item's stock was NOT deducted — everything rolled back.
  assert.equal(Number(store.getBatch(String(a.id), "A-1")!.qty), 10);
  assert.equal(Number(store.getBatch(String(b.id), "B-1")!.qty), 3);
  assert.equal(store.listSales().length, 0);
  assert.equal(
    store.listMovements({ medicineId: String(a.id) }).filter((mv) => mv.movement_type === "out").length,
    0
  );
  assert.equal(
    store.listMovements({ medicineId: String(b.id) }).filter((mv) => mv.movement_type === "out").length,
    0
  );
});

test("M4: stock can never go negative", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  store.addBatch({ medicine_id: String(m.id), batch_number: "B-01", qty: 2 });

  // Sell 2 (OK), then try to sell 1 more.
  store.createSale({
    patient_name: "X",
    items: [{ medicine_id: String(m.id), name: "Paracetamol 500mg", qty: 2, price: 10 }],
    subtotal: 20,
    tax: 0,
    grand_total: 20,
    payment_method: "cash",
    amount_paid: 20,
  });
  assert.equal(Number(store.getBatch(String(m.id), "B-01")!.qty), 0);
  assert.throws(
    () =>
      store.createSale({
        patient_name: "Y",
        items: [{ medicine_id: String(m.id), name: "Paracetamol 500mg", qty: 1, price: 10 }],
        subtotal: 10,
        tax: 0,
        grand_total: 10,
        payment_method: "cash",
        amount_paid: 10,
      }),
    /Insufficient stock|No available stock/
  );
});

test("M4: sales return restores the correct batch stock + refund ledger", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  store.addBatch({
    medicine_id: String(m.id),
    batch_number: "B-01",
    expiry_date: "2029-01-01",
    qty: 10,
  });
  store.addBatch({
    medicine_id: String(m.id),
    batch_number: "B-02",
    expiry_date: "2029-06-01",
    qty: 20,
  });

  // Sell 4 from B-01 (explicit batch) and 4 from B-02.
  const sale = store.createSale({
    patient_name: "Ravi",
    items: [
      { medicine_id: String(m.id), name: "Paracetamol 500mg", qty: 4, price: 10, batch_number: "B-01" },
      { medicine_id: String(m.id), name: "Paracetamol 500mg", qty: 4, price: 10, batch_number: "B-02" },
    ],
    subtotal: 80,
    tax: 0,
    grand_total: 80,
    payment_method: "cash",
    amount_paid: 80,
  });
  assert.equal(Number(store.getBatch(String(m.id), "B-01")!.qty), 6);
  assert.equal(Number(store.getBatch(String(m.id), "B-02")!.qty), 16);

  const ret = store.createReturn({
    original_sale_number: String(sale.sale_number),
    patient_name: "Ravi",
    return_reason: "Customer returned",
    refund_method: "cash",
    items: [
      { medicine_name: "Paracetamol 500mg", batch_number: "B-01", quantity: 2, unit_price: 10, total_price: 20 },
    ],
  });
  assert.ok(ret.return_number);
  assert.equal(Number(ret.refund_amount), 20);

  // EXACT batch restored (B-01 back to 8, B-02 untouched at 16).
  assert.equal(Number(store.getBatch(String(m.id), "B-01")!.qty), 8);
  assert.equal(Number(store.getBatch(String(m.id), "B-02")!.qty), 16);

  // Ledger records the return as an 'in' movement.
  const ledger = store.listMovements({ medicineId: String(m.id) });
  const returned = ledger.filter((mv) => mv.reference_type === "return");
  assert.equal(returned.length, 1);
  assert.equal(Number(returned[0].quantity), 2);

  // Refund payment row recorded.
  const payments = store.listPayments({ saleNumber: String(sale.sale_number) });
  const refund = payments.find((p) => p.status === "refunded");
  assert.ok(refund);
  assert.equal(Number(refund!.amount), 20);
});

test("M4: cannot return more than what was sold; full return marks sale refunded", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  store.addBatch({ medicine_id: String(m.id), batch_number: "B-01", qty: 10 });
  const sale = store.createSale({
    patient_name: "Ravi",
    items: [{ medicine_id: String(m.id), name: "Paracetamol 500mg", qty: 3, price: 10 }],
    subtotal: 30,
    tax: 0,
    grand_total: 30,
    payment_method: "cash",
    amount_paid: 30,
  });

  assert.throws(
    () =>
      store.createReturn({
        original_sale_number: String(sale.sale_number),
        return_reason: "x",
        items: [{ medicine_name: "Paracetamol 500mg", quantity: 4, unit_price: 10 }],
      }),
    /at most 3 can be returned/
  );

  // Full return (3 of 3) → sale marked refunded.
  store.createReturn({
    original_sale_number: String(sale.sale_number),
    return_reason: "x",
    refund_method: "cash",
    items: [{ medicine_name: "Paracetamol 500mg", quantity: 3, unit_price: 10, total_price: 30 }],
  });
  const updated = store.getSale(String(sale.sale_number));
  assert.equal(updated!.payment_status, "refunded");
  assert.equal(Number(updated!.amount_returned), 30);
  assert.equal(Number(store.getBatch(String(m.id), "B-01")!.qty), 10);
});

test("M4: stock movement ledger is immutable (no UPDATE, no DELETE)", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  store.addBatch({ medicine_id: String(m.id), batch_number: "B-01", qty: 5 });
  const mv = store.listMovements({ medicineId: String(m.id) })[0];

  assert.throws(
    () => store.execute("UPDATE stock_movements SET quantity = 999 WHERE id = ?", [String(mv.id)]),
    /immutable/
  );
  assert.throws(
    () => store.execute("DELETE FROM stock_movements WHERE id = ?", [String(mv.id)]),
    /immutable/
  );
  assert.equal(store.listMovements({ medicineId: String(m.id) }).length, 1);
});

test("M4: FEFO — unspecified batch sells earliest-expiry first", () => {
  const store = newStore();
  const m = store.createMedicine(med());
  store.addBatch({ medicine_id: String(m.id), batch_number: "LATE", expiry_date: "2030-01-01", qty: 5 });
  store.addBatch({ medicine_id: String(m.id), batch_number: "EARLY", expiry_date: "2028-01-01", qty: 5 });

  const sale = store.createSale({
    patient_name: "X",
    items: [{ medicine_id: String(m.id), name: "Paracetamol 500mg", qty: 3, price: 10 }],
    subtotal: 30,
    tax: 0,
    grand_total: 30,
    payment_method: "cash",
    amount_paid: 30,
  });
  assert.equal(sale.line_items[0].batch_number, "EARLY");
  assert.equal(store.getSale(String(sale.sale_number))!.line_items[0].batch_number, "EARLY");
  assert.equal(Number(store.getBatch(String(m.id), "EARLY")!.qty), 2);
  assert.equal(Number(store.getBatch(String(m.id), "LATE")!.qty), 5);
});

test("M4: data persists across restart in a file-backed store (fully offline)", () => {
  const dir = mkdtempSync(join(tmpdir(), "pharmacy-m4-"));
  const file = join(dir, "pharmacy.db");

  const first = newStore(file);
  const m = first.createMedicine(med());
  first.addBatch({ medicine_id: String(m.id), batch_number: "B-01", qty: 10 });
  const sale = first.createSale({
    patient_name: "Ravi",
    items: [{ medicine_id: String(m.id), name: "Paracetamol 500mg", qty: 2, price: 10 }],
    subtotal: 20,
    tax: 0,
    grand_total: 20,
    payment_method: "cash",
    amount_paid: 20,
  });
  first.close();

  // "Restart": reopen the same file, no network anywhere.
  const second = newStore(file);
  const meds = second.listMedicines();
  assert.equal(meds.length, 1);
  assert.equal(Number(meds[0].stock_qty), 8);
  const reloaded = second.getSale(String(sale.sale_number));
  assert.ok(reloaded);
  assert.equal(reloaded!.line_items.length, 1);
  assert.equal(second.listMovements({ medicineId: String(m.id) }).length, 2);
  assert.equal(second.listSales().length, 1);
  second.close();
});

test("M4: batches are rejected for unknown medicine; sale rejects unknown medicine", () => {
  const store = newStore();
  assert.throws(
    () => store.addBatch({ medicine_id: "nope", batch_number: "B-1", qty: 1 }),
    /Medicine not found/
  );
  assert.throws(
    () =>
      store.createSale({
        patient_name: "X",
        items: [{ medicine_id: "nope", name: "Ghost", qty: 1, price: 1 }],
        subtotal: 1,
        tax: 0,
        grand_total: 1,
        payment_method: "cash",
        amount_paid: 1,
      }),
    /Medicine not found/
  );
});
