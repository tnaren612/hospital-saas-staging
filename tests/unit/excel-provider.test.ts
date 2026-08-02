import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { excelProvider, resetExcelProviders } from "@/lib/datahub/excel";
import { getModule } from "@/lib/datahub/registry";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "datahub-excel-"));
  resetExcelProviders();
});

function makeProvider(name = "pharmacy.xlsx") {
  return excelProvider({ filePath: join(dir, name) });
}

function cleanup() {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe("excelProvider", () => {
  it("creates a workbook with a sheet per module", async () => {
    const p = makeProvider();
    const tables = await p.listTables();
    assert.ok(tables.length > 0);
    assert.ok(tables.some((t) => t.table === "hospital_patients"));
    assert.ok(tables.some((t) => t.table === "datahub_config_rows"));
    cleanup();
  });

  it("round-trips insert and read", async () => {
    const p = makeProvider();
    const patients = getModule("patients")!;
    const res = await p.upsertRows(patients, null, [
      { full_name: "Ravi", phone: "9876543210", age: 42 },
    ], { updateOnMatch: true });
    assert.equal(res.inserted, 1);

    assert.equal(await p.count(patients, null), 1);
    const keys = await p.existingKeys(patients, null);
    assert.ok(keys.has("9876543210"));

    const { rows } = await p.browse(patients, null, { all: true });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].full_name, "Ravi");
    assert.equal(rows[0].age, 42);
    cleanup();
  });

  it("updates on match and skips when updateOnMatch is false", async () => {
    const p = makeProvider();
    const patients = getModule("patients")!;
    await p.upsertRows(patients, null, [{ full_name: "A", phone: "1111111111" }], { updateOnMatch: true });
    const upd = await p.upsertRows(patients, null, [{ full_name: "A2", phone: "1111111111" }], { updateOnMatch: true });
    assert.equal(upd.updated, 1);
    assert.equal(await p.count(patients, null), 1);

    const skip = await p.upsertRows(patients, null, [{ full_name: "B", phone: "1111111111" }], { updateOnMatch: false });
    assert.equal(skip.skipped, 1);
    cleanup();
  });

  it("supports search, filter, sort, pagination", async () => {
    const p = makeProvider();
    const patients = getModule("patients")!;
    await p.upsertRows(patients, null, [
      { full_name: "Alpha", phone: "1000000001", age: 20 },
      { full_name: "Beta", phone: "1000000002", age: 40 },
      { full_name: "Gamma", phone: "1000000003", age: 60 },
    ], { updateOnMatch: true });

    const search = await p.browse(patients, null, { search: "beta", all: true });
    assert.equal(search.total, 1);
    const filtered = await p.browse(patients, null, { filters: { age: 40 }, all: true });
    assert.equal(filtered.rows[0].full_name, "Beta");
    const sorted = await p.browse(patients, null, { sort: { column: "age", asc: true }, all: true });
    assert.equal(sorted.rows[0].age, 20);
    const page = await p.browse(patients, null, { page: 1, pageSize: 2 });
    assert.equal(page.rows.length, 2);
    assert.equal(page.total, 3);
    cleanup();
  });

  it("deletes by id", async () => {
    const p = makeProvider();
    const patients = getModule("patients")!;
    await p.upsertRows(patients, null, [{ full_name: "A", phone: "1000000001" }], { updateOnMatch: true });
    const { rows } = await p.browse(patients, null, { all: true });
    const n = await p.deleteById(patients, null, [String(rows[0].id)]);
    assert.equal(n, 1);
    assert.equal(await p.count(patients, null), 0);
    cleanup();
  });

  it("round-trips boolean and string-array types", async () => {
    const p = makeProvider();
    const medicines = getModule("medicines")!;
    await p.upsertRows(medicines, null, [
      { item_code: "M1", name: "Paracetamol", expiry_tracking: true },
    ], { updateOnMatch: true });
    const mRows = await p.browse(medicines, null, { all: true });
    assert.equal(mRows.rows[0].expiry_tracking, true);

    const doctors = getModule("doctors")!;
    await p.upsertRows(doctors, null, [
      { name: "Dr. T", qualifications: ["MBBS", "MD"] },
    ], { updateOnMatch: true });
    const dRows = await p.browse(doctors, null, { all: true });
    assert.deepEqual(dRows.rows[0].qualifications, ["MBBS", "MD"]);
    cleanup();
  });

  it("handles config modules", async () => {
    const p = makeProvider();
    const specialties = getModule("specialties")!;
    await p.upsertRows(specialties, null, [
      { name: "Cardiology", description: "Heart" },
      { name: "Neurology" },
    ], { updateOnMatch: true });
    assert.equal(await p.count(specialties, null), 2);
    const upd = await p.upsertRows(specialties, null, [
      { name: "Cardiology", description: "Updated" },
    ], { updateOnMatch: true });
    assert.equal(upd.updated, 1);
    const { rows } = await p.browse(specialties, null, { all: true });
    assert.equal(rows.find((r) => r.name === "Cardiology")?.description, "Updated");
    cleanup();
  });

  it("persists to a valid .xlsx file that SheetJS can reopen", async () => {
    const filePath = join(dir, "persist.xlsx");
    const p = excelProvider({ filePath });
    const patients = getModule("patients")!;
    await p.upsertRows(patients, null, [{ full_name: "Zed", phone: "9999999999" }], { updateOnMatch: true });
    // Reopen the file directly with SheetJS.
    const wb = XLSX.readFile(filePath);
    assert.ok(wb.Sheets["hospital_patients"]);
    cleanup();
  });

  it("rejects a corrupt workbook instead of silently overwriting", async () => {
    const filePath = join(dir, "corrupt.xlsx");
    // Write garbage bytes as if it were an xlsx file.
    const { writeFileSync } = await import("node:fs");
    writeFileSync(filePath, "this is not a valid xlsx file");
    assert.throws(() => excelProvider({ filePath }), /corrupt|empty|Unexpected|unexpected/i);
    cleanup();
  });
});
