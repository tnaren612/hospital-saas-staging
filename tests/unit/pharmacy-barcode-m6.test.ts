import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fuzzyBarcodeVariants,
  findDuplicateMedicineKey,
  buildMedicineIndex,
  findMedicineByBarcode,
  resolveScan,
  type IndexedMedicine,
} from "../../src/lib/pharmacy/barcode/scan";

const meds: IndexedMedicine[] = [
  { id: "m1", name: "Paracetamol 500", sku: "8901234567890" },
  { id: "m2", name: "Amoxicillin 250", sku: "MED-ABC-123" },
  { id: "m3", name: "ORS Sachet", sku: null, barcode: "036000291450" },
  { id: "m4", name: "Vit-D3 Drops", sku: "VITD-001", barcode: "VITD-001" },
];

// ---------------------------------------------------------------------------
// fuzzyBarcodeVariants
// ---------------------------------------------------------------------------

test("M6: fuzzy variants normalize compact and non-alphanumeric forms", () => {
  const variants = fuzzyBarcodeVariants("  8901 2345 6789 0\n");
  assert.ok(variants.includes("8901234567890"));
  // Control characters (GS/terminators) are stripped by normalization before
  // variant generation, so the clean code is the variant base.
  const stripped = fuzzyBarcodeVariants("\u001d8901234567890\u001d");
  assert.ok(stripped.includes("890123456789"));
  assert.ok(!stripped.some((v) => v.includes("\u001d")));
});

test("M6: fuzzy variants are deterministic, deduped and never empty", () => {
  const a = fuzzyBarcodeVariants("8901234567890");
  const b = fuzzyBarcodeVariants("8901234567890");
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
  assert.equal(fuzzyBarcodeVariants("   ").length, 0);
  assert.equal(fuzzyBarcodeVariants("").length, 0);
});

test("M6: fuzzy variants strip Code 39 start/stop terminators", () => {
  const variants = fuzzyBarcodeVariants("*MED-ABC-123*");
  assert.ok(variants.includes("MED-ABC-123"));
});

test("M6: fuzzy variants drop EAN-13 / UPC-A check digits", () => {
  assert.ok(fuzzyBarcodeVariants("8901234567890").includes("890123456789"));
  assert.ok(fuzzyBarcodeVariants("036000291458").includes("03600029145"));
});

test("M6: fuzzy variants strip leading zeros and stray prefix/trailing digits", () => {
  const leading = fuzzyBarcodeVariants("03600029145");
  assert.ok(leading.includes("3600029145"));
  const prefix = fuzzyBarcodeVariants("08901234567890");
  assert.ok(prefix.includes("8901234567890"));
  const trailing = fuzzyBarcodeVariants("89012345678900");
  assert.ok(trailing.includes("8901234567890"));
});

// ---------------------------------------------------------------------------
// resolveScan — exact then fuzzy
// ---------------------------------------------------------------------------

test("M6: resolveScan keeps exact-match behavior (short-circuit)", () => {
  const index = buildMedicineIndex(meds);
  const exact = resolveScan(index, "8901234567890");
  assert.equal(exact.medicine?.id, "m1");
  assert.equal(exact.matchedKey, "8901234567890");
  assert.equal(resolveScan(index, "nope").medicine, null);
  assert.equal(resolveScan(index, "nope").matchedKey, null);
});

test("M6: resolveScan fuzzy — spaced scan matches compact stored key", () => {
  const index = buildMedicineIndex(meds);
  const res = resolveScan(index, "8901 2345 6789 0");
  assert.equal(res.medicine?.id, "m1");
  assert.equal(res.matchedKey, "8901234567890");
});

test("M6: resolveScan fuzzy — Code 39 scanner terminators match stored code", () => {
  const index = buildMedicineIndex(meds);
  const res = resolveScan(index, "*MED-ABC-123*");
  assert.equal(res.medicine?.id, "m2");
  assert.equal(res.matchedKey, "MED-ABC-123");
});

