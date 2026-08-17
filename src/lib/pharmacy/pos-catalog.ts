/**
 * Pharmacy POS — catalog helpers (pure, testable).
 *
 * The medicine catalog is a SEPARATE concept from the cart: the catalog is
 * the persistent list of medicines (SQLite-authoritative) the pharmacist
 * browses and searches; the cart is the temporary bill under construction.
 * These helpers implement the catalog browsing rules (recent / search /
 * view-all), the add-to-cart guards (stock, expiry) and the payment-row
 * rules (one Cash tender by default; extra rows only via explicit split).
 */

import { normalizeBarcode } from "./barcode/scan";

export type CatalogMed = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  generic_name?: string | null;
  manufacturer?: string | null;
  selling_price?: number | string | null;
  stock_qty?: number | string | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  reorder_level?: number | string | null;
  updated_at?: string | null;
};

export type TenderLike = {
  methodId: string;
  amount: number;
  reference?: string;
};

export type PaymentMethodLike = {
  id: string;
  enabled: boolean;
};

export type CatalogCartLine = {
  medicine_id?: string;
  name: string;
  generic_name?: string;
  manufacturer?: string;
  batch_number?: string | null;
  expiry_date?: string | null;
  mrp?: number;
  selling_price: number;
  quantity: number;
  gst_percent?: number;
};

/** Default payment row: exactly ONE Cash tender. */
export function defaultTenders(): TenderLike[] {
  return [{ methodId: "cash", amount: 0 }];
}

export type PosScanOutcome = "added" | "unknown" | "ignored";

export type PosScanDispatchInput<M> = {
  raw: string;
  medicine: M | null;
  add: (medicine: M) => void;
  onUnknown: (raw: string) => void;
};

/**
 * Route one resolved scan to its POS outcome. Every scanner source
 * (USB/BT HID, Android HID, camera, image upload, manual, BLE companion)
 * funnels through here — there is no scanner-specific cart code.
 *
 *   - empty / whitespace / control-only payload → "ignored" (cart untouched)
 *   - unresolved medicine → "unknown" (the POS opens Add Medicine)
 *   - resolved medicine → "added" (the POS adds it to the cart)
 *
 * The empty-guard uses the SAME normalization as the scan pipeline, so a
 * payload the pipeline would reject can never reach the cart from here.
 */
export function dispatchPosScan<M>(input: PosScanDispatchInput<M>): PosScanOutcome {
  if (!normalizeBarcode(String(input.raw ?? ""))) return "ignored";
  if (!input.medicine) {
    input.onUnknown(String(input.raw));
    return "unknown";
  }
  input.add(input.medicine);
  return "added";
}

/**
 * Add a second tender row ONLY when the pharmacist explicitly splits.
 * Returns the same array when the method already has a row.
 */
export function addSplitTenderRow(
  tenders: TenderLike[],
  methodId: string
): TenderLike[] {
  if (tenders.some((t) => t.methodId === methodId)) return tenders;
  return [...tenders, { methodId, amount: 0 }];
}

const NOW_REF = "1970-01-01T00:00:00.000Z";

function updatedAt(med: CatalogMed): string {
  return typeof med.updated_at === "string" && med.updated_at
    ? med.updated_at
    : NOW_REF;
}

/**
 * Default list for an empty search: recently touched / available medicines.
 * Never renders the full catalog — capped at `limit` (5–10) with a
 * "View all" affordance handled by the caller.
 */
