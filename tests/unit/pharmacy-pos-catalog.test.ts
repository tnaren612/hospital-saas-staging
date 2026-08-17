/**
 * PHARMACY POS CATALOG — persistent medicine list / search results.
 *
 * The medicine catalog (SQLite-authoritative) is a SEPARATE concept from the
 * cart (temporary bill) and the sale (committed transaction). These tests pin
 * the 21 regression behaviors:
 *
 *   1–3   catalog list: SQLite medicines appear, empty search shows a capped
 *         recent/available list, "view all" shows the full catalog
 *   4–8   search: name / generic / SKU / barcode / manufacturer
 *   9     search rows carry SQLite price + stock
 *   10–13 unknown barcode: medicine + opening batch committed to SQLite via
 *         the offline route, visible immediately, survives store restart
 *   14–16 cart separation: adding never removes the catalog medicine; a sale
 *         reduces the listed stock; clearing the cart keeps the medicine
 *   17–18 stock guards: out-of-stock blocked, over-stock blocked
 *   19    scanner and search resolve the SAME canonical medicine id
 *   20–21 payments: exactly one Cash tender by default; extra rows only via
 *         explicit split
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { PharmacySqliteStore } from "../../src/lib/pharmacy/sqlite-store";
import {
  commitBatchLocally,
  commitMedicineLocally,
  fetchLocalMedicines,
} from "../../src/lib/pharmacy/local-tx";
import {
  buildMedicineIndex,
  findMedicineByBarcode,
  searchMedicines,
  type IndexedMedicine,
  type MedicineSearchOpts,
} from "../../src/lib/pharmacy/barcode/scan";
import {
  addLineToCart,
  addSplitTenderRow,
  canAddToCart,
  defaultTenders,
  visibleCatalogList,
  type CatalogCartLine,
  type CatalogMed,
} from "../../src/lib/pharmacy/pos-catalog";

const SEARCH_FIELDS: MedicineSearchOpts = {
  fields: ["name", "generic_name", "manufacturer", "sku", "barcode"],
};

function toIndexed(rows: Array<Record<string, unknown>>): IndexedMedicine[] {
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    sku: r.sku ? String(r.sku) : null,
    barcode: r.barcode ? String(r.barcode) : null,
    generic_name: r.generic_name ? String(r.generic_name) : null,
    manufacturer: r.manufacturer ? String(r.manufacturer) : null,
    selling_price: r.selling_price,
    stock_qty: r.stock_qty,
  }));
}

/** M6 Scanner Test Medicine — the canonical example from the spec. */
function seedM6(store: PharmacySqliteStore, stock = 10, over: Record<string, unknown> = {}) {
  const m = store.createMedicine({
    name: "M6 Scanner Test Medicine",
    generic_name: "Scannerin",
    manufacturer: "Sri Pharma",
    sku: "M6SKU1",
    barcode: "8901234567897",
    selling_price: 56,
    purchase_price: 30,
    reorder_level: 5,
    ...over,
  });
  if (stock > 0) {
    store.addBatch({
      medicine_id: String(m.id),
      batch_number: "M6B-2601",
      expiry_date: "2028-03-31",
      selling_price: 56,
      qty: stock,
    });
  }
  return m;
}

// ---------------------------------------------------------------------------
// 1–3. Catalog list: default (recent/available), view-all, empty catalog
// ---------------------------------------------------------------------------

test("catalog: SQLite-stored medicines appear in the list view", () => {
  const store = new PharmacySqliteStore();
  const m = seedM6(store);
  const rows = store.listMedicines();
  assert.ok(rows.some((r) => String(r.id) === String(m.id)));
  const list = visibleCatalogList({
    medicines: toIndexed(rows),
    search: "",
    results: [],
    viewAll: false,
    recentLimit: 8,
  });
  assert.equal(list.mode, "recent");
  assert.ok(list.items.some((i) => i.id === String(m.id)), "medicine is in the default list");
});

