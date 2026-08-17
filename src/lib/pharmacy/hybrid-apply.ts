/**
 * M7 Hybrid Sync — cloud apply contract.
 *
 * Local SQLite remains the transaction authority. These helpers replay a
 * committed local mutation onto the cloud replica:
 *   - medicines upsert by id / barcode / sku (never duplicate)
 *   - sales upsert by sale_number (never a second row, never a second stock out)
 *   - customer / supplier / purchase_order / category upsert by natural key
 *
 * The store is injected so unit tests run against an in-memory replica and
 * the sync route uses the Supabase adapter.
 */

import { roundMoney } from "./tax";
import { POS_PAYMENT_METHODS } from "./validation";

export const LAST_SYNC_WATERMARK_KEY = "last-sync-watermark";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

export function clientSaleNumber(payload: Record<string, unknown>): string | null {
  return asTrimmedString(payload.sale_number);
}

export function clientEntityId(payload: Record<string, unknown>): string | null {
  if (isUuid(payload.id)) return String(payload.id).trim();
  if (isUuid(payload._clientId)) return String(payload._clientId).trim();
  return null;
}

export function medicineIdentity(payload: Record<string, unknown>): {
  id: string | null;
  barcode: string | null;
  sku: string | null;
} {
  return {
    id: clientEntityId(payload),
    barcode: asTrimmedString(payload.barcode),
    sku: asTrimmedString(payload.sku),
  };
}

export function classifyApplyFailure(message: string): "conflict" | "failed" {
  return /insufficient stock|already exists|conflict|expired|not found|negative/i.test(
    message
  )
    ? "conflict"
    : "failed";
}

/** PostgREST PGRST204: column is not in the live schema cache. */
export function missingSchemaColumn(message: string): string | null {
  const m = message.match(/Could not find the '([^']+)' column/i);
  return m?.[1] || null;
}

export function applyErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Apply failed";
}

/** Entities that now have a cloud apply path (heal M6 "blocked" queue rows). */
export const CLOUD_APPLY_ENTITIES = new Set([
  "settings",
  "branch",
  "shift",
  "sale",
  "return",
  "held_bill",
  "medicine",
  "customer",
  "supplier",
  "purchase_order",
  "category",
]);

export type ApplyResult = {
  id: string;
  duplicate: boolean;
  row: Record<string, unknown>;
};

