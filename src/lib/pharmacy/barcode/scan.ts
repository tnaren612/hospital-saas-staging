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
  /** exact match index: normalized barcode/sku → medicine id (first-wins) */
  byBarcode: Map<string, string>;
  /** every medicine whose SKU/barcode normalizes to a key — ambiguity detection */
  byBarcodeAll: Map<string, IndexedMedicine[]>;
  /** first-2-char buckets for name/generic/manufacturer/sku/barcode substring search */
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
  const byBarcodeAll = new Map<string, IndexedMedicine[]>();
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
      const allFor = byBarcodeAll.get(key) || [];
      allFor.push(med);
      byBarcodeAll.set(key, allFor);
    }
    addToBucket(med.name || "", med);
    if (med.generic_name) addToBucket(med.generic_name, med);
    if (med.manufacturer) addToBucket(med.manufacturer, med);
    if (med.sku) addToBucket(med.sku, med);
    if (med.barcode) addToBucket(med.barcode, med);
  }
  return { byBarcode, byBarcodeAll, buckets, all };
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

/**
 * Case-insensitive SKU lookup for POS scan fields. Returns null for
 * empty / whitespace-only input — an empty scan must NEVER match a
 * medicine whose SKU is blank, or a phantom line lands in the cart.
 */
export function findMedicineBySku<M extends IndexedMedicine>(
  medicines: M[],
  raw: string
): M | null {
  const q = KEY(String(raw ?? ""));
  if (!q) return null;
  return medicines.find((m) => KEY(m.sku || "") === q) || null;
}

export type MedicineSearchOpts = {
  limit?: number;
  /** Search name / generic / manufacturer / sku / barcode. */
  fields?: ("name" | "generic_name" | "manufacturer" | "sku" | "barcode")[];
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
    if (f === "barcode") {
      // Barcode keys tolerate spacing: "89 0123 4567 897" matches
      // a stored "8901234567897".
      const compact = KEY(String(med.barcode ?? "").replace(/\s+/g, ""));
      const compactQ = q.replace(/\s+/g, "");
      if (compact && (compact.includes(q) || compact.includes(compactQ))) return true;
      continue;
    }
    const v = KEY((med[f] as string) ?? "");
    if (v && v.includes(q)) return true;
  }
  return false;
}

/**
 * Deterministic fuzzy variants of a scanned value, tried in order when an
 * exact lookup fails. Each variant addresses a real-world scanner quirk:
 *
 *   1. compact form          "89 0123 4567 890" → "8901234567890"
 *   2. non-alphanumeric      "\u001d8901234567890" → "8901234567890"
 *   3. Code 39 terminators   "*ABC123*" → "ABC123"
 *   4. EAN-13 minus check    "8901234567890" → "890123456789"
 *   5. UPC-A minus check     "036000291458" → "03600029145"
 *   6. leading zeros         "0036000291458" → "36000291458"
 *   7. prefix char dropped   scan prefix char (comment in resolveScan)
 *   8. trailing char dropped scanner-appended terminator digit
 */
export function fuzzyBarcodeVariants(raw: string): string[] {
  const v = normalizeBarcode(raw);
  if (!v) return [];
  const out: string[] = [];
  const push = (s: string) => {
    const k = s.trim();
    if (k && k !== v && !out.includes(k)) out.push(k);
  };
  const compact = v.replace(/\s+/g, "");
  push(compact);
  const stripped = v.replace(/[^0-9A-Za-z]/g, "");
  push(stripped);
  const code39 = v.replace(/^[*\s]+|[*\s]+$/g, "");
  push(code39);
  const digitBase = /^\d+$/.test(stripped) ? stripped : "";
  if (digitBase.length === 13) push(digitBase.slice(0, 12));
  if (digitBase.length === 12) push(digitBase.slice(0, 11));
  // Scanner dropped the check digit — recompute it (EAN-13 / UPC-A share GTIN).
  if (digitBase.length === 12) push(digitBase + gtinChecksum(digitBase));
  if (digitBase.length === 11) push(digitBase + gtinChecksum(digitBase));
  if (digitBase) push(digitBase.replace(/^0+/, ""));
  if (digitBase.length >= 8) {
    push(digitBase.slice(1));
    push(digitBase.slice(0, -1));
  }
  return out;
}

