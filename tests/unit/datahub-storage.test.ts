import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDataProvider } from "@/lib/datahub/provider";
import { resolveDataManagementConfig } from "@/lib/datahub/settings";
import { resetSqliteProviders } from "@/lib/datahub/sqlite";
import { resetExcelProviders } from "@/lib/datahub/excel";
import { getModule } from "@/lib/datahub/registry";

beforeEach(() => {
  resetSqliteProviders();
  resetExcelProviders();
});

describe("createDataProvider (storage mode selection)", () => {
  it("selects a working SQLite provider for sqlite mode", async () => {
    const p = await createDataProvider("sqlite");
    const patients = getModule("patients")!;
    await p.upsertRows(patients, null, [{ full_name: "Ravi", phone: "9876543210" }], { updateOnMatch: true });
    assert.equal(await p.count(patients, null), 1);
  });

  it("selects hybrid -> SQLite local store", async () => {
    const p = await createDataProvider("hybrid");
    const patients = getModule("patients")!;
    await p.upsertRows(patients, null, [{ full_name: "A", phone: "1000000001" }], { updateOnMatch: true });
    assert.equal(await p.count(patients, null), 1);
  });

  it("selects a working Excel provider for excel mode with a file path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "datahub-storage-"));
    try {
      const p = await createDataProvider("excel", { storageFile: join(dir, "store.xlsx") });
      const patients = getModule("patients")!;
      await p.upsertRows(patients, null, [{ full_name: "B", phone: "1000000002" }], { updateOnMatch: true });
      assert.equal(await p.count(patients, null), 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws when excel mode has no workbook path", async () => {
    await assert.rejects(
      createDataProvider("excel"),
      /storage_file|workbook file path/
    );
  });

  it("defaults to supabase for unknown/empty modes", async () => {
    const p = await createDataProvider("supabase");
    assert.ok(p);
    assert.equal(typeof p.browse, "function");
  });
});

describe("resolveDataManagementConfig storage fields", () => {
  it("defaults to supabase mode", () => {
    const c = resolveDataManagementConfig({});
    assert.equal(c.storage_mode, "supabase");
    assert.equal(c.storage_file, "");
  });

  it("preserves configured sqlite/excel/hybrid modes and file", () => {
    const c = resolveDataManagementConfig({ storage_mode: "excel", storage_file: "/tmp/p.xlsx" });
    assert.equal(c.storage_mode, "excel");
    assert.equal(c.storage_file, "/tmp/p.xlsx");
  });

  it("rejects unknown storage modes with the default", () => {
    const c = resolveDataManagementConfig({ storage_mode: "mongo" });
    assert.equal(c.storage_mode, "supabase");
  });
});
