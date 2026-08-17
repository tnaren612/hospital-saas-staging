/**
 * Pharmacy SQLite Store — offline-first transactional backend (M4 + M5).
 *
 * Everything the pharmacy needs to run with the internet completely
 * unavailable, persisted to a local SQLite file (Node `node:sqlite`,
 * zero extra dependencies):
 *
 *   - medicines with duplicate prevention
 *   - batch / expiry management (per-batch stock)
 *   - opening stock, purchase stock (goods receipt), stock adjustments
 *   - an IMMUTABLE stock movement ledger (DB triggers forbid UPDATE/DELETE)
 *   - atomic POS sales (sale + items + payments + stock deduction + ledger
 *     in one transaction; rollback of every side-effect if any part fails)
 *   - sales-return that restores the exact batch stock and records the refund
 *   - guard rails: no negative stock, no expired-batch sale, no qty above
 *     available stock
 *   - patients (walk-in info: name, UHID, age, gender, doctor, prescription)
 *   - payments ledger (cash/UPI/card/credit/insurance, split & partial
 *     tenders, change, references, offline verification status rules)
 *
 * The store is a plain class over `DatabaseSync`. Tests open ":memory:" (or a
 * temp file); the server opens a real file so data survives restarts.
 */

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { roundMoney } from "./tax";
import { posSaleSchema, POS_PAYMENT_METHODS } from "./validation";
import type { PharmacySettings } from "./types";
import type { PosSaleLineItem } from "./service";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const medicineInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  generic_name: z.string().trim().max(200).optional().nullable(),
  manufacturer: z.string().trim().max(200).optional().nullable(),
  sku: z.string().trim().max(100).optional().nullable(),
  barcode: z.string().trim().max(100).optional().nullable(),
  category: z.string().trim().max(100).optional().nullable(),
  schedule: z.string().trim().max(50).optional().nullable(),
  unit: z.string().trim().max(20).optional().nullable(),
  purchase_price: z.number().nonnegative().optional().default(0),
  selling_price: z.number().nonnegative().optional().default(0),
  mrp: z.number().nonnegative().optional().nullable(),
  min_stock_level: z.number().int().nonnegative().optional().default(0),
  reorder_level: z.number().int().nonnegative().optional().default(0),
  is_active: z.boolean().optional().default(true),
});

export type MedicineInput = z.input<typeof medicineInputSchema>;

export const batchInputSchema = z.object({
  medicine_id: z.string().min(1).max(120),
  batch_number: z.string().trim().min(1).max(100),
  expiry_date: z.string().trim().max(20).optional().nullable(),
  mrp: z.number().nonnegative().optional().nullable(),
  purchase_price: z.number().nonnegative().optional().default(0),
  selling_price: z.number().nonnegative().optional().default(0),
  qty: z.number().int().nonnegative().optional().default(0),
  created_by: z.string().max(120).optional().nullable(),
});

export type BatchInput = z.input<typeof batchInputSchema>;

export const addStockInputSchema = z.object({
  medicine_id: z.string().min(1).max(120),
  batch_number: z.string().trim().min(1).max(100),
  qty: z.number().int().positive(),
  notes: z.string().max(500).optional().nullable(),
  created_by: z.string().max(120).optional().nullable(),
});

export const adjustmentInputSchema = z.object({
  medicine_id: z.string().min(1).max(120),
  batch_id: z.string().max(120).optional().nullable(),
  batch_number: z.string().trim().max(100).optional().nullable(),
  quantity: z.number().int().refine((n) => n !== 0, "quantity cannot be 0"),
  reason: z.string().trim().min(1).max(300),
  created_by: z.string().max(120).optional().nullable(),
});

export const purchaseItemSchema = z.object({
  medicine_id: z.string().min(1).max(120),
  medicine_name: z.string().trim().min(1).max(200).optional(),
  batch_number: z.string().trim().min(1).max(100),
  expiry_date: z.string().trim().max(20).optional().nullable(),
  qty: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  gst_percent: z.number().nonnegative().max(100).optional().default(0),
});

export const purchaseInputSchema = z.object({
  supplier_name: z.string().trim().max(200).optional().nullable(),
  invoice_number: z.string().trim().max(100).optional().nullable(),
  purchase_date: z.string().trim().max(20).optional().nullable(),
  subtotal: z.number().nonnegative().optional().default(0),
  tax: z.number().nonnegative().optional().default(0),
  grand_total: z.number().nonnegative().optional().default(0),
  notes: z.string().max(500).optional().nullable(),
  created_by: z.string().max(120).optional().nullable(),
  items: z.array(purchaseItemSchema).min(1),
});