test("catalog: empty search shows a capped recent/available list, not the whole catalog", () => {
  const store = new PharmacySqliteStore();
  for (let i = 0; i < 12; i++) {
    store.createMedicine({ name: `Med ${i}`, sku: `SKU-${i}`, barcode: `9990000000${i}`, selling_price: 10 });
  }
  const rows = store.listMedicines({ limit: 2000 });
  assert.equal(rows.length, 12, "SQLite has all 12 medicines");
  const list = visibleCatalogList({
    medicines: toIndexed(rows),
    search: "",
    results: [],
    viewAll: false,
    recentLimit: 8,
  });
  assert.equal(list.mode, "recent");
  assert.equal(list.items.length, 8, "default list is capped at 8");
  assert.equal(list.total, 12, "the total is still reported for the view-all affordance");
});

test("catalog: view-all returns the full catalog", () => {
  const store = new PharmacySqliteStore();
  for (let i = 0; i < 12; i++) {
    store.createMedicine({ name: `Med ${i}`, sku: `SKU-${i}`, barcode: `9990000000${i}`, selling_price: 10 });
  }
  const rows = store.listMedicines({ limit: 2000 });
  const list = visibleCatalogList({
    medicines: toIndexed(rows),
    search: "",
    results: [],
    viewAll: true,
    recentLimit: 8,
  });
  assert.equal(list.mode, "all");
  assert.equal(list.items.length, 12, "view-all lists every medicine");
});

test("catalog: empty search on an empty catalog renders nothing (no phantom rows)", () => {
  const list = visibleCatalogList({
    medicines: [],
    search: "",
    results: [],
    viewAll: false,
    recentLimit: 8,
  });
  assert.equal(list.items.length, 0);
  assert.equal(list.total, 0);
});

// ---------------------------------------------------------------------------
// 4–8. Search: name / generic / SKU / barcode / manufacturer
// ---------------------------------------------------------------------------

test("search: by name", () => {
  const store = new PharmacySqliteStore();
  seedM6(store);
  const index = buildMedicineIndex(toIndexed(store.listMedicines()));
  const hits = searchMedicines(index, "M6 Scanner", SEARCH_FIELDS);
  assert.ok(hits.some((h) => h.name === "M6 Scanner Test Medicine"));
});

test("search: by generic name", () => {
  const store = new PharmacySqliteStore();
  seedM6(store);
  const index = buildMedicineIndex(toIndexed(store.listMedicines()));
  const hits = searchMedicines(index, "Scannerin", SEARCH_FIELDS);
  assert.ok(hits.some((h) => h.name === "M6 Scanner Test Medicine"));
});

test("search: by SKU", () => {
  const store = new PharmacySqliteStore();
  seedM6(store);
  const index = buildMedicineIndex(toIndexed(store.listMedicines()));
  const hits = searchMedicines(index, "M6SKU1", SEARCH_FIELDS);
  assert.ok(hits.some((h) => h.name === "M6 Scanner Test Medicine"), "SKU search finds it");
});

test("search: by barcode", () => {
  const store = new PharmacySqliteStore();
  seedM6(store);
  const index = buildMedicineIndex(toIndexed(store.listMedicines()));
  const hits = searchMedicines(index, "8901234567897", SEARCH_FIELDS);
  assert.ok(hits.some((h) => h.name === "M6 Scanner Test Medicine"), "barcode search finds it");
});

test("search: by manufacturer", () => {
  const store = new PharmacySqliteStore();
  seedM6(store);
  const index = buildMedicineIndex(toIndexed(store.listMedicines()));
  const hits = searchMedicines(index, "Sri Pharma", SEARCH_FIELDS);
  assert.ok(hits.some((h) => h.name === "M6 Scanner Test Medicine"));
});

test("search: no false positives when a field does not match", () => {
  const store = new PharmacySqliteStore();
  seedM6(store);
  store.createMedicine({ name: "Paracetamol 500mg", manufacturer: "Other Labs", selling_price: 12 });
  const index = buildMedicineIndex(toIndexed(store.listMedicines()));
  assert.equal(searchMedicines(index, "Sri Pharma", SEARCH_FIELDS).length, 1);
  assert.equal(searchMedicines(index, "8901234567897", SEARCH_FIELDS).length, 1);
});

// ---------------------------------------------------------------------------
// 9. Search rows carry SQLite price + stock
// ---------------------------------------------------------------------------

