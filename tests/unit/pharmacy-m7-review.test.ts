/**
 * Regression tests for M1–M7 review High issues 1–5.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCloudMedicine,
  applyCloudSale,
  MemoryHybridCloudStore,
} from "../../src/lib/pharmacy/hybrid-apply";
import {
  beginCharge,
  createChargeLockState,
  endCharge,
} from "../../src/lib/pharmacy/pos-charge-lock";
import {
  isPharmacyLocalMode,
  pharmacySqlitePath,
  requirePersistentPharmacySqlitePath,
} from "../../src/lib/pharmacy/sqlite-path";
import {
  shouldWriteLedger,
  writeSyncLedger,
  type LedgerRow,
} from "../../src/lib/pharmacy/sync-ledger";

const HOSPITAL = "11111111-1111-1111-1111-111111111111";
const MED_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function med() {
  return {
    id: MED_ID,
    name: "Review Med",
    sku: "8901",
    barcode: "8901",
    selling_price: 40,
    stock_qty: 15,
    qty: 15,
    hospital_id: HOSPITAL,
  };
}

function sale(over: Record<string, unknown> = {}) {
  return {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    sale_number: "LOC-REVIEW-1",
    patient_name: "Walk-in Customer",
    sale_type: "walk_in",
    items: [{ medicine_id: MED_ID, name: "Review Med", qty: 1, price: 40 }],
    subtotal: 40,
    discount: 0,
    tax: 0,
    grand_total: 40,
    payment_method: "cash",
    amount_paid: 40,
    amount_returned: 0,
    ...over,
  };
}

describe("1. atomic sale apply + retry completes missing stock", () => {
  it("rolls back a new sale when decrement fails (no orphan row)", async () => {
    const store = new MemoryHybridCloudStore();
    await applyCloudMedicine(store, med(), HOSPITAL);
    store.failNextDecrement = new Error("movement failed");
    await assert.rejects(applyCloudSale(store, sale(), HOSPITAL), /movement failed/);
    assert.equal(store.sales.length, 0);
    assert.equal(Number(store.medicines[0].stock_qty), 15);
    assert.equal(store.movements.length, 0);
  });

  it("retry of a committed sale without movement deducts exactly once", async () => {
    const store = new MemoryHybridCloudStore();
    await applyCloudMedicine(store, med(), HOSPITAL);
    store.simulateCommittedPartial = true;
    store.failNextDecrement = new Error("movement failed");
    await assert.rejects(applyCloudSale(store, sale(), HOSPITAL), /movement failed/);
    assert.equal(store.sales.length, 1, "sale row already committed");
    assert.equal(Number(store.medicines[0].stock_qty), 15);
    assert.equal(store.movements.length, 0);

    const retry = await applyCloudSale(store, sale(), HOSPITAL);
    assert.equal(retry.duplicate, true);
    assert.equal(store.sales.length, 1);
    assert.equal(Number(store.medicines[0].stock_qty), 14);
    assert.equal(store.movements.length, 1);
    assert.equal(store.movements[0].reference, "LOC-REVIEW-1");

    const again = await applyCloudSale(store, sale(), HOSPITAL);
    assert.equal(again.duplicate, true);
    assert.equal(Number(store.medicines[0].stock_qty), 14);
    assert.equal(store.movements.length, 1);
  });
});

describe("2. atomic stock decrement", () => {
  it("fails when qty exceeds stock and leaves stock unchanged", async () => {
    const store = new MemoryHybridCloudStore();
    await applyCloudMedicine(store, { ...med(), stock_qty: 5, qty: 5 }, HOSPITAL);
    await assert.rejects(
      store.decrementMedicineStock(MED_ID, 6, HOSPITAL),
      /Insufficient stock/
    );
    assert.equal(Number(store.medicines[0].stock_qty), 5);
    await store.decrementMedicineStock(MED_ID, 3, HOSPITAL);
    assert.equal(Number(store.medicines[0].stock_qty), 2);
    await assert.rejects(
      store.decrementMedicineStock(MED_ID, 3, HOSPITAL),
      /Insufficient stock/
    );
    assert.equal(Number(store.medicines[0].stock_qty), 2);
  });

  it("does not decrement another hospital's row", async () => {
    const store = new MemoryHybridCloudStore();
    await applyCloudMedicine(store, med(), HOSPITAL);
    await assert.rejects(
      store.decrementMedicineStock(MED_ID, 1, "22222222-2222-2222-2222-222222222222"),
      /Insufficient stock/
    );
    assert.equal(Number(store.medicines[0].stock_qty), 15);
  });
});

describe("3. sync ledger persist + no downgrade", () => {
  it("refuses to overwrite applied with failed", () => {
    assert.equal(shouldWriteLedger({ status: "applied" }, "failed"), false);
    assert.equal(shouldWriteLedger({ status: "failed" }, "applied"), true);
    assert.equal(shouldWriteLedger(null, "applied"), true);
  });

  it("throws when the service-role write returns an error", async () => {
    const client = {
      from() {
        return {
          async insert() {
            return { error: { message: "permission denied for table pharmacy_sync_ledger" } };
          },
          update() {
            return {
              async eq() {
                return { error: { message: "permission denied" } };
              },
            };
          },
        };
      },
    };
    const row: LedgerRow = {
      op_id: "op-1",
      hospital_id: HOSPITAL,
      entity: "sale",
      action: "create",
      status: "applied",
      response: { id: "1" },
      error: null,
    };
    await assert.rejects(writeSyncLedger(client, null, row), /permission denied/);
  });

  it("does not call update when existing row is already applied", async () => {
    let updates = 0;
    const client = {
      from() {
        return {
          async insert() {
            return { error: null };
          },
          update() {
            updates += 1;
            return {
              async eq() {
                return { error: null };
              },
            };
          },
        };
      },
    };
    await writeSyncLedger(
      client,
      { status: "applied" },
      {
        op_id: "op-1",
        hospital_id: HOSPITAL,
        entity: "sale",
        action: "create",
        status: "failed",
        response: null,
        error: "nope",
      }
    );
    assert.equal(updates, 0);
  });
});

describe("4. local sync uses the same SQLite path as /offline", () => {
  it("ignores backend=sqlite when Supabase is configured", () => {
    assert.equal(isPharmacyLocalMode(true), false);
    assert.equal(isPharmacyLocalMode(false), true);
  });

  it("reads PHARMACY_SQLITE_PATH for both offline and sync", () => {
    const prev = process.env.PHARMACY_SQLITE_PATH;
    process.env.PHARMACY_SQLITE_PATH = "C:/data/pharmacy.db";
    try {
      assert.equal(pharmacySqlitePath(), "C:/data/pharmacy.db");
    } finally {
      if (prev === undefined) delete process.env.PHARMACY_SQLITE_PATH;
      else process.env.PHARMACY_SQLITE_PATH = prev;
    }
  });

  it("refuses :memory: as a production sync store", () => {
    assert.throws(
      () => requirePersistentPharmacySqlitePath(undefined, "production"),
      /PHARMACY_SQLITE_PATH must point to a persistent file/
    );
    assert.throws(
      () => requirePersistentPharmacySqlitePath(":memory:", "production"),
      /PHARMACY_SQLITE_PATH must point to a persistent file/
    );
    assert.equal(
      requirePersistentPharmacySqlitePath("C:/data/pharmacy.db", "production"),
      "C:/data/pharmacy.db"
    );
  });
});

describe("5. Charge double-click lock + one sale_number", () => {
  it("second beginCharge is rejected while locked", () => {
    const state = createChargeLockState();
    let n = 0;
    const mint = () => `LOC-${++n}`;
    const first = beginCharge(state, mint);
    const second = beginCharge(state, mint);
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    if (first.ok) assert.equal(first.saleNumber, "LOC-1");
    assert.equal(n, 1);
  });

  it("failed charge reuses the same sale_number", () => {
    const state = createChargeLockState();
    let n = 0;
    const mint = () => `LOC-${++n}`;
    const first = beginCharge(state, mint);
    assert.ok(first.ok);
    endCharge(state, false);
    const retry = beginCharge(state, mint);
    assert.ok(retry.ok);
    if (first.ok && retry.ok) {
      assert.equal(retry.saleNumber, first.saleNumber);
    }
    assert.equal(n, 1);
    endCharge(state, true);
    const next = beginCharge(state, mint);
    assert.ok(next.ok);
    if (next.ok) assert.equal(next.saleNumber, "LOC-2");
  });
});
