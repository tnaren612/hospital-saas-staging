/**
 * Pharmacy Tax & Currency engine
 *
 * Enterprise-grade, future-proof tax computation with support for:
 *   - GST split into CGST / SGST / IGST (intra-state vs inter-state)
 *   - Inclusive vs exclusive tax (MRP-inclusive pricing)
 *   - Configurable rates per line item
 *   - Multi-currency ready (INR default; extend SUPPORTED_CURRENCIES to add more)
 *
 * Pure functions only — unit-testable without Supabase or React.
 */

/** Tax regime: intra-state (CGST + SGST) or inter-state (IGST). */
export type TaxType = "intra" | "inter";

export type Currency = {
  code: string;
  symbol: string;
  locale: string;
  /** Decimal places to display */
  digits: number;
  /** Rounding precision for money math */
  round: number;
};

export const INR: Currency = {
  code: "INR",
  symbol: "₹",
  locale: "en-IN",
  digits: 2,
  round: 2,
};

/**
 * Multi-currency registry. Add new currencies here — no call-site changes needed.
 * Each entry keeps existing receipts working because formatting is centralized.
 */
export const SUPPORTED_CURRENCIES: Record<string, Currency> = {
  INR,
  USD: { code: "USD", symbol: "$", locale: "en-US", digits: 2, round: 2 },
  EUR: { code: "EUR", symbol: "€", locale: "de-DE", digits: 2, round: 2 },
  GBP: { code: "GBP", symbol: "£", locale: "en-GB", digits: 2, round: 2 },
  AED: { code: "AED", symbol: "AED ", locale: "en-AE", digits: 2, round: 2 },
};

export function getCurrency(code?: string | null): Currency {
  if (code && SUPPORTED_CURRENCIES[code]) return SUPPORTED_CURRENCIES[code];
  return INR;
}

/** Round money to currency precision (avoid float drift). */
export function roundMoney(value: number, currency: Currency = INR): number {
  const factor = 10 ** currency.round;
  return Math.round((Number(value) || 0) * factor) / factor;
}

/**
 * Format a money value with the currency symbol and locale.
 * @param amount   The raw number to format
 * @param currency Currency to render in (default INR)
 * @param opts.symbol        Set false to hide the symbol (numeric only)
 * @param opts.showFraction  Force decimal digits; defaults to currency.digits
 */
export function formatMoney(
  amount: number,
  currency: Currency = INR,
  opts?: { symbol?: boolean; showFraction?: boolean }
): string {
  const symbol = opts?.symbol === false ? "" : currency.symbol;
  const value = roundMoney(amount, currency);
  const digits = opts?.showFraction ?? true ? currency.digits : 0;
  const formatted = value.toLocaleString(currency.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${symbol}${formatted}`;
}

/**
 * GST breakdown for a single taxable slab.
 * Intra-state: tax split equally into CGST + SGST.
 * Inter-state: full tax as IGST.
 */
export type GstBreakdown = {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export function computeGstBreakdown(
  taxable: number,
  ratePercent: number,
  taxType: TaxType = "intra",
  currency: Currency = INR
): GstBreakdown {
  const rate = Number(ratePercent) || 0;
  const total = roundMoney((Number(taxable) || 0) * (rate / 100), currency);
  if (taxType === "inter") {
    return { cgst: 0, sgst: 0, igst: total, total };
  }
  // Intra-state — split evenly, absorb the odd paisa into CGST.
  const half = roundMoney(total / 2, currency);
  return { cgst: half, sgst: total - half, igst: 0, total };
}

/** Aggregate GST breakdown across multiple slabs. */
export type TaxSummary = GstBreakdown & {
  /** Taxable base across all lines */
  taxable: number;
  /** Effective blended rate */
  effectiveRate: number;
};

export function sumTaxBreakdown(
  breakdowns: GstBreakdown[],
  currency: Currency = INR
): TaxSummary {
  const agg = breakdowns.reduce(
    (acc, b) => ({
      cgst: roundMoney(acc.cgst + b.cgst, currency),
      sgst: roundMoney(acc.sgst + b.sgst, currency),
      igst: roundMoney(acc.igst + b.igst, currency),
      total: roundMoney(acc.total + b.total, currency),
    }),
    { cgst: 0, sgst: 0, igst: 0, total: 0 }
  );
  return { ...agg, taxable: 0, effectiveRate: 0 };
}

/**
 * Resolve the effective unit price for a line given inclusive/exclusive tax.
 *
 * @param unitPrice   Shelf price entered by the user (may include tax)
 * @param ratePercent GST rate for this line
 * @param inclusive   When true, unitPrice already includes GST (MRP-style)
 * @returns the price net of tax (the taxable base per unit)
 */
export function netUnitPrice(
  unitPrice: number,
  ratePercent: number,
  inclusive: boolean,
  currency: Currency = INR
): number {
  if (!inclusive) return roundMoney(Number(unitPrice) || 0, currency);
  const rate = Number(ratePercent) || 0;
  const gross = Number(unitPrice) || 0;
  return roundMoney(gross / (1 + rate / 100), currency);
}

/**
 * One taxable slab (a group of lines sharing the same GST rate + regime).
 * Used by the receipt to render a CGST/SGST/IGST breakdown table.
 */
export type TaxSlab = {
  ratePercent: number;
  taxType: TaxType;
  taxable: number;
  gst: GstBreakdown;
};

/** Compute tax slabs from per-line details. Returns zero when nothing taxable. */
export function buildTaxSlabs(
  lines: { amount: number; gstPercent?: number; taxType?: TaxType }[],
  currency: Currency = INR
): TaxSlab[] {
  const map = new Map<string, TaxSlab>();
  for (const line of lines) {
    const rate = Number(line.gstPercent) || 0;
    const type = line.taxType || "intra";
    const key = `${rate}:${type}`;
    let slab = map.get(key);
    if (!slab) {
      slab = {
        ratePercent: rate,
        taxType: type,
        taxable: 0,
        gst: computeGstBreakdown(0, rate, type, currency),
      };
      map.set(key, slab);
    }
    slab.taxable = roundMoney(slab.taxable + (Number(line.amount) || 0), currency);
  }
  const slabs = Array.from(map.values());
  for (const slab of slabs) {
    slab.gst = computeGstBreakdown(slab.taxable, slab.ratePercent, slab.taxType, currency);
  }
  return slabs;
}

export function summarizeSlabs(
  slabs: TaxSlab[],
  currency: Currency = INR
): TaxSummary {
  const breakdown = sumTaxBreakdown(
    slabs.map((s) => s.gst),
    currency
  );
  const taxable = slabs.reduce(
    (s, x) => roundMoney(s + x.taxable, currency),
    0
  );
  return {
    ...breakdown,
    taxable,
    effectiveRate:
      taxable > 0 ? roundMoney((breakdown.total / taxable) * 100, currency) : 0,
  };
}
