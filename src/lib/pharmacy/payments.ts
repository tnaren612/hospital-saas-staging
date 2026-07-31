/**
 * Pharmacy Payment catalog & settlement engine
 *
 * Future-proof payment layer. Every payment method the administrator can enable
 * is declared here. Insurance billing, credit sales, loyalty, and the refund
 * workflow are expressed as interfaces + placeholders so they can be enabled in
 * later increments without touching POS/UI call sites.
 */

import type { PharmacySettings } from "./types";

export type PaymentCategory =
  | "cash"
  | "upi"
  | "card"
  | "insurance"
  | "credit"
  | "wallet"
  | "other";

/** A payment method configurable by administrators (enable/disable in Settings). */
export type PaymentMethodConfig = {
  id: string;
  name: string;
  category: PaymentCategory;
  /** UI hint / icon key (lucide name or brand alias). */
  icon?: string;
  /** Default enabled when a new hospital has no explicit config. */
  defaultEnabled: boolean;
};

/** The full catalog of supported methods. Add new methods here. */
export const PAYMENT_METHOD_CATALOG: PaymentMethodConfig[] = [
  { id: "cash", name: "Cash", category: "cash", defaultEnabled: true },
  { id: "upi", name: "UPI", category: "upi", defaultEnabled: true, icon: "qrcode" },
  { id: "gpay", name: "Google Pay", category: "upi", defaultEnabled: true, icon: "smartphone" },
  { id: "phonepe", name: "PhonePe", category: "upi", defaultEnabled: true, icon: "smartphone" },
  { id: "paytm", name: "Paytm", category: "upi", defaultEnabled: true, icon: "smartphone" },
  { id: "credit_card", name: "Credit Card", category: "card", defaultEnabled: true, icon: "credit-card" },
  { id: "debit_card", name: "Debit Card", category: "card", defaultEnabled: true, icon: "credit-card" },
  { id: "insurance", name: "Insurance", category: "insurance", defaultEnabled: true, icon: "shield" },
  { id: "wallet", name: "Wallet", category: "wallet", defaultEnabled: false, icon: "wallet" },
  { id: "credit", name: "Credit", category: "credit", defaultEnabled: false, icon: "book-open" },
  { id: "other", name: "Other", category: "other", defaultEnabled: true, icon: "ellipsis" },
];

/**
 * Map a PharmacySettings boolean flag to a method id.
 * This is the single mapping point between the persisted settings schema and
 * the catalog — extend here when adding methods/columns.
 */
export function settingsFlagForMethod(id: string): keyof PharmacySettings | null {
  const map: Record<string, keyof PharmacySettings> = {
    cash: "enable_cash",
    upi: "enable_upi",
    gpay: "enable_upi",
    phonepe: "enable_upi",
    paytm: "enable_upi",
    credit_card: "enable_card",
    debit_card: "enable_card",
    insurance: "enable_insurance",
    credit: "enable_credit",
    wallet: "enable_wallet",
  };
  return map[id] ?? null;
}

/** A catalog method plus its resolved enabled state for the current hospital. */
export type EnabledPaymentMethod = PaymentMethodConfig & { enabled: boolean };

/**
 * Resolve the methods enabled for a hospital.
 * A method is enabled only when its category flag is on (credit sales also gated
 * by allow_credit_sales). Defaults fall back to the catalog default so a fresh
 * hospital always has a sane set without a migration.
 */
export function buildPaymentMethods(
  settings: PharmacySettings | null | undefined,
  overrides?: Record<string, boolean>
): EnabledPaymentMethod[] {
  const s = settings || null;
  return PAYMENT_METHOD_CATALOG.map((m) => {
    const flag = settingsFlagForMethod(m.id);
    const raw = flag
      ? (s as Record<string, unknown> | null)?.[flag]
      : undefined;
    // Preserve "unset" so the catalog default applies when no flag is present.
    const fromSettings = typeof raw === "boolean" ? raw : undefined;
    let enabled = fromSettings ?? m.defaultEnabled;
    if (m.id === "credit" && s && !s.allow_credit_sales) enabled = false;
    if (overrides && typeof overrides[m.id] === "boolean") enabled = overrides[m.id];
    return { ...m, enabled };
  });
}

