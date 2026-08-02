/**
 * Pharmacy POS cart math — pure, testable line-item + totals computation.
 *
 * Builds on tax.ts (GST split, inclusive/exclusive, currency) and payments.ts
 * (enabled method resolution). No I/O; safe to unit-test in isolation.
 */

import type { PharmacySettings } from "./types";
import {
  type Currency,
  INR,
  getCurrency,
  roundMoney,
  netUnitPrice,
  buildTaxSlabs,
  summarizeSlabs,
  type TaxSlab,
  type TaxSummary,
  type TaxType,
} from "./tax";
import { buildPaymentMethods, type EnabledPaymentMethod } from "./payments";

/** A single POS cart line (mirrors the persisted sale line item shape). */
export type CartLine = {
  medicine_id?: string;
  name: string;
  generic_name?: string;
  manufacturer?: string;
  batch_number?: string | null;
  expiry_date?: string | null;
  /** Shelf MRP (display only — not used in totals math) */
  mrp?: number;
  /** Unit selling price (may include tax when inclusive) */
  selling_price: number;
  quantity: number;
  discount_percent?: number;
  /** Absolute line discount override (takes precedence over discount_percent) */
  discount_amount?: number;
  gst_percent?: number;
  taxType?: TaxType;
  schedule?: string;
};

export type CartTotals = {
  /** Sum of gross line amounts before any discount */
  gross: number;
  /** Alias of gross — pre-discount line total */
  subtotal: number;
  /** Total discount across lines (percent + absolute) */
  discount: number;
  /** Amount subject to tax after discount */
  taxable: number;
  /** Per-slab GST for receipt breakdown */
  slabs: TaxSlab[];
  summary: TaxSummary;
  /** Total GST (CGST+SGST+IGST) */
  tax: number;
  /** Final payable */
  grand_total: number;
};

/**
 * Compute totals for a set of cart lines.
 *
 * @param opts.discount     Extra global discount amount applied on top of line discounts
 * @param opts.inclusiveTax When true, selling_price includes GST (MRP-style)
 * @param opts.taxType      Default regime when a line does not specify one
 * @param opts.currency     Currency for rounding/formatting
 */
export function computeTotals(
  lines: CartLine[],
  opts?: {
    discount?: number;
    inclusiveTax?: boolean;
    taxType?: TaxType;
    currency?: Currency | string;
  }
): CartTotals {
  const currency =
    typeof opts?.currency === "string"
      ? getCurrency(opts.currency)
      : opts?.currency || INR;
  const inclusive = Boolean(opts?.inclusiveTax);
  const defaultTaxType: TaxType = opts?.taxType || "intra";
  const globalDiscount = roundMoney(Number(opts?.discount) || 0, currency);

  let gross = 0;
  let discount = 0;

  const netAmounts: { amount: number; gstPercent?: number; taxType?: TaxType }[] = [];

  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const lineGross = roundMoney(Number(line.selling_price) * qty, currency);
    const rate = Number(line.gst_percent) || 0;
    const taxType = line.taxType || defaultTaxType;

    // Resolve the taxable base per unit (strip included tax if inclusive).
    const baseUnit = netUnitPrice(line.selling_price, rate, inclusive, currency);
    const baseAmount = roundMoney(baseUnit * qty, currency);

    // Discount: absolute override wins, else percent of the taxable base.
    let lineDiscount = 0;
    if (typeof line.discount_amount === "number" && line.discount_amount !== 0) {
      lineDiscount = Math.min(
        roundMoney(Number(line.discount_amount) || 0, currency),
        baseAmount
      );
    } else if (typeof line.discount_percent === "number" && line.discount_percent > 0) {
      lineDiscount = roundMoney(
        baseAmount * (Number(line.discount_percent) / 100),
        currency
      );
    }

    const net = roundMoney(baseAmount - lineDiscount, currency);
    gross = roundMoney(gross + lineGross, currency);
    discount = roundMoney(discount + lineDiscount, currency);

    netAmounts.push({ amount: net, gstPercent: rate, taxType });
  }

  // Apply global discount proportionally across lines so per-slab tax bases
  // stay consistent with the final taxable total.
  const preTaxable = roundMoney(
    netAmounts.reduce((s, n) => s + n.amount, 0),
    currency
  );
  const appliedGlobal = Math.min(globalDiscount, preTaxable);
  discount = roundMoney(discount + appliedGlobal, currency);

  let taxable = roundMoney(preTaxable - appliedGlobal, currency);
  const ratio = preTaxable > 0 ? taxable / preTaxable : 0;
  const adjusted = netAmounts.map((n) => ({
    amount: roundMoney(n.amount * ratio, currency),
    gstPercent: n.gstPercent,
    taxType: n.taxType,
  }));
  taxable = roundMoney(
    adjusted.reduce((s, n) => s + n.amount, 0),
    currency
  );

  const slabs = buildTaxSlabs(adjusted, currency);

  const summary = summarizeSlabs(slabs, currency);
  const tax = summary.total;
  const grand_total = roundMoney(taxable + tax, currency);

  return {
    gross,
    subtotal: gross,
    discount,
    taxable,
    slabs,
    summary,
    tax,
    grand_total,
  };
}

/** Convenience: resolve the enabled payment methods for the POS. */
export function enabledPaymentMethods(
  settings: PharmacySettings | null | undefined,
  overrides?: Record<string, boolean>
): EnabledPaymentMethod[] {
  return buildPaymentMethods(settings, overrides);
}
