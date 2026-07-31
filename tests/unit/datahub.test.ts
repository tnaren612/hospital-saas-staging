import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, sniffFormat, parseDataFile } from "@/lib/datahub/parse";
import { coerceValue, validateRecord } from "@/lib/datahub/validation";
import { runImport, autoMapHeaders } from "@/lib/datahub/import-engine";
import { getModule } from "@/lib/datahub/registry";
import { resolveDataManagementConfig } from "@/lib/datahub/settings";
import type { DataProvider } from "@/lib/datahub/provider";

function csvBytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

function fakeProvider(existingKeys: string[]): DataProvider {
  return {
    listTables: async () => [],
    count: async () => 0,
    browse: async () => ({ rows: [], total: 0 }),
    upsertRows: async () => ({ inserted: 0, updated: 0, skipped: 0, failures: [] }),
    deleteById: async () => 0,
    existingKeys: async () => new Set(existingKeys),
  } as DataProvider;
}

describe("datahub parse", () => {
  it("sniffs formats from filename", () => {
    assert.equal(sniffFormat("x.xlsx"), "xlsx");
    assert.equal(sniffFormat("x.XLS"), "xls");
    assert.equal(sniffFormat("x.csv"), "csv");
    assert.equal(sniffFormat("x.txt"), null);
  });

  it("parses simple CSV", () => {
    const { headers, rows } = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    assert.deepEqual(headers, ["a", "b", "c"]);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], ["1", "2", "3"]);
  });

  it("parses CSV with quoted commas and escaped quotes", () => {
    const { rows } = parseCsv('a,b\n"hello, world",x\n"says ""hi""",y\n');
    assert.deepEqual(rows[0], ["hello, world", "x"]);
    assert.deepEqual(rows[1], ['says "hi"', "y"]);
  });

  it("rejects unsupported formats in parseDataFile", () => {
    assert.throws(() => parseDataFile("x.txt", csvBytes("a\n")), /Unsupported/);
  });
});

describe("datahub validation", () => {
  it("coerces numbers and enums", () => {
    const module = getModule("patients")!;
    const age = module.fields.find((f) => f.key === "age")!;
    const gender = module.fields.find((f) => f.key === "gender")!;
    assert.deepEqual(coerceValue(age, "42"), { value: 42, ok: true });
    assert.equal(coerceValue(age, "abc").ok, false);
    assert.deepEqual(coerceValue(gender, "MALE"), { value: "male", ok: true });
    assert.equal(coerceValue(gender, "unknown").ok, false);
  });

  it("flags missing required fields and bad phones", () => {
    const module = getModule("patients")!;
    const { issues, record } = validateRecord(
      module,
      { phone: "12345" },
      3
    );
    assert.ok(issues.some((i) => i.column === "full_name" && i.severity === "error"));
    assert.ok(issues.some((i) => i.column === "phone" && i.severity === "error"));
    assert.equal(record["full_name"], undefined);
  });
});

describe("datahub import engine", () => {
  it("auto-maps headers to field keys", () => {
    const module = getModule("patients")!;
    const map = autoMapHeaders(module, ["Full Name", "Phone", "Age", "Nope"]);
    assert.equal(map["Full Name"], "full_name");
    assert.equal(map["Phone"], "phone");
    assert.equal(map["Age"], "age");
    assert.equal(map["Nope"], undefined);
  });

  it("classifies preview rows as new / duplicate / invalid", async () => {
    const module = getModule("patients")!;
    const csv = [
      "Full Name,Phone,Age",
      "Existing,9876543210,30",
      "New User,9000000000,25",
      "Bad One,12345,200",
    ].join("\n");

    const summary = await runImport({
      module,
      hospitalId: null,
      provider: fakeProvider(["9876543210"]),
      config: resolveDataManagementConfig({}),
      file: { name: "patients.csv", bytes: csvBytes(csv) },
      mode: "preview",
      duplicateMode: "update",
    });

    assert.equal(summary.totalRows, 3);
    const states = summary.rows!.map((r) => r.state);
    assert.ok(states.includes("update"), "existing unique key -> update");
    assert.ok(states.includes("new"));
    assert.ok(states.includes("invalid"), "bad phone + age -> invalid");
    assert.equal(summary.duplicates, 0);
    assert.ok(summary.errorReportRows.some((r) => String(r.Row) === "3"));
  });

  it("enforces allowed formats and size", async () => {
    const module = getModule("patients")!;
    const config = resolveDataManagementConfig({
      allowedFormats: ["csv"],
      maxFileSizeMB: 1,
    });
    await assert.rejects(
      runImport({
        module,
        hospitalId: null,
        provider: fakeProvider([]),
        config,
        file: { name: "x.xlsx", bytes: csvBytes("a\n") },
        mode: "preview",
      }),
      /not allowed/
    );
  });
});