export const returnItemSchema = z.object({
  medicine_id: z.string().max(120).optional().nullable(),
  medicine_name: z.string().trim().min(1).max(200),
  batch_number: z.string().trim().max(100).optional().nullable(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  total_price: z.number().nonnegative().optional(),
  reason: z.string().max(300).optional().nullable(),
});

export const returnInputSchema = z.object({
  original_sale_id: z.string().max(120).optional().nullable(),
  original_sale_number: z.string().trim().min(1).max(120),
  patient_name: z.string().trim().min(1).max(120).optional(),
  patient_phone: z.string().max(15).optional().nullable(),
  return_reason: z.string().trim().min(1).max(300),
  return_type: z.enum(["refund", "exchange", "credit_note"]).default("refund"),
  refund_method: z.enum(POS_PAYMENT_METHODS).optional().nullable(),
  refund_reference: z.string().max(120).optional().nullable(),
  refund_amount: z.number().nonnegative().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  processed_by: z.string().max(120).optional().nullable(),
  items: z.array(returnItemSchema).min(1),
});

export const paymentLineSchema = z.object({
  method: z.string().max(50),
  amount: z.number().nonnegative(),
  reference: z.string().max(120).optional().nullable(),
});

export type PaymentLineInput = z.infer<typeof paymentLineSchema>;

/** posSaleSchema + M5 patient fields (gender / UHID). */
export const sqliteSaleSchema = posSaleSchema.extend({
  patient_gender: z.string().max(20).optional().nullable(),
  patient_uhid: z.string().max(60).optional().nullable(),
  sale_number: z.string().max(120).optional().nullable(),
  created_at: z.string().max(40).optional().nullable(),
  updated_at: z.string().max(40).optional().nullable(),
  payments: z.array(paymentLineSchema).optional(),
});

export type SqliteSaleInput = z.input<typeof sqliteSaleSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function defaultSettings(hospitalId: string): PharmacySettings {
  return {
    hospital_id: hospitalId,
    receipt_header: "",
    receipt_footer: "Thank you for your purchase.",
    receipt_paper_size: "80mm",
    show_logo: true,
    show_hospital_address: true,
    show_phone: true,
    show_gst: true,
    show_drug_license: true,
    show_doctor_name: true,
    show_patient_address: true,
    show_batch_details: true,
    show_expiry: true,
    show_mrp: true,
    show_savings: true,
    show_barcode: true,
    show_qr_code: true,
    show_return_policy: true,
    return_policy_text:
      "Items can be returned within 7 days with the original bill.",
    default_gst_percent: 12,
    inclusive_tax: false,
    max_discount_percent: 20,
    require_discount_approval: false,
    low_stock_threshold: 10,
    expiry_alert_days: 90,
    critical_expiry_days: 30,
    enable_barcode_scanner: true,
    enable_keyboard_shortcuts: true,
    enable_sound_effects: true,
    auto_print_receipt: true,
    require_patient_for_sale: false,
    allow_credit_sales: true,
    enable_cash: true,
    enable_upi: true,
    enable_card: true,
    enable_insurance: true,
    enable_credit: true,
    enable_wallet: false,
    drug_license_number: "",
    gst_number: "",
    pharmacist_name: "",
    pharmacist_registration: "",
    standalone_mode: true,
  };
}

// ---------------------------------------------------------------------------
// Schema (DDL)
// ---------------------------------------------------------------------------

const DDL = `
CREATE TABLE IF NOT EXISTS medicines (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL DEFAULT 'local',
  name TEXT NOT NULL,
  generic_name TEXT,
  manufacturer TEXT,
  sku TEXT,
  barcode TEXT,
  category TEXT,
  schedule TEXT,
  unit TEXT,
  purchase_price REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  mrp REAL,
  min_stock_level INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_medicines_name_manuf
  ON medicines (hospital_id, lower(name), lower(COALESCE(manufacturer, '')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_medicines_sku
  ON medicines (hospital_id, lower(COALESCE(sku, '')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_medicines_barcode
  ON medicines (hospital_id, lower(COALESCE(barcode, '')));

CREATE TABLE IF NOT EXISTS medicine_batches (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_number TEXT NOT NULL,
  expiry_date TEXT,
  mrp REAL,
  purchase_price REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (medicine_id, batch_number)
);

-- Immutable append-only ledger: no row may ever be updated or deleted.
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES medicine_batches(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in','out','adjust')),
  quantity INTEGER NOT NULL,
  reference_type TEXT NOT NULL DEFAULT 'sale',
  reference_id TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS trg_movements_no_update
BEFORE UPDATE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements are immutable (update blocked)');
END;
CREATE TRIGGER IF NOT EXISTS trg_movements_no_delete
BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements are immutable (delete blocked)');
END;

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  purchase_number TEXT NOT NULL UNIQUE,
  supplier_name TEXT,
  invoice_number TEXT,
  purchase_date TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  medicine_name TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  expiry_date TEXT,
  qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  gst_percent REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  sale_number TEXT NOT NULL UNIQUE,
  hospital_id TEXT NOT NULL DEFAULT 'local',
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  patient_age INTEGER,
  patient_gender TEXT,
  patient_uhid TEXT,
  patient_id TEXT,
  sale_type TEXT NOT NULL DEFAULT 'walk_in',
  doctor_name TEXT,
  doctor_reg_no TEXT,
  prescription_number TEXT,
  branch_id TEXT,
  shift_id TEXT,
  cashier_name TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  igst REAL NOT NULL DEFAULT 0,
  tax_type TEXT NOT NULL DEFAULT 'intra',
  grand_total REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'paid',
  amount_paid REAL NOT NULL DEFAULT 0,
  amount_returned REAL NOT NULL DEFAULT 0,
  payment_reference TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_updated ON sales (updated_at);
CREATE INDEX IF NOT EXISTS idx_sales_hospital ON sales (hospital_id);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES medicine_batches(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price REAL NOT NULL,
  gst_percent REAL NOT NULL DEFAULT 0,
  batch_number TEXT,
  expiry_date TEXT,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  created_at TEXT NOT NULL
);

-- Per-tender payment ledger. Offline status rules:
--   cash            -> 'paid'      (settled at the counter)
--   upi/card/other  -> 'unverified' (gateway not reachable offline)
--   credit/insurance-> 'pending'   (deferred collection)
--   refunds         -> 'refunded'
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT,
  sale_number TEXT,
  return_id TEXT,
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'paid',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments (sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_sale_number ON payments (sale_number);

CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  return_number TEXT NOT NULL UNIQUE,
  sale_id TEXT,
  sale_number TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  return_reason TEXT NOT NULL,
  return_type TEXT NOT NULL DEFAULT 'refund',
  subtotal REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  refund_method TEXT,
  refund_reference TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  processed_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  medicine_id TEXT REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_id TEXT,
  medicine_name TEXT NOT NULL,
  batch_number TEXT,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  uhid TEXT,
  name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  phone TEXT,
  doctor_name TEXT,
  prescription_number TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_uhid ON patients (lower(uhid)) WHERE uhid IS NOT NULL AND trim(uhid) <> '';

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL DEFAULT 'local',
  code TEXT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  manager_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL DEFAULT 'local',
  branch_id TEXT,
  user_id TEXT,
  user_name TEXT NOT NULL,
  shift_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  opening_cash REAL NOT NULL DEFAULT 0,
  closing_cash REAL,
  total_sales REAL NOT NULL DEFAULT 0,
  total_returns REAL NOT NULL DEFAULT 0,
  total_transactions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS held_bills (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL DEFAULT 'local',
  branch_id TEXT,
  shift_id TEXT,
  reference TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  items TEXT NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  notes TEXT,
  held_by TEXT,
  held_by_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  hospital_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
`;

const HOSPITAL = "local";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function todayIso(): string {
  return nowIso().slice(0, 10);
}

export function medicineErrorMessage(name: string, manufacturer?: string | null): string {
  return `Medicine already exists: ${name}${manufacturer ? ` (${manufacturer})` : ""}`;
}

/** Offline payment verification status by method. */
export function offlinePaymentStatus(method: string): "paid" | "unverified" | "pending" {
  const m = method.toLowerCase();
  if (m === "cash") return "paid";
  if (m === "credit" || m === "insurance") return "pending";
  return "unverified";
}

export function paymentCategory(method: string): string {
  const m = method.toLowerCase();
  if (m === "cash") return "cash";
  if (m === "credit") return "credit";
  if (m === "insurance") return "insurance";
  if (m === "upi" || m === "gpay" || m === "phonepe" || m === "paytm") return "upi";
  if (m === "credit_card" || m === "debit_card" || m === "card") return "card";
  if (m === "wallet") return "wallet";
  return "other";
}

/** Extract the payment_lines JSON blob written by buildPosPayload. */
export function paymentLinesFromNotes(notes?: string | null): PaymentLineInput[] {
  if (!notes) return [];
  const m = notes.match(/payment_lines:(.*)/);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[1]) as PaymentLineInput[];
    return Array.isArray(parsed) ? parsed.filter((p) => p && Number(p.amount) > 0) : [];
  } catch {
    return [];
  }
}

