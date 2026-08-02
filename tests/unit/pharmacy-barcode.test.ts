import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gtinChecksum,
  isValidEan13,
  isValidUpc,
  detectBarcodeFormat,
  normalizeBarcode,
  buildMedicineIndex,
  findMedicineByBarcode,
  searchMedicines,
  resolveScan,
} from "../../src/lib/pharmacy/barcode/scan";

test("barcode normalize", () => {
  assert.equal(normalizeBarcode("  8901234567890\n"), "8901234567890");
  assert.equal(normalizeBarcode(" AB-123 "), "AB-123");
  assert.equal(normalizeBarcode("\u001d8901234567890\u001d"), "8901234567890");
});

test("gtin checksum matches EAN-13 spec", () => {
  // Standard example: 890123456789 → check digit C (computed here).
  const check = gtinChecksum("890123456789");
  assert.match(check, /^\d$/);
  assert.equal(isValidEan13(`890123456789${check}`), true);
  assert.equal(isValidEan13("8901234567890"), true);
  // 13 digits with a wrong check digit must fail.
  assert.equal(isValidEan13("8901234567891"), false);
  assert.equal(isValidEan13("12345"), false);
});

test("gtin checksum UPC-A", () => {
  // 03600029145 + check digit 8 is a valid UPC-A.
  assert.equal(isValidUpc("036000291458"), true);
  assert.equal(isValidUpc("036000291450"), false);
});

test("detectBarcodeFormat covers EAN13/UPC/Code128/Code39/QR", () => {
  assert.equal(detectBarcodeFormat("8901234567890"), "ean13");
  assert.equal(detectBarcodeFormat("036000291458"), "upc");
  assert.equal(detectBarcodeFormat("MED-123-ABC"), "code128");
  assert.equal(detectBarcodeFormat("CODE391234"), "code39");
  assert.equal(detectBarcodeFormat("https://ssh.in/bill/12345678901234567890"), "qr");
});

test("buildMedicineIndex + barcode lookup is exact and case-insensitive", () => {
  const index = buildMedicineIndex([
    { id: "m1", name: "Paracetamol 500", sku: "8901234567890" },
    { id: "m2", name: "Amoxicillin 250", sku: "MED-ABC-123" },
    { id: "m3", name: "ORS Sachet", sku: null, barcode: "036000291450" },
  ]);
  assert.equal(findMedicineByBarcode(index, "8901234567890")?.id, "m1");
  assert.equal(findMedicineByBarcode(index, "med-abc-123")?.id, "m2");
  assert.equal(findMedicineByBarcode(index, "036000291450")?.id, "m3");
  assert.equal(findMedicineByBarcode(index, "nope"), null);
  const resolved = resolveScan(index, "8901234567890");
  assert.equal(resolved.medicine?.id, "m1");
  assert.equal(resolveScan(index, "nope").medicine, null);
});

test("searchMedicines over buckets finds by name/generic/manufacturer with limits", () => {
  const meds = Array.from({ length: 5000 }, (_, i) => ({
    id: `m${i}`,
    name: i === 4242 ? "Amoxicillin 500mg" : `Drug ${i}`,
    generic_name: i === 4242 ? "amoxicillin trihydrate" : `generic ${i}`,
    manufacturer: i === 4242 ? "Sun Pharma" : `maker ${i}`,
    sku: `SKU${i}`,
  }));
  const index = buildMedicineIndex(meds);
  const byName = searchMedicines(index, "amoxicillin 500", { limit: 10 });
  assert.ok(byName.some((m) => m.id === "m4242"));
  const byGeneric = searchMedicines(index, "amoxicillin", { fields: ["generic_name"] });
  assert.ok(byGeneric.some((m) => m.id === "m4242"));
  const byMaker = searchMedicines(index, "sun", { fields: ["manufacturer"] });
  assert.ok(byMaker.some((m) => m.id === "m4242"));
  const limited = searchMedicines(index, "drug", { limit: 5 });
  assert.ok(limited.length <= 5);
  // Single-char query still returns matches without exploding.
  const single = searchMedicines(index, "a", { limit: 5 });
  assert.ok(single.length > 0 && single.length <= 5);
});