test("M6: resolveScan fuzzy — missing check digit resolves stored full EAN-13", () => {
  const index = buildMedicineIndex(meds);
  // Stored key has the full 13 digits; scanner sent 12 (check digit omitted).
  const res = resolveScan(index, "890123456789");
  assert.equal(res.medicine?.id, "m1");
  assert.equal(res.matchedKey, "8901234567890");
});

test("M6: resolveScan fuzzy — prefix char dropped resolves", () => {
  const index = buildMedicineIndex(meds);
  const res = resolveScan(index, "08901234567890");
  assert.equal(res.medicine?.id, "m1");
});

test("M6: resolveScan fuzzy — trailing extra digit resolves", () => {
  const index = buildMedicineIndex(meds);
  const res = resolveScan(index, "89012345678900");
  assert.equal(res.medicine?.id, "m1");
});

test("M6: resolveScan fuzzy never resolves an unknown code", () => {
  const index = buildMedicineIndex(meds);
  const res = resolveScan(index, "9999999999999");
  assert.equal(res.medicine, null);
  assert.equal(res.matchedKey, null);
});

test("M6: findMedicineByBarcode remains exact-only (fuzzy lives in resolveScan)", () => {
  const index = buildMedicineIndex(meds);
  assert.equal(findMedicineByBarcode(index, "*MED-ABC-123*"), null);
  assert.equal(findMedicineByBarcode(index, "MED-ABC-123")?.id, "m2");
});

// ---------------------------------------------------------------------------
// findDuplicateMedicineKey — duplicate SKU / barcode / name prevention
// ---------------------------------------------------------------------------

test("M6: duplicate SKU is detected case/space-insensitively", () => {
  const dup = findDuplicateMedicineKey(meds, { sku: "med-abc-123" });
  assert.equal(dup?.kind, "sku");
  assert.equal(dup?.medicine.id, "m2");
  assert.equal(findDuplicateMedicineKey(meds, { sku: "NEW-SKU" }), null);
});

test("M6: duplicate barcode is detected in exact and compact forms", () => {
  assert.equal(findDuplicateMedicineKey(meds, { barcode: "036000291450" })?.kind, "barcode");
  assert.equal(
    findDuplicateMedicineKey(meds, { barcode: "0360 0029 1450" })?.kind,
    "barcode"
  );
  assert.equal(findDuplicateMedicineKey(meds, { barcode: "OTHER-BAR" }), null);
});

test("M6: name duplicate requires matching manufacturer (or empty)", () => {
  const branded = [
    { id: "x1", name: "Paracetamol 500", manufacturer: "Cipla" },
    { id: "x2", name: "Paracetamol 500", manufacturer: "Sun Pharma" },
  ];
  const same = findDuplicateMedicineKey(branded, {
    name: "Paracetamol 500",
    manufacturer: "Cipla",
  });
  assert.equal(same?.kind, "name");
  assert.equal(same?.medicine.id, "x1");
  const different = findDuplicateMedicineKey(branded, {
    name: "Paracetamol 500",
    manufacturer: "Different Labs",
  });
  assert.equal(different, null);
  // A medicine with no manufacturer recorded blocks any same-name insert
  // (conservative: avoid creating near-duplicates from bare names).
  const unlabelled = [{ id: "y1", name: "ORS Sachet" }];
  const bare = findDuplicateMedicineKey(unlabelled, {
    name: "ORS Sachet",
    manufacturer: "Acme",
  });
  assert.equal(bare?.kind, "name");
  assert.equal(bare?.medicine.id, "y1");
});

test("M6: duplicate check honours excludeId (edit flows)", () => {
  const dup = findDuplicateMedicineKey(meds, { sku: "med-abc-123" }, "m2");
  assert.equal(dup, null);
  assert.equal(findDuplicateMedicineKey(meds, { sku: "med-abc-123" }, "m1")?.medicine.id, "m2");
});

