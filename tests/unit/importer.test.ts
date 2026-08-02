import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv, parseSqlInserts } from "../../src/lib/pharmacy/importer/parsers";
import {
  buildPreview,
  inferMapping,
  runWizard,
  commit,
  buildSampleTemplate,
  summarize,
} from "../../src/lib/pharmacy/importer/wizard";
import { MEDICINE_SCHEMA } from "../../src/lib/pharmacy/importer/schemas";

describe("importer parsers", () => {
  it("parses CSV with quoted fields and CRLF", () => {
    const rows = parseCsv(
      'sku,name,price\r\n"AB-1","Paracetamol, 500mg",15\r\nAB-2,Aspirin,10'
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, "Paracetamol, 500mg");
    assert.equal(rows[0].price, "15");
  });

  it("parses SQL INSERT dumps with quoted strings", () => {
    const rows = parseSqlInserts(
      `INSERT INTO medicines (sku, name, price, is_active) VALUES ('AB-1', 'Aspirin', 10, true), ('AB-2', 'Zinc', 5, false);`
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, "Aspirin");
    assert.equal(rows[0].price, 10);
    assert.equal(rows[0].is_active, true);
  });

  it("handles multi-statement SQL dumps across formats", () => {
    const rows = parseSqlInserts(
      `INSERT INTO suppliers (name, phone) VALUES ('Cipla', '98765');\nINSERT INTO suppliers (name, phone) VALUES ('Sun', '11223');`
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[1].name, "Sun");
  });
});

describe("importer wizard", () => {
  it("infers column mappings from exact header/field and header/label matches", () => {
    const mapping = inferMapping(["SKU", "Name", "Batch Number"], MEDICINE_SCHEMA);
    assert.equal(mapping["SKU"], "sku");
    assert.equal(mapping["Name"], "name");
    assert.equal(mapping["Batch Number"], "batch_number");
  });

  it("detects duplicates and validates required fields", () => {
    const preview = buildPreview([
      { SKU: "A1", Name: "Paracetamol", Selling: 10 },
      { SKU: "A1", Name: "Duplicate", Selling: 12 },
      { SKU: "", Name: "", Selling: 5 },
    ]);
    const mapping = inferMapping(preview.headers, MEDICINE_SCHEMA);
    const { results } = runWizard(preview, mapping, MEDICINE_SCHEMA);
    const byStatus = summarize(results);
    // First row valid, second is a duplicate, third fails required fields.
    assert.equal(byStatus.ok, 1);
    assert.equal(byStatus.duplicate, 1);
    assert.equal(byStatus.error, 1);
  });

  it("flags rows that already exist server-side", () => {
    const preview = buildPreview([{ sku: "EXIST", name: "X", selling_price: 5 }]);
    const { results } = runWizard(preview, { sku: "sku", name: "name", selling_price: "selling_price" }, MEDICINE_SCHEMA, new Set(["EXIST"]));
    assert.equal(results[0].status, "duplicate");
    assert.equal(results[0].duplicateOf, -1);
  });

  it("produces rollback deletes for committed inserts", () => {
    const preview = buildPreview([
      { sku: "B1", name: "Cough Syrup", selling_price: 40, stock_qty: 10 },
    ]);
    const mapping = inferMapping(preview.headers, MEDICINE_SCHEMA);
    const { ops } = runWizard(preview, mapping, MEDICINE_SCHEMA);
    const { result, rollback } = commit(ops, ops.map((_, i) => ({ index: i, status: "ok" as const })), "admin");
    assert.equal(result.imported, 1);
    assert.equal(rollback.length, 1);
    assert.equal(rollback[0].kind, "delete");
    assert.equal(rollback[0].entity, "medicine");
  });

  it("generates a downloadable sample template with the schema fields", () => {
    const csv = buildSampleTemplate(MEDICINE_SCHEMA);
    assert.equal(csv.includes("sku") || csv.includes("SKU"), true);
    assert.equal(csv.split("\n").length, 2);
  });
});