/** FEFO: earliest-expiry in-stock, unexpired batch when no batch is specified. */
export function fefoBatches(
  rows: Array<Record<string, unknown>>,
  today = todayIso()
): Array<Record<string, unknown>> {
  return rows
    .filter((r) => Number(r.qty) > 0)
    .filter((r) => {
      const expiry = String(r.expiry_date ?? "").trim();
      return !expiry || expiry >= today;
    })
    .sort((a, b) => {
      const ea = String(a.expiry_date ?? "9999-12-31");
      const eb = String(b.expiry_date ?? "9999-12-31");
      return ea.localeCompare(eb);
    });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type SaleRow = {
  id: string;
  sale_number: string;
  hospital_id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_age: number | null;
  patient_gender: string | null;
  patient_uhid: string | null;
  patient_id: string | null;
  sale_type: string;
  doctor_name: string | null;
  doctor_reg_no: string | null;
  prescription_number: string | null;
  branch_id: string | null;
  shift_id: string | null;
  cashier_name: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax_type: string;
  grand_total: number;
  payment_method: string;
  payment_status: string;
  amount_paid: number;
  amount_returned: number;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  line_items: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
};

export class PharmacySqliteStore {
  private db: DatabaseSync;
  readonly path: string;

  constructor(path?: string) {
    this.path = path || ":memory:";
    this.db = new DatabaseSync(this.path);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(DDL);
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* ignore */
    }
  }

  /** Raw statement execution (admin tooling / tests). */
  execute(sql: string, params: unknown[] = []): void {
    this.db.prepare(sql).run(...params);
  }

  private txDepth = 0;

  /** Run statements atomically; ROLLBACK on any throw. Nested calls share the outer transaction. */
  private tx<T>(fn: () => T): T {
    if (this.txDepth > 0) return fn();
    this.txDepth += 1;
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      this.txDepth = 0;
    }
  }

  /** Create a medicine and its opening batch in one transaction. */
  createMedicineWithOpeningBatch(
    medicine: MedicineInput,
    batch: Omit<BatchInput, "medicine_id">
  ): Record<string, unknown> {
    return this.tx(() => {
      const created = this.createMedicine(medicine);
      this.addBatch({ ...batch, medicine_id: String(created.id) });
      return this.getMedicine(String(created.id))!;
    });
  }

  // -- counters ---------------------------------------------------------------

  private nextCounter(key: string): number {
    const cur = this.db
      .prepare("SELECT value FROM counters WHERE key = ?")
      .get(key) as { value: number } | undefined;
    const next = Number(cur?.value ?? 0) + 1;
    this.db
      .prepare(
        "INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .run(key, next);
    return next;
  }

  private nextSaleNumber(): string {
    const day = todayIso().replace(/-/g, "");
    return `PH-${day}-${String(this.nextCounter(`sale-${day}`)).padStart(4, "0")}`;
  }

  private nextReturnNumber(): string {
    const day = todayIso().replace(/-/g, "");
    return `RET-${day}-${String(this.nextCounter(`return-${day}`)).padStart(4, "0")}`;
  }

  private nextPurchaseNumber(): string {
    const day = todayIso().replace(/-/g, "");
    return `PO-${day}-${String(this.nextCounter(`purchase-${day}`)).padStart(4, "0")}`;
  }

  // -- settings ---------------------------------------------------------------

  getSettings(): PharmacySettings {
    const row = this.db
      .prepare("SELECT data FROM settings WHERE hospital_id = ?")
      .get(HOSPITAL) as { data: string } | undefined;
    if (!row) return defaultSettings(HOSPITAL);
    try {
      return { ...defaultSettings(HOSPITAL), ...(JSON.parse(row.data) as PharmacySettings) };
    } catch {
      return defaultSettings(HOSPITAL);
    }
  }

  saveSettings(patch: Partial<PharmacySettings>): PharmacySettings {
    const next = { ...this.getSettings(), ...patch };
    this.db
      .prepare(
        "INSERT INTO settings (hospital_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(hospital_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
      )
      .run(HOSPITAL, JSON.stringify(next), nowIso());
    return next;
  }

  // -- medicines --------------------------------------------------------------

  private medicineRow(row: Record<string, unknown>): Record<string, unknown> {
    const stock = this.db
      .prepare("SELECT COALESCE(SUM(qty), 0) AS qty FROM medicine_batches WHERE medicine_id = ? AND qty > 0")
      .get(String(row.id)) as { qty: number };
    const earliest = this.db
      .prepare("SELECT MIN(expiry_date) AS e FROM medicine_batches WHERE medicine_id = ? AND qty > 0")
      .get(String(row.id)) as { e: string | null };
    const firstBatch = this.db
      .prepare(
        "SELECT batch_number, expiry_date FROM medicine_batches WHERE medicine_id = ? ORDER BY created_at ASC LIMIT 1"
      )
      .get(String(row.id)) as { batch_number: string; expiry_date: string | null } | undefined;
    return {
      ...row,
      stock_qty: Number(stock.qty),
      expiry_date: earliest.e || firstBatch?.expiry_date || null,
      batch_number: firstBatch?.batch_number ?? null,
      is_active: Boolean(row.is_active),
    };
  }

  listMedicines(opts?: { search?: string; limit?: number }): Array<Record<string, unknown>> {
    const limit = Math.min(opts?.limit || 500, 2000);
    const rows = (this.db
      .prepare(
        `SELECT * FROM medicines WHERE hospital_id = ? AND is_active = 1 ${
          opts?.search ? "AND (lower(name) LIKE ? OR lower(sku) LIKE ? OR lower(barcode) LIKE ? OR lower(generic_name) LIKE ?)" : ""
        } ORDER BY name ASC LIMIT ?`
      )
      .all(
        ...[
          HOSPITAL,
          ...(opts?.search
            ? [0, 1, 2, 3].map(() => `%${opts.search!.toLowerCase()}%`)
            : []),
          limit,
        ]
      ) as Array<Record<string, unknown>>);
    return rows.map((r) => this.medicineRow(r));
  }

  getMedicine(id: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT * FROM medicines WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.medicineRow(row) : null;
  }

  findMedicineByBarcode(barcode: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT * FROM medicines WHERE hospital_id = ? AND lower(barcode) = lower(?) LIMIT 1")
      .get(HOSPITAL, barcode) as Record<string, unknown> | undefined;
    return row ? this.medicineRow(row) : null;
  }

  /** Create a medicine; duplicate (name+manufacturer / sku / barcode) is rejected. */
  createMedicine(input: MedicineInput): Record<string, unknown> {
    input = medicineInputSchema.parse(input);
    const name = input.name.trim();
    const manufacturer = input.manufacturer?.trim() || null;

    const byName = this.db
      .prepare(
        "SELECT id FROM medicines WHERE hospital_id = ? AND lower(name) = lower(?) AND lower(COALESCE(manufacturer, '')) = lower(COALESCE(?, '')) LIMIT 1"
      )
      .get(HOSPITAL, name, manufacturer) as { id: string } | undefined;
    if (byName) throw new Error(medicineErrorMessage(name, manufacturer));

    if (input.sku?.trim()) {
      const bySku = this.db
        .prepare("SELECT id FROM medicines WHERE hospital_id = ? AND lower(sku) = lower(?) LIMIT 1")
        .get(HOSPITAL, input.sku.trim()) as { id: string } | undefined;
      if (bySku) throw new Error(`SKU already exists: ${input.sku.trim()}`);
    }

    if (input.barcode?.trim()) {
      const byBarcode = this.db
        .prepare("SELECT id FROM medicines WHERE hospital_id = ? AND lower(barcode) = lower(?) LIMIT 1")
        .get(HOSPITAL, input.barcode.trim()) as { id: string } | undefined;
      if (byBarcode) throw new Error(`Barcode already exists: ${input.barcode.trim()}`);
    }

    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO medicines (id, hospital_id, name, generic_name, manufacturer, sku, barcode, category, schedule, unit, purchase_price, selling_price, mrp, min_stock_level, reorder_level, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        HOSPITAL,
        name,
        input.generic_name?.trim() || null,
        manufacturer,
        input.sku?.trim() || null,
        input.barcode?.trim() || null,
        input.category?.trim() || null,
        input.schedule?.trim() || null,
        input.unit?.trim() || null,
        input.purchase_price ?? 0,
        input.selling_price ?? 0,
        input.mrp ?? null,
        input.min_stock_level ?? 0,
        input.reorder_level ?? 0,
        input.is_active === false ? 0 : 1,
        now,
        now
      );
    return this.getMedicine(id)!;
  }

  // -- batches & stock ---------------------------------------------------------

  listBatches(medicineId?: string): Array<Record<string, unknown>> {
    if (medicineId) {
      return this.db
        .prepare("SELECT * FROM medicine_batches WHERE medicine_id = ? ORDER BY expiry_date ASC")
        .all(medicineId) as Array<Record<string, unknown>>;
    }
    return this.db
      .prepare("SELECT * FROM medicine_batches ORDER BY created_at DESC LIMIT 2000")
      .all() as Array<Record<string, unknown>>;
  }

  getBatch(medicineId: string, batchNumber: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT * FROM medicine_batches WHERE medicine_id = ? AND batch_number = ?")
      .get(medicineId, batchNumber) as Record<string, unknown> | undefined;
    return row || null;
  }

  /** Create a batch (opening stock). Duplicate batch number is rejected. */
  addBatch(input: BatchInput): Record<string, unknown> {
    if (input && Number(input.qty) < 0) {
      throw new Error("Batch quantity cannot be negative");
    }
    input = batchInputSchema.parse(input);
    return this.tx(() => {
      const med = this.getMedicine(input.medicine_id);
      if (!med) throw new Error(`Medicine not found: ${input.medicine_id}`);
      const existing = this.getBatch(input.medicine_id, input.batch_number);
      if (existing) {
        throw new Error(
          `Batch already exists for ${String(med.name)}: ${input.batch_number}`
        );
      }
      if ((input.qty ?? 0) < 0) {
        throw new Error("Batch quantity cannot be negative");
      }
      const id = randomUUID();
      const now = nowIso();
      this.db
        .prepare(
          `INSERT INTO medicine_batches (id, medicine_id, batch_number, expiry_date, mrp, purchase_price, selling_price, qty, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.medicine_id,
          input.batch_number,
          input.expiry_date || null,
          input.mrp ?? null,
          input.purchase_price ?? 0,
          input.selling_price ?? 0,
          input.qty ?? 0,
          now,
          now
        );
      if ((input.qty ?? 0) > 0) {
        this.insertMovement({
          medicine_id: input.medicine_id,
          batch_id: id,
          movement_type: "in",
          quantity: input.qty!,
          reference_type: "opening",
          notes: "Opening stock",
          created_by: input.created_by,
        });
      }
      return this.getBatch(input.medicine_id, input.batch_number)!;
    });
  }

  /** Add stock to an existing batch. */
  addStock(raw: z.input<typeof addStockInputSchema>): Record<string, unknown> {
    const input = addStockInputSchema.parse(raw);
    return this.tx(() => {
      const batch = this.getBatch(input.medicine_id, input.batch_number);
      if (!batch) throw new Error(`Batch not found: ${input.batch_number}`);
      this.db
        .prepare("UPDATE medicine_batches SET qty = qty + ?, updated_at = ? WHERE id = ?")
        .run(input.qty, nowIso(), String(batch.id));
      this.insertMovement({
        medicine_id: input.medicine_id,
        batch_id: String(batch.id),
        movement_type: "in",
        quantity: input.qty,
        reference_type: "add",
        notes: input.notes || "Stock added",
        created_by: input.created_by,
      });
      return this.getBatch(input.medicine_id, input.batch_number)!;
    });
  }

  /** Signed stock adjustment; may not drive a batch negative. */
  adjustStock(raw: z.input<typeof adjustmentInputSchema>): Record<string, unknown> {
    const input = adjustmentInputSchema.parse(raw);
    return this.tx(() => {
      const med = this.getMedicine(input.medicine_id);
      if (!med) throw new Error(`Medicine not found: ${input.medicine_id}`);

      let batch: Record<string, unknown> | undefined;
      if (input.batch_id) {
        batch = this.db
          .prepare("SELECT * FROM medicine_batches WHERE id = ?")
          .get(input.batch_id) as Record<string, unknown> | undefined;
      } else if (input.batch_number) {
        batch = this.getBatch(input.medicine_id, input.batch_number) as Record<string, unknown> | undefined;
      } else {
        batch = this.db
          .prepare("SELECT * FROM medicine_batches WHERE medicine_id = ? ORDER BY created_at ASC LIMIT 1")
          .get(input.medicine_id) as Record<string, unknown> | undefined;
      }
      if (!batch) throw new Error(`No batch found for ${String(med.name)}`);

      const delta = input.quantity;
      const next = Number(batch.qty) + delta;
      if (next < 0) {
        throw new Error(
          `Adjustment would make stock negative for ${String(med.name)} (batch ${String(batch.batch_number)}): available ${Number(batch.qty)}`
        );
      }
      this.db
        .prepare("UPDATE medicine_batches SET qty = ?, updated_at = ? WHERE id = ?")
        .run(next, nowIso(), String(batch.id));
      this.insertMovement({
        medicine_id: input.medicine_id,
        batch_id: String(batch.id),
        movement_type: "adjust",
        quantity: delta,
        reference_type: "adjustment",
        notes: input.reason,
        created_by: input.created_by,
      });
      return { ...batch, qty: next };
    });
  }

  /** Purchase receipt: purchase header + items, batch stock in, ledger rows. */
  createPurchase(raw: z.input<typeof purchaseInputSchema>): Record<string, unknown> {
    const input = purchaseInputSchema.parse(raw);
    return this.tx(() => {
      const id = randomUUID();
      const now = nowIso();
      const purchaseNumber = `PO-${now.slice(0, 10).replace(/-/g, "")}-${String(
        this.nextCounter(`purchase-${todayIso()}`)
      ).padStart(4, "0")}`;

      let subtotal = 0;
      let tax = 0;
      let grand = 0;
      for (const item of input.items) {
        subtotal += item.qty * item.unit_price;
        tax += item.qty * item.unit_price * (item.gst_percent / 100);
      }
      subtotal = roundMoney(subtotal);
      tax = roundMoney(tax);
      grand = roundMoney(input.grand_total || subtotal + tax);

      this.db
        .prepare(
          `INSERT INTO purchases (id, purchase_number, supplier_name, invoice_number, purchase_date, subtotal, tax, grand_total, notes, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          purchaseNumber,
          input.supplier_name || null,
          input.invoice_number || null,
          input.purchase_date || todayIso(),
          subtotal,
          tax,
          grand,
          input.notes || null,
          input.created_by || null,
          now,
          now
        );

      for (const item of input.items) {
        const med = this.getMedicine(item.medicine_id);
        if (!med) throw new Error(`Medicine not found: ${item.medicine_id}`);
        let batch = this.getBatch(item.medicine_id, item.batch_number);
        if (!batch) {
          batch = this.addBatchInsideTx({
            medicine_id: item.medicine_id,
            batch_number: item.batch_number,
            expiry_date: item.expiry_date || null,
            mrp: null,
            purchase_price: item.unit_price,
            selling_price: med.selling_price as number,
            qty: 0,
          });
        } else {
          this.db
            .prepare(
              "UPDATE medicine_batches SET expiry_date = COALESCE(?, expiry_date), purchase_price = ?, updated_at = ? WHERE id = ?"
            )
            .run(item.expiry_date || null, item.unit_price, now, String(batch.id));
        }
        this.db
          .prepare("UPDATE medicine_batches SET qty = qty + ?, updated_at = ? WHERE id = ?")
          .run(item.qty, now, String(batch.id));
        this.insertMovement({
          medicine_id: item.medicine_id,
          batch_id: String(batch.id),
          movement_type: "in",
          quantity: item.qty,
          reference_type: "purchase",
          reference_id: id,
          notes: `Purchase ${purchaseNumber}${input.invoice_number ? ` / inv ${input.invoice_number}` : ""}`,
          created_by: input.created_by,
        });
        this.db
          .prepare(
            `INSERT INTO purchase_items (id, purchase_id, medicine_id, medicine_name, batch_number, expiry_date, qty, unit_price, gst_percent, total, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            randomUUID(),
            id,
            item.medicine_id,
            item.medicine_name || String(med.name),
            item.batch_number,
            item.expiry_date || null,
            item.qty,
            item.unit_price,
            item.gst_percent,
            roundMoney(item.qty * item.unit_price),
            now
          );
      }

      return {
        id,
        purchase_number: purchaseNumber,
        supplier_name: input.supplier_name,
        invoice_number: input.invoice_number,
        purchase_date: input.purchase_date || todayIso(),
        subtotal,
        tax,
        grand_total: grand,
        notes: input.notes,
        created_by: input.created_by,
        created_at: now,
        items: input.items,
      };
    });
  }

  private addBatchInsideTx(input: {
    medicine_id: string;
    batch_number: string;
    expiry_date: string | null;
    mrp: number | null;
    purchase_price: number;
    selling_price: number;
    qty: number;
  }): Record<string, unknown> {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO medicine_batches (id, medicine_id, batch_number, expiry_date, mrp, purchase_price, selling_price, qty, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.medicine_id,
        input.batch_number,
        input.expiry_date,
        input.mrp,
        input.purchase_price,
        input.selling_price,
        input.qty,
        now,
        now
      );
    return this.getBatch(input.medicine_id, input.batch_number)!;
  }

  private insertMovement(m: {
    medicine_id: string;
    batch_id?: string | null;
    movement_type: "in" | "out" | "adjust";
    quantity: number;
    reference_type: string;
    reference_id?: string | null;
    notes?: string | null;
    created_by?: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO stock_movements (id, medicine_id, batch_id, movement_type, quantity, reference_type, reference_id, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        m.medicine_id,
        m.batch_id || null,
        m.movement_type,
        m.quantity,
        m.reference_type,
        m.reference_id || null,
        m.notes || null,
        m.created_by || null,
        nowIso()
      );
  }

  // -- sales ------------------------------------------------------------------

  /**
   * Atomic POS sale. Validates every line (medicine exists, batch available,
   * batch not expired, qty <= available), then in ONE transaction writes the
   * sale, its items, the payment ledger, the patient record, deducts batch
   * stock and appends immutable movements. Any failure rolls all of it back.
   */
  createSale(raw: SqliteSaleInput): SaleRow {
    const input = sqliteSaleSchema.parse(raw);
    return this.tx(() => {
      const items: PosSaleLineItem[] = (input.items || []) as PosSaleLineItem[];
      if (!items.length) throw new Error("Sale requires at least one item");

      const prepared: Array<{
        item: PosSaleLineItem;
        medicine: Record<string, unknown>;
        batch: Record<string, unknown>;
      }> = [];

      for (const item of items) {
        if (!item.medicine_id) throw new Error(`Missing medicine reference for ${item.name}`);
        const medicine = this.db
          .prepare("SELECT * FROM medicines WHERE id = ?")
          .get(item.medicine_id) as Record<string, unknown> | undefined;
        if (!medicine) throw new Error(`Medicine not found: ${item.name}`);

        let batch: Record<string, unknown> | undefined;
        if (item.batch_number) {
          batch = this.getBatch(String(medicine.id), item.batch_number) || undefined;
          if (!batch) {
            throw new Error(
              `Batch not found for ${item.name}: ${item.batch_number}`
            );
          }
        } else {
          batch = fefoBatches(
            this.db
              .prepare("SELECT * FROM medicine_batches WHERE medicine_id = ?")
              .all(String(medicine.id)) as Array<Record<string, unknown>>
          )[0];
          if (!batch) {
            throw new Error(`No available stock for ${item.name}`);
          }
        }

        const expiry = String(batch.expiry_date || "");
        if (expiry && expiry < todayIso()) {
          throw new Error(
            `Cannot sell expired batch ${String(batch.batch_number)} of ${item.name} (expired ${expiry})`
          );
        }
        const available = Number(batch.qty);
        if (available < item.qty) {
          throw new Error(
            `Insufficient stock for ${item.name}. Available: ${available}`
          );
        }
        prepared.push({ item, medicine, batch });
      }

      const saleNumber =
        input.sale_number || this.nextSaleNumber();
      const saleId = randomUUID();
      const now = nowIso();
      const createdAt = input.created_at || now;

      const method = String(input.payment_method || "cash").toLowerCase();
      const subtotal = roundMoney(input.subtotal);
      const tax = roundMoney(input.tax);
      const grandTotal = roundMoney(input.grand_total);
      const discount = roundMoney(input.discount);

      // Payment lines: explicit > notes (buildPosPayload blob) > single tender.
      const paymentLines =
        (input.payments?.length ? input.payments : paymentLinesFromNotes(input.notes)) || [];
      const fallbackLine =
        paymentLines.length === 0 && input.amount_paid > 0
          ? [{ method, amount: input.amount_paid, reference: input.payment_reference }]
          : [];
      const tenders = [...paymentLines, ...fallbackLine].filter(
        (p) => Number(p.amount) > 0
      );
      const totalCollected = roundMoney(
        tenders.reduce((s, p) => s + Number(p.amount), 0)
      );
      const deferred = tenders.some(
        (p) => p.method === "credit" || p.method === "insurance"
      );
      const balanceDue = roundMoney(Math.max(0, grandTotal - totalCollected));
      const changeDue = roundMoney(
        Math.max(0, totalCollected - grandTotal - balanceDue)
      );
      const amountPaid = roundMoney(
        input.amount_paid ?? (deferred ? grandTotal : Math.min(totalCollected, grandTotal))
      );
      const paymentStatus =
        input.payment_status ||
        (balanceDue > 0.005 || deferred ? "pending" : "paid");

      this.db
        .prepare(
          `INSERT INTO sales (id, sale_number, hospital_id, patient_name, patient_phone, patient_age, patient_gender, patient_uhid, patient_id, sale_type, doctor_name, doctor_reg_no, prescription_number, branch_id, shift_id, cashier_name, subtotal, discount, tax, cgst, sgst, igst, tax_type, grand_total, payment_method, payment_status, amount_paid, amount_returned, payment_reference, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          saleId,
          saleNumber,
          HOSPITAL,
          String(input.patient_name || "Walk-in Customer").slice(0, 120),
          input.patient_phone || null,
          input.patient_age ?? null,
          input.patient_gender || null,
          input.patient_uhid || null,
          null,
          input.sale_type === "prescription" ? "prescription" : "walk_in",
          input.doctor_name || null,
          input.doctor_reg_no || null,
          input.prescription_number || null,
          input.branch_id || null,
          input.shift_id || null,
          input.cashier_name || null,
          subtotal,
          discount,
          tax,
          roundMoney(input.cgst || 0),
          roundMoney(input.sgst || 0),
          roundMoney(input.igst || 0),
          input.tax_type === "inter" ? "inter" : "intra",
          grandTotal,
          method,
          paymentStatus,
          amountPaid,
          roundMoney(input.amount_returned || changeDue),
          input.payment_reference || null,
          input.notes || null,
          createdAt,
          input.updated_at || now
        );

      for (const p of prepared) {
        const item = p.item;
        const total = roundMoney(Number(item.price) * item.qty);
        this.db
          .prepare(
            `INSERT INTO sale_items (id, sale_id, medicine_id, batch_id, name, qty, price, gst_percent, batch_number, expiry_date, discount, total, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            randomUUID(),
            saleId,
            String(p.medicine.id),
            String(p.batch.id),
            String(item.name).slice(0, 200),
            item.qty,
            item.price,
            item.gst_percent || 0,
            String(p.batch.batch_number),
            String(p.batch.expiry_date || ""),
            item.discount || 0,
            total,
            createdAt
          );
        const result = this.db
          .prepare(
            "UPDATE medicine_batches SET qty = qty - ?, updated_at = ? WHERE id = ? AND qty >= ?"
          )
          .run(item.qty, now, String(p.batch.id), item.qty);
        if (Number(result.changes) === 0) {
          throw new Error(
            `Insufficient stock for ${item.name}. Available: ${Number(p.batch.qty)}`
          );
        }
        this.insertMovement({
          medicine_id: String(p.medicine.id),
          batch_id: String(p.batch.id),
          movement_type: "out",
          quantity: item.qty,
          reference_type: "sale",
          reference_id: saleId,
          notes: saleNumber,
          created_by: input.cashier_name,
        });
      }

      for (const t of tenders) {
        const m = String(t.method).toLowerCase();
        this.db
          .prepare(
            `INSERT INTO payments (id, sale_id, sale_number, method, amount, reference, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            randomUUID(),
            saleId,
            saleNumber,
            m,
            roundMoney(t.amount),
            t.reference || null,
            offlinePaymentStatus(m),
            createdAt
          );
      }

      this.upsertPatient({
        uhid: input.patient_uhid || null,
        name: String(input.patient_name || "Walk-in Customer"),
        age: input.patient_age ?? null,
        gender: input.patient_gender || null,
        phone: input.patient_phone || null,
        doctor_name: input.doctor_name || null,
        prescription_number: input.prescription_number || null,
      });

      return this.getSale(saleNumber)!;
    });
  }

  /**
   * Idempotent sale commit (the active POS transaction boundary). When the
   * caller supplies a `sale_number` that already exists, the existing sale is
   * returned untouched — retries of an already-committed transaction must
   * never double-deduct stock or write a second sale.
   */
  createSaleIdempotent(raw: SqliteSaleInput): SaleRow {
    const saleNumber = raw.sale_number;
    if (saleNumber) {
      const existing = this.getSale(saleNumber);
      if (existing) return existing;
    }
    return this.createSale(raw);
  }

  private upsertPatient(p: {
    uhid: string | null;
    name: string;
    age: number | null;
    gender: string | null;
    phone: string | null;
    doctor_name: string | null;
    prescription_number: string | null;
  }): void {
    if (p.uhid) {
      const existing = this.db
        .prepare("SELECT id FROM patients WHERE lower(uhid) = lower(?)")
        .get(p.uhid) as { id: string } | undefined;
      if (existing) {
        this.db
          .prepare(
            "UPDATE patients SET name = ?, age = COALESCE(?, age), gender = COALESCE(?, gender), phone = COALESCE(?, phone), doctor_name = COALESCE(?, doctor_name), prescription_number = COALESCE(?, prescription_number), updated_at = ? WHERE id = ?"
          )
          .run(p.name, p.age, p.gender, p.phone, p.doctor_name, p.prescription_number, nowIso(), existing.id);
        return;
      }
    } else if (p.phone) {
      const existing = this.db
        .prepare("SELECT id FROM patients WHERE lower(COALESCE(phone, '')) = lower(?) AND lower(COALESCE(uhid, '')) = '' ORDER BY created_at DESC LIMIT 1")
        .get(p.phone) as { id: string } | undefined;
      if (existing) {
        this.db
          .prepare(
            "UPDATE patients SET name = ?, age = COALESCE(?, age), gender = COALESCE(?, gender), doctor_name = COALESCE(?, doctor_name), prescription_number = COALESCE(?, prescription_number), updated_at = ? WHERE id = ?"
          )
          .run(p.name, p.age, p.gender, p.doctor_name, p.prescription_number, nowIso(), existing.id);
        return;
      }
    }
    this.db
      .prepare(
        `INSERT INTO patients (id, uhid, name, age, gender, phone, doctor_name, prescription_number, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        p.uhid || null,
        p.name,
        p.age,
        p.gender,
        p.phone,
        p.doctor_name,
        p.prescription_number,
        nowIso(),
        nowIso()
      );
  }

  getSale(saleNumber: string): SaleRow | null {
    const row = this.db
      .prepare("SELECT * FROM sales WHERE sale_number = ?")
      .get(saleNumber) as Record<string, unknown> | undefined;
    if (!row) return null;
    const items = this.db
      .prepare("SELECT * FROM sale_items WHERE sale_id = ?")
      .all(String(row.id)) as Array<Record<string, unknown>>;
    const payments = this.db
      .prepare("SELECT * FROM payments WHERE sale_id = ? ORDER BY created_at ASC")
      .all(String(row.id)) as Array<Record<string, unknown>>;
    return {
      ...(row as unknown as SaleRow),
      line_items: items.map((i) => ({
        ...i,
        medicine_id: i.medicine_id,
        name: i.name,
        qty: i.qty,
        quantity: i.qty,
        price: i.price,
        selling_price: i.price,
        gst_percent: i.gst_percent,
        batch_number: i.batch_number,
        expiry_date: i.expiry_date,
        discount: i.discount,
        total: i.total,
      })),
      payments: payments.map((p) => ({
        ...p,
        id: p.id,
        method: p.method,
        amount: p.amount,
        reference: p.reference,
        status: p.status,
      })),
    };
  }

  listSales(opts?: { sinceIso?: string; limit?: number }): SaleRow[] {
    const since = opts?.sinceIso || "1970-01-01T00:00:00.000Z";
    const limit = Math.min(opts?.limit || 500, 2000);
    const rows = this.db
      .prepare("SELECT * FROM sales WHERE updated_at >= ? ORDER BY updated_at ASC LIMIT ?")
      .all(since, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.getSale(String(r.sale_number))!).filter(Boolean);
  }

  listPayments(opts?: { saleNumber?: string; sinceIso?: string }): Array<Record<string, unknown>> {
    if (opts?.saleNumber) {
      return this.db
        .prepare("SELECT * FROM payments WHERE sale_number = ? ORDER BY created_at ASC")
        .all(opts.saleNumber) as Array<Record<string, unknown>>;
    }
    if (opts?.sinceIso) {
      return this.db
        .prepare("SELECT * FROM payments WHERE created_at >= ? ORDER BY created_at DESC LIMIT 2000")
        .all(opts.sinceIso) as Array<Record<string, unknown>>;
    }
    return this.db
      .prepare("SELECT * FROM payments ORDER BY created_at DESC LIMIT 2000")
      .all() as Array<Record<string, unknown>>;
  }

  // -- returns ----------------------------------------------------------------

  /**
   * Return + refund, atomic. Restores the EXACT batch stock the items were
   * sold from, appends ledger rows, records the refund payment and, when the
   * whole sale is returned, marks the sale refunded.
   */
  createReturn(raw: z.input<typeof returnInputSchema>): Record<string, unknown> {
    const input = returnInputSchema.parse(raw);
    return this.tx(() => {
      const sale = this.db
        .prepare("SELECT * FROM sales WHERE sale_number = ?")
        .get(input.original_sale_number) as Record<string, unknown> | undefined;
      if (!sale) {
        throw new Error(`Original sale not found: ${input.original_sale_number}`);
      }
      const saleId = String(sale.id);

      let subtotal = 0;
      for (const item of input.items) {
        const sold = this.db
          .prepare(
            "SELECT COALESCE(SUM(qty), 0) AS qty FROM sale_items WHERE sale_id = ? AND lower(name) = lower(?)"
          )
          .get(saleId, item.medicine_name) as { qty: number };
        const returnedSoFar = this.db
          .prepare(
            "SELECT COALESCE(SUM(quantity), 0) AS qty FROM return_items WHERE medicine_name = ? AND return_id IN (SELECT id FROM returns WHERE sale_id = ?)"
          )
          .get(item.medicine_name, saleId) as { qty: number };
        const maxReturnable = Number(sold.qty) - Number(returnedSoFar.qty);
        if (item.quantity > maxReturnable) {
          throw new Error(
            `Cannot return ${item.quantity} of ${item.medicine_name}; at most ${maxReturnable} can be returned`
          );
        }
        subtotal += roundMoney(Number(item.unit_price || 0) * item.quantity);
      }

      const now = nowIso();
      const returnId = randomUUID();
      const returnNumber = input.original_sale_number.includes("RET-")
        ? input.original_sale_number
        : `RET-${input.original_sale_number}`;
      const refundAmount = roundMoney(input.refund_amount ?? subtotal);

      this.db
        .prepare(
          `INSERT INTO returns (id, return_number, sale_id, sale_number, patient_name, patient_phone, return_reason, return_type, subtotal, refund_amount, refund_method, refund_reference, status, processed_by, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          returnId,
          returnNumber,
          saleId,
          input.original_sale_number,
          String(input.patient_name || sale.patient_name || "Walk-in Customer").slice(0, 120),
          input.patient_phone || sale.patient_phone || null,
          input.return_reason,
          input.return_type,
          roundMoney(subtotal),
          refundAmount,
          input.refund_method || sale.payment_method || "cash",
          input.refund_reference || null,
          "completed",
          input.processed_by || null,
          input.notes || null,
          now,
          now
        );

      for (const item of input.items) {

        let batch: Record<string, unknown> | null | undefined = null;
        if (item.medicine_id) {
          batch = this.db
            .prepare(
              "SELECT * FROM medicine_batches WHERE medicine_id = ? AND batch_number = ?"
            )
            .get(item.medicine_id, item.batch_number || "") as Record<string, unknown> | undefined;
        }
        if (!batch) {
          // Return items from the POS UI carry only the medicine name — resolve
          // the medicine first, then the exact batch the item was sold from.
          const medRow = item.medicine_id
            ? (this.db
                .prepare("SELECT * FROM medicines WHERE id = ?")
                .get(item.medicine_id) as Record<string, unknown> | undefined)
            : (this.db
                .prepare(
                  "SELECT * FROM medicines WHERE lower(name) = lower(?) ORDER BY created_at ASC LIMIT 1"
                )
                .get(item.medicine_name) as Record<string, unknown> | undefined);
          if (medRow) {
            const medId = String(medRow.id);
            if (item.batch_number) {
              batch = this.getBatch(medId, item.batch_number);
            }
            if (!batch) {
              batch = this.db
                .prepare("SELECT * FROM medicine_batches WHERE medicine_id = ? ORDER BY created_at ASC LIMIT 1")
                .get(medId) as Record<string, unknown> | undefined;
            }
          }
        }
        if (!batch) {
          throw new Error(`No batch found to restore for ${item.medicine_name}`);
        }

        const unitPrice = item.unit_price || 0;
        const total = roundMoney(unitPrice * item.quantity);
        subtotal += total;

        this.db
          .prepare("UPDATE medicine_batches SET qty = qty + ?, updated_at = ? WHERE id = ?")
          .run(item.quantity, now, String(batch.id));
        this.insertMovement({
          medicine_id: String(batch.medicine_id),
          batch_id: String(batch.id),
          movement_type: "in",
          quantity: item.quantity,
          reference_type: "return",
          reference_id: saleId,
          notes: `Return ${returnNumber} for ${input.original_sale_number}`,
          created_by: input.processed_by,
        });
        this.db
          .prepare(
            `INSERT INTO return_items (id, return_id, medicine_id, batch_id, medicine_name, batch_number, quantity, unit_price, total_price, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            randomUUID(),
            returnId,
            String(batch.medicine_id),
            String(batch.id),
            item.medicine_name,
            String(batch.batch_number),
            item.quantity,
            unitPrice,
            total,
            item.reason || null,
            now
          );
      }

      if (refundAmount > 0) {
        this.db
          .prepare(
            `INSERT INTO payments (id, sale_id, sale_number, return_id, method, amount, reference, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            randomUUID(),
            saleId,
            input.original_sale_number,
            returnId,
            input.refund_method || sale.payment_method || "cash",
            refundAmount,
            input.refund_reference || null,
            "refunded",
            now
          );
      }

      // If the entire sale has been returned, mark the sale refunded.
      const soldTotal = this.db
        .prepare("SELECT COALESCE(SUM(qty), 0) AS qty FROM sale_items WHERE sale_id = ?")
        .get(saleId) as { qty: number };
      const returnedTotal = this.db
        .prepare(
          "SELECT COALESCE(SUM(quantity), 0) AS qty FROM return_items WHERE return_id IN (SELECT id FROM returns WHERE sale_id = ?)"
        )
        .get(saleId) as { qty: number };
      if (Number(returnedTotal.qty) >= Number(soldTotal.qty)) {
        this.db
          .prepare("UPDATE sales SET payment_status = 'refunded', amount_returned = ?, updated_at = ? WHERE id = ?")
          .run(refundAmount, now, saleId);
      } else {
        this.db
          .prepare("UPDATE sales SET amount_returned = amount_returned + ?, updated_at = ? WHERE id = ?")
          .run(refundAmount, now, saleId);
      }

      const row = this.db
        .prepare("SELECT * FROM returns WHERE id = ?")
        .get(returnId) as Record<string, unknown>;
      const items = this.db
        .prepare("SELECT * FROM return_items WHERE return_id = ?")
        .all(returnId) as Array<Record<string, unknown>>;
      return { ...row, items };
    });
  }

  /** Read one return with its items (by return number or original sale). */
  getReturn(returnNumber: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT * FROM returns WHERE return_number = ? OR sale_number = ?")
      .get(returnNumber, returnNumber) as Record<string, unknown> | undefined;
    if (!row) return null;
    const items = this.db
      .prepare("SELECT * FROM return_items WHERE return_id = ?")
      .all(String(row.id)) as Array<Record<string, unknown>>;
    return { ...row, items };
  }

  /**
   * Idempotent return (the active POS return boundary). The M4/M5 engine
   * supports one return per original sale (return_number derives from the
   * sale); a retry of an already-committed return returns the existing row
   * instead of re-restoring stock or re-refunding.
   */
  createReturnIdempotent(raw: z.input<typeof returnInputSchema>): Record<string, unknown> {
    const saleNumber = String(raw.original_sale_number || "").trim();
    if (saleNumber) {
      const existing = this.db
        .prepare("SELECT return_number FROM returns WHERE sale_number = ?")
        .get(saleNumber) as { return_number: string } | undefined;
      if (existing) return this.getReturn(existing.return_number)!;
    }
    return this.createReturn(raw);
  }

  listReturns(opts?: { limit?: number }): Array<Record<string, unknown>> {
    const limit = Math.min(opts?.limit || 200, 2000);
    const rows = this.db
      .prepare("SELECT * FROM returns ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      ...r,
      items: this.db
        .prepare("SELECT * FROM return_items WHERE return_id = ?")
        .all(String(r.id)),
    }));
  }

  // -- ledger -----------------------------------------------------------------

  listMovements(opts?: { medicineId?: string; limit?: number }): Array<Record<string, unknown>> {
    const limit = Math.min(opts?.limit || 500, 2000);
    if (opts?.medicineId) {
      return this.db
        .prepare("SELECT * FROM stock_movements WHERE medicine_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
        .all(opts.medicineId, limit) as Array<Record<string, unknown>>;
    }
    return this.db
      .prepare("SELECT * FROM stock_movements ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(limit) as Array<Record<string, unknown>>;
  }

  listPurchases(opts?: { limit?: number }): Array<Record<string, unknown>> {
    const limit = Math.min(opts?.limit || 200, 2000);
    const rows = this.db
      .prepare("SELECT * FROM purchases ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      ...r,
      items: this.db
        .prepare("SELECT * FROM purchase_items WHERE purchase_id = ?")
        .all(String(r.id)),
    }));
  }

  // -- patients ---------------------------------------------------------------

  listPatients(opts?: { search?: string; limit?: number }): Array<Record<string, unknown>> {
    const limit = Math.min(opts?.limit || 200, 2000);
    if (opts?.search) {
      return this.db
        .prepare(
          "SELECT * FROM patients WHERE lower(name) LIKE ? OR lower(COALESCE(phone, '')) LIKE ? OR lower(COALESCE(uhid, '')) LIKE ? ORDER BY updated_at DESC LIMIT ?"
        )
        .all(
          `%${opts.search.toLowerCase()}%`,
          `%${opts.search.toLowerCase()}%`,
          `%${opts.search.toLowerCase()}%`,
          limit
        ) as Array<Record<string, unknown>>;
    }
    return this.db
      .prepare("SELECT * FROM patients ORDER BY updated_at DESC LIMIT ?")
      .all(limit) as Array<Record<string, unknown>>;
  }

  // -- branches / shifts / held bills -----------------------------------------

  listBranches(): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM branches WHERE hospital_id = ? ORDER BY is_default DESC, name ASC")
      .all(HOSPITAL) as Array<Record<string, unknown>>;
  }

  createBranch(input: {
    code?: string;
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    phone?: string | null;
    email?: string | null;
    manager_name?: string | null;
    is_default?: boolean;
  }): Record<string, unknown> {
    const now = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO branches (id, hospital_id, code, name, address, city, state, pincode, phone, email, manager_name, is_active, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
      )
      .run(
        id,
        HOSPITAL,
        input.code || null,
        input.name,
        input.address || null,
        input.city || null,
        input.state || null,
        input.pincode || null,
        input.phone || null,
        input.email || null,
        input.manager_name || null,
        input.is_default ? 1 : 0,
        now,
        now
      );
    return this.listBranches().find((b) => b.id === id)!;
  }

  listShifts(): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM shifts WHERE hospital_id = ? ORDER BY start_time DESC LIMIT 50")
      .all(HOSPITAL) as Array<Record<string, unknown>>;
  }

  openShift(input: {
    user_name: string;
    user_id?: string | null;
    branch_id?: string | null;
    opening_cash: number;
    notes?: string | null;
  }): Record<string, unknown> {
    const now = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO shifts (id, hospital_id, branch_id, user_id, user_name, shift_date, start_time, opening_cash, total_sales, total_returns, total_transactions, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'open', ?, ?, ?)`
      )
      .run(
        id,
        HOSPITAL,
        input.branch_id || null,
        input.user_id || null,
        input.user_name,
        now.slice(0, 10),
        now,
        input.opening_cash,
        input.notes || null,
        now,
        now
      );
    return this.db.prepare("SELECT * FROM shifts WHERE id = ?").get(id) as Record<string, unknown>;
  }

  listHeldBills(): Array<Record<string, unknown>> {
    const rows = this.db
      .prepare("SELECT * FROM held_bills WHERE hospital_id = ? ORDER BY created_at DESC LIMIT 50")
      .all(HOSPITAL) as Array<Record<string, unknown>>;
    return rows.map((r) => {
      let items: unknown = [];
      try {
        items = JSON.parse(String(r.items));
      } catch {
        items = [];
      }
      return { ...r, items };
    });
  }

  createHeldBill(input: {
    branch_id?: string | null;
    shift_id?: string | null;
    reference: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    items: unknown[];
    discount: number;
    notes?: string | null;
    held_by?: string | null;
    held_by_name?: string | null;
  }): Record<string, unknown> {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO held_bills (id, hospital_id, branch_id, shift_id, reference, customer_name, customer_phone, items, discount, notes, held_by, held_by_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        HOSPITAL,
        input.branch_id || null,
        input.shift_id || null,
        input.reference,
        input.customer_name || null,
        input.customer_phone || null,
        JSON.stringify(input.items || []),
        input.discount || 0,
        input.notes || null,
        input.held_by || null,
        input.held_by_name || null,
        nowIso()
      );
    return this.db.prepare("SELECT * FROM held_bills WHERE id = ?").get(id) as Record<string, unknown>;
  }

  // -- stats ------------------------------------------------------------------

  dashboardStats(): Record<string, unknown> {
    const today = todayIso();
    const since = `${today}T00:00:00`;

    const salesToday = this.db
      .prepare("SELECT COALESCE(SUM(grand_total), 0) AS t, COUNT(*) AS n FROM sales WHERE created_at >= ?")
      .get(since) as { t: number; n: number };
    const returnsToday = this.db
      .prepare("SELECT COALESCE(SUM(refund_amount), 0) AS t, COUNT(*) AS n FROM returns WHERE created_at >= ?")
      .get(since) as { t: number; n: number };
    const meds = this.listMedicines({ limit: 2000 });
    const settings = this.getSettings();

    const lowStock = meds.filter((m) => Number(m.stock_qty) <= Number(m.min_stock_level || 0)).length;
    const outOfStock = meds.filter((m) => Number(m.stock_qty) === 0).length;

    const soon = new Date();
    soon.setDate(soon.getDate() + Number(settings.expiry_alert_days || 90));
    const soonStr = soon.toISOString().slice(0, 10);
    const expiring = meds.filter(
      (m) => m.expiry_date && String(m.expiry_date) <= soonStr && String(m.expiry_date) >= today
    ).length;
    const expired = meds.filter(
      (m) => m.expiry_date && String(m.expiry_date) < today
    ).length;

    const paymentRows = this.db
      .prepare("SELECT method, amount FROM payments WHERE created_at >= ?")
      .all(since) as Array<{ method: string; amount: number }>;
    const byMethod = new Map<string, { amount: number; count: number }>();
    for (const p of paymentRows) {
      const cur = byMethod.get(p.method) || { amount: 0, count: 0 };
      cur.amount += Number(p.amount);
      cur.count += 1;
      byMethod.set(p.method, cur);
    }

    const recent = this.db
      .prepare("SELECT * FROM sales ORDER BY created_at DESC LIMIT 10")
      .all() as Array<Record<string, unknown>>;

    return {
      today_sales: roundMoney(Number(salesToday.t)),
      today_transactions: Number(salesToday.n),
      today_returns: roundMoney(Number(returnsToday.t)),
      today_discount: 0,
      today_tax: 0,
      today_customers: this.db
        .prepare("SELECT COUNT(DISTINCT COALESCE(patient_phone, patient_name)) AS n FROM sales WHERE created_at >= ?")
        .get(since) as { n: number },
      low_stock_count: lowStock,
      expiring_count: expiring,
      expired_count: expired,
      out_of_stock_count: outOfStock,
      pending_prescriptions: 0,
      active_shift: this.db
        .prepare("SELECT * FROM shifts WHERE status = 'open' ORDER BY start_time DESC LIMIT 1")
        .get() || null,
      recent_sales: recent,
      top_medicines: [],
      payment_breakdown: [...byMethod.entries()].map(([method, v]) => ({ method, ...v })),
      hourly_sales: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Factory + singleton
// ---------------------------------------------------------------------------

const instances = new Map<string, PharmacySqliteStore>();

/**
 * Get the singleton store. ":memory:" (default) is for tests; the server
 * passes a real file path so data survives restarts with no network.
 */
export function getPharmacySqlite(path?: string): PharmacySqliteStore {
  const key = path || ":memory:";
  let store = instances.get(key);
  if (!store) {
    store = new PharmacySqliteStore(key);
    instances.set(key, store);
  }
  return store;
}

/** Close + drop a store from the cache (mainly tests). */
export function closePharmacySqlite(path?: string): void {
  const key = path || ":memory:";
  const store = instances.get(key);
  if (store) {
    store.close();
    instances.delete(key);
  }
}

/** Reset the whole cache (tests). */
export function resetPharmacySqlite(): void {
  for (const [, s] of instances) {
    try {
      s.close();
    } catch {
      /* ignore */
    }
  }
  instances.clear();
}