test("empty index returns no matches", () => {
  const index = buildMedicineIndex([]);
  assert.equal(findMedicineByBarcode(index, "x"), null);
  assert.deepEqual(searchMedicines(index, "x"), []);
});

test("receipt enhancement injects real barcode/QR and signature placeholder", async () => {
  const { enhanceReceiptWithScannables } = await import("../../src/lib/pharmacy/receipt-enhance");
  const { generateThermalReceipt } = await import("../../src/lib/pharmacy/receipt");
  const data = {
    sale: { sale_number: "PH-123" },
    hospital: { name: "H", address: "", phone: "", email: "", gst: "", drug_license: "", logo_url: "" },
    cashier_name: "Cashier A",
    pharmacist_name: "",
    settings: {
      show_barcode: true,
      show_qr_code: true,
      show_return_policy: false,
      receipt_paper_size: "80mm",
      receipt_footer: "Thanks",
      show_logo: false,
      show_hospital_address: false,
      show_phone: false,
      show_gst: false,
      show_drug_license: false,
      show_doctor_name: false,
      show_batch_details: false,
      show_expiry: false,
      show_mrp: false,
    } as unknown as Record<string, unknown>,
    items: [{ name: "ORS", selling_price: 40, quantity: 1, mrp: 45 }],
    subtotal: 40,
    discount: 0,
    tax: 0,
    grand_total: 40,
    amount_paid: 40,
    amount_returned: 0,
    payment_method: "cash",
    customer_name: "Ravi",
  } as never;
  const base = generateThermalReceipt(data as never, "80mm");
  assert.ok(base.includes("[QR Code]"));
  assert.ok(base.includes("[Barcode: PH-123]"));
  const out = await enhanceReceiptWithScannables(base, data as never, {
    barcode: async () => "data:image/png;base64,BARCODE",
    qr: async () => "data:image/png;base64,QR",
  });
  assert.ok(!out.includes("[QR Code]"));
  assert.ok(!out.includes("[Barcode: PH-123]"));
  assert.ok(out.includes("data:image/png;base64,QR"));
  assert.ok(out.includes("data:image/png;base64,BARCODE"));
  assert.ok(out.includes("Digital signature: __SIGNATURE__"));
});

test("receipt enhancement keeps placeholders when generators are unavailable", async () => {
  const { enhanceReceiptWithScannables } = await import("../../src/lib/pharmacy/receipt-enhance");
  const { generateThermalReceipt } = await import("../../src/lib/pharmacy/receipt");
  const data = {
    sale: { sale_number: "PH-1" },
    hospital: { name: "H", address: "", phone: "", email: "", gst: "", drug_license: "", logo_url: "" },
    cashier_name: "C",
    pharmacist_name: "",
    settings: {
      show_barcode: true,
      show_qr_code: true,
      show_return_policy: false,
    },
    items: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    grand_total: 0,
    amount_paid: 0,
    amount_returned: 0,
    payment_method: "cash",
    customer_name: "Ravi",
  } as never;
  const base = generateThermalReceipt(data as never, "80mm");
  const out = await enhanceReceiptWithScannables(base, data as never, {
    barcode: async () => null,
    qr: async () => null,
  });
  assert.ok(out.includes("[QR Code]"));
  assert.ok(out.includes("[Barcode: PH-1]"));
});

test("bill verification QR text includes sale number and total", async () => {
  const { billVerificationText } = await import("../../src/lib/pharmacy/receipt-enhance");
  const text = billVerificationText({
    sale: { sale_number: "PH-42" },
    hospital: { name: "SSH" },
    grand_total: 123.5,
    payment_method: "cash",
  } as never);
  assert.ok(text.includes("PH-42"));
  assert.ok(text.includes("123.5"));
  assert.ok(text.includes("SSH"));
});