// ----------------------------------------------------------------------------
// Mixed / partial / credit settlement
// ----------------------------------------------------------------------------

export type PaymentTender = {
  methodId: string;
  amount: number;
  /** Optional transaction reference (UPI txn id, card last4, etc.) */
  reference?: string;
};

export type SettlementResult = {
  methodId: string;
  amount: number;
  /** Amount still owed (credit / partial). Zero when fully settled. */
  balanceDue: number;
  /** Change to return to customer (cash overpayment). */
  changeDue: number;
};

/**
 * Settle a sale across one or more tenders (mixed / partial / credit).
 * @param total     Grand total to collect
 * @param tenders   One or more payment tenders (sum may be less, equal, or more)
 */
export function settle(total: number, tenders: PaymentTender[]): SettlementResult[] {
  let remaining = Math.max(0, Number(total) || 0);
  const results: SettlementResult[] = [];
  const primary =
    tenders[0]?.methodId && buildPaymentMethods(null).some((m) => m.id === tenders[0]!.methodId)
      ? tenders[0].methodId
      : "cash";
  let usedPrimary = false;

  for (const t of tenders) {
    if (remaining <= 0 && !t.amount) {
      results.push({ methodId: t.methodId, amount: 0, balanceDue: 0, changeDue: 0 });
      continue;
    }
    const isFirstPrimary = t.methodId === primary && !usedPrimary;
    let applied = Math.min(Number(t.amount) || 0, remaining);
    let changeDue = 0;
    if (isFirstPrimary && Number(t.amount) > remaining) {
      changeDue = Number(t.amount) - remaining;
      applied = remaining;
    }
    usedPrimary = usedPrimary || t.methodId === primary;
    remaining = Math.max(0, remaining - applied);
    results.push({
      methodId: t.methodId,
      amount: applied,
      balanceDue: remaining,
      changeDue,
    });
  }

  if (results.length === 0) {
    results.push({ methodId: primary, amount: 0, balanceDue: total, changeDue: 0 });
  }
  return results;
}

// ----------------------------------------------------------------------------
// Future feature interfaces (placeholders) — enable in later increments.
// ----------------------------------------------------------------------------

/** Insurance billing workflow. Implement to support insurer claims from POS. */
export interface InsuranceBillingService {
  readonly id: string;
  readonly available: boolean;
  /** Validate a patient's coverage against a provider for a medicine sale. */
  validateCoverage(patient: unknown, medicineIds: string[]): Promise<{ approved: boolean; reason?: string }>;
}

export const insuranceBillingService: InsuranceBillingService = {
  id: "insurance-billing",
  available: false,
  async validateCoverage() {
    return { approved: false, reason: "Insurance billing not enabled yet." };
  },
};

/** Credit account settlement. Implement to track ledger credit balances. */
export interface CreditService {
  readonly id: string;
  readonly available: boolean;
  createLedgerEntry(patientId: string, amount: number, reference: string): Promise<void>;
}

export const creditService: CreditService = {
  id: "credit",
  available: false,
  async createLedgerEntry() {
    /* no-op placeholder */
  },
};

/** Refund workflow. Implement to drive pharmacy_returns approvals end-to-end. */
export interface RefundWorkflow {
  readonly id: string;
  readonly available: boolean;
  submitReturn(saleId: string, reason: string, items: unknown[]): Promise<{ ok: boolean; returnId?: string }>;
}

export const refundWorkflow: RefundWorkflow = {
  id: "refund-workflow",
  available: false,
  async submitReturn() {
    return { ok: false };
  },
};

/** Loyalty program. Implement to award/redeem points at checkout. */
export interface LoyaltyService {
  readonly id: string;
  readonly available: boolean;
  pointsFor(amount: number): number;
  redeem(patientId: string, points: number): Promise<number>;
}

export const loyaltyService: LoyaltyService = {
  id: "loyalty",
  available: false,
  pointsFor() {
    return 0;
  },
  async redeem() {
    return 0;
  },
};
