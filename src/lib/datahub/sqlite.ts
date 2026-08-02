/**
 * SQLite data provider for the DataHub engine.
 *
 * Implements the generic `DataProvider` interface over Node's built-in
 * `node:sqlite` (`DatabaseSync`) — zero additional dependencies, native,
 * synchronous, ACID. This is the foundation of **Standalone Local Mode** and
 * the local half of **Hybrid Mode**.
 *
 * Rows are keyed by registry field-key (as with the Supabase provider) and
 * translated to/from columns internally. All SQL is parameterized.
 *
 * NOTE: `node:sqlite` is experimental in Node. It requires Node >= 22.5 and
 * is available on the pinned runtime (v24). It is server-side only.
 */

import { DatabaseSync } from "node:sqlite";
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
// Type <-> column mapping
// ---------------------------------------------------------------------------

function sqliteType(f: DataField): string {
  switch (f.type) {
    case "integer":
      return "INTEGER";
    case "number":
      return "REAL";
    case "boolean":
      return "INTEGER";
    default:
      return "TEXT"; // string/text/email/phone/enum/date/datetime/string_array
  }
}

/** Encode a registry value for storage. */
function encodeValue(f: DataField, v: unknown): unknown {
  if (v === undefined || v === null) return null;
  switch (f.type) {
    case "boolean":
      return v ? 1 : 0;
    case "string_array":
      return JSON.stringify(v);
    default:
      return v;
  }
}

/** Decode a stored value back to a registry value. */
function decodeValue(f: DataField, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  switch (f.type) {
    case "boolean":
      return Boolean(v);
    case "string_array": {
      if (typeof v !== "string") return v;
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : v;
      } catch {
        return v;
      }
    }
    default:
      return v;
  }
}