test("M6: empty inputs produce no duplicate hit", () => {
  assert.equal(findDuplicateMedicineKey(meds, {}), null);
  assert.equal(findDuplicateMedicineKey([], { sku: "x" }), null);
});

// ---------------------------------------------------------------------------
// Label sheet — existing label-printer support, verified at unit level
// ---------------------------------------------------------------------------

test("M6: label sheet escapes codes/captions and renders the configured grid", async () => {
  const { labelSheetHtml } = await import("../../src/lib/pharmacy/barcode/generate");
  const html = labelSheetHtml({
    title: "Pharmacy <Labels> & \"Quotes\"",
    labels: [
      { code: "<script>alert(1)</script>", caption: 'Acme & Co "500mg"', sub: "₹45.00", imageDataUrl: "data:image/png;base64,AAA" },
      { code: "8901234567890", caption: "Plain", imageDataUrl: "data:image/png;base64,BBB" },
    ],
    columns: 3,
  });
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("Acme &amp; Co &quot;500mg&quot;"));
  assert.ok(html.includes("grid-template-columns: repeat(3, 1fr)"));
  assert.ok(html.includes("<div class=\"cell\">"));
  assert.ok(html.includes("<div class=\"sub\">₹45.00</div>"));
});

test("M6: label sheet omits sub when absent and defaults to A4 / 3 columns", async () => {
  const { labelSheetHtml } = await import("../../src/lib/pharmacy/barcode/generate");
  const html = labelSheetHtml({
    title: "T",
    labels: [{ code: "A", caption: "B", imageDataUrl: "data:image/png;base64,CCC" }],
  });
  assert.ok(!html.includes("<div class=\"sub\">"));
  assert.ok(html.includes("@page { size: A4"));
});

test("M6: barcode/QR data URLs degrade to null outside a browser", async () => {
  const { generateBarcodeDataUrl, generateQrDataUrl } = await import(
    "../../src/lib/pharmacy/barcode/generate"
  );
  assert.equal(await generateBarcodeDataUrl("8901234567890"), null);
  assert.equal(await generateQrDataUrl("https://ssh.in/x"), null);
});

// ---------------------------------------------------------------------------
// Barcode ambiguity safety — fuzzy resolution must never guess a medicine
// ---------------------------------------------------------------------------

test("M6-safety: exact match wins immediately over fuzzy alternatives", () => {
  // "8901234567890" is e1's exact barcode; its 12-digit slice is e2's barcode.
  const index = buildMedicineIndex([
    { id: "e1", name: "Full EAN", barcode: "8901234567890" },
    { id: "e2", name: "Base 12", barcode: "890123456789" },
  ]);
  const res = resolveScan(index, "8901234567890");
  assert.equal(res.status, "exact");
  assert.equal(res.medicine?.id, "e1");
});

test("M6-safety: a single fuzzy match resolves normally", () => {
  const index = buildMedicineIndex([
    { id: "u1", name: "Only match", barcode: "8901234567890" },
  ]);
  const res = resolveScan(index, "08901234567890"); // stray prefix digit
  assert.equal(res.status, "fuzzy");
  assert.equal(res.medicine?.id, "u1");
  assert.equal(res.matchedKey, "8901234567890");
});

test("M6-safety: two medicines collapsing to one fuzzy candidate are ambiguous", () => {
  // Same stored key — the scan's Code 39 terminator variant reaches both.
  const index = buildMedicineIndex([
    { id: "c1", name: "Collide A", barcode: "A-B-C" },
    { id: "c2", name: "Collide B", barcode: "A-B-C" },
  ]);
  const res = resolveScan(index, "*A-B-C*");
  assert.equal(res.status, "ambiguous");
  assert.equal(res.medicine, null);
});