export function recentMedicines<T extends CatalogMed>(
  medicines: T[],
  limit = 8
): T[] {
  return medicines
    .slice()
    .sort((a, b) => {
      const byTime = updatedAt(b).localeCompare(updatedAt(a));
      return byTime !== 0 ? byTime : a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export type VisibleCatalogResult<T> = {
  items: T[];
  total: number;
  mode: "search" | "recent" | "all";
};

/**
 * Decide what the medicine list section shows:
 * - a non-empty search → the search results
 * - otherwise → recent/available medicines (default) or the full catalog
 *   when the pharmacist explicitly asked to view all.
 */
export function visibleCatalogList<T extends CatalogMed>(opts: {
  medicines: T[];
  search: string;
  results: T[];
  viewAll: boolean;
  recentLimit?: number;
}): VisibleCatalogResult<T> {
  const query = String(opts.search ?? "").trim();
  if (query) {
    return { items: opts.results, total: opts.results.length, mode: "search" };
  }
  if (opts.viewAll) {
    return { items: opts.medicines, total: opts.medicines.length, mode: "all" };
  }
  return {
    items: recentMedicines(opts.medicines, opts.recentLimit),
    total: opts.medicines.length,
    mode: "recent",
  };
}

/** Batch expiry (date-only values are treated as end-of-day). */
export function isExpiryValid(expiry?: string | null, now = new Date()): boolean {
  if (!expiry) return true;
  return new Date(`${expiry}T23:59:59`) >= now;
}

export type AddToCartVerdict =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Guard before adding: an out-of-stock medicine can never enter the cart,
 * quantity can never exceed available stock, and an expired batch can never
 * be dispensed. When the catalog has NO stock information the guard cannot
 * prove a shortage and the add is allowed (back-compat with bare rows).
 */
export function canAddToCart(
  med: CatalogMed,
  opts?: { inCartQty?: number; qty?: number; now?: Date }
): AddToCartVerdict {
  const qty = Math.max(1, Math.floor(opts?.qty ?? 1));
  const stockRaw = med.stock_qty;
  if (stockRaw !== undefined && stockRaw !== null && stockRaw !== "") {
    const stockQty = Number(stockRaw);
    if (!Number.isFinite(stockQty)) return { ok: true };
    if (stockQty <= 0) {
      return { ok: false, message: `${med.name} is out of stock.` };
    }
    const inCart = Math.max(0, Number(opts?.inCartQty ?? 0));
    if (inCart + qty > stockQty) {
      return {
        ok: false,
        message: `${med.name} — only ${stockQty} in stock.`,
      };
    }
  }
  if (!isExpiryValid(med.expiry_date, opts?.now)) {
    return { ok: false, message: `${med.name} is expired and cannot be dispensed.` };
  }
  return { ok: true };
}

/**
 * Pure add-to-cart: validates against stock/expiry, then merges the line.
 * Returns the NEW cart on success — the caller replaces its state. Adding
 * to the cart never mutates the medicine catalog.
 */
export function addLineToCart<C extends CatalogCartLine>(
  cart: C[],
  med: CatalogMed,
  qty: number,
  gstPercent: number,
  opts?: { now?: Date }
): { ok: true; cart: C[] } | { ok: false; message: string } {
  const verdict = canAddToCart(med, {
    inCartQty: cart
      .filter((c) => c.medicine_id === med.id)
      .reduce((s, c) => s + c.quantity, 0),
    qty,
    now: opts?.now,
  });
  if (!verdict.ok) return verdict;

  const price = Number(med.selling_price ?? 0);
  const existing = cart.find((c) => c.medicine_id === med.id);
  const next =
    existing === undefined
      ? [
          ...cart,
          {
            medicine_id: med.id,
            name: String(med.name ?? ""),
            generic_name: med.generic_name ?? undefined,
            manufacturer: med.manufacturer ?? undefined,
            batch_number: med.batch_number ?? undefined,
            expiry_date: med.expiry_date ?? null,
            mrp: price,
            selling_price: price,
            quantity: Math.max(1, Math.floor(qty)),
            gst_percent: gstPercent,
          } as C,
        ]
      : cart.map((c) =>
          c.medicine_id === med.id
            ? { ...c, quantity: c.quantity + Math.max(1, Math.floor(qty)) }
            : c
        );
  return { ok: true, cart: next };
}
