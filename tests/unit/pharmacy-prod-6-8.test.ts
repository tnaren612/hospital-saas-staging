/**
 * Regression tests for remaining production issues 6–8.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCloudMedicine,
  applyCloudReturn,
  MemoryHybridCloudStore,
} from "../../src/lib/pharmacy/hybrid-apply";
import {
  pharmacySqlitePathForHospital,
  requirePersistentPharmacySqlitePath,
  tenantSqliteKey,
} from "../../src/lib/pharmacy/sqlite-path";
import { fefoBatches, PharmacySqliteStore } from "../../src/lib/pharmacy/sqlite-store";

const HOSPITAL = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const MED_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function med() {
  return {
    id: MED_ID,
    name: "Return Med",
    sku: "RET-1",
    barcode: "RET-1",
    selling_price: 40,
    stock_qty: 14,
    qty: 14,
    hospital_id: HOSPITAL,
  };
}

function ret(over: Record<string, unknown> = {}) {
  return {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    return_number: "RET-LOC-REVIEW-1",
    original_sale_number: "LOC-REVIEW-1",
    patient_name: "Walk-in Customer",
    return_reason: "customer return",
    return_type: "refund",
    items: [{ medicine_id: MED_ID, medicine_name: "Return Med", quantity: 1, unit_price: 40 }],
    subtotal: 40,
    refund_amount: 40,
    ...over,
  };
}

describe("6. SQLite persistence + multi-tenant isolation", () => {
  it("only a hospital UUID becomes a tenant file key", () => {
    assert.equal(tenantSqliteKey(null), null);
    assert.equal(tenantSqliteKey("local"), null);
    assert.equal(tenantSqliteKey("../etc/passwd"), null);
    assert.equal(tenantSqliteKey(HOSPITAL), HOSPITAL);
  });

  it("gives each hospital its own persistent file and keeps standalone unscoped", () => {
    const prev = process.env.PHARMACY_SQLITE_PATH;
    process.env.PHARMACY_SQLITE_PATH = "C:/data/pharmacy.db";
    try {
      assert.equal(pharmacySqlitePathForHospital(null), "C:/data/pharmacy.db");
      assert.equal(pharmacySqlitePathForHospital("local"), "C:/data/pharmacy.db");
      assert.equal(
        pharmacySqlitePathForHospital(HOSPITAL),
        `C:/data/pharmacy-${HOSPITAL}.db`
      );
      assert.equal(
        pharmacySqlitePathForHospital(OTHER),
        `C:/data/pharmacy-${OTHER}.db`
      );
      assert.notEqual(
        pharmacySqlitePathForHospital(HOSPITAL),
        pharmacySqlitePathForHospital(OTHER)
      );
    } finally {
      if (prev === undefined) delete process.env.PHARMACY_SQLITE_PATH;
      else process.env.PHARMACY_SQLITE_PATH = prev;
    }
  });

  it("refuses :memory: as a production offline/sync store", () => {
    assert.throws(
      () => requirePersistentPharmacySqlitePath(undefined, "production"),
      /PHARMACY_SQLITE_PATH must point to a persistent file/
    );
    assert.throws(
      () => requirePersistentPharmacySqlitePath(":memory:", "production"),
      /PHARMACY_SQLITE_PATH must point to a persistent file/
    );
  });
});

describe("7. FEFO selects in-stock unexpired batches", () => {
  it("skips expired and zero-qty batches", () => {
    const picked = fefoBatches(
      [
        { batch_number: "EXPIRED", expiry_date: "2020-01-01", qty: 9 },
        { batch_number: "EMPTY", expiry_date: "2027-01-01", qty: 0 },
        { batch_number: "LATER", expiry_date: "2029-01-01", qty: 4 },
        { batch_number: "NEXT", expiry_date: "2028-01-01", qty: 3 },
      ],
      "2026-08-17"
    );
    assert.deepEqual(
      picked.map((b) => b.batch_number),
      ["NEXT", "LATER"]
    );
  });

  it("sells the next unexpired batch when the earliest is expired", () => {
    const store = new PharmacySqliteStore();
    const m = store.createMedicine({
      name: "FEFO-Skip-Expired",
      sku: "FEFO-EXP",
      selling_price: 10,
    });
    store.addBatch({
      medicine_id: String(m.id),
      batch_number: "OLD",
      expiry_date: "2020-01-01",
      qty: 8,
    });
    store.addBatch({
      medicine_id: String(m.id),
      batch_number: "GOOD",
      expiry_date: "2029-01-01",
      qty: 5,
    });
    const sale = store.createSale({
      patient_name: "X",
      items: [{ medicine_id: String(m.id), name: "FEFO-Skip-Expired", qty: 2, price: 10 }],
      subtotal: 20,
      tax: 0,
      grand_total: 20,
      payment_method: "cash",
      amount_paid: 20,
    });
    assert.equal(sale.line_items[0].batch_number, "GOOD");
    assert.equal(Number(store.getBatch(String(m.id), "OLD")!.qty), 8);
    assert.equal(Number(store.getBatch(String(m.id), "GOOD")!.qty), 3);
  });
});

describe("8. cloud return restock is atomic and idempotent", () => {
  it("rolls back a new return when increment fails", async () => {
    const store = new MemoryHybridCloudStore();
    await applyCloudMedicine(store, med(), HOSPITAL);
    store.failNextIncrement = new Error("movement failed");
    await assert.rejects(applyCloudReturn(store, ret(), HOSPITAL), /movement failed/);
    assert.equal(store.returns.length, 0);
    assert.equal(Number(store.medicines[0].stock_qty), 14);
    assert.equal(store.movements.length, 0);
  });

  it("retry of a committed return without movement restocks exactly once", async () => {
    const store = new MemoryHybridCloudStore();
    await applyCloudMedicine(store, med(), HOSPITAL);
    store.simulateCommittedPartial = true;
    store.failNextIncrement = new Error("movement failed");
    await assert.rejects(applyCloudReturn(store, ret(), HOSPITAL), /movement failed/);
    assert.equal(store.returns.length, 1);
    assert.equal(Number(store.medicines[0].stock_qty), 14);
    assert.equal(store.movements.length, 0);

    const retry = await applyCloudReturn(store, ret(), HOSPITAL);
    assert.equal(retry.duplicate, true);
    assert.equal(store.returns.length, 1);
    assert.equal(Number(store.medicines[0].stock_qty), 15);
    assert.equal(store.movements.length, 1);
    assert.equal(store.movements[0].movement_type, "in");
    assert.equal(store.movements[0].reference, "RET-LOC-REVIEW-1");

    const again = await applyCloudReturn(store, ret(), HOSPITAL);
    assert.equal(again.duplicate, true);
    assert.equal(Number(store.medicines[0].stock_qty), 15);
    assert.equal(store.movements.length, 1);
  });

  it("does not restock another hospital's medicine", async () => {
    const store = new MemoryHybridCloudStore();
    await applyCloudMedicine(store, med(), HOSPITAL);
    await assert.rejects(applyCloudReturn(store, ret(), OTHER), /Medicine not found/);
    assert.equal(Number(store.medicines[0].stock_qty), 14);
    assert.equal(store.movements.length, 0);
  });
});
