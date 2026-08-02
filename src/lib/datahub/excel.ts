/**
 * Excel workbook data provider for the DataHub engine.
 *
 * Implements the generic `DataProvider` interface over a SheetJS `.xlsx`
 * workbook. Intended ONLY for small / single-user pharmacies — see
 * PHARMACY_OFFLINE_ARCHITECTURE.md §4. Not safe for concurrent multi-user
 * writes; a single-flight write lock serializes writes within one process and
 * every write uses atomic temp-file replacement so a crash cannot corrupt the
 * live workbook.
 *
 * Worksheet structure mirrors the pharmacy workbook spec:
 *   Medicines, Inventory, Batches, Patients, Customers, Suppliers, Purchases,
 *   PurchaseItems, Sales, SaleItems, Payments, Returns, Settings, AuditLog,
 *   plus one sheet per DataHub registry module and a datahub_config_rows sheet.
 */

import * as XLSX from "xlsx";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { DataField, DataModule } from "./types";
import {
  configModuleTable,
  getAllModules,
  getField,
  recordUniqueKey,
} from "./registry";
import type {
  BrowseQuery,
  DataProvider,
  UpsertOptions,
  UpsertResult,
} from "./provider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encodeCell(f: DataField, v: unknown): unknown {
  if (v === undefined || v === null) return "";
  switch (f.type) {
    case "boolean":
      return v ? "true" : "false";
    case "string_array":
      return Array.isArray(v) ? v.join(";") : String(v);
    default:
      return v;
  }
}

function decodeCell(f: DataField, v: unknown): unknown {
  if (v === undefined || v === null || v === "") return null;
  switch (f.type) {
    case "boolean":
      return String(v).toLowerCase() === "true";
    case "string_array": {
      const s = String(v);
      return s.split(";").map((p) => p.trim()).filter(Boolean);
    }
    case "number":
      return typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
    case "integer":
      return Math.round(Number(String(v).replace(/[^\d.-]/g, "")));
    default:
      return v;
  }
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\[\]*?:/\\]/g, "_").slice(0, 31);
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

type RowMap = Record<string, unknown>;

class ExcelBackend {
  private filePath: string;
  private wb: XLSX.WorkBook;
  private writeLock: Promise<void> = Promise.resolve();
  private readonly metaCols = ["id", "_created_at", "_updated_at", "_deleted"];

  constructor(filePath: string) {
    this.filePath = filePath;
    this.wb = this.loadOrCreate();
    this.ensureSchema();
  }