test("search result carries SQLite price and stock (authoritative local data)", () => {
  const store = new PharmacySqliteStore();
  seedM6(store, 10);
  const rows = store.listMedicines();
  assert.equal(Number(rows[0]?.stock_qty), 10);
  assert.equal(Number(rows[0]?.selling_price), 56);
  const index = buildMedicineIndex(toIndexed(rows));
  const hit = searchMedicines(index, "8901234567897", SEARCH_FIELDS)[0];
  const withStock = hit as unknown as { selling_price?: number; stock_qty?: number };
  assert.equal(Number(withStock.selling_price), 56, "price comes from SQLite");
  assert.equal(Number(withStock.stock_qty), 10, "stock comes from SQLite");
});

// ---------------------------------------------------------------------------
// 10–13. Unknown barcode → SQLite medicine + batch, immediate + persistent
// ---------------------------------------------------------------------------

test("unknown barcode: medicine is committed to SQLite via the offline route (action=medicine)", async () => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; body: Record<string, unknown> } | null = null;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> };
      return new Response(
        JSON.stringify({ data: { id: "med-1", name: "Paracetamol 500mg" } }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const result = await commitMedicineLocally({
      name: "Paracetamol 500mg",
      sku: "8907654321098",
      barcode: "8907654321098",
      selling_price: 15,
    });
    assert.equal(result.ok, true);
    const call = captured as unknown as { url: string; body: Record<string, unknown> };
    assert.match(call.url, /\/api\/admin\/pharmacy\/offline\?action=medicine/);
    assert.equal(call.body.barcode, "8907654321098");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unknown barcode: the opening batch/stock is committed after the medicine (action=batch)", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url: String(input), body });
      const isMedicine = String(input).includes("action=medicine");
      return new Response(
        JSON.stringify({
          data: isMedicine ? { id: "med-created", name: "Paracetamol 500mg" } : { id: "batch-1" },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const created = await commitMedicineLocally({ name: "Paracetamol 500mg", barcode: "X" });
    assert.ok(created.ok);
    const batch = await commitBatchLocally({
      medicine_id: String((created.data as { id: string }).id),
      batch_number: "B-OPEN",
      selling_price: 15,
      qty: 25,
    });
    assert.equal(batch.ok, true);
    assert.match(calls[1]?.url, /action=batch/);
    assert.equal(calls[1]?.body.medicine_id, "med-created", "batch links to the created medicine");
    assert.equal(calls[1]?.body.qty, 25);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unknown barcode: the new medicine appears in the catalog immediately (list + fetchLocalMedicines)", async () => {
  const store = new PharmacySqliteStore();
  const created = store.createMedicine({
    name: "Paracetamol 500mg",
    sku: "8907654321098",
    barcode: "8907654321098",
    selling_price: 15,
  });
  store.addBatch({
    medicine_id: String(created.id),
    batch_number: "B-OPEN",
    selling_price: 15,
    qty: 25,
  });

  const rows = store.listMedicines({ limit: 2000 });
  const row = rows.find((r) => String(r.id) === String(created.id));
  assert.ok(row, "medicine is listed right after creation");
  assert.equal(Number(row?.stock_qty), 25, "opening stock is listed right away");

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      assert.match(String(input), /kind=medicines/);
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const fetched = await fetchLocalMedicines();
    assert.ok(
      fetched.some((m) => m.id === String(created.id)),
      "the POS refresh sees the new medicine"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unknown barcode: the medicine survives a server restart (file-backed store reopen)", () => {
  const file = join(tmpdir(), `pharma-catalog-${randomUUID()}.db`);
  try {
    const store = new PharmacySqliteStore(file);
    const created = store.createMedicine({
      name: "Persistent Med",
      sku: "PERSIST-1",
      barcode: "8907654321098",
      selling_price: 15,
    });
    store.addBatch({
      medicine_id: String(created.id),
      batch_number: "B-PERSIST",
      selling_price: 15,
      qty: 7,
    });
    const id = String(created.id);
    store.close();

    const reopened = new PharmacySqliteStore(file);
    const row = reopened.getMedicine(id);
    assert.ok(row, "medicine survives restart");
    assert.equal(Number(row?.stock_qty), 7, "stock survives restart");
    assert.equal(reopened.findMedicineByBarcode("8907654321098")?.id, id);
    reopened.close();
  } finally {
    rmSync(file, { force: true });
    rmSync(`${file}-wal`, { force: true });
    rmSync(`${file}-shm`, { force: true });
  }
});

test("duplicate barcode is rejected by the store — the scanner re-links the existing medicine", () => {
  const store = new PharmacySqliteStore();
  const m = seedM6(store);
  assert.throws(
    () =>
      store.createMedicine({
        name: "Duplicate",
        barcode: "8901234567897",
        selling_price: 1,
      }),
    /Barcode already exists/i
  );
  assert.equal(store.findMedicineByBarcode("8901234567897")?.id, String(m.id));
});

// ---------------------------------------------------------------------------
// 14–16. Cart vs catalog separation
// ---------------------------------------------------------------------------

test("cart: adding a medicine never removes it from the catalog", () => {
  const store = new PharmacySqliteStore();
  const m = seedM6(store, 10);
  const rows = store.listMedicines();
  const med = toIndexed(rows).find((i) => i.id === String(m.id)) as CatalogMed;
  const before = rows.length;

  const emptyCart: CatalogCartLine[] = [];
  const out = addLineToCart(emptyCart, med, 1, 12);
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.cart.length, 1);
    assert.equal(out.cart[0]?.medicine_id, String(m.id));
    assert.equal(out.cart[0]?.quantity, 1);
  }

  const after = store.listMedicines();
  assert.equal(after.length, before, "catalog is untouched by the cart");
  assert.equal(Number(after.find((r) => String(r.id) === String(m.id))?.stock_qty), 10);
});

test("cart: a sale reduces the listed stock (10 → 5) and the medicine stays in the catalog", () => {
  const store = new PharmacySqliteStore();
  const m = seedM6(store, 10);
  const sale = store.createSaleIdempotent({
    _clientId: randomUUID(),
    sale_number: `LOC-${randomUUID().slice(0, 8)}`,
    patient_name: "Test Customer",
    sale_type: "walk_in",
    cashier_name: "Cashier",
    items: [
      {
        medicine_id: String(m.id),
        name: "M6 Scanner Test Medicine",
        qty: 5,
        price: 56,
        gst_percent: 12,
        batch_number: "M6B-2601",
      },
    ],
    subtotal: 280,
    discount: 0,
    tax: 33.6,
    cgst: 16.8,
    sgst: 16.8,
    igst: 0,
    tax_type: "intra",
    grand_total: 313.6,
    payment_method: "cash",
    payment_status: "paid",
    amount_paid: 313.6,
    amount_returned: 0,
  } as never);
  assert.ok(sale.id);

  const row = store.getMedicine(String(m.id));
  assert.equal(Number(row?.stock_qty), 5, "list stock now shows 5");
});

test("cart: clearing the cart keeps the medicine in the catalog and re-addable", () => {
  const store = new PharmacySqliteStore();
  const m = seedM6(store, 10);
  const rows = store.listMedicines();
  const med = toIndexed(rows).find((i) => i.id === String(m.id)) as CatalogMed;

  let cart: { medicine_id?: string; quantity: number; name: string; selling_price: number }[] = [];
  const first = addLineToCart(cart, med, 2, 12);
  assert.equal(first.ok, true);
  if (first.ok) cart = first.cart;

  cart = []; // "Clear" — the bill resets, the catalog does not
  assert.equal(store.getMedicine(String(m.id))?.name, "M6 Scanner Test Medicine");

  const second = addLineToCart(cart, med, 1, 12);
  assert.equal(second.ok, true, "the medicine can be added to a fresh cart");
  assert.equal(store.getMedicine(String(m.id))?.name, "M6 Scanner Test Medicine");
});

// ---------------------------------------------------------------------------
// 17–18. Stock guards
// ---------------------------------------------------------------------------

test("stock: an out-of-stock medicine cannot be added and still appears in the list", () => {
  const store = new PharmacySqliteStore();
  const m = seedM6(store, 0); // created without any batch → stock 0
  const rows = store.listMedicines();
  const med = toIndexed(rows).find((i) => i.id === String(m.id)) as CatalogMed;
  assert.equal(Number(med.stock_qty), 0);

  const verdict = canAddToCart(med);
  assert.equal(verdict.ok, false);
  const out = addLineToCart([], med, 1, 12);
  assert.equal(out.ok, false);
  assert.match(out.ok ? "" : out.message, /out of stock/i);
  assert.ok(
    store.listMedicines().some((r) => String(r.id) === String(m.id)),
    "the out-of-stock medicine is still listed"
  );
});

test("stock: selling the last unit makes the list show 0 and blocks the next add", () => {
  const store = new PharmacySqliteStore();
  const m = seedM6(store, 1);
  store.createSaleIdempotent({
    _clientId: randomUUID(),
    sale_number: `LOC-${randomUUID().slice(0, 8)}`,
    patient_name: "Test Customer",
    sale_type: "walk_in",
    cashier_name: "Cashier",
    items: [
      {
        medicine_id: String(m.id),
        name: "M6 Scanner Test Medicine",
        qty: 1,
        price: 56,
        gst_percent: 12,
        batch_number: "M6B-2601",
      },
    ],
    subtotal: 56,
    discount: 0,
    tax: 6.72,
    cgst: 3.36,
    sgst: 3.36,
    igst: 0,
    tax_type: "intra",
    grand_total: 62.72,
    payment_method: "cash",
    payment_status: "paid",
    amount_paid: 62.72,
    amount_returned: 0,
  } as never);
  const row = store.getMedicine(String(m.id));
  assert.equal(Number(row?.stock_qty), 0);
  assert.equal(canAddToCart(row as unknown as CatalogMed).ok, false);
});

test("stock: requesting more than the available stock is blocked", () => {
  const store = new PharmacySqliteStore();
  const m = seedM6(store, 2);
  const med = toIndexed(store.listMedicines()).find((i) => i.id === String(m.id)) as CatalogMed;
  assert.equal(canAddToCart(med, { qty: 3 }).ok, false);
  assert.equal(canAddToCart(med, { qty: 2 }).ok, true);
  const blocked = addLineToCart([], med, 3, 12);
  assert.equal(blocked.ok, false);
});

// ---------------------------------------------------------------------------
// 19. Scanner and search share ONE canonical catalog
// ---------------------------------------------------------------------------

test("scanner and search resolve the same canonical medicine id", () => {
  const store = new PharmacySqliteStore();
  const m = seedM6(store, 10);
  const index = buildMedicineIndex(toIndexed(store.listMedicines()));
  const byScan = findMedicineByBarcode(index, "8901234567897");
  const bySearch = searchMedicines(index, "8901234567897", SEARCH_FIELDS)[0];
  assert.ok(byScan, "the scanner resolves the barcode");
  assert.equal(byScan.id, String(m.id));
  assert.equal(bySearch?.id, byScan.id, "search finds the same medicine the scanner does");
});

// ---------------------------------------------------------------------------
// 20–21. Payment rows: one Cash by default, split only on request
// ---------------------------------------------------------------------------

test("payments: the default bill has exactly ONE Cash tender row", () => {
  const tenders = defaultTenders();
  assert.equal(tenders.length, 1);
  assert.equal(tenders[0]?.methodId, "cash");
  assert.equal(tenders[0]?.amount, 0);
});

test("payments: extra tender rows appear ONLY after an explicit split, never duplicated", () => {
  let tenders = defaultTenders();
  assert.equal(tenders.length, 1, "normal mode: single row");

  tenders = addSplitTenderRow(tenders, "upi");
  assert.equal(tenders.length, 2, "split adds one extra row");
  assert.deepEqual(
    tenders.map((t) => t.methodId),
    ["cash", "upi"]
  );

  const unchanged = addSplitTenderRow(tenders, "upi");
  assert.equal(unchanged, tenders, "a method already present is never duplicated");

  tenders = addSplitTenderRow(tenders, "gpay");
  assert.deepEqual(
    tenders.map((t) => t.methodId),
    ["cash", "upi", "gpay"],
    "several methods can coexist once split is active"
  );
  assert.equal(tenders[0]?.methodId, "cash", "cash row remains first");
});