/** Quote an identifier safely. */
function qid(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** Non-system, importable fields of a module (the columns we persist). */
function dataColumns(module: DataModule): DataField[] {
  return module.fields.filter((f) => !f.system && f.importable !== false);
}

/**
 * Build the CREATE TABLE for a table shared by one or more modules.
 * Columns are the union of every module's data columns (some modules share a
 * backing table, e.g. medicines + inventory both use inventory_items).
 */
function createTableSql(modules: DataModule[]): string {
  const seen = new Map<string, DataField>();
  for (const mod of modules) {
    for (const f of dataColumns(mod)) {
      if (!seen.has(f.column)) seen.set(f.column, f);
    }
  }
  const cols = [...seen.values()].map((f) => `${qid(f.column)} ${sqliteType(f)}`);
  const base = [
    `id TEXT PRIMARY KEY`,
    `hospital_id TEXT`,
    ...cols,
    `created_at TEXT`,
    `updated_at TEXT`,
  ];
  const table = modules[0].table;
  return `CREATE TABLE IF NOT EXISTS ${qid(table)} (${base.join(", ")})`;
}

const CONFIG_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ${qid(
  configModuleTable
)} (
  id TEXT PRIMARY KEY,
  hospital_id TEXT,
  module_key TEXT,
  ref_key TEXT,
  data TEXT,
  created_at TEXT,
  updated_at TEXT
)`;

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

class SqliteBackend {
  private db: DatabaseSync;

  constructor(path?: string) {
    this.db = new DatabaseSync(path || ":memory:");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(CONFIG_TABLE_SQL);
    const byTable = new Map<string, DataModule[]>();
    for (const mod of getAllModules()) {
      const list = byTable.get(mod.table) || [];
      list.push(mod);
      byTable.set(mod.table, list);
    }
    for (const modules of byTable.values()) {
      this.db.exec(createTableSql(modules));
    }
  }

  close(): void {
    this.db.close();
  }

  /** Run statements in a single transaction (manual BEGIN/COMMIT/ROLLBACK). */
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  // -- config module helpers -------------------------------------------------

  private configWhere(
    module: DataModule,
    hospitalId: string | null,
    prefix = ""
  ): { where: string; params: unknown[] } {
    const where = `${prefix}module_key = ?`;
    const params: unknown[] = [module.configModuleKey];
    if (hospitalId) {
      return { where: `${where} AND ${prefix}hospital_id = ?`, params: [...params, hospitalId] };
    }
    return { where, params };
  }

  // -- db module: column name <-> field key ----------------------------------

  private fieldForColumn(module: DataModule, column: string): DataField | null {
    return module.fields.find((f) => f.column === column) ?? null;
  }

  private rowToRecord(
    module: DataModule,
    row: Record<string, unknown>
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of module.fields) {
      out[f.key] = decodeValue(f, row[f.column]);
    }
    out.id = row.id;
    return out;
  }

  private existingKeysMap(
    module: DataModule,
    hospitalId: string | null
  ): Map<string, string> {
    const map = new Map<string, string>();
    if (module.source === "config") {
      const { where, params } = this.configWhere(module, hospitalId);
      const rows = this.db
        .prepare(`SELECT id, ref_key FROM ${qid(configModuleTable)} WHERE ${where}`)
        .all(...params) as Record<string, unknown>[];
      for (const r of rows) {
        if (r.ref_key) map.set(String(r.ref_key), String(r.id));
      }
      return map;
    }
    const uniqueCols = module.uniqueKeys
      .map((k) => getField(module, k)?.column)
      .filter((c): c is string => Boolean(c));
    if (!uniqueCols.length) return map;
    const where: string[] = [];
    const params: unknown[] = [];
    if (module.tenantScoped && hospitalId) {
      where.push("hospital_id = ?");
      params.push(hospitalId);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const cols = [...uniqueCols, "id"].map(qid).join(", ");
    const rows = this.db
      .prepare(`SELECT ${cols} FROM ${qid(module.table)} ${whereSql}`)
      .all(...params) as Record<string, unknown>[];
    for (const r of rows) {
      const key = uniqueCols.map((c) => String(r[c] ?? "")).join("|");
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
    const searchable = dataColumns(module).filter(
      (f) => f.type === "string" || f.type === "text" || f.type === "email" || f.type === "phone"
    );
    const searchCols = searchable.slice(0, 6).map((f) => f.column);

    const colNames = query.columns?.length
      ? query.columns
          .map((k) => getField(module, k)?.column)
          .filter((c): c is string => Boolean(c))
      : dataColumns(module).map((f) => f.column);
    const columns = [...new Set([...colNames, "id"])];

    const where: string[] = [];
    const params: unknown[] = [];
    if (module.tenantScoped && hospitalId) {
      where.push("hospital_id = ?");
      params.push(hospitalId);
    }
    if (query.filters) {
      for (const [key, value] of Object.entries(query.filters)) {
        const f = getField(module, key);
        if (!f || value === undefined || value === null || value === "") continue;
        where.push(`${qid(f.column)} = ?`);
        params.push(encodeValue(f, value));
      }
    }
    if (query.search?.trim() && searchCols.length) {
      const term = query.search.trim();
      where.push(`(${searchCols.map((c) => `${qid(c)} LIKE ?`).join(" OR ")})`);
      for (let i = 0; i < searchCols.length; i++) params.push(`%${term}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS n FROM ${qid(module.table)} ${whereSql}`)
      .get(...params) as { n: number };
    const total = Number(countRow.n);

    const sortField = query.sort?.column
      ? getField(module, query.sort.column)
      : null;
    const sortCol =
      (sortField && sortField.column) ||
      (module.titleField && getField(module, module.titleField)?.column) ||
      "created_at";
    const asc = query.sort ? query.sort.asc : false;
    let sql = `SELECT ${columns.map(qid).join(", ")} FROM ${qid(module.table)} ${whereSql} ORDER BY ${qid(sortCol)} ${asc ? "ASC" : "DESC"}`;

    const selectParams = [...params];
    if (!query.all) {
      const page = query.page && query.page > 0 ? query.page : 1;
      const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 25;
      sql += " LIMIT ? OFFSET ?";
      selectParams.push(pageSize, (page - 1) * pageSize);
    } else {
      sql += " LIMIT ?";
      selectParams.push(100000);
    }

    const rows = (this.db.prepare(sql).all(...selectParams) as Record<string, unknown>[]).map(
      (r) => this.rowToRecord(module, r)
    );
    return { rows, total };
  }

  private browseConfig(
    module: DataModule,
    hospitalId: string | null,
    query: BrowseQuery
  ): { rows: Record<string, unknown>[]; total: number } {
    const { where, params } = this.configWhere(module, hospitalId);
    const raw = this.db
      .prepare(
        `SELECT id, ref_key, data FROM ${qid(configModuleTable)} WHERE ${where}`
      )
      .all(...params) as Record<string, unknown>[];

    let rows: Record<string, unknown>[] = raw.map((r) => {
      let data: Record<string, unknown> = {};
      if (typeof r.data === "string") {
        try {
          data = JSON.parse(r.data) as Record<string, unknown>;
        } catch {
          data = {};
        }
      } else if (r.data && typeof r.data === "object") {
        data = r.data as Record<string, unknown>;
      }
      return { ...data, id: r.id, ref_key: r.ref_key };
    });

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
    if (query.columns?.length) {
      rows = rows.map((r) => {
        const subset: Record<string, unknown> = { id: r.id, ref_key: r.ref_key };
        for (const k of query.columns!) subset[k] = r[k];
        return subset;
      });
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

  private upsertConfig(
    module: DataModule,
    hospitalId: string | null,
    rows: Record<string, unknown>[],
    opts: UpsertOptions
  ): UpsertResult {
    const byRef = this.existingKeysMap(module, hospitalId);
    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; data: string }[] = [];
    let skipped = 0;

    for (const record of rows) {
      const refValue = String(record[module.uniqueKeys[0]] ?? "").trim();
      const refKey = slugify(refValue || String(record.id || "")) || randomUUID();
      const existingId = refValue ? byRef.get(refKey) : undefined;
      if (existingId !== undefined) {
        if (opts.updateOnMatch) toUpdate.push({ id: existingId, data: JSON.stringify(record) });
        else skipped++;
        continue;
      }
      toInsert.push({
        id: String(record.id ?? randomUUID()),
        ...(hospitalId ? { hospital_id: hospitalId } : {}),
        module_key: module.configModuleKey,
        ref_key: refKey,
        data: JSON.stringify(record),
      });
    }

    const failures: UpsertResult["failures"] = [];
    let inserted = 0;
    let updated = 0;
    const now = nowIso();

    for (const row of toInsert) {
      try {
        this.db
          .prepare(
            `INSERT INTO ${qid(configModuleTable)} (id, hospital_id, module_key, ref_key, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(row.id, row.hospital_id ?? null, row.module_key, row.ref_key, row.data, now, now);
        inserted++;
      } catch (e) {
        failures.push({ index: -1, message: e instanceof Error ? e.message : "Insert failed" });
      }
    }
    for (const row of toUpdate) {
      try {
        this.db
          .prepare(`UPDATE ${qid(configModuleTable)} SET data = ?, updated_at = ? WHERE id = ?`)
          .run(row.data, now, row.id);
        updated++;
      } catch (e) {
        failures.push({ index: -1, message: e instanceof Error ? e.message : "Update failed" });
      }
    }
    return { inserted, updated, skipped, failures };
  }

  private upsertDb(
    module: DataModule,
    hospitalId: string | null,
    rows: Record<string, unknown>[],
    opts: UpsertOptions
  ): UpsertResult {
    const byKey = this.existingKeysMap(module, hospitalId);
    const fields = dataColumns(module);
    const failures: UpsertResult["failures"] = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const now = nowIso();

    for (const record of rows) {
      const key = recordUniqueKey(module, record);
      const existingId = key ? byKey.get(key) : undefined;

      if (existingId !== undefined) {
        if (!opts.updateOnMatch) {
          skipped++;
          continue;
        }
        const sets: string[] = ["updated_at = ?"];
        const vals: unknown[] = [now];
        for (const f of fields) {
          if (record[f.key] === undefined || record[f.key] === null || record[f.key] === "") continue;
          sets.push(`${qid(f.column)} = ?`);
          vals.push(encodeValue(f, record[f.key]));
        }
        vals.push(existingId);
        try {
          this.db
            .prepare(`UPDATE ${qid(module.table)} SET ${sets.join(", ")} WHERE id = ?`)
            .run(...vals);
          updated++;
        } catch (e) {
          failures.push({ index: -1, message: e instanceof Error ? e.message : "Update failed" });
        }
        continue;
      }

      const colNames: string[] = ["id", "created_at", "updated_at"];
      const colVals: unknown[] = [String(record.id ?? randomUUID()), now, now];
      if (module.tenantScoped && hospitalId) {
        colNames.push("hospital_id");
        colVals.push(hospitalId);
      }
      for (const f of fields) {
        const v = record[f.key];
        if (v === undefined || v === null || v === "") continue;
        colNames.push(f.column);
        colVals.push(encodeValue(f, v));
      }
      try {
        this.db
          .prepare(
            `INSERT INTO ${qid(module.table)} (${colNames.map(qid).join(", ")}) VALUES (${colNames.map(() => "?").join(", ")})`
          )
          .run(...colVals);
        inserted++;
      } catch (e) {
        failures.push({ index: -1, message: e instanceof Error ? e.message : "Insert failed" });
      }
    }
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
        if (module.source === "config") {
          const { where, params } = this.configWhere(module, hospitalId);
          const r = this.db
            .prepare(`SELECT COUNT(*) AS n FROM ${qid(configModuleTable)} WHERE ${where}`)
            .get(...params) as { n: number };
          return Number(r.n);
        }
        const where: string[] = [];
        const params: unknown[] = [];
        if (module.tenantScoped && hospitalId) {
          where.push("hospital_id = ?");
          params.push(hospitalId);
        }
        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const r = this.db
          .prepare(`SELECT COUNT(*) AS n FROM ${qid(module.table)} ${whereSql}`)
          .get(...params) as { n: number };
        return Number(r.n);
      },

      browse: async (module, hospitalId, query) => {
        return module.source === "config"
          ? this.browseConfig(module, hospitalId, query)
          : this.browseDb(module, hospitalId, query);
      },

      upsertRows: async (module, hospitalId, rows, opts) => {
        return module.source === "config"
          ? this.upsertConfig(module, hospitalId, rows, opts)
          : this.upsertDb(module, hospitalId, rows, opts);
      },

      deleteById: async (module, hospitalId, ids) => {
        if (!ids.length) return 0;
        const placeholders = ids.map(() => "?").join(", ");
        if (module.source === "config") {
          let where = `id IN (${placeholders})`;
          const params: unknown[] = [...ids];
          if (hospitalId) {
            where += " AND hospital_id = ?";
            params.push(hospitalId);
          }
          const r = this.db
            .prepare(`DELETE FROM ${qid(configModuleTable)} WHERE ${where}`)
            .run(...params);
          return Number(r.changes);
        }
        let where = `id IN (${placeholders})`;
        const params: unknown[] = [...ids];
        if (module.tenantScoped && hospitalId) {
          where += " AND hospital_id = ?";
          params.push(hospitalId);
        }
        const r = this.db
          .prepare(`DELETE FROM ${qid(module.table)} WHERE ${where}`)
          .run(...params);
        return Number(r.changes);
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
// Instance cache + factory
// ---------------------------------------------------------------------------

const instances = new Map<string, SqliteBackend>();

/** Open (and cache) a SQLite backend. Use ":memory:" or a temp path in tests. */
export function sqliteProvider(opts?: { path?: string }): DataProvider {
  const path = opts?.path || ":memory:";
  let backend = instances.get(path);
  if (!backend) {
    backend = new SqliteBackend(path);
    instances.set(path, backend);
  }
  return backend.provider();
}

/** Close a cached SQLite backend (mainly for tests). */
export function closeSqliteProvider(path?: string): void {
  const p = path || ":memory:";
  const backend = instances.get(p);
  if (backend) {
    backend.close();
    instances.delete(p);
  }
}

/** Reset the instance cache (tests). */
export function resetSqliteProviders(): void {
  for (const [, b] of instances) {
    try {
      b.close();
    } catch {
      /* ignore */
    }
  }
  instances.clear();
}
