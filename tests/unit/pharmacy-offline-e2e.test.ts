/**
 * M4+M5 real offline E2E workflow (simulated end-to-end on SQLite).
 *
 * Mirrors the manual acceptance run:
 *   login is handled by the existing staff auth (not part of this store);
 *   every pharmacy step below runs with the internet completely unavailable
 *   and ends with a full application "restart" (close + reopen the DB file).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PharmacySqliteStore } from "../../src/lib/pharmacy/sqlite-store";

test("OFFLINE E2E: full POS lifecycle without network, survives restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "pharmacy-e2e-"));
  const file = join(dir, "pharmacy.db");
  const store = new PharmacySqliteStore(file);

  // 1) Add Medicine
  const m = store.createMedicine({
    name: "Paracetamol 500mg",
    manufacturer: "Cipla",
    sku: "PARA-500",
    barcode: "8901234567890",
    selling_price: 10,
    purchase_price: 4,
  });
  assert.ok(m.id, "Add Medicine");

  // 2) Attempt Duplicate -> BLOCKED
  assert.throws(
    () =>
      store.createMedicine({
        name: "Paracetamol 500mg",
        manufacturer: "Cipla",
        sku: "PARA-500",
      }),
    /already exists/,
    "Duplicate medicine blocked"
  );

  // 3) Add Batch
  const batch = store.addBatch({
    medicine_id: String(m.id),
    batch_number: "P-2601",
    expiry_date: "2029-12-31",
    selling_price: 10,
    qty: 0,
  });
  assert.ok(batch.id, "Add Batch");

  // 4) Add Stock (opening)
  const stocked = store.addStock({
    medicine_id: String(m.id),
    batch_number: "P-2601",
    qty: 100,
  });
  assert.equal(Number(stocked.qty), 100, "Add Stock");

  // 5) Scan/Search Medicine
  const byBarcode = store.findMedicineByBarcode("8901234567890");
  assert.ok(byBarcode, "Scan by barcode");
  const bySearch = store.listMedicines({ search: "paracetamol" });
  assert.equal(bySearch.length, 1, "Search medicine");

  // 6) Add Patient + Age (walk-in with UHID)
  // 7) Add Medicine to Cart + 8) Cash Payment + 9) Complete Sale
  const sale = store.createSale({
    patient_name: "Patient E2E",
    patient_age: 45,
    patient_gender: "Male",
    patient_uhid: "SSH-E2E-01",
    sale_type: "walk_in",
    cashier_name: "Cashier One",
    items: [
      {
        medicine_id: String(m.id),
        name: "Paracetamol 500mg",
        qty: 2,
        price: 10,
        gst_percent: 12,
        batch_number: "P-2601",
      },
    ],
    subtotal: 20,
    tax: 2.4,
    cgst: 1.2,
    sgst: 1.2,
    tax_type: "intra",
    grand_total: 22.4,
    payment_method: "cash",
    amount_paid: 22.4,
    amount_returned: 0,
    payments: [{ method: "cash", amount: 22.4 }],
  });
  assert.equal(sale.payment_status, "paid", "Complete sale (cash)");
  assert.equal(sale.line_items.length, 1, "Sale line items");

  // 10) Verify Stock Deduction
  assert.equal(Number(store.getBatch(String(m.id), "P-2601")!.qty), 98, "Stock deducted");
  assert.equal(Number(store.getMedicine(String(m.id))!.stock_qty), 98, "Total stock");

  // 11) Generate Bill / 12) Print-Preview / 13) Reprint (receipt rebuilt from row)
  const reloaded = store.getSale(String(sale.sale_number));
  assert.ok(reloaded, "Bill persisted");
  assert.equal(String(reloaded!.sale_number).startsWith("PH-"), true, "Sale number");

  // 14) Return Medicine + 15) Refund + 16) Verify Stock Restoration
  const ret = store.createReturn({
    original_sale_number: String(sale.sale_number),
    patient_name: "Patient E2E",
    return_reason: "Customer returned one strip",
    refund_method: "cash",
    items: [
      {
        medicine_name: "Paracetamol 500mg",
        batch_number: "P-2601",
        quantity: 1,
        unit_price: 10,
        total_price: 10,
      },
    ],
  });
  assert.equal(Number(ret.refund_amount), 10, "Refund amount");
  assert.equal(
    Number(store.getBatch(String(m.id), "P-2601")!.qty),
    99,
    "Stock restored to correct batch"
  );
  const refundPay = store
    .listPayments({ saleNumber: String(sale.sale_number) })
    .find((p) => p.status === "refunded");
  assert.ok(refundPay, "Refund payment recorded");

  // 17) Restart the application while still offline.
  store.close();
  const second = new PharmacySqliteStore(file);

  assert.equal(second.listSales().length, 1, "Transaction survives restart");
  assert.equal(
    second.getSale(String(sale.sale_number))!.line_items.length,
    1,
    "Sale items survive restart"
  );
  assert.equal(
    Number(second.getMedicine(String(m.id))!.stock_qty),
    99,
    "Inventory survives restart"
  );
  assert.equal(
    second.listMovements({ medicineId: String(m.id) }).length,
    3,
    "Immutable ledger survives restart (stock-in, sale-out, return-in)"
  );
  assert.equal(
    second.listPatients()[0].uhid,
    "SSH-E2E-01",
    "Patient record survives restart"
  );
  assert.equal(second.listPayments({ saleNumber: String(sale.sale_number) }).length, 2, "Payments survive restart");
  second.close();
});