export type HybridCloudStore = {
  findSaleByNumber(
    hospitalId: string,
    saleNumber: string
  ): Promise<Record<string, unknown> | null>;
  insertSale(row: Record<string, unknown>): Promise<Record<string, unknown>>;
  findMedicineById(id: string): Promise<Record<string, unknown> | null>;
  findMedicineBySku(
    hospitalId: string,
    sku: string
  ): Promise<Record<string, unknown> | null>;
  findMedicineByBarcode(
    hospitalId: string,
    barcode: string
  ): Promise<Record<string, unknown> | null>;
  insertMedicine(row: Record<string, unknown>): Promise<Record<string, unknown>>;
  getMedicineStock(id: string, hospitalId?: string): Promise<number | null>;
  decrementMedicineStock(
    id: string,
    qty: number,
    hospitalId: string
  ): Promise<void>;
  insertStockMovement(row: Record<string, unknown>): Promise<void>;
  applySaleReplica(input: {
    hospitalId: string;
    saleNumber: string;
    saleRow: Record<string, unknown>;
    lines: Array<{ medicine_id: string; qty: number; name: string }>;
  }): Promise<{ row: Record<string, unknown>; created: boolean }>;
  incrementMedicineStock(
    id: string,
    qty: number,
    hospitalId: string
  ): Promise<void>;
  applyReturnReplica(input: {
    hospitalId: string;
    returnNumber: string;
    returnRow: Record<string, unknown>;
    lines: Array<{ medicine_id: string; qty: number; name: string }>;
  }): Promise<{ row: Record<string, unknown>; created: boolean }>;
  findByName(
    entity: "customer" | "supplier" | "category",
    hospitalId: string,
    name: string
  ): Promise<Record<string, unknown> | null>;
  findById(
    entity: "customer" | "supplier" | "category" | "purchase_order",
    id: string
  ): Promise<Record<string, unknown> | null>;
  insertRow(
    entity: "customer" | "supplier" | "category" | "purchase_order",
    row: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  findPurchaseOrderByNumber(
    hospitalId: string,
    poNumber: string
  ): Promise<Record<string, unknown> | null>;
};

export function medicineRowFromPayload(
  payload: Record<string, unknown>,
  hospitalId: string
): Record<string, unknown> {
  const id = clientEntityId(payload);
  const sku = asTrimmedString(payload.sku) || "";
  const barcode = asTrimmedString(payload.barcode);
  const stock = Number(payload.stock_qty ?? payload.qty ?? 0) || 0;
  return {
    ...(id ? { id } : {}),
    hospital_id: hospitalId,
    name: String(payload.name || "Medicine").slice(0, 200),
    generic_name: String(payload.generic_name || ""),
    manufacturer: String(payload.manufacturer || ""),
    batch_number: String(payload.batch_number || ""),
    sku,
    ...(barcode ? { barcode } : {}),
    unit: String(payload.unit || "tab"),
    purchase_price: Number(payload.purchase_price || 0),
    selling_price: Number(payload.selling_price || 0),
    stock_qty: stock,
    reorder_level: Number(payload.reorder_level || 0),
    min_stock_level: Number(payload.min_stock_level || 0),
    expiry_date: asTrimmedString(payload.expiry_date),
    is_active: payload.is_active === false ? false : true,
  };
}

export async function applyCloudMedicine(
  store: HybridCloudStore,
  payload: Record<string, unknown>,
  hospitalId: string
): Promise<ApplyResult> {
  const ident = medicineIdentity(payload);
  if (ident.id) {
    const existing = await store.findMedicineById(ident.id);
    if (existing) return { id: String(existing.id), duplicate: true, row: existing };
  }
  if (ident.barcode) {
    const existing = await store.findMedicineByBarcode(hospitalId, ident.barcode);
    if (existing) return { id: String(existing.id), duplicate: true, row: existing };
  }
  if (ident.sku) {
    const existing = await store.findMedicineBySku(hospitalId, ident.sku);
    if (existing) return { id: String(existing.id), duplicate: true, row: existing };
  }
  const inserted = await store.insertMedicine(medicineRowFromPayload(payload, hospitalId));
  return { id: String(inserted.id), duplicate: false, row: inserted };
}

export function saleRowFromPayload(
  payload: Record<string, unknown>,
  hospitalId: string,
  saleNumber: string
): Record<string, unknown> {
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    ...(isUuid(payload.id)
      ? { id: String(payload.id) }
      : isUuid(payload._clientId)
        ? { id: String(payload._clientId) }
        : {}),
    hospital_id: hospitalId,
    sale_number: saleNumber,
    patient_name: String(payload.patient_name || "Walk-in Customer").slice(0, 120),
    patient_phone: String(payload.patient_phone || ""),
    patient_age: payload.patient_age == null ? null : Number(payload.patient_age),
    sale_type: payload.sale_type === "prescription" ? "prescription" : "walk_in",
    branch_id: payload.branch_id ?? null,
    shift_id: payload.shift_id ?? null,
    cashier_name: payload.cashier_name ?? "",
    customer_phone: payload.patient_phone ?? "",
    prescription_number: payload.prescription_number ?? null,
    doctor_name: payload.doctor_name ?? null,
    doctor_reg_no: payload.doctor_reg_no ?? null,
    subtotal: Number(payload.subtotal || 0),
    discount: Number(payload.discount || 0),
    tax: Number(payload.tax || 0),
    grand_total: Number(payload.grand_total || 0),
    amount_paid: Number(payload.amount_paid || 0),
    amount_returned: Number(payload.amount_returned || 0),
    payment_method: POS_PAYMENT_METHODS.includes(
      String(payload.payment_method || "cash") as (typeof POS_PAYMENT_METHODS)[number]
    )
      ? String(payload.payment_method || "cash")
      : "cash",
    payment_status: String(payload.payment_status || "paid"),
    payment_reference: payload.payment_reference ?? null,
    notes: payload.notes ?? null,
    sold_by: payload.cashier_name ?? "",
    line_items: items.map((raw) => {
      const i = raw as Record<string, unknown>;
      const qty = Number(i.qty ?? i.quantity ?? 1);
      const price = Number(i.price ?? i.selling_price ?? 0);
      return {
        medicine_id: i.medicine_id ?? null,
        name: String(i.name || ""),
        quantity: qty,
        qty,
        price,
        selling_price: price,
        gst_percent: i.gst_percent ?? null,
        batch_number: i.batch_number ?? null,
        expiry_date: i.expiry_date ?? null,
        discount: Number(i.discount ?? 0),
        total: roundMoney(price * qty),
      };
    }),
  };
}

