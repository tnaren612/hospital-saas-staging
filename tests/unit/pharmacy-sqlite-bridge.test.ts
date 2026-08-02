/**
 * M6 BRIDGE — Active POS ↔ M4/M5 SQLite transaction boundary.
 *
 * The SQLite store (behind /api/admin/pharmacy/offline) is the authority for
 * sale acceptance: stock=1 exact scenario, concurrency, atomic rollback,
 * FEFO, immutable ledger, restart persistence, exact-batch returns, and the
 * commit-then-enqueue contract of the POS bridge.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { PharmacySqliteStore, type SqliteSaleInput } from "../../src/lib/pharmacy/sqlite-store";
import {
  commitReturnLocally,
  commitSaleLocally,
  fetchLocalMedicines,
  fetchLocalSale,
} from "../../src/lib/pharmacy/local-tx";
import { buildMedicineIndex, findMedicineByBarcode } from "../../src/lib/pharmacy/barcode/scan";
import { receiptDataFromSale } from "../../src/lib/pharmacy/pos-offline";
import { fallbackSettingsForTest } from "../helpers/pharmacy-fixtures";

const hospital = {
  name: "Sri Srinivasa Hospital",
  address: "Badvel, Andhra Pradesh",
  phone: "08574-123456",
  email: "care@ssh.example",
  gst: "37ABCDE1234F1Z5",
  drug_license: "DL-AP-2026-0042",
  logo_url: "",
};

function seed(store: PharmacySqliteStore, over: Record<string, unknown> = {}) {
  const m = store.createMedicine({
    name: "M6STOCK001",
    manufacturer: "Bridge Pharma",
    sku: "M6STOCK001",
    barcode: "8901234567897",
    selling_price: 50,
    purchase_price: 30,
    ...over,
  });
  store.addBatch({
    medicine_id: String(m.id),
    batch_number: "M6B-2601",
    expiry_date: "2028-03-31",
    selling_price: 50,
    qty: 1,
  });
  return m;
}

function saleFor(
  store: PharmacySqliteStore,
  medId: string,
  qty = 1,
  over: Record<string, unknown> = {}
): SqliteSaleInput {
  const id = randomUUID();
  return {
    _clientId: id,
    sale_number: over.sale_number ? String(over.sale_number) : `LOC-TEST-${id.slice(0, 8)}`,
    patient_name: "Test Customer",
    sale_type: "walk_in" as const,
    cashier_name: "Cashier",
    items: [
      {
        medicine_id: medId,
        name: "M6STOCK001",
        qty,
        price: 50,
        gst_percent: 12,
        batch_number: "M6B-2601",
      },
    ],
    subtotal: 50 * qty,
    discount: 0,
    tax: 6 * qty,
    cgst: 3 * qty,
    sgst: 3 * qty,
    igst: 0,
    tax_type: "intra" as const,
    grand_total: 56 * qty,
    payment_method: "cash",
    payment_status: "paid",
    amount_paid: 56 * qty,
    amount_returned: 0,
    ...over,
  } as unknown as SqliteSaleInput;
}

// ---------------------------------------------------------------------------
// 1–3. POS adapter reaches SQLite; stock=1 scenario
// ---------------------------------------------------------------------------

test("bridge: commitSaleLocally POSTs the sale to the offline route (adapter reaches SQLite)", async () => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; body: Record<string, unknown> } | null = null;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = {
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      };
      return new Response(
        JSON.stringify({
          data: { id: "srv-1", sale_number: "LOC-1", line_items: [], payments: [] },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const result = await commitSaleLocally({
      sale_number: "LOC-1",
      items: [{ name: "M6STOCK001", qty: 1, price: 50 }],
      grand_total: 56,
    });
    assert.equal(result.ok, true);
    assert.ok(captured, "fetch must be called");
    const capturedCall = captured as { url: string; body: Record<string, unknown> };
    assert.match(capturedCall.url, /\/api\/admin\/pharmacy\/offline\?action=sale/);
    assert.equal(capturedCall.body.sale_number, "LOC-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stock=1: first sale succeeds and stock becomes 0", () => {
  const store = new PharmacySqliteStore();
  const m = seed(store);
  const sale = store.createSaleIdempotent(saleFor(store, String(m.id), 1));
  assert.ok(sale.id);
  assert.equal(store.getMedicine(String(m.id))?.stock_qty, 0);
  const batch = store.getBatch(String(m.id), "M6B-2601");
  assert.equal(Number(batch?.qty), 0);
});

test("stock=1: second sale is BLOCKED — no payment, no receipt, stock stays 0", () => {
  const store = new PharmacySqliteStore();
  const m = seed(store);
  store.createSaleIdempotent(saleFor(store, String(m.id), 1, { sale_number: "LOC-A" }));

  assert.throws(
    () => store.createSaleIdempotent(saleFor(store, String(m.id), 1, { sale_number: "LOC-B" })),
    /insufficient stock/i
  );
  assert.equal(store.getMedicine(String(m.id))?.stock_qty, 0);
  assert.equal(store.listSales().length, 1, "exactly one sale exists");
  assert.equal(store.listPayments().length, 1, "exactly one payment exists");
});

// ---------------------------------------------------------------------------
// 4. Concurrency
// ---------------------------------------------------------------------------

test("concurrency: two concurrent stock=1 sales → exactly ONE commits, stock 0, never -1", async () => {
  const file = join(tmpdir(), `pharma-conc-${randomUUID()}.db`);
  try {
    const a = new PharmacySqliteStore(file);
    const m = seed(a);
    a.close();

    const b = new PharmacySqliteStore(file);
    const c = new PharmacySqliteStore(file);
    const results = await Promise.allSettled([
      Promise.resolve().then(() =>
        b.createSaleIdempotent(saleFor(b, String(m.id), 1, { sale_number: "CONC-A" }))
      ),
      Promise.resolve().then(() =>
        c.createSaleIdempotent(saleFor(c, String(m.id), 1, { sale_number: "CONC-B" }))
      ),
    ]);

    const okCount = results.filter((r) => r.status === "fulfilled").length;
    const failCount = results.filter((r) => r.status === "rejected").length;
    assert.equal(okCount, 1, "exactly one sale commits");
    assert.equal(failCount, 1, "exactly one sale fails");
    const failed = results.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") {
      assert.match(String(failed.reason), /insufficient stock/i);
    }

    const after = new PharmacySqliteStore(file);
    const stock = Number(after.getMedicine(String(m.id))?.stock_qty ?? -1);
    assert.equal(stock, 0, "final stock is 0, never negative");
    assert.equal(after.listSales().length, 1);
    after.close();
    b.close();
    c.close();
  } finally {
    rmSync(file, { force: true });
    rmSync(`${file}-wal`, { force: true });
    rmSync(`${file}-shm`, { force: true });
  }
});

// ---------------------------------------------------------------------------
// 5–6. Expiry + FEFO
// ---------------------------------------------------------------------------

test("expired batch is blocked", () => {
  const store = new PharmacySqliteStore();
  const m = seed(store);
  store.addBatch({
    medicine_id: String(m.id),
    batch_number: "EXP-OLD",
    expiry_date: "2020-01-01",
    selling_price: 50,
    qty: 5,
  });
  assert.throws(
    () =>
      store.createSaleIdempotent(
        saleFor(store, String(m.id), 1, {
          sale_number: "LOC-EXP",
          items: [
            {
              medicine_id: String(m.id),
              name: "M6STOCK001",
              qty: 1,
              price: 50,
              gst_percent: 12,
              batch_number: "EXP-OLD",
            },
          ],
        })
      ),
    /expired/i
  );
  assert.equal(Number(store.getBatch(String(m.id), "EXP-OLD")?.qty), 5, "stock untouched");
});

test("FEFO: earliest-expiry batch is consumed first", () => {
  const store = new PharmacySqliteStore();
  const m = store.createMedicine({
    name: "FEFO-Med",
    sku: "FEFO-1",
    barcode: "8901234567898",
    selling_price: 40,
  });
  store.addBatch({ medicine_id: String(m.id), batch_number: "A-EARLY", expiry_date: "2027-01-01", selling_price: 40, qty: 2 });
  store.addBatch({ medicine_id: String(m.id), batch_number: "B-LATE", expiry_date: "2028-06-01", selling_price: 40, qty: 5 });

  const sale = store.createSaleIdempotent(
    saleFor(store, String(m.id), 2, {
      sale_number: "LOC-FEFO",
      items: [
        {
          medicine_id: String(m.id),
          name: "FEFO-Med",
          qty: 2,
          price: 40,
          gst_percent: 12,
        },
      ],
    })
  );

  const line = sale.line_items[0] as { batch_number?: string };
  assert.equal(line.batch_number, "A-EARLY", "must consume the earlier expiry batch");
  assert.equal(Number(store.getBatch(String(m.id), "A-EARLY")?.qty), 0);
  assert.equal(Number(store.getBatch(String(m.id), "B-LATE")?.qty), 5, "later batch untouched");
});

// ---------------------------------------------------------------------------
// 7–9. Atomicity + ledger
// ---------------------------------------------------------------------------

test("atomic rollback: mid-transaction stock failure undoes sale, payment, stock and movements", () => {
  const store = new PharmacySqliteStore();
  const m = seed(store);
  const before = store.listMovements({ medicineId: String(m.id) }).length;

  // Two lines on the same batch, each claiming 2 units while only 2 exist:
  // validation passes for both (no writes yet), then the second line's
  // guarded UPDATE fails after the sale + first line + movement were written.
  assert.throws(() =>
    store.createSaleIdempotent(
      saleFor(store, String(m.id), 1, {
        sale_number: "LOC-ROLL",
        items: [
          { medicine_id: String(m.id), name: "M6STOCK001", qty: 1, price: 50, gst_percent: 12, batch_number: "M6B-2601" },
          { medicine_id: String(m.id), name: "M6STOCK001", qty: 1, price: 50, gst_percent: 12, batch_number: "M6B-2601" },
        ],
        grand_total: 112,
        subtotal: 100,
      })
    )
  );

  assert.equal(store.getSale("LOC-ROLL"), null, "sale row absent after rollback");
  assert.equal(store.listPayments().length, 0, "no payment rows after rollback");
  assert.equal(Number(store.getBatch(String(m.id), "M6B-2601")?.qty), 1, "stock unchanged");
  assert.equal(
    store.listMovements({ medicineId: String(m.id) }).length,
    before,
    "movement ledger unchanged"
  );
});

test("movement ledger: sale writes an immutable out movement", () => {
  const store = new PharmacySqliteStore();
  const m = seed(store);
  store.createSaleIdempotent(saleFor(store, String(m.id), 1, { sale_number: "LOC-LED" }));

  const movements = store.listMovements({ medicineId: String(m.id) });
  const saleMovement = movements.find((mv) => mv.movement_type === "out" && mv.reference_type === "sale");
  assert.ok(saleMovement, "sale out-movement exists");
  assert.equal(Number(saleMovement.quantity), 1);
  assert.equal(saleMovement.reference_id, store.getSale("LOC-LED")?.id);

  assert.throws(
    () =>
      store.execute(
        "UPDATE stock_movements SET notes = 'tampered' WHERE id = ?",
        [String(saleMovement.id)]
      ),
    /immutable/i
  );
  assert.throws(
    () => store.execute("DELETE FROM stock_movements WHERE id = ?", [String(saleMovement.id)]),
    /immutable/i
  );
  const notes = store.listMovements({ medicineId: String(m.id) }).find((mv) => mv.id === saleMovement.id);
  assert.notEqual(notes?.notes, "tampered", "ledger row never mutated");
});

// ---------------------------------------------------------------------------
// 10–11. Payments
// ---------------------------------------------------------------------------

test("payments: committed sale persists payment rows", () => {
  const store = new PharmacySqliteStore();
  const m = seed(store);
  store.createSaleIdempotent(
    saleFor(store, String(m.id), 1, {
      sale_number: "LOC-PAY",
      payments: [{ method: "cash", amount: 56 }],
    })
  );
  const payments = store.listPayments();
  assert.equal(payments.length, 1);
  assert.equal(payments[0].method, "cash");
  assert.equal(payments[0].status, "paid");
});

test("payments: split tender preserved as separate ledger rows", () => {
  const store = new PharmacySqliteStore();
  const m = seed(store);
  const sale = store.createSaleIdempotent(
    saleFor(store, String(m.id), 1, {
      sale_number: "LOC-SPLIT",
      payments: [
        { method: "cash", amount: 30, reference: null },
        { method: "upi", amount: 26, reference: "UPI-REF-1" },
      ],
    })
  );
  assert.equal(sale.payments.length, 2);
  const methods = (sale.payments as Array<Record<string, unknown>>)
    .map((p) => String(p.method))
    .sort();
  assert.deepEqual(methods, ["cash", "upi"]);
  assert.equal(sale.payments[1].status, "unverified", "UPI stays unverified offline");
});

// ---------------------------------------------------------------------------
// 12–13. Receipt only after commit
// ---------------------------------------------------------------------------

test("receipt: only a committed transaction row yields a final receipt", async () => {
  const originalFetch = globalThis.fetch;
  try {
    // A failed (stock) transaction returns ok:false with NO data — the POS
    // has nothing to build a receipt from.
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: "Insufficient stock for M6STOCK001. Available: 0", kind: "stock" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )) as unknown as typeof fetch;

    const failed = await commitSaleLocally({ sale_number: "LOC-X", items: [] });
    assert.equal(failed.ok, false);
    assert.equal(failed.kind, "stock");
    assert.equal("data" in failed, false, "no data to finalize a receipt");

    // A committed row DOES produce a final receipt via the same helper the
    // POS uses after commit.
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: {
            id: "srv-1",
            sale_number: "LOC-Y",
            patient_name: "Test",
            subtotal: 50,
            discount: 0,
            tax: 6,
            cgst: 3,
            sgst: 3,
            igst: 0,
            grand_total: 56,
            payment_method: "cash",
            payment_status: "paid",
            amount_paid: 56,
            amount_returned: 0,
            created_at: new Date().toISOString(),
            line_items: [
              { name: "M6STOCK001", qty: 1, price: 50, selling_price: 50, batch_number: "M6B-2601", expiry_date: "2028-03-31", gst_percent: 12 },
            ],
            payments: [{ method: "cash", amount: 56, status: "paid" }],
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )) as unknown as typeof fetch;

    const committed = await commitSaleLocally({ sale_number: "LOC-Y" });
    assert.equal(committed.ok, true);
    const receipt = receiptDataFromSale(committed.data, {
      hospital,
      settings: fallbackSettingsForTest(),
      cashierName: "Cashier",
    });
    assert.ok(receipt, "final receipt builds from the committed row");
    assert.equal(receipt.items.length, 1);
    assert.equal(receipt.transaction_id, "srv-1");
    assert.equal(receipt.amount_paid, 56);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed transaction produces no final receipt (network level)", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const failed = await commitSaleLocally({ sale_number: "LOC-Z", items: [] });
    assert.equal(failed.ok, false);
    assert.equal(failed.kind, "network");
    assert.equal("data" in failed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 14. Restart persistence
// ---------------------------------------------------------------------------

test("restart: sale, payment, stock and movements survive a store reopen", () => {
  const file = join(tmpdir(), `pharma-restart-${randomUUID()}.db`);
  try {
    const first = new PharmacySqliteStore(file);
    const m = seed(first);
    first.createSaleIdempotent(
      saleFor(first, String(m.id), 1, { sale_number: "LOC-RESTART", payments: [{ method: "cash", amount: 56 }] })
    );
    const saleId = String(first.getSale("LOC-RESTART")?.id);
    first.close();

    const reopened = new PharmacySqliteStore(file);
    const sale = reopened.getSale("LOC-RESTART");
    assert.ok(sale, "sale survives restart");
    assert.equal(sale.id, saleId);
    assert.equal(reopened.listPayments({ saleNumber: "LOC-RESTART" }).length, 1, "payment survives");
    assert.equal(Number(reopened.getMedicine(String(m.id))?.stock_qty), 0, "stock stays decremented");
    assert.equal(
      reopened.listMovements({ medicineId: String(m.id) }).filter((mv) => mv.reference_type === "sale").length,
      1,
      "movement survives"
    );
    const receipt = receiptDataFromSale(sale as unknown as Record<string, unknown>, {
      hospital,
      settings: fallbackSettingsForTest(),
      cashierName: "Cashier",
    });
    assert.ok(receipt, "receipt reconstructible from the persisted sale (reprint)");
    reopened.close();
  } finally {
    rmSync(file, { force: true });
    rmSync(`${file}-wal`, { force: true });
    rmSync(`${file}-shm`, { force: true });
  }
});

// ---------------------------------------------------------------------------
// 15–16. Exact-batch return
// ---------------------------------------------------------------------------

function fefoSeed(store: PharmacySqliteStore) {
  const m = store.createMedicine({
    name: "Return-Med",
    sku: "RET-1",
    barcode: "8901234567899",
    selling_price: 40,
  });
  store.addBatch({ medicine_id: String(m.id), batch_number: "A-EARLY", expiry_date: "2027-01-01", selling_price: 40, qty: 2 });
  store.addBatch({ medicine_id: String(m.id), batch_number: "B-LATE", expiry_date: "2028-06-01", selling_price: 40, qty: 5 });
  return m;
}

test("exact-batch return: sold batch A restored, batch B untouched", () => {
  const store = new PharmacySqliteStore();
  const m = fefoSeed(store);
  const sale = store.createSaleIdempotent(
    saleFor(store, String(m.id), 2, {
      sale_number: "LOC-RET-SALE",
      items: [{ medicine_id: String(m.id), name: "Return-Med", qty: 2, price: 40, gst_percent: 12 }],
    })
  );
  const line = sale.line_items[0] as { batch_number?: string };
  assert.equal(line.batch_number, "A-EARLY");
  assert.equal(Number(store.getBatch(String(m.id), "A-EARLY")?.qty), 0);

  const ret = store.createReturnIdempotent({
    original_sale_number: "LOC-RET-SALE",
    patient_name: "Test",
    return_reason: "duplicate",
    refund_amount: 80,
    items: [
      {
        medicine_id: String(m.id),
        medicine_name: "Return-Med",
        batch_number: "A-EARLY",
        quantity: 1,
        unit_price: 40,
      },
    ],
  });
  assert.ok(ret.id);
  assert.equal(Number(store.getBatch(String(m.id), "A-EARLY")?.qty), 1, "exact batch A restored");
  assert.equal(Number(store.getBatch(String(m.id), "B-LATE")?.qty), 5, "batch B never touched");
  const movements = store.listMovements({ medicineId: String(m.id) });
  assert.equal(movements.filter((mv) => mv.reference_type === "return").length, 1);
  const refunds = store.listPayments({ saleNumber: "LOC-RET-SALE" }).filter((p) => p.status === "refunded");
  assert.equal(refunds.length, 1);
});

test("over-return blocked and repeated returns exceed remaining returnable quantity", () => {
  const store = new PharmacySqliteStore();
  const m = fefoSeed(store);
  store.createSaleIdempotent(
    saleFor(store, String(m.id), 2, {
      sale_number: "LOC-RET-OVER",
      items: [{ medicine_id: String(m.id), name: "Return-Med", qty: 2, price: 40, gst_percent: 12 }],
    })
  );

  // Return 2 of 2 — allowed.
  const ret = store.createReturnIdempotent({
    original_sale_number: "LOC-RET-OVER",
    patient_name: "Test",
    return_reason: "duplicate",
    items: [{ medicine_id: String(m.id), medicine_name: "Return-Med", quantity: 2, unit_price: 40 }],
  });

  // A second return for the same sale is an idempotent replay — it returns
  // the already-committed return and must not restore stock a second time.
  const replay = store.createReturnIdempotent({
    original_sale_number: "LOC-RET-OVER",
    patient_name: "Test",
    return_reason: "duplicate",
    items: [{ medicine_id: String(m.id), medicine_name: "Return-Med", quantity: 1, unit_price: 40 }],
  });
  assert.equal(replay.id, ret.id, "same committed return replayed");
  assert.equal(Number(store.getBatch(String(m.id), "A-EARLY")?.qty), 2, "stock not restored twice");

  // Arbitrary over-return on a fresh sale is blocked by the engine.
  const store2 = new PharmacySqliteStore();
  const m2 = fefoSeed(store2);
  store2.createSaleIdempotent(
    saleFor(store2, String(m2.id), 2, {
      sale_number: "LOC-RET-OVER2",
      items: [{ medicine_id: String(m2.id), name: "Return-Med", qty: 2, price: 40, gst_percent: 12 }],
    })
  );
  assert.throws(() =>
    store2.createReturnIdempotent({
      original_sale_number: "LOC-RET-OVER2",
      patient_name: "Test",
      return_reason: "duplicate",
      items: [{ medicine_id: String(m2.id), medicine_name: "Return-Med", quantity: 3, unit_price: 40 }],
    }),
    /at most 2 can be returned/i
  );
});

// ---------------------------------------------------------------------------
// 17. Idempotency
// ---------------------------------------------------------------------------

test("idempotency: retrying a committed sale never duplicates it or stock", () => {
  const store = new PharmacySqliteStore();
  const m = seed(store);
  const first = store.createSaleIdempotent(
    saleFor(store, String(m.id), 1, { sale_number: "LOC-REPLAY", payments: [{ method: "cash", amount: 56 }] })
  );
  // Retry with the identical sale_number (what the queue push does).
  const replay = store.createSaleIdempotent(
    saleFor(store, String(m.id), 1, { sale_number: "LOC-REPLAY", payments: [{ method: "cash", amount: 56 }] })
  );
  assert.equal(replay.id, first.id, "same committed sale returned");
  assert.equal(store.listSales().length, 1, "no duplicate sale");
  assert.equal(Number(store.getBatch(String(m.id), "M6B-2601")?.qty), 0, "stock deducted exactly once");
  assert.equal(
    store.listMovements({ medicineId: String(m.id) }).filter((mv) => mv.reference_type === "sale").length,
    1,
    "one sale movement only"
  );
  assert.equal(store.listPayments().length, 1, "one payment only");
});

// ---------------------------------------------------------------------------
// 18. Cloud dead → local sale still commits
// ---------------------------------------------------------------------------

test("supabase unreachable (every fetch throws) does not block the local SQLite sale", () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const store = new PharmacySqliteStore();
    const m = seed(store);
    const sale = store.createSaleIdempotent(
      saleFor(store, String(m.id), 1, { sale_number: "LOC-NO-NET", payments: [{ method: "cash", amount: 56 }] })
    );
    assert.ok(sale.id);
    assert.equal(Number(store.getMedicine(String(m.id))?.stock_qty), 0);

    // Next sale must observe the decremented SQLite stock.
    assert.throws(
      () => store.createSaleIdempotent(saleFor(store, String(m.id), 1, { sale_number: "LOC-NO-NET-2" })),
      /insufficient stock/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 19–20. Queue contract
// ---------------------------------------------------------------------------

test("sync queue: pushing the committed transaction re-applies idempotently (no second local sale)", () => {
  const store = new PharmacySqliteStore();
  const m = seed(store);
  const committed = store.createSaleIdempotent(
    saleFor(store, String(m.id), 1, { sale_number: "LOC-QUEUE" })
  );
  const queuedPayload = saleFor(store, String(m.id), 1, { sale_number: "LOC-QUEUE" });

  // Exactly what the sync route's applyLocalOp does when the queue pushes.
  const applied = store.createSaleIdempotent(queuedPayload);
  assert.equal(String(applied.id), String(committed.id), "queue push returns the committed sale");
  assert.equal(store.listSales().length, 1);
  assert.equal(Number(store.getMedicine(String(m.id))?.stock_qty), 0);
});

test("failed SQLite transaction is never queued as successful (bridge returns no data)", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const store = new PharmacySqliteStore();
    const m = seed(store);
    store.createSaleIdempotent(saleFor(store, String(m.id), 1, { sale_number: "LOC-FIRST" }));

    // The POS adapter gets the structured 409 — no data object exists to
    // enqueue; the UI shows the stock error instead.
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("kind=medicines")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: String(m.id), name: "M6STOCK001", barcode: "8901234567897", stock_qty: 0, selling_price: 50 },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Insufficient stock for M6STOCK001. Available: 0", kind: "stock" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const failed = await commitSaleLocally(saleFor(store, String(m.id), 1, { sale_number: "LOC-SECOND" }));
    assert.equal(failed.ok, false);
    assert.equal(failed.kind, "stock");
    assert.equal("data" in failed, false, "nothing to enqueue");
    assert.equal(store.listSales().length, 1, "only the first sale exists");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 21–22. UI stock refresh + scanner continuity
// ---------------------------------------------------------------------------

test("stock refresh: fetchLocalMedicines reflects the committed decrement", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      assert.match(url, /kind=medicines/);
      return new Response(
        JSON.stringify({
          data: [
            { id: "m1", name: "M6STOCK001", barcode: "8901234567897", stock_qty: 0, selling_price: 50 },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const rows = await fetchLocalMedicines();
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].stock_qty), 0, "SQLite authority shows the new stock");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scanner resolves against refreshed stock: medicine found, stock badge reads 0", async () => {
  // The refreshed catalog row (stock_qty 0) still resolves by exact barcode —
  // the scanner continues to work; the cart qty guard reads the refreshed 0.
  const refreshed = [
    {
      id: "m1",
      name: "M6STOCK001",
      sku: "M6STOCK001",
      barcode: "8901234567897",
      selling_price: 50,
      stock_qty: 0,
    },
  ];
  const index = buildMedicineIndex(refreshed);
  const found = findMedicineByBarcode(index, "8901234567897");
  assert.ok(found, "barcode still resolves after the sale");
  assert.equal(found.id, "m1");
  assert.equal(Number((found as unknown as { stock_qty: number }).stock_qty), 0);
});

// ---------------------------------------------------------------------------
// Bridge: returns adapter
// ---------------------------------------------------------------------------

test("bridge: commitReturnLocally POSTs the return; fetchLocalSale returns sold batches", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("kind=sales")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "sale-1",
              sale_number: "LOC-RET",
              line_items: [{ name: "Return-Med", batch_number: "A-EARLY", medicine_id: "m1" }],
              payments: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("action=return")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.equal(body.original_sale_number, "LOC-RET");
        const items = body.items as Array<Record<string, unknown>>;
        assert.equal(items[0].batch_number, "A-EARLY", "exact sold batch sent to the engine");
        return new Response(
          JSON.stringify({
            data: { id: "ret-1", return_number: "RET-LOC-RET", items },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    const sale = await fetchLocalSale("LOC-RET");
    assert.ok(sale);
    const line = (sale.line_items as Array<Record<string, unknown>>)[0];
    assert.equal(line.batch_number, "A-EARLY");

    const result = await commitReturnLocally({
      original_sale_number: "LOC-RET",
      patient_name: "Test",
      return_reason: "duplicate",
      items: [{ medicine_id: "m1", medicine_name: "Return-Med", batch_number: line.batch_number, quantity: 1, unit_price: 40 }],
    });
    assert.equal(result.ok, true);
    assert.equal(String(result.data.return_number), "RET-LOC-RET");
    assert.ok(calls.some((u) => u.includes("action=return")), "return POST reached the offline route");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
