import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  sqliteProvider,
  resetSqliteProviders,
} from "@/lib/datahub/sqlite";
import { getModule } from "@/lib/datahub/registry";

beforeEach(() => {
  resetSqliteProviders();
});

function getProvider() {
  return sqliteProvider({ path: ":memory:" });
}

describe("sqliteProvider", () => {
  it("creates tables for every registry module and lists them", async () => {
    const p = getProvider();
    const tables = await p.listTables();
    const patients = getModule("patients")!;
    assert.ok(tables.some((t) => t.table === patients.table));
    assert.ok(tables.some((t) => t.table === "datahub_config_rows"));
  });

  it("starts empty and counts 0", async () => {
    const p = getProvider();
    const patients = getModule("patients")!;
    assert.equal(await p.count(patients, null), 0);
    const { rows, total } = await p.browse(patients, null, { all: true });
    assert.equal(rows.length, 0);
    assert.equal(total, 0);
  });

  it("inserts rows and reads them back (round-trip)", async () => {
    const p = getProvider();
    const patients = getModule("patients")!;
    const res = await p.upsertRows(patients, null, [
      { full_name: "Ravi Kumar", phone: "9876543210", age: 42, gender: "male" },
      { full_name: "Sita Devi", phone: "9000000001", age: 30, gender: "female" },
    ], { updateOnMatch: true });
    assert.equal(res.inserted, 2);

    assert.equal(await p.count(patients, null), 2);
    const keys = await p.existingKeys(patients, null);
    assert.ok(keys.has("9876543210"));
    assert.ok(keys.has("9000000001"));

    const { rows } = await p.browse(patients, null, { all: true });
    const ravi = rows.find((r) => r.full_name === "Ravi Kumar");
    assert.ok(ravi);
    assert.equal(ravi.phone, "9876543210");
    assert.equal(ravi.age, 42);
    assert.ok(ravi.id);
  });

  it("updates on matching unique key (updateOnMatch) without duplicating", async () => {
    const p = getProvider();
    const patients = getModule("patients")!;
    await p.upsertRows(patients, null, [{ full_name: "Ravi", phone: "9876543210" }], { updateOnMatch: true });
    const res = await p.upsertRows(patients, null, [{ full_name: "Ravi Renamed", phone: "9876543210" }], { updateOnMatch: true });
    assert.equal(res.inserted, 0);
    assert.equal(res.updated, 1);
    assert.equal(await p.count(patients, null), 1);
    const { rows } = await p.browse(patients, null, { all: true });
    assert.equal(rows[0].full_name, "Ravi Renamed");
  });

  it("skips on matching unique key when updateOnMatch is false", async () => {
    const p = getProvider();
    const patients = getModule("patients")!;
    await p.upsertRows(patients, null, [{ full_name: "A", phone: "1111111111" }], { updateOnMatch: true });
    const res = await p.upsertRows(patients, null, [{ full_name: "B", phone: "1111111111" }], { updateOnMatch: false });
    assert.equal(res.skipped, 1);
    assert.equal(await p.count(patients, null), 1);
  });

  it("supports search, filter, sort and pagination", async () => {
    const p = getProvider();
    const patients = getModule("patients")!;
    await p.upsertRows(patients, null, [
      { full_name: "Alpha", phone: "1000000001", age: 20 },
      { full_name: "Beta", phone: "1000000002", age: 40 },
      { full_name: "Gamma", phone: "1000000003", age: 60 },
    ], { updateOnMatch: true });

    const search = await p.browse(patients, null, { search: "beta", all: true });
    assert.equal(search.total, 1);

    const filtered = await p.browse(patients, null, { filters: { age: 40 }, all: true });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.rows[0].full_name, "Beta");

    const sorted = await p.browse(patients, null, { sort: { column: "age", asc: true }, all: true });
    assert.equal(sorted.rows[0].age, 20);
    assert.equal(sorted.rows[2].age, 60);

    const page1 = await p.browse(patients, null, { page: 1, pageSize: 2 });
    assert.equal(page1.rows.length, 2);
    assert.equal(page1.total, 3);
  });

  it("deletes by id", async () => {
    const p = getProvider();
    const patients = getModule("patients")!;
    await p.upsertRows(patients, null, [{ full_name: "A", phone: "1000000001" }], { updateOnMatch: true });
    const { rows } = await p.browse(patients, null, { all: true });
    assert.equal(rows.length, 1);
    const n = await p.deleteById(patients, null, [String(rows[0].id)]);
    assert.equal(n, 1);
    assert.equal(await p.count(patients, null), 0);
  });

  it("round-trips boolean and string-array types", async () => {
    const p = getProvider();
    const medicines = getModule("medicines")!;
    await p.upsertRows(medicines, null, [
      { item_code: "MED-1", name: "Paracetamol", expiry_tracking: true, gst_percent: 12 },
    ], { updateOnMatch: true });
    const { rows } = await p.browse(medicines, null, { all: true });
    assert.equal(rows[0].expiry_tracking, true);
    assert.equal(rows[0].gst_percent, 12);

    const doctors = getModule("doctors")!;
    await p.upsertRows(doctors, null, [
      { name: "Dr. Test", qualifications: ["MBBS", "MD"], experience_years: 10 },
    ], { updateOnMatch: true });
    const dRows = await p.browse(doctors, null, { all: true });
    assert.deepEqual(dRows.rows[0].qualifications, ["MBBS", "MD"]);
  });

  it("filters by hospital_id for tenant-scoped modules", async () => {
    const p = getProvider();
    const insurance = getModule("insurance")!; // tenantScoped: true
    await p.upsertRows(insurance, "h1", [{ provider_code: "P1", provider_name: "One" }], { updateOnMatch: true });
    await p.upsertRows(insurance, "h2", [{ provider_code: "P2", provider_name: "Two" }], { updateOnMatch: true });

    assert.equal(await p.count(insurance, "h1"), 1);
    assert.equal(await p.count(insurance, "h2"), 1);
    const { rows } = await p.browse(insurance, "h1", { all: true });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider_name, "One");
  });

  it("handles config modules (datahub_config_rows)", async () => {
    const p = getProvider();
    const specialties = getModule("specialties")!; // source: config
    await p.upsertRows(specialties, null, [
      { name: "Cardiology", description: "Heart" },
      { name: "Neurology" },
    ], { updateOnMatch: true });

    assert.equal(await p.count(specialties, null), 2);
    const { rows } = await p.browse(specialties, null, { all: true });
    assert.equal(rows.length, 2);
    const cardio = rows.find((r) => r.name === "Cardiology");
    assert.ok(cardio);
    assert.equal(cardio.description, "Heart");

    // update-on-match by ref_key
    const res = await p.upsertRows(specialties, null, [
      { name: "Cardiology", description: "Updated" },
    ], { updateOnMatch: true });
    assert.equal(res.updated, 1);
    const after = await p.browse(specialties, null, { all: true });
    assert.equal(after.rows.find((r) => r.name === "Cardiology")?.description, "Updated");
  });
});
