/**
 * Pharmacy POS — offline-first settlement logic (pure, testable).
 *
 * Everything the POS needs to complete a bill without a network:
 *  - payload building for the offline queue (posSaleSchema-compatible)
 *  - multi-tender settlement (split / mixed / partial / credit / insurance)
 *  - receipt data construction for immediate printing
 *  - outstanding balances, held bills and settlement reports
 *
 * No I/O. The UI wires these to the offline store + print engine.
 */

import type { CartTotals, CartLine } from "./cart";
import { roundMoney } from "./tax";
import type {
  PaymentTender,
  SettlementResult,
} from "./payments";
import { settle } from "./payments";
import type {
  PharmacyBranch,
  PharmacyHeldBill,
  PharmacySettings,
  ReceiptData,
  SaleForReceipt,
} from "./types";
import type { PosSaleInput, PosSaleLineItem } from "./service";

export const POS_PAYMENT_METHODS = [
  "cash",
  "upi",
  "gpay",
  "phonepe",
  "paytm",
  "credit_card",
  "debit_card",
  "insurance",
  "wallet",
  "credit",
  "other",
] as const;

export type PosPaymentLine = {
  methodId: string;
  amount: number;
  reference?: string;
};

export type PosCustomer = {
  patientName: string;
  patientPhone?: string;
  patientAge?: number | null;
  patientId?: string | null;
  saleType: "walk_in" | "prescription";
  doctorName?: string | null;
  doctorRegNo?: string | null;
  prescriptionNumber?: string | null;
};

export type PosPayloadOptions = {
  customer: PosCustomer;
  cashierName?: string;
  items: PosSaleLineItem[];
  cartLines: CartLine[];
  totals: CartTotals;
  tenders: PosPaymentLine[];
  notes?: string;
  saleNumber: string;
  branchId?: string | null;
  shiftId?: string | null;
};

export type PosPayloadResult = {
  payload: PosSaleInput;
  settlement: SettlementResult[];
  totalCollected: number;
  balanceDue: number;
  changeDue: number;
  primaryMethod: string;
};

/** Local sale number — distinct prefix so offline bills are identifiable. */
export function localSaleNumber(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(
    d.getMinutes()
  ).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  return `LOC-${stamp}-${Math.floor(Math.random() * 90 + 10)}`;
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  gpay: "Google Pay",
  phonepe: "PhonePe",
  paytm: "Paytm",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
  insurance: "Insurance",
  wallet: "Wallet",
  credit: "Credit",
  other: "Other",
};

export function methodLabel(id: string): string {
  return METHOD_LABEL[id] || id;
}

function validTenders(tenders: PosPaymentLine[]): PaymentTender[] {
  return tenders
    .filter((t) => Number(t.amount) > 0 && POS_PAYMENT_METHODS.includes(t.methodId as never))
    .map((t) => ({ methodId: t.methodId, amount: Number(t.amount) || 0, reference: t.reference }));
}

/**
 * Build the sale payload for a settle action. Applies multi-tender settlement,
 * records per-method breakdown in notes, and marks partial/credit/insurance
 * bills as pending so outstanding balances stay tracked.
 */
