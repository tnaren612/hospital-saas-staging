/**
 * M7 Hybrid Sync — apply contract: medicines + sales are idempotent,
 * never duplicate a sale_number, never double-deduct stock.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCloudMedicine,
  applyCloudSale,
  applyCloudCustomer,
  applyCloudSupplier,
  applyCloudCategory,
  applyCloudPurchaseOrder,
  applyErrorMessage,
  classifyApplyFailure,
  missingSchemaColumn,
  clientSaleNumber,
  medicineIdentity,
  MemoryHybridCloudStore,
} from "../../src/lib/pharmacy/hybrid-apply";

const HOSPITAL = "11111111-1111-1111-1111-111111111111";
const MED_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SALE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function medicinePayload(over: Record<string, unknown> = {}) {
  return {
    id: MED_ID,
    name: "Offline Cash Med",
    sku: "8901056617645",
    barcode: "8901056617645",
    selling_price: 40,
    stock_qty: 15,
    qty: 15,
    unit: "tab",
    ...over,
  };
}

function salePayload(over: Record<string, unknown> = {}) {
  return {
    id: SALE_ID,
    sale_number: "LOC-20260817-142020-85",
    patient_name: "Walk-in Customer",
    sale_type: "walk_in",
    items: [
      {
        medicine_id: MED_ID,
        name: "Offline Cash Med",
        qty: 1,
        price: 40,
      },
    ],
    subtotal: 40,
    discount: 0,
    tax: 4.8,
    grand_total: 44.8,
    payment_method: "cash",
    amount_paid: 44.8,
    amount_returned: 0,
    ...over,
  };
}

describe("hybrid apply helpers", () => {
  it("reads the client sale_number (never invents PH- when one is present)", () => {
    assert.equal(clientSaleNumber(salePayload()), "LOC-20260817-142020-85");
    assert.equal(clientSaleNumber({ sale_number: "  " }), null);
  });

  it("identifies a medicine by id, barcode, then sku", () => {
    const ident = medicineIdentity(medicinePayload());
    assert.equal(ident.id, MED_ID);
    assert.equal(ident.barcode, "8901056617645");
    assert.equal(ident.sku, "8901056617645");
  });

  it("classifies stock conflicts separately from transport failures", () => {
    assert.equal(classifyApplyFailure("Insufficient stock for X. Available: 0"), "conflict");
    assert.equal(classifyApplyFailure("duplicate sale_number"), "failed");
    assert.equal(classifyApplyFailure("network timeout"), "failed");
  });

  it("extracts a missing PostgREST column so apply can retry without it", () => {
    assert.equal(
      missingSchemaColumn(
        "Could not find the 'amount_paid' column of 'pharmacy_sales' in the schema cache"
      ),
      "amount_paid"
    );
    assert.equal(missingSchemaColumn("boom"), null);
    assert.equal(
      applyErrorMessage({ message: "Could not find the 'amount_paid' column" }),
      "Could not find the 'amount_paid' column"
    );
  });
});

describe("applyCloudMedicine", () => {
  it("inserts once and returns the same row on replay (barcode / id / sku)", async () => {
    const store = new MemoryHybridCloudStore();
    const first = await applyCloudMedicine(store, medicinePayload(), HOSPITAL);
    assert.equal(first.duplicate, false);
    assert.equal(store.medicines.length, 1);
    assert.equal(Number(store.medicines[0].stock_qty), 15);

    const byId = await applyCloudMedicine(store, medicinePayload(), HOSPITAL);
    const byBarcode = await applyCloudMedicine(
      store,
      medicinePayload({ id: undefined, sku: "other" }),
      HOSPITAL
    );
    const bySku = await applyCloudMedicine(
      store,
      medicinePayload({ id: undefined, barcode: undefined }),
      HOSPITAL
    );
    assert.equal(byId.duplicate, true);
    assert.equal(byBarcode.duplicate, true);
    assert.equal(bySku.duplicate, true);
    assert.equal(store.medicines.length, 1);
    assert.equal(byId.id, first.id);
  });
});

describe("applyCloudSale", () => {
  it("replays the same sale_number without a second row or second stock out", async () => {
    const store = new MemoryHybridCloudStore();
    await applyCloudMedicine(store, medicinePayload(), HOSPITAL);

    const first = await applyCloudSale(store, salePayload(), HOSPITAL);
    assert.equal(first.duplicate, false);
    assert.equal(String(first.row.sale_number), "LOC-20260817-142020-85");
    assert.equal(Number(store.medicines[0].stock_qty), 14);
    assert.equal(store.sales.length, 1);
    assert.equal(store.movements.length, 1);

    const replay = await applyCloudSale(store, salePayload(), HOSPITAL);
    assert.equal(replay.duplicate, true);
    assert.equal(replay.id, first.id);
    assert.equal(store.sales.length, 1);
    assert.equal(Number(store.medicines[0].stock_qty), 14);
    assert.equal(store.movements.length, 1);
  });

  it("conflicts when the cloud replica has no stock for that medicine", async () => {
    const store = new MemoryHybridCloudStore();
    await assert.rejects(
      applyCloudSale(store, salePayload(), HOSPITAL),
      /Insufficient stock/
    );
    assert.equal(store.sales.length, 0);
  });

  it("treats a unique-violation race as the existing sale (no second deduct)", async () => {
    const store = new MemoryHybridCloudStore();
    await applyCloudMedicine(store, medicinePayload(), HOSPITAL);
    const originalInsert = store.insertSale.bind(store);
    let calls = 0;
    store.insertSale = async (row) => {
      calls += 1;
      if (calls === 1) {
        await originalInsert(row);
        throw new Error("duplicate key value violates unique constraint");
      }
      return originalInsert(row);
    };
    const applied = await applyCloudSale(store, salePayload(), HOSPITAL);
    assert.equal(applied.duplicate, true);
    assert.equal(store.sales.length, 1);
    assert.equal(Number(store.medicines[0].stock_qty), 15);
  });
});

describe("apply named cloud entities", () => {
  it("upserts customer / supplier / category / PO by natural key", async () => {
    const store = new MemoryHybridCloudStore();
    const c1 = await applyCloudCustomer(store, { name: "Ravi", phone: "9" }, HOSPITAL);
    const c2 = await applyCloudCustomer(store, { name: "Ravi", phone: "8" }, HOSPITAL);
    assert.equal(c2.duplicate, true);
    assert.equal(c1.id, c2.id);

    const s1 = await applyCloudSupplier(store, { name: "Acme" }, HOSPITAL);
    const s2 = await applyCloudSupplier(store, { name: "Acme" }, HOSPITAL);
    assert.equal(s2.id, s1.id);

    const cat = await applyCloudCategory(store, { name: "OTC" }, HOSPITAL);
    assert.equal(cat.duplicate, false);

    const po = await applyCloudPurchaseOrder(
      store,
      { po_number: "PO-1", total_amount: 10 },
      HOSPITAL
    );
    const po2 = await applyCloudPurchaseOrder(
      store,
      { po_number: "PO-1", total_amount: 99 },
      HOSPITAL
    );
    assert.equal(po2.duplicate, true);
    assert.equal(po.id, po2.id);
  });
});