test("M6-safety: ambiguity result is independent of medicine array order", () => {
  const pairA = [
    { id: "c1", name: "Collide A", barcode: "A-B-C" },
    { id: "c2", name: "Collide B", barcode: "A-B-C" },
  ];
  const pairB = [...pairA].reverse();
  const ra = resolveScan(buildMedicineIndex(pairA), "*A-B-C*");
  const rb = resolveScan(buildMedicineIndex(pairB), "*A-B-C*");
  assert.equal(ra.status, "ambiguous");
  assert.equal(rb.status, "ambiguous");
  // A unique fuzzy hit is also order-independent (same medicine both ways).
  const solo = [{ id: "s1", name: "Solo", barcode: "8901234567890" }];
  const fwd = resolveScan(buildMedicineIndex(solo), "08901234567890");
  const rev = resolveScan(buildMedicineIndex([...solo].reverse()), "08901234567890");
  assert.equal(fwd.status, "fuzzy");
  assert.equal(fwd.medicine?.id, "s1");
  assert.equal(rev.status, "fuzzy");
  assert.equal(rev.medicine?.id, "s1");
});

test("M6-safety: unknown barcode stays unknown", () => {
  const index = buildMedicineIndex([
    { id: "u1", name: "Solo", barcode: "8901234567890" },
  ]);
  const res = resolveScan(index, "9999999999999");
  assert.equal(res.status, "unknown");
  assert.equal(res.medicine, null);
  assert.equal(res.matchedKey, null);
});

test("M6-safety: leading-zero normalization ambiguity is not resolved silently", () => {
  // Scan "03600029145": prefix-drop → "3600029145" (a1); trailing-drop →
  // "0360002914" (a2). Two DIFFERENT medicines could match — must be ambiguous.
  const index = buildMedicineIndex([
    { id: "a1", name: "Zero A", barcode: "3600029145" },
    { id: "a2", name: "Zero B", barcode: "0360002914" },
  ]);
  const res = resolveScan(index, "03600029145");
  assert.equal(res.status, "ambiguous");
  assert.equal(res.medicine, null);
  // Each alone resolves to itself.
  const onlyA = resolveScan(buildMedicineIndex([{ id: "a1", name: "A", barcode: "3600029145" }]), "03600029145");
  assert.equal(onlyA.status, "fuzzy");
  assert.equal(onlyA.medicine?.id, "a1");
  const onlyB = resolveScan(buildMedicineIndex([{ id: "a2", name: "B", barcode: "0360002914" }]), "03600029145");
  assert.equal(onlyB.status, "fuzzy");
  assert.equal(onlyB.medicine?.id, "a2");
});

test("M6-safety: check-digit drop/recompute ambiguity is not resolved silently", () => {
  // Scan "890123456789" (12 digits): slice(0,11) → "89012345678" (chk A);
  // recomputed check digit → "8901234567890" (chk B). Ambiguous.
  const index = buildMedicineIndex([
    { id: "chkA", name: "Check A", barcode: "89012345678" },
    { id: "chkB", name: "Check B", barcode: "8901234567890" },
  ]);
  const res = resolveScan(index, "890123456789");
  assert.equal(res.status, "ambiguous");
  assert.equal(res.medicine, null);
});

test("M6-safety: prefix/trailing-digit normalization ambiguity is not resolved silently", () => {
  // Scan "089012345678900" (15 digits): prefix-drop → "89012345678900" (pfx B);
  // trailing-drop → "08901234567890" (pfx A). Ambiguous.
  const index = buildMedicineIndex([
    { id: "pfxA", name: "Prefix A", barcode: "08901234567890" },
    { id: "pfxB", name: "Prefix B", barcode: "89012345678900" },
  ]);
  const res = resolveScan(index, "089012345678900");
  assert.equal(res.status, "ambiguous");
  assert.equal(res.medicine, null);
});

test("M6-safety: duplicate exact key keeps exact first-wins contract", () => {
  const index = buildMedicineIndex([
    { id: "d1", name: "Dup A", barcode: "036000291450" },
    { id: "d2", name: "Dup B", barcode: "036000291450" },
  ]);
  const res = resolveScan(index, "036000291450");
  assert.equal(res.status, "exact");
  assert.equal(res.medicine?.id, "d1");
});