export function buildPosPayload(opts: PosPayloadOptions): PosPayloadResult {
  const tenders = validTenders(opts.tenders);
  const settlement = settle(opts.totals.grand_total, tenders);
  const applied = settlement.reduce((s, r) => s + r.amount, 0);
  const totalCollected = roundMoney(Math.min(applied, opts.totals.grand_total));
  const changeDue = roundMoney(settlement.reduce((s, r) => s + r.changeDue, 0));
  const balanceDue = roundMoney(Math.max(0, opts.totals.grand_total - totalCollected));
  const deferred = settlement.some(
    (r) => r.methodId === "credit" || r.methodId === "insurance"
  );
  const primaryMethod =
    settlement.find((r) => r.amount > 0)?.methodId ||
    (POS_PAYMENT_METHODS.includes(opts.tenders[0]?.methodId as never)
      ? opts.tenders[0].methodId
      : "cash");

  const paymentLines = settlement
    .filter((r) => r.amount > 0)
    .map((r) => ({
      method: r.methodId,
      amount: r.amount,
      reference: opts.tenders.find((t) => t.methodId === r.methodId)?.reference || null,
    }));

  const notes = [
    opts.notes ? opts.notes : "",
    `sale_number:${opts.saleNumber}`,
    `balance_due:${balanceDue.toFixed(2)}`,
    `payment_lines:${JSON.stringify(paymentLines)}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);

  const payload: PosSaleInput = {
    patient_name: opts.customer.patientName || "Walk-in Customer",
    patient_phone: opts.customer.patientPhone || undefined,
    patient_age: opts.customer.patientAge ?? null,
    sale_type: opts.customer.saleType,
    branch_id: opts.branchId ?? null,
    shift_id: opts.shiftId ?? null,
    cashier_name: opts.cashierName || undefined,
    doctor_name: opts.customer.doctorName ?? null,
    doctor_reg_no: opts.customer.doctorRegNo ?? null,
    prescription_number: opts.customer.prescriptionNumber ?? null,
    items: opts.items,
    subtotal: opts.totals.subtotal,
    discount: opts.totals.discount,
    tax: opts.totals.tax,
    cgst: opts.totals.summary.cgst,
    sgst: opts.totals.summary.sgst,
    igst: opts.totals.summary.igst,
    tax_type: "intra",
    grand_total: opts.totals.grand_total,
    payment_method: primaryMethod,
    payment_status: balanceDue > 0 || deferred ? "pending" : "paid",
    amount_paid: deferred ? opts.totals.grand_total : totalCollected,
    amount_returned: deferred ? 0 : changeDue,
    payment_reference:
      paymentLines
        .map((p) => (p.reference ? `${p.method}:${p.reference}` : ""))
        .filter(Boolean)
        .join(", ") || null,
    notes,
  };

  return {
    payload,
    settlement,
    totalCollected,
    balanceDue,
    changeDue,
    primaryMethod,
  };
}

/** CartLine[] → PosSaleLineItem[] (schema shape) for the queue payload. */
export function toPosLineItems(cart: CartLine[]): PosSaleLineItem[] {
  return cart.map((c) => ({
    medicine_id: c.medicine_id,
    name: c.name,
    qty: c.quantity,
    price: c.selling_price,
    gst_percent: c.gst_percent,
    batch_number: c.batch_number ?? null,
    expiry_date: c.expiry_date ?? null,
    discount: c.discount_amount ?? 0,
  }));
}

export type ReceiptBuildOptions = {
  sale: SaleForReceipt;
  hospital: ReceiptData["hospital"];
  branch?: PharmacyBranch | null;
  settings: PharmacySettings;
  cartLines: CartLine[];
  totals: CartTotals;
  amountPaid: number;
  amountReturned: number;
  paymentMethod: string;
  paymentReference?: string;
  cashierName: string;
  pharmacistName?: string;
  customer: PosCustomer;
  printedBy?: string;
  transactionId?: string;
  taxType?: "intra" | "inter";
};

/** Build a full ReceiptData for immediate printing from a (local) sale. */
export function buildReceiptData(opts: ReceiptBuildOptions): ReceiptData {
  const { totals, cartLines } = opts;
  return {
    sale: opts.sale,
    hospital: opts.hospital,
    branch: opts.branch || null,
    cashier_name: opts.cashierName,
    pharmacist_name: opts.pharmacistName || "",
    settings: opts.settings,
    items: cartLines.map((c) => ({
      medicine_id: c.medicine_id || "",
      name: c.name,
      batch_number: c.batch_number ?? undefined,
      expiry_date: c.expiry_date ?? null,
      mrp: c.mrp ?? c.selling_price,
      selling_price: c.selling_price,
      quantity: c.quantity,
      discount_percent: c.discount_percent ?? 0,
      gst_percent: c.gst_percent ?? 0,
    })),
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    grand_total: totals.grand_total,
    amount_paid: opts.amountPaid,
    amount_returned: opts.amountReturned,
    payment_method: opts.paymentMethod,
    payment_reference: opts.paymentReference,
    customer_name: opts.customer.patientName || "Walk-in Customer",
    customer_phone: opts.customer.patientPhone || undefined,
    doctor_name: opts.customer.doctorName || undefined,
    prescription_number: opts.customer.prescriptionNumber || undefined,
    cgst: totals.summary.cgst,
    sgst: totals.summary.sgst,
    igst: totals.summary.igst,
    tax_type: opts.taxType ?? "intra",
    patient_id: opts.customer.patientId || null,
    patient_age: opts.customer.patientAge ?? null,
    transaction_id: opts.transactionId,
    printed_by: opts.printedBy,
  };
}

/** Rebuild a minimal ReceiptData from a cached sale row (reprint). */
export function receiptDataFromSale(
  row: Record<string, unknown>,
  opts: {
    hospital: ReceiptData["hospital"];
    settings: PharmacySettings;
    cashierName: string;
    pharmacistName?: string;
  }
): ReceiptData | null {
  const itemsRaw = Array.isArray(row.line_items)
    ? (row.line_items as Array<Record<string, unknown>>)
    : [];
  const items: CartLine[] = itemsRaw.map((i) => ({
    medicine_id: (i.medicine_id as string) || undefined,
    name: String(i.name || ""),
    batch_number: (i.batch_number as string) || undefined,
    expiry_date: (i.expiry_date as string) || null,
    mrp: Number(i.mrp ?? i.price ?? i.selling_price ?? 0),
    selling_price: Number(i.price ?? i.selling_price ?? 0),
    quantity: Number(i.qty ?? i.quantity ?? 1),
    gst_percent: Number(i.gst_percent ?? 0),
  }));
  if (!items.length) return null;

  const totals: CartTotals = {
    gross: Number(row.subtotal ?? 0),
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    taxable: Number(row.subtotal ?? 0) - Number(row.discount ?? 0),
    slabs: [],
    summary: {
      cgst: Number(row.cgst ?? 0),
      sgst: Number(row.sgst ?? 0),
      igst: Number(row.igst ?? 0),
      total: Number(row.tax ?? 0),
      taxable: Number(row.subtotal ?? 0) - Number(row.discount ?? 0),
      effectiveRate: Number(row.grand_total ?? 0) > 0 ? (Number(row.tax ?? 0) / (Number(row.grand_total ?? 0) - Number(row.tax ?? 0))) * 100 : 0,
    },
    tax: Number(row.tax ?? 0),
    grand_total: Number(row.grand_total ?? 0),
  };

  return buildReceiptData({
    sale: { id: (row.id as string) || undefined, sale_number: (row.sale_number as string) || undefined, created_at: (row.created_at as string) || undefined },
    hospital: opts.hospital,
    settings: opts.settings,
    cartLines: items,
    totals,
    amountPaid: Number(row.amount_paid ?? row.grand_total ?? 0),
    amountReturned: Number(row.amount_returned ?? 0),
    paymentMethod: String(row.payment_method ?? "cash"),
    paymentReference: (row.payment_reference as string) || undefined,
    cashierName: opts.cashierName,
    pharmacistName: opts.pharmacistName,
    customer: {
      patientName: String(row.patient_name ?? "Walk-in Customer"),
      patientPhone: (row.patient_phone as string) || undefined,
      patientAge: row.patient_age != null ? Number(row.patient_age) : null,
      saleType: row.sale_type === "prescription" ? "prescription" : "walk_in",
      doctorName: (row.doctor_name as string) || null,
      prescriptionNumber: (row.prescription_number as string) || null,
    },
    printedBy: opts.cashierName,
    transactionId: (row.id as string) || undefined,
    taxType: row.tax_type === "inter" ? "inter" : "intra",
  });
}

// ----------------------------------------------------------------------------
// Outstanding balances & settlement reports
// ----------------------------------------------------------------------------

export type OutstandingRow = {
  saleNumber: string;
  patientName: string;
  grandTotal: number;
  amountPaid: number;
  balance: number;
  paymentMethod: string;
  createdAt: string;
};

/** Extract outstanding (partial / credit / insurance) balances from sale rows. */
export function outstandingBalances(
  sales: Array<Record<string, unknown>>
): OutstandingRow[] {
  const rows: OutstandingRow[] = [];
  for (const s of sales) {
    const grandTotal = Number(s.grand_total ?? 0);
    const amountPaid = Number(s.amount_paid ?? 0);
    const balance = Math.max(0, grandTotal - amountPaid);
    if (balance > 0.005) {
      rows.push({
        saleNumber: String(s.sale_number ?? ""),
        patientName: String(s.patient_name ?? "Walk-in Customer"),
        grandTotal,
        amountPaid,
        balance,
        paymentMethod: String(s.payment_method ?? "cash"),
        createdAt: String(s.created_at ?? ""),
      });
    }
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type SettlementReport = {
  rangeStart: string;
  rangeEnd: string;
  totalSales: number;
  transactionCount: number;
  byMethod: Array<{ method: string; amount: number; count: number }>;
  refunds: number;
  returnCount: number;
  outstandingTotal: number;
  outstandingCount: number;
  cashDrawer: number;
};

/**
 * Settlement report from cached sales + returns. Aggregates payments per
 * method (incl. split payments recorded in notes) and cash drawer estimate.
 */
export function settlementReport(
  sales: Array<Record<string, unknown>>,
  returns: Array<Record<string, unknown>>,
  opts?: { since?: string; until?: string }
): SettlementReport {
  const since = opts?.since ? new Date(opts.since).getTime() : -Infinity;
  const until = opts?.until ? new Date(opts.until).getTime() : Infinity;

  const inRange = (iso?: string) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= since && t <= until;
  };

  const byMethod = new Map<string, { amount: number; count: number }>();
  const note = (s: Record<string, unknown>) => String(s.notes ?? "");

  const collect = (method: string, amount: number) => {
    const cur = byMethod.get(method) || { amount: 0, count: 0 };
    cur.amount += amount;
    cur.count += 1;
    byMethod.set(method, cur);
  };

  let totalSales = 0;
  let transactionCount = 0;
  for (const s of sales) {
    if (!inRange(String(s.created_at ?? ""))) continue;
    totalSales += Number(s.grand_total ?? 0);
    transactionCount += 1;
    const paymentLines = extractPaymentLines(note(s));
    if (paymentLines.length) {
      for (const line of paymentLines) collect(line.method, line.amount);
    } else {
      collect(String(s.payment_method ?? "cash"), Number(s.grand_total ?? 0));
    }
  }

  let refunds = 0;
  let returnCount = 0;
  for (const r of returns) {
    if (!inRange(String(r.created_at ?? ""))) continue;
    refunds += Number(r.refund_amount ?? 0);
    returnCount += 1;
  }

  const outstanding = outstandingBalances(
    sales.filter((s) => inRange(String(s.created_at ?? "")))
  );

  const cashDrawer =
    (byMethod.get("cash")?.amount || 0) - refunds;

  return {
    rangeStart: opts?.since || "",
    rangeEnd: opts?.until || "",
    totalSales,
    transactionCount,
    byMethod: [...byMethod.entries()]
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.amount - a.amount),
    refunds,
    returnCount,
    outstandingTotal: outstanding.reduce((s, o) => s + o.balance, 0),
    outstandingCount: outstanding.length,
    cashDrawer,
  };
}

function extractPaymentLines(notes: string): Array<{ method: string; amount: number }> {
  const m = notes.match(/payment_lines:(.*)/);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[1]) as Array<{ method: string; amount: number }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------------------
// Held bills (offline)
// ----------------------------------------------------------------------------

export type HeldBillDraft = {
  reference: string;
  customerName?: string;
  customerPhone?: string;
  items: CartLine[];
  discount: number;
  notes?: string;
  heldByName?: string;
};

/** Build the payload for the offline held-bill queue entry. */
export function heldBillPayload(
  draft: HeldBillDraft,
  hospitalId: string
): Omit<PharmacyHeldBill, "id" | "created_at" | "hospital_id"> & { hospital_id: string } {
  return {
    hospital_id: hospitalId,
    reference: draft.reference,
    customer_name: draft.customerName || null,
    customer_phone: draft.customerPhone || null,
    items: draft.items.map((c) => ({
      medicine_id: c.medicine_id || "",
      name: c.name,
      generic_name: c.generic_name,
      manufacturer: c.manufacturer,
      batch_number: c.batch_number || undefined,
      expiry_date: c.expiry_date ?? null,
      mrp: c.mrp ?? c.selling_price,
      selling_price: c.selling_price,
      quantity: c.quantity,
      discount_percent: c.discount_percent,
      discount_amount: c.discount_amount,
      gst_percent: c.gst_percent ?? 0,
    })),
    discount: draft.discount,
    notes: draft.notes || null,
    held_by_name: draft.heldByName || null,
  };
}

/** Held-bill row (cached entity) → CartLine[] for resuming a bill. */
export function heldItemsToCart(
  held: Record<string, unknown>
): CartLine[] {
  const items = Array.isArray(held.items)
    ? (held.items as Array<Record<string, unknown>>)
    : [];
  return items.map((i) => ({
    medicine_id: (i.medicine_id as string) || undefined,
    name: String(i.name || ""),
    generic_name: (i.generic_name as string) || undefined,
    manufacturer: (i.manufacturer as string) || undefined,
    batch_number: (i.batch_number as string) || undefined,
    expiry_date: (i.expiry_date as string) || null,
    mrp: Number(i.mrp ?? i.selling_price ?? 0),
    selling_price: Number(i.selling_price ?? 0),
    quantity: Number(i.quantity ?? 1),
    discount_percent: Number(i.discount_percent ?? 0) || undefined,
    discount_amount: Number(i.discount_amount ?? 0) || undefined,
    gst_percent: Number(i.gst_percent ?? 0) || undefined,
  }));
}