export type ResolveScanResult =
  | { status: "exact"; medicine: IndexedMedicine; matchedKey: string }
  | { status: "fuzzy"; medicine: IndexedMedicine; matchedKey: string }
  | { status: "ambiguous"; medicine: null; matchedKey: string | null }
  | { status: "unknown"; medicine: null; matchedKey: null };

/**
 * Resolve a scan against the medicine index.
 *
 * Exact SKU/barcode matches win immediately. If the exact lookup misses, every
 * fuzzy variant is evaluated and ALL distinct medicines that could match are
 * collected — a single candidate resolves, two or more different medicines
 * collapse to an explicit `ambiguous` result (never a silently chosen one).
 * The result is independent of medicine array order.
 */
export function resolveScan(
  index: MedicineLookupIndex,
  raw: string
): ResolveScanResult {
  // Defense-in-depth: an empty / whitespace-only / control-only value can
  // never resolve a medicine, no matter who calls resolveScan.
  const key = normalizeBarcode(raw);
  if (!key) {
    return { status: "unknown", medicine: null, matchedKey: null };
  }
  const direct = findMedicineByBarcode(index, key);
  if (direct) return { status: "exact", medicine: direct, matchedKey: key };
  const seen = new Map<string, IndexedMedicine>();
  const matchedKeys: string[] = [];
  for (const variant of fuzzyBarcodeVariants(raw)) {
    const hits = index.byBarcodeAll.get(KEY(variant)) || [];
    for (const med of hits) {
      if (!seen.has(med.id)) {
        seen.set(med.id, med);
        matchedKeys.push(variant);
      }
    }
  }
  if (seen.size === 1) {
    const med = [...seen.values()][0];
    return { status: "fuzzy", medicine: med, matchedKey: matchedKeys[0] };
  }
  if (seen.size > 1) {
    return { status: "ambiguous", medicine: null, matchedKey: matchedKeys[0] ?? null };
  }
  return { status: "unknown", medicine: null, matchedKey: null };
}

export type MedicineDupInput = {
  name?: string;
  manufacturer?: string | null;
  sku?: string | null;
  barcode?: string | null;
};

export type MedicineDupHit = {
  kind: "name" | "sku" | "barcode";
  medicine: IndexedMedicine;
};

/**
 * Detect an existing medicine that would collide with a new SKU / barcode
 * (or the same name + manufacturer). Used by the unknown-barcode → Add
 * Medicine flow and the Inventory form to prevent duplicate keys before
 * anything is enqueued. `excludeId` skips the medicine being edited.
 */
export function findDuplicateMedicineKey(
  medicines: IndexedMedicine[],
  input: MedicineDupInput,
  excludeId?: string
): MedicineDupHit | null {
  const name = KEY(input.name || "");
  const manufacturer = KEY(input.manufacturer || "");
  const sku = KEY(input.sku || "");
  const barcode = KEY(input.barcode || "");
  const compactBarcode = (input.barcode || "").replace(/\s+/g, "").toLowerCase();

  for (const med of medicines) {
    if (excludeId && med.id === excludeId) continue;
    if (name && manufacturer && KEY(med.name) === name) {
      const medMaker = KEY(med.manufacturer || "");
      if (!medMaker || medMaker === manufacturer) {
        return { kind: "name", medicine: med };
      }
    }
    if (sku && KEY(med.sku || "") === sku) {
      return { kind: "sku", medicine: med };
    }
    if (barcode && (KEY(med.barcode || "") === barcode)) {
      return { kind: "barcode", medicine: med };
    }
    if (compactBarcode && compactBarcode === (med.barcode || "").replace(/\s+/g, "").toLowerCase()) {
      return { kind: "barcode", medicine: med };
    }
  }
  return null;
}
