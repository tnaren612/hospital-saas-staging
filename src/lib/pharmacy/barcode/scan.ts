/**
 * Pharmacy Barcode — scan pipeline & lookup (pure, testable)
 *
 * Covers EAN13 / UPC / Code128 / Code39 / QR. Keyboard-wedge scanners (USB /
 * Bluetooth) type into the focused input and send Enter; camera scanners use
 * the native BarcodeDetector API. All matching logic lives here so it can be
 * unit-tested without a DOM.
 */

export type BarcodeFormat = "ean13" | "upc" | "code128" | "code39" | "qr" | "unknown";

export const BARCODE_FORMATS: BarcodeFormat[] = [
  "ean13",
  "upc",
  "code128",
  "code39",
  "qr",
];

/** Normalise a raw scan before lookup: trim + collapse whitespace. */
export function normalizeBarcode(raw: string): string {
  return String(raw ?? "")
    .replace(/[^\x20-\x7E]/g, "") // strip control chars / barcode terminators
    .trim()
    .replace(/\s+/g, " ");
}

/** GTIN check-digit (EAN-13 / UPC-A / EAN-8 share the algorithm). */
export function gtinChecksum(first12: string): string {
  const digits = String(first12).replace(/[^\d]/g, "");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return String(check);
}

export function isValidEan13(value: string): boolean {
  const v = String(value ?? "");
  if (!/^\d{13}$/.test(v)) return false;
  return v[12] === gtinChecksum(v.slice(0, 12));
}

export function isValidUpc(value: string): boolean {
  const v = String(value ?? "");
  if (!/^\d{12}$/.test(v)) return false;
  return v[11] === gtinChecksum(v.slice(0, 11));
}

const CODE39_CHARS = new Set(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*".split("")
);

/**
 * Best-effort format detection from the scanned value. QR wins for anything
 * that is not a compact barcode (URLs, long text, mixed case).
 */
export function detectBarcodeFormat(value: string): BarcodeFormat {
  const v = String(value ?? "").trim();
  if (v.length === 13 && /^\d{13}$/.test(v)) {
    return isValidEan13(v) ? "ean13" : "code128";
  }
  if (v.length === 12 && /^\d{12}$/.test(v)) {
    return isValidUpc(v) ? "upc" : "code128";
  }
  if (v.length <= 32 && v.length > 0) {
    const ascii = [...v].every((c) => /[\x20-\x7E]/.test(c));
    if (ascii) {
      const upper = v.toUpperCase();
      const code39Set = [...upper].every((c) => CODE39_CHARS.has(c));
      // Code 39: continuous uppercase forms without dashes (classic usage).
      if (code39Set && !/[a-z]/.test(v) && !/-/.test(v) && v.length <= 12) {
        return "code39";
      }
      return "code128";
    }
  }
  return "qr";
}

export function isBarcodeLike(value: string): boolean {
  const v = normalizeBarcode(value);
  if (!v) return false;
  const format = detectBarcodeFormat(v);
  return format !== "qr" || v.length > 0;
}

// ----------------------------------------------------------------------------
// Medicine lookup index — O(1) barcode/SKU + fast substring search
// ----------------------------------------------------------------------------

export type IndexedMedicine = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  generic_name?: string | null;
  manufacturer?: string | null;
};

export type MedicineLookupIndex = {
  /** exact match index: normalized barcode/sku → medicine id */
  byBarcode: Map<string, string>;
  /** first-2-char buckets for name/generic/manufacturer substring search */
  buckets: Map<string, IndexedMedicine[]>;
  all: IndexedMedicine[];
};

const KEY = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

/** Keys (SKU / barcode) considered for a medicine, normalized. */
export function medicineBarcodeKeys(med: IndexedMedicine): string[] {
  const keys = new Set<string>();
  if (med.barcode) keys.add(KEY(med.barcode));
  if (med.sku) keys.add(KEY(med.sku));
  if (med.sku !== med.barcode && med.barcode) {
    const compact = med.barcode.replace(/\s+/g, "");
    if (compact) keys.add(KEY(compact));
  }
  return [...keys].filter(Boolean);
}

/**
 * Build a lookup index over a medicine list (e.g. 100k rows).
 * Bucketing by first two characters of every searchable field keeps substring
 * search sub-millisecond instead of scanning the full list.
 */
export function buildMedicineIndex(medicines: IndexedMedicine[]): MedicineLookupIndex {
  const byBarcode = new Map<string, string>();
  const buckets = new Map<string, IndexedMedicine[]>();
  const all: IndexedMedicine[] = [];

  const addToBucket = (value: string, med: IndexedMedicine) => {
    const key = KEY(value);
    if (!key) return;
    const prefix = key.slice(0, 2);
    const bucket = buckets.get(prefix) || [];
    bucket.push(med);
    buckets.set(prefix, bucket);
  };

  for (const med of medicines) {
    if (!med?.id) continue;
    all.push(med);
    for (const key of medicineBarcodeKeys(med)) {
      if (!byBarcode.has(key)) byBarcode.set(key, med.id);
    }
    addToBucket(med.name || "", med);
    if (med.generic_name) addToBucket(med.generic_name, med);
    if (med.manufacturer) addToBucket(med.manufacturer, med);
  }
  return { byBarcode, buckets, all };
}

export function findMedicineByBarcode(
  index: MedicineLookupIndex,
  raw: string
): IndexedMedicine | null {
  const key = KEY(raw);
  if (!key) return null;
  const id = index.byBarcode.get(key);
  if (!id) return null;
  return index.all.find((m) => m.id === id) || null;
}

export type MedicineSearchOpts = {
  limit?: number;
  /** Search name / generic / manufacturer / sku. */
  fields?: ("name" | "generic_name" | "manufacturer" | "sku")[];
};

const DEFAULT_FIELDS: NonNullable<MedicineSearchOpts["fields"]> = [
  "name",
  "generic_name",
  "manufacturer",
];

/** Substring search over bucketed index (fast for 100k+ rows). */
export function searchMedicines(
  index: MedicineLookupIndex,
  query: string,
  opts?: MedicineSearchOpts
): IndexedMedicine[] {
  const q = KEY(query);
  if (!q) return [];
  const limit = opts?.limit || 50;
  const fields = opts?.fields || DEFAULT_FIELDS;
  const seen = new Set<string>();
  const matches: IndexedMedicine[] = [];
  const consider = (med: IndexedMedicine) => {
    if (seen.has(med.id)) return;
    if (!fieldMatches(med, q, fields)) return;
    seen.add(med.id);
    matches.push(med);
  };
  if (q.length === 1) {
    for (const bucket of index.buckets.values()) {
      for (const med of bucket) {
        if (matches.length >= limit) return matches;
        consider(med);
      }
    }
    return matches;
  }
  const bucket = index.buckets.get(q.slice(0, 2));
  if (!bucket) return [];
  for (const med of bucket) {
    if (matches.length >= limit) break;
    consider(med);
  }
  return matches;
}

function fieldMatches(
  med: IndexedMedicine,
  q: string,
  fields: NonNullable<MedicineSearchOpts["fields"]>
): boolean {
  for (const f of fields) {
    const v = KEY((med[f] as string) ?? "");
    if (v && v.includes(q)) return true;
  }
  return false;
}

/** First char of a barcode scan is often a check/prefix char; exact then fuzzy. */
export function resolveScan(index: MedicineLookupIndex, raw: string): {
  medicine: IndexedMedicine | null;
  matchedKey: string | null;
} {
  const direct = findMedicineByBarcode(index, raw);
  if (direct) return { medicine: direct, matchedKey: raw };
  return { medicine: null, matchedKey: null };
}