export function saleLinesFromPayload(
  payload: Record<string, unknown>
): Array<{ medicine_id: string; qty: number; name: string }> {
  const items = Array.isArray(payload.items)
    ? (payload.items as Array<Record<string, unknown>>)
    : [];
  const lines: Array<{ medicine_id: string; qty: number; name: string }> = [];
  for (const item of items) {
    const medicineId = asTrimmedString(item.medicine_id);
    const qty = Number(item.qty ?? item.quantity ?? 0);
    if (!medicineId || qty <= 0) continue;
    lines.push({
      medicine_id: medicineId,
      qty,
      name: String(item.name || "item"),
    });
  }
  return lines;
}

export async function applyCloudSale(
  store: HybridCloudStore,
  payload: Record<string, unknown>,
  hospitalId: string
): Promise<ApplyResult> {
  const saleNumber = clientSaleNumber(payload);
  if (!saleNumber) throw new Error("sale_number required");
  const lines = saleLinesFromPayload(payload);
  if (!lines.length) throw new Error("Invalid sale payload");
  const saleRow = saleRowFromPayload(payload, hospitalId, saleNumber);
  try {
    const applied = await store.applySaleReplica({
      hospitalId,
      saleNumber,
      saleRow,
      lines,
    });
    return {
      id: String(applied.row.id),
      duplicate: !applied.created,
      row: applied.row,
    };
  } catch (err) {
    const message = applyErrorMessage(err);
    if (/duplicate|unique|already exists/i.test(message)) {
      const applied = await store.applySaleReplica({
        hospitalId,
        saleNumber,
        saleRow,
        lines,
      });
      return {
        id: String(applied.row.id),
        duplicate: true,
        row: applied.row,
      };
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

async function applyNamedEntity(
  store: HybridCloudStore,
  entity: "customer" | "supplier" | "category",
  payload: Record<string, unknown>,
  hospitalId: string
): Promise<ApplyResult> {
  const id = clientEntityId(payload);
  if (id) {
    const existing = await store.findById(entity, id);
    if (existing) return { id: String(existing.id), duplicate: true, row: existing };
  }
  const name = asTrimmedString(payload.name) || entity;
  const existing = await store.findByName(entity, hospitalId, name);
  if (existing) return { id: String(existing.id), duplicate: true, row: existing };
  const inserted = await store.insertRow(entity, {
    ...(id ? { id } : {}),
    hospital_id: hospitalId,
    name,
    phone: asTrimmedString(payload.phone) || "",
    email: asTrimmedString(payload.email) || "",
    address: asTrimmedString(payload.address) || "",
    description: asTrimmedString(payload.description) || "",
    is_active: payload.is_active === false ? false : true,
  });
  return { id: String(inserted.id), duplicate: false, row: inserted };
}

export async function applyCloudCustomer(
  store: HybridCloudStore,
  payload: Record<string, unknown>,
  hospitalId: string
): Promise<ApplyResult> {
  return applyNamedEntity(store, "customer", payload, hospitalId);
}

export async function applyCloudSupplier(
  store: HybridCloudStore,
  payload: Record<string, unknown>,
  hospitalId: string
): Promise<ApplyResult> {
  return applyNamedEntity(store, "supplier", payload, hospitalId);
}

export async function applyCloudCategory(
  store: HybridCloudStore,
  payload: Record<string, unknown>,
  hospitalId: string
): Promise<ApplyResult> {
  return applyNamedEntity(store, "category", payload, hospitalId);
}

export function clientReturnNumber(payload: Record<string, unknown>): string | null {
  const explicit = asTrimmedString(payload.return_number);
  if (explicit) return explicit;
  const saleNumber = asTrimmedString(payload.original_sale_number);
  if (!saleNumber) return null;
  return saleNumber.includes("RET-") ? saleNumber : `RET-${saleNumber}`;
}

export function returnLinesFromPayload(
  payload: Record<string, unknown>
): Array<{
  medicine_id: string;
  qty: number;
  quantity: number;
  name: string;
  medicine_name: string;
  unit_price: number;
  price: number;
  total_price: number;
}> {
  const items = Array.isArray(payload.items)
    ? (payload.items as Array<Record<string, unknown>>)
    : [];
  const lines: Array<{
    medicine_id: string;
    qty: number;
    quantity: number;
    name: string;
    medicine_name: string;
    unit_price: number;
    price: number;
    total_price: number;
  }> = [];
  for (const item of items) {
    const medicineId = asTrimmedString(item.medicine_id);
    const qty = Number(item.qty ?? item.quantity ?? 0);
    if (!medicineId || qty <= 0) continue;
    const unitPrice = Number(item.unit_price ?? item.price ?? 0);
    const totalPrice = Number(
      item.total_price ?? (Number.isFinite(unitPrice) ? unitPrice * qty : 0)
    );
    const name = String(item.medicine_name || item.name || "item");
    lines.push({
      medicine_id: medicineId,
      qty,
      quantity: qty,
      name,
      medicine_name: name,
      unit_price: unitPrice,
      price: unitPrice,
      total_price: Number(totalPrice.toFixed(2)),
    });
  }
  return lines;
}

export function returnRowFromPayload(
  payload: Record<string, unknown>,
  hospitalId: string,
  returnNumber: string
): Record<string, unknown> {
  return {
    ...(isUuid(payload.id)
      ? { id: String(payload.id) }
      : isUuid(payload._clientId)
        ? { id: String(payload._clientId) }
        : {}),
    hospital_id: hospitalId,
    return_number: returnNumber,
    original_sale_number: asTrimmedString(payload.original_sale_number),
    original_sale_id: isUuid(payload.original_sale_id)
      ? String(payload.original_sale_id)
      : null,
    patient_name: String(payload.patient_name || "Walk-in Customer").slice(0, 120),
    patient_phone: String(payload.patient_phone || ""),
    return_reason: String(payload.return_reason || "return"),
    return_type:
      payload.return_type === "exchange" || payload.return_type === "credit_note"
        ? payload.return_type
        : "refund",
    subtotal: Number(payload.subtotal || 0),
    refund_amount: Number(payload.refund_amount || payload.subtotal || 0),
    refund_method: payload.refund_method ?? "cash",
    refund_reference: payload.refund_reference ?? null,
    status: String(payload.status || "completed"),
    notes: payload.notes ?? null,
  };
}

export async function applyCloudReturn(
  store: HybridCloudStore,
  payload: Record<string, unknown>,
  hospitalId: string
): Promise<ApplyResult> {
  const returnNumber = clientReturnNumber(payload);
  if (!returnNumber) throw new Error("return_number required");
  const lines = returnLinesFromPayload(payload);
  if (!lines.length) throw new Error("Invalid return payload");
  const returnRow = returnRowFromPayload(payload, hospitalId, returnNumber);
  try {
    const applied = await store.applyReturnReplica({
      hospitalId,
      returnNumber,
      returnRow,
      lines,
    });
    return {
      id: String(applied.row.id),
      duplicate: !applied.created,
      row: { ...applied.row, items: payload.items || [] },
    };
  } catch (err) {
    const message = applyErrorMessage(err);
    if (/duplicate|unique|already exists/i.test(message)) {
      const applied = await store.applyReturnReplica({
        hospitalId,
        returnNumber,
        returnRow,
        lines,
      });
      return {
        id: String(applied.row.id),
        duplicate: true,
        row: { ...applied.row, items: payload.items || [] },
      };
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

export async function applyCloudPurchaseOrder(
  store: HybridCloudStore,
  payload: Record<string, unknown>,
  hospitalId: string
): Promise<ApplyResult> {
  const id = clientEntityId(payload);
  if (id) {
    const existing = await store.findById("purchase_order", id);
    if (existing) return { id: String(existing.id), duplicate: true, row: existing };
  }
  const poNumber =
    asTrimmedString(payload.po_number) ||
    asTrimmedString(payload.reference) ||
    `PO-${Date.now().toString().slice(-8)}`;
  const existing = await store.findPurchaseOrderByNumber(hospitalId, poNumber);
  if (existing) return { id: String(existing.id), duplicate: true, row: existing };
  const inserted = await store.insertRow("purchase_order", {
    ...(id ? { id } : {}),
    hospital_id: hospitalId,
    po_number: poNumber,
    supplier_id: payload.supplier_id ?? null,
    status: asTrimmedString(payload.status) || "draft",
    total_amount: Number(payload.total_amount || 0),
    notes: asTrimmedString(payload.notes) || "",
    line_items: Array.isArray(payload.line_items) ? payload.line_items : payload.items || [],
  });
  return { id: String(inserted.id), duplicate: false, row: inserted };
}

export function generateSaleNumber(): string {
  return `PH-${Date.now().toString().slice(-8)}`;
}

/** In-memory cloud replica used by M7 tests (no Supabase). */
export class MemoryHybridCloudStore implements HybridCloudStore {
  sales: Record<string, unknown>[] = [];
  medicines: Record<string, unknown>[] = [];
  movements: Record<string, unknown>[] = [];
  returns: Record<string, unknown>[] = [];
  customers: Record<string, unknown>[] = [];
  suppliers: Record<string, unknown>[] = [];
  categories: Record<string, unknown>[] = [];
  purchaseOrders: Record<string, unknown>[] = [];
  /** Test hook: throw once from decrement after the sale row exists. */
  failNextDecrement: Error | null = null;
  /** Test hook: throw once from increment after the return row exists. */
  failNextIncrement: Error | null = null;
  /** Test hook: leave a committed sale/return if stock write fails (no rollback). */
  simulateCommittedPartial = false;

  private nextId(prefix: string): string {
    return `${prefix}-${this.sales.length + this.medicines.length + this.customers.length + 1}-${Date.now().toString(36)}`;
  }

  async findSaleByNumber(hospitalId: string, saleNumber: string) {
    return (
      this.sales.find(
        (s) =>
          String(s.sale_number) === saleNumber &&
          String(s.hospital_id || "") === hospitalId
      ) || null
    );
  }

  async insertSale(row: Record<string, unknown>) {
    if (
      this.sales.some(
        (s) =>
          String(s.sale_number) === String(row.sale_number) &&
          String(s.hospital_id) === String(row.hospital_id)
      )
    ) {
      throw new Error("duplicate sale_number");
    }
    const inserted = { ...row, id: row.id || this.nextId("sale") };
    this.sales.push(inserted);
    return inserted;
  }

  async findMedicineById(id: string) {
    return this.medicines.find((m) => String(m.id) === id) || null;
  }

  async findMedicineBySku(hospitalId: string, sku: string) {
    return (
      this.medicines.find(
        (m) => String(m.sku || "") === sku && String(m.hospital_id || "") === hospitalId
      ) || null
    );
  }

  async findMedicineByBarcode(hospitalId: string, barcode: string) {
    return (
      this.medicines.find(
        (m) =>
          String(m.barcode || "") === barcode && String(m.hospital_id || "") === hospitalId
      ) || null
    );
  }

  async insertMedicine(row: Record<string, unknown>) {
    const inserted = { ...row, id: row.id || this.nextId("med") };
    this.medicines.push(inserted);
    return inserted;
  }

  async getMedicineStock(id: string, hospitalId?: string) {
    const m = await this.findMedicineById(id);
    if (!m) return null;
    if (hospitalId && String(m.hospital_id || "") !== hospitalId) return null;
    return Number(m.stock_qty ?? 0);
  }

  async decrementMedicineStock(id: string, qty: number, hospitalId: string) {
    if (this.failNextDecrement) {
      const err = this.failNextDecrement;
      this.failNextDecrement = null;
      throw err;
    }
    const m = this.medicines.find(
      (row) =>
        String(row.id) === id && String(row.hospital_id || "") === hospitalId
    );
    const available = m ? Number(m.stock_qty ?? 0) : 0;
    if (!m || available < qty) {
      throw new Error(`Insufficient stock. Available: ${m ? available : 0}`);
    }
    m.stock_qty = available - qty;
  }

  async insertStockMovement(row: Record<string, unknown>) {
    this.movements.push({ ...row, id: this.nextId("mv") });
  }

  async incrementMedicineStock(id: string, qty: number, hospitalId: string) {
    if (this.failNextIncrement) {
      const err = this.failNextIncrement;
      this.failNextIncrement = null;
      throw err;
    }
    const m = this.medicines.find(
      (row) =>
        String(row.id) === id && String(row.hospital_id || "") === hospitalId
    );
    if (!m) throw new Error("Medicine not found");
    m.stock_qty = Number(m.stock_qty ?? 0) + qty;
  }

  private findReturnByNumber(hospitalId: string, returnNumber: string) {
    return (
      this.returns.find(
        (r) =>
          String(r.return_number) === returnNumber &&
          String(r.hospital_id || "") === hospitalId
      ) || null
    );
  }

  private insertReturn(row: Record<string, unknown>) {
    if (
      this.returns.some(
        (r) =>
          String(r.return_number) === String(row.return_number) &&
          String(r.hospital_id) === String(row.hospital_id)
      )
    ) {
      throw new Error("duplicate return_number");
    }
    const inserted = { ...row, id: row.id || this.nextId("ret") };
    this.returns.push(inserted);
    return inserted;
  }

  async applyReturnReplica(input: {
    hospitalId: string;
    returnNumber: string;
    returnRow: Record<string, unknown>;
    lines: Array<{ medicine_id: string; qty: number; name: string }>;
  }): Promise<{ row: Record<string, unknown>; created: boolean }> {
    const existing = this.findReturnByNumber(input.hospitalId, input.returnNumber);
    const stockSnap = this.medicines.map((m) => ({
      id: m.id,
      stock_qty: m.stock_qty,
    }));
    const moveSnap = this.movements.length;
    let created = false;
    let ret = existing;
    try {
      if (!ret) {
        try {
          ret = this.insertReturn(input.returnRow);
          created = true;
        } catch (err) {
          const message = applyErrorMessage(err);
          if (/duplicate|unique|already exists/i.test(message)) {
            ret = this.findReturnByNumber(input.hospitalId, input.returnNumber);
            if (!ret) throw err;
            created = false;
          } else {
            throw err;
          }
        }
      }
      for (const line of input.lines) {
        const already = this.movements.some(
          (m) =>
            String(m.reference) === input.returnNumber &&
            String(m.medicine_id) === line.medicine_id &&
            String(m.movement_type || "in") === "in"
        );
        if (already) continue;
        await this.incrementMedicineStock(
          line.medicine_id,
          line.qty,
          input.hospitalId
        );
        await this.insertStockMovement({
          hospital_id: input.hospitalId,
          medicine_id: line.medicine_id,
          movement_type: "in",
          quantity: line.qty,
          reference: input.returnNumber,
        });
      }
      return { row: ret, created };
    } catch (err) {
      if (created && !this.simulateCommittedPartial) {
        this.returns = this.returns.filter((r) => r !== ret);
        this.movements = this.movements.slice(0, moveSnap);
        for (const snap of stockSnap) {
          const m = this.medicines.find((row) => row.id === snap.id);
          if (m) m.stock_qty = snap.stock_qty;
        }
      }
      throw err;
    }
  }

  async applySaleReplica(input: {
    hospitalId: string;
    saleNumber: string;
    saleRow: Record<string, unknown>;
    lines: Array<{ medicine_id: string; qty: number; name: string }>;
  }): Promise<{ row: Record<string, unknown>; created: boolean }> {
    const existing = await this.findSaleByNumber(input.hospitalId, input.saleNumber);
    const stockSnap = this.medicines.map((m) => ({
      id: m.id,
      stock_qty: m.stock_qty,
    }));
    const moveSnap = this.movements.length;
    let created = false;
    let sale = existing;
    try {
      if (!sale) {
        try {
          sale = await this.insertSale(input.saleRow);
          created = true;
        } catch (err) {
          const message = applyErrorMessage(err);
          if (/duplicate|unique|already exists/i.test(message)) {
            sale = await this.findSaleByNumber(input.hospitalId, input.saleNumber);
            if (!sale) throw err;
            created = false;
          } else {
            throw err;
          }
        }
      }
      for (const line of input.lines) {
        const already = this.movements.some(
          (m) =>
            String(m.reference) === input.saleNumber &&
            String(m.medicine_id) === line.medicine_id &&
            String(m.movement_type || "out") === "out"
        );
        if (already) continue;
        await this.decrementMedicineStock(
          line.medicine_id,
          line.qty,
          input.hospitalId
        );
        await this.insertStockMovement({
          hospital_id: input.hospitalId,
          medicine_id: line.medicine_id,
          movement_type: "out",
          quantity: line.qty,
          reference: input.saleNumber,
        });
      }
      return { row: sale, created };
    } catch (err) {
      if (created && !this.simulateCommittedPartial) {
        this.sales = this.sales.filter((s) => s !== sale);
        this.movements = this.movements.slice(0, moveSnap);
        for (const snap of stockSnap) {
          const m = this.medicines.find((row) => row.id === snap.id);
          if (m) m.stock_qty = snap.stock_qty;
        }
      }
      throw err;
    }
  }

  private bucket(entity: "customer" | "supplier" | "category" | "purchase_order") {
    if (entity === "customer") return this.customers;
    if (entity === "supplier") return this.suppliers;
    if (entity === "category") return this.categories;
    return this.purchaseOrders;
  }

  async findByName(
    entity: "customer" | "supplier" | "category",
    hospitalId: string,
    name: string
  ) {
    return (
      this.bucket(entity).find(
        (r) =>
          String(r.name || "").toLowerCase() === name.toLowerCase() &&
          String(r.hospital_id || "") === hospitalId
      ) || null
    );
  }

  async findById(
    entity: "customer" | "supplier" | "category" | "purchase_order",
    id: string
  ) {
    return this.bucket(entity).find((r) => String(r.id) === id) || null;
  }

  async insertRow(
    entity: "customer" | "supplier" | "category" | "purchase_order",
    row: Record<string, unknown>
  ) {
    const inserted = { ...row, id: row.id || this.nextId(entity) };
    this.bucket(entity).push(inserted);
    return inserted;
  }

  async findPurchaseOrderByNumber(hospitalId: string, poNumber: string) {
    return (
      this.purchaseOrders.find(
        (r) =>
          String(r.po_number) === poNumber && String(r.hospital_id || "") === hospitalId
      ) || null
    );
  }
}