  private loadOrCreate(): XLSX.WorkBook {
    if (existsSync(this.filePath)) {
      try {
        const buf = readFileSync(this.filePath);
        // Integrity gate: a real .xlsx is a ZIP (PK\x03\x04); legacy .xls is an
        // OLE compound file (D0 CF 11 E0). Anything else is corrupt/garbage —
        // never silently overwrite it.
        const magic = buf.subarray(0, 4);
        const isZip =
          magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04;
        const isOle =
          buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
        if (!isZip && !isOle) {
          throw new Error(
            "File is corrupt or not a valid Excel workbook — refusing to overwrite."
          );
        }
        const wb = XLSX.read(buf, { type: "buffer" });
        if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
          throw new Error("Workbook is corrupt or empty — refusing to overwrite.");
        }
        return wb;
      } catch (e) {
        // Attempt a recovery copy before failing loudly.
        try {
          const backup = `${this.filePath}.bak-${Date.now()}`;
          renameSync(this.filePath, backup);
          console.warn(`[excel-provider] moved unreadable workbook to ${backup}`);
        } catch {
          /* ignore */
        }
        throw e;
      }
    }
    return XLSX.utils.book_new();
  }

  private ensureSchema(): void {
    for (const mod of getAllModules()) {
      this.ensureSheet(mod.table);
    }
    this.ensureSheet(configModuleTable);
  }

  /** Ensure a worksheet exists with the expected header row. */
  private ensureSheet(table: string): void {
    const name = sanitizeSheetName(table);
    if (this.wb.Sheets[name]) {
      // Validate headers so we never silently use a mis-structured sheet.
      const headers = this.readHeaderRow(name);
      const expected =
        table === configModuleTable
          ? this.configHeader()
          : this.headerForTable(table);
      if (expected.length && headers.length && headers.join(",") !== expected.join(",")) {
        throw new Error(
          `Worksheet "${name}" headers do not match the expected schema — refusing to write.`
        );
      }
      return;
    }
    const aoa: unknown[][] = [this.headerForTable(table)];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = aoa[0].map(() => ({ wch: 18 }));
    this.wb.Sheets[name] = ws;
    if (!this.wb.SheetNames.includes(name)) this.wb.SheetNames.push(name);
    this.persistSync();
  }

  private headerForTable(table: string): string[] {
    if (table === configModuleTable) return this.configHeader();
    const modules = getAllModules().filter((m) => m.table === table);
    if (!modules.length) return this.metaCols;
    // Union of labels across every module sharing this table (e.g. medicines +
    // inventory both use inventory_items).
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const mod of modules) {
      for (const f of this.dataColumns(mod)) {
        if (!seen.has(f.label)) {
          seen.add(f.label);
          labels.push(f.label);
        }
      }
    }
    return [...this.metaCols, ...labels];
  }

  private configHeader(): string[] {
    return ["id", "hospital_id", "module_key", "ref_key", "data"];
  }

  private dataColumns(module: DataModule): DataField[] {
    return module.fields.filter((f) => !f.system && f.importable !== false);
  }

  private readHeaderRow(sheet: string): string[] {
    const ws = this.wb.Sheets[sheet];
    if (!ws) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    if (!rows.length) return [];
    return (rows[0] || []).map((h) => String(h ?? "").trim());
  }

  /** Read a worksheet as array-of-objects keyed by header. */
  private readRows(sheet: string): RowMap[] {
    const ws = this.wb.Sheets[sheet];
    if (!ws) return [];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    if (!aoa.length) return [];
    const headers = (aoa[0] || []).map((h) => String(h ?? "").trim());
    const out: RowMap[] = [];
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i];
      if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;
      const obj: RowMap = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx];
      });
      out.push(obj);
    }
    return out;
  }

  private persistSync(): void {
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, XLSX.write(this.wb, { bookType: "xlsx", type: "buffer" }));
    renameSync(tmp, this.filePath);
  }

  private async persist(): Promise<void> {
    this.persistSync();
  }

  private writeRows(sheet: string, rows: RowMap[]): void {
    const headers = this.readHeaderRow(sheet);
    const aoa: unknown[][] = [
      headers,
      ...rows.map((r) => headers.map((h) => r[h] ?? "")),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = headers.map(() => ({ wch: 18 }));
    this.wb.Sheets[sheet] = ws;
    this.wb.Sheets[sheet]["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length, c: Math.max(0, headers.length - 1) },
    });
  }

  // -- db module: row map <-> field-key record -------------------------------

  private rowMapToRecord(
    module: DataModule,
    row: RowMap
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const labelToField = new Map<string, DataField>();
    for (const f of this.dataColumns(module)) labelToField.set(f.label, f);
    for (const [label, value] of Object.entries(row)) {
      const f = labelToField.get(label);
      if (f) out[f.key] = decodeCell(f, value);
    }
    out.id = row.id ?? undefined;
    return out;
  }

  private recordToRowMap(module: DataModule, record: Record<string, unknown>): RowMap {
    const row: RowMap = {
      id: String(record.id ?? randomUUID()),
      _created_at: record._created_at ?? nowIso(),
      _updated_at: nowIso(),
      _deleted: record._deleted ?? false,
    };
    for (const f of this.dataColumns(module)) {
      const v = record[f.key];
      if (v !== undefined && v !== null && v !== "") {
        row[f.label] = encodeCell(f, v);
      }
    }
    return row;
  }

  private configRowToRecord(row: RowMap): Record<string, unknown> {
    let data: Record<string, unknown> = {};
    if (typeof row.data === "string") {
      try {
        data = JSON.parse(row.data) as Record<string, unknown>;
      } catch {
        data = {};
      }
    }
    return { ...data, id: row.id, ref_key: row.ref_key };
  }

  private existingKeysMap(module: DataModule, hospitalId: string | null): Map<string, string> {
    const map = new Map<string, string>();
    const sheet = sanitizeSheetName(module.table);
    const rows = this.readRows(sheet);
    if (module.source === "config") {
      for (const r of rows) {
        if (r.module_key !== module.configModuleKey) continue;
        if (hospitalId && r.hospital_id !== hospitalId) continue;
        if (r.ref_key) map.set(String(r.ref_key), String(r.id));
      }
      return map;
    }
    const uniqueKeys = module.uniqueKeys
      .map((k) => getField(module, k))
      .filter((f): f is DataField => Boolean(f));
    if (!uniqueKeys.length) return map;
    for (const r of rows) {
      if (module.tenantScoped && hospitalId && r.hospital_id !== hospitalId) continue;
      const record = this.rowMapToRecord(module, r);
      const key = uniqueKeys.map((f) => String(record[f.key] ?? "")).join("|");
      if (key) map.set(key, String(r.id));
    }
    return map;
  }

  // -- browse -----------------------------------------------------------------

  private browseDb(
    module: DataModule,
    hospitalId: string | null,
    query: BrowseQuery
  ): { rows: Record<string, unknown>[]; total: number } {
    const sheet = sanitizeSheetName(module.table);
    let records: Record<string, unknown>[] = this.readRows(sheet)
      .map((r) => this.rowMapToRecord(module, r))
      .filter((r) => !r._deleted);

    if (module.tenantScoped && hospitalId) {
      records = records.filter((r) => r.hospital_id === hospitalId);
    }
    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        if (value === undefined || value === null || value === "") continue;
        records = records.filter((r) => r[key] === value);
      }
    }
    if (query.search?.trim()) {
      const term = query.search.trim().toLowerCase();
      records = records.filter((r) =>
        Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(term))
      );
    }
    if (query.columns?.length) {
      records = records.map((r) => {
        const subset: Record<string, unknown> = { id: r.id };
        for (const k of query.columns!) subset[k] = r[k];
        return subset;
      });
    }
    const sortField = query.sort?.column
      ? getField(module, query.sort.column)
      : null;
    const sortCol =
      (sortField && sortField.key) ||
      (module.titleField && getField(module, module.titleField)?.key) ||
      "_created_at";
    const asc = query.sort ? query.sort.asc : true;
    records.sort((a, b) => {
      const av = String(a[sortCol] ?? "");
      const bv = String(b[sortCol] ?? "");
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    const total = records.length;
    if (!query.all) {
      const page = query.page && query.page > 0 ? query.page : 1;
      const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 25;
      records = records.slice((page - 1) * pageSize, page * pageSize);
    }
    return { rows: records, total };
  }

  private browseConfig(
    module: DataModule,
    hospitalId: string | null,
    query: BrowseQuery
  ): { rows: Record<string, unknown>[]; total: number } {
    const sheet = sanitizeSheetName(module.table);
    let rows: Record<string, unknown>[] = this.readRows(sheet)
      .filter((r) => r.module_key === module.configModuleKey)
      .map((r) => this.configRowToRecord(r));
    if (hospitalId) {
      const target = this.readRows(sheet).filter(
        (r) => r.module_key === module.configModuleKey && r.hospital_id === hospitalId
      );
      const ids = new Set(target.map((r) => String(r.id)));
      rows = rows.filter((r) => ids.has(String(r.id)));
    }
    if (query.search?.trim()) {
      const term = query.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(term))
      );
    }
    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        if (value === undefined || value === null || value === "") continue;
        rows = rows.filter((r) => r[key] === value);
      }
    }
    const sortCol = query.sort?.column || module.titleField || "ref_key";
    const asc = query.sort ? query.sort.asc : true;
    rows.sort((a, b) => {
      const av = String(a[sortCol] ?? "");
      const bv = String(b[sortCol] ?? "");
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    const total = rows.length;
    if (!query.all) {
      const page = query.page && query.page > 0 ? query.page : 1;
      const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 25;
      rows = rows.slice((page - 1) * pageSize, page * pageSize);
    }
    return { rows, total };
  }

  // -- upsert -----------------------------------------------------------------

  private upsertDb(
    module: DataModule,
    hospitalId: string | null,
    rows: Record<string, unknown>[],
    opts: UpsertOptions
  ): UpsertResult {
    const sheet = sanitizeSheetName(module.table);
    const all = this.readRows(sheet);
    const byKey = this.existingKeysMap(module, hospitalId);
    const failures: UpsertResult["failures"] = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const now = nowIso();

    const written: RowMap[] = [];
    for (const record of rows) {
      const key = recordUniqueKey(module, record);
      const existingId = key ? byKey.get(key) : undefined;
      if (existingId !== undefined) {
        if (!opts.updateOnMatch) {
          skipped++;
          continue;
        }
        const idx = all.findIndex((r) => String(r.id) === existingId);
        const rowMap = this.recordToRowMap(module, record);
        rowMap.id = existingId;
        rowMap._created_at = idx >= 0 ? all[idx]._created_at : now;
        rowMap._updated_at = now;
        if (idx >= 0) {
          const merged = { ...all[idx] };
          for (const [k, v] of Object.entries(rowMap)) merged[k] = v;
          written.push(merged);
        } else {
          written.push(rowMap);
        }
        updated++;
        continue;
      }
      const rowMap = this.recordToRowMap(module, record);
      if (module.tenantScoped && hospitalId) rowMap.hospital_id = hospitalId;
      written.push(rowMap);
      inserted++;
    }

    // Rebuild sheet: keep rows that were not updated + newly written.
    const kept = all.filter(
      (r) => !written.some((w) => String(w.id) === String(r.id))
    );
    this.writeRows(sheet, [...kept, ...written]);
    this.persistSync();
    return { inserted, updated, skipped, failures };
  }

  private upsertConfig(
    module: DataModule,
    hospitalId: string | null,
    rows: Record<string, unknown>[],
    opts: UpsertOptions
  ): UpsertResult {
    const sheet = sanitizeSheetName(module.table);
    const all = this.readRows(sheet);
    const byRef = this.existingKeysMap(module, hospitalId);
    const failures: UpsertResult["failures"] = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const now = nowIso();

    const written: RowMap[] = [];
    for (const record of rows) {
      const refValue = String(record[module.uniqueKeys[0]] ?? "").trim();
      const refKey = slugify(refValue || String(record.id || "")) || randomUUID();
      const existingId = refValue ? byRef.get(refKey) : undefined;
      if (existingId !== undefined) {
        if (!opts.updateOnMatch) {
          skipped++;
          continue;
        }
        const idx = all.findIndex((r) => String(r.id) === existingId);
        const rowMap: RowMap = {
          id: existingId,
          hospital_id: idx >= 0 ? all[idx].hospital_id : hospitalId ?? "",
          module_key: module.configModuleKey,
          ref_key: refKey,
          data: JSON.stringify(record),
        };
        written.push(rowMap);
        updated++;
        continue;
      }
      written.push({
        id: String(record.id ?? randomUUID()),
        hospital_id: hospitalId ?? "",
        module_key: module.configModuleKey,
        ref_key: refKey,
        data: JSON.stringify(record),
      });
      inserted++;
    }
    void now;

    const kept = all.filter(
      (r) => !written.some((w) => String(w.id) === String(r.id))
    );
    this.writeRows(sheet, [...kept, ...written]);
    this.persistSync();
    return { inserted, updated, skipped, failures };
  }

  // -- DataProvider ----------------------------------------------------------

  provider(): DataProvider {
    const api: DataProvider = {
      listTables: async () => {
        const seen = new Map<string, string>();
        for (const m of getAllModules()) {
          seen.set(m.table, seen.has(m.table) ? seen.get(m.table)! : m.key);
        }
        return [...seen.entries()].map(([table, moduleKey]) => ({ table, moduleKey }));
      },

      count: async (module, hospitalId) => {
        const { rows } =
          module.source === "config"
            ? this.browseConfig(module, hospitalId, { all: true })
            : this.browseDb(module, hospitalId, { all: true });
        return rows.length;
      },

      browse: async (module, hospitalId, query) => {
        if (module.source === "config") return this.browseConfig(module, hospitalId, query);
        return this.browseDb(module, hospitalId, query);
      },

      upsertRows: async (module, hospitalId, rows, opts) => {
        // Serialize writes via the single-flight lock.
        const run = this.writeLock.then(() => {
          const result =
            module.source === "config"
              ? this.upsertConfig(module, hospitalId, rows, opts)
              : this.upsertDb(module, hospitalId, rows, opts);
          return result;
        });
        this.writeLock = run.then(
          () => undefined,
          () => undefined
        );
        return run;
      },

      deleteById: async (module, hospitalId, ids) => {
        const sheet = sanitizeSheetName(module.table);
        const all = this.readRows(sheet);
        const idSet = new Set(ids.map(String));
        let removed = 0;
        const kept = all.filter((r) => {
          if (module.source === "config") {
            if (r.module_key !== module.configModuleKey) return true;
            if (hospitalId && r.hospital_id !== hospitalId) return true;
            if (idSet.has(String(r.id))) {
              removed++;
              return false;
            }
            return true;
          }
          if (module.tenantScoped && hospitalId && r.hospital_id !== hospitalId) return true;
          if (idSet.has(String(r.id))) {
            removed++;
            return false;
          }
          return true;
        });
        this.writeRows(sheet, kept);
        this.persistSync();
        return removed;
      },

      existingKeys: async (module, hospitalId) => {
        return new Set(this.existingKeysMap(module, hospitalId).keys());
      },
    };
    return api;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const instances = new Map<string, ExcelBackend>();

/** Open (and cache) an Excel workbook provider backed by the given file. */
export function excelProvider(opts: { filePath: string }): DataProvider {
  let backend = instances.get(opts.filePath);
  if (!backend) {
    backend = new ExcelBackend(opts.filePath);
    instances.set(opts.filePath, backend);
  }
  return backend.provider();
}

/** Close/reset an Excel provider (mainly for tests). */
export function closeExcelProvider(filePath?: string): void {
  if (filePath) {
    instances.delete(filePath);
    return;
  }
  instances.clear();
}

/** For tests: reset all cached Excel providers. */
export function resetExcelProviders(): void {
  instances.clear();
}
