/**
 * Data provider abstraction for the Data Management engine.
 *
 * All data access flows through the `DataProvider` interface so the engine,
 * registry and UI never talk to a specific backend. Today only the Supabase
 * provider is wired (Supabase *is* PostgreSQL); a SQLite provider can be added
 * later for local development without touching any other layer.
 *
 * Rows returned/exchanged are keyed by **registry field key** (not raw DB
 * column), which is what import/export/mapping/UI operate on. db-backed
 * modules translate field key <-> column internally.
 */

import type { DataModule, StorageMode } from "./types";
import {
  configModuleTable,
  getAllModules,
  getField,
  slug,
} from "./registry";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { applyHospitalFilter } from "@/lib/hospital/tenant";
import { sqliteProvider } from "./sqlite";
import { excelProvider } from "./excel";

export type BrowseQuery = {
  search?: string;
  /** Column filters keyed by field key -> exact value. */
  filters?: Record<string, unknown>;
  sort?: { column: string; asc: boolean };
  /** 1-based page (ignored when `all` is true). */
  page?: number;
  pageSize?: number;
  /** Field keys to select (defaults to all non-system). */
  columns?: string[];
  /** When true, ignore pagination and return all matching rows. */
  all?: boolean;
};

export type UpsertOptions = {
  /** When a matching record is found, update it (true) or skip it (false). */
  updateOnMatch: boolean;
};

export type UpsertResult = {
  inserted: number;
  updated: number;
  skipped: number;
  /** Rows that errored at the DB layer: { index, message }. */
  failures: { index: number; message: string }[];
};

export type DataProvider = {
  listTables(): Promise<{ table: string; moduleKey: string }[]>;
  count(module: DataModule, hospitalId: string | null): Promise<number>;
  browse(
    module: DataModule,
    hospitalId: string | null,
    query: BrowseQuery
  ): Promise<{ rows: Record<string, unknown>[]; total: number }>;
  upsertRows(
    module: DataModule,
    hospitalId: string | null,
    rows: Record<string, unknown>[],
    opts: UpsertOptions
  ): Promise<UpsertResult>;
  deleteById(
    module: DataModule,
    hospitalId: string | null,
    ids: string[]
  ): Promise<number>;
  /** Set of unique identity strings already present (for preview dedupe). */
  existingKeys(
    module: DataModule,
    hospitalId: string | null
  ): Promise<Set<string>>;
};

// ---------------------------------------------------------------------------
// Field key <-> column translation helpers (db modules)
// ---------------------------------------------------------------------------

function col(module: DataModule, fieldKey: string): string | null {
  return getField(module, fieldKey)?.column ?? null;
}

/** Map a field-keyed record to a DB insert/update payload (db modules). */
function toDbPayload(module: DataModule, record: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of module.fields) {
    if (field.system || field.importable === false) continue;
    if (record[field.key] === undefined || record[field.key] === null || record[field.key] === "") {
      continue;
    }
    payload[field.column] = record[field.key];
  }
  return payload;
}

/** Map a DB row back to a field-keyed record (db modules). */
function fromDbRow(module: DataModule, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of module.fields) {
    out[field.key] = row[field.column];
  }
  out.id = row.id;
  return out;
}

function isConfig(module: DataModule): boolean {
  return module.source === "config";
}

// ---------------------------------------------------------------------------
// Supabase provider implementation
// ---------------------------------------------------------------------------

/** Service-role client factory (bypasses RLS for trusted admin data ops). */
function sb() {
  return createServiceRoleClient();
}

export async function supabaseProvider(): Promise<DataProvider> {
  /** Fetch the unique-key identity for every existing row of a db module. */
  async function fetchExistingKeys(module: DataModule, hospitalId: string | null) {
    const uniqueCols = module.uniqueKeys
      .map((k) => col(module, k))
      .filter((c): c is string => Boolean(c));
    if (!uniqueCols.length) return new Map<string, string>();
    const select = [...uniqueCols, "id"].join(",");
    let q = sb().from(module.table).select(select).limit(100000);
    if (module.tenantScoped) q = applyHospitalFilter(q, hospitalId);
    const { data } = await q;
    const map = new Map<string, string>();
    for (const row of (data || []) as unknown as Record<string, unknown>[]) {
      const key = uniqueCols.map((c) => String(row[c] ?? "")).join("|");
      if (key) map.set(key, String(row.id));
    }
    return map;
  }

  const provider: DataProvider = {
    async listTables() {
      const seen = new Map<string, string>();
      for (const m of getAllModules()) {
        seen.set(m.table, seen.has(m.table) ? seen.get(m.table)! : m.key);
      }
      return [...seen.entries()].map(([table, moduleKey]) => ({ table, moduleKey }));
    },

    async existingKeys(module, hospitalId) {
      if (isConfig(module)) {
        let q = sb()
          .from(configModuleTable)
          .select("ref_key")
          .eq("module_key", module.configModuleKey);
        if (hospitalId) q = q.eq("hospital_id", hospitalId);
        const { data } = await q;
        return new Set((data || []).map((r) => String(r.ref_key ?? "")));
      }
      const map = await fetchExistingKeys(module, hospitalId);
      return new Set(map.keys());
    },

    async count(module, hospitalId) {
      if (isConfig(module)) {
        let q = sb()
          .from(configModuleTable)
          .select("id", { count: "exact", head: true })
          .eq("module_key", module.configModuleKey);
        if (hospitalId) q = q.eq("hospital_id", hospitalId);
        const { count } = await q;
        return count ?? 0;
      }
      let q = sb()
        .from(module.table)
        .select("id", { count: "exact", head: true });
      if (module.tenantScoped) q = applyHospitalFilter(q, hospitalId);
      const { count } = await q;
      return count ?? 0;
    },

    async browse(module, hospitalId, query) {
      if (isConfig(module)) return browseConfig(module, hospitalId, query);
      return browseDb(module, hospitalId, query);
    },

    async upsertRows(module, hospitalId, rows, opts) {
      if (isConfig(module)) return upsertConfig(module, hospitalId, rows, opts);

      const uniqueCols = module.uniqueKeys
        .map((k) => col(module, k))
        .filter((c): c is string => Boolean(c));
      const existing = await fetchExistingKeys(module, hospitalId);

      const toInsert: Record<string, unknown>[] = [];
      const toUpdate: { id: string; payload: Record<string, unknown> }[] = [];
      const failures: UpsertResult["failures"] = [];
      let skipped = 0;

      rows.forEach((record) => {
        let key = "";
        if (uniqueCols.length) {
          const vals = uniqueCols.map((c) => {
            const field = module.fields.find((f) => f.column === c);
            return String(field ? record[field.key] ?? "" : "");
          });
          key = vals.join("|");
        }
        const existingId = key ? existing.get(key) : undefined;
        if (existingId !== undefined) {
          if (opts.updateOnMatch) {
            toUpdate.push({ id: existingId, payload: toDbPayload(module, record) });
          } else {
            skipped++;
          }
          return;
        }
        toInsert.push(toDbPayload(module, record));
      });

      let inserted = 0;
      let updated = 0;

      if (toInsert.length) {
        const chunks = chunk(toInsert, 100);
        for (const batch of chunks) {
          const payload = module.tenantScoped
            ? batch.map((r) => (hospitalId ? { ...r, hospital_id: hospitalId } : r))
            : batch;
          try {
            const { error } = await sb().from(module.table).insert(payload);
            if (error) {
              failures.push({ index: -1, message: error.message });
            } else {
              inserted += batch.length;
            }
          } catch (e) {
            failures.push({ index: -1, message: e instanceof Error ? e.message : "Insert failed" });
          }
        }
      }

      if (toUpdate.length) {
        for (const u of toUpdate) {
          try {
            const { error } = await sb().from(module.table).update(u.payload).eq("id", u.id);
            if (error) failures.push({ index: -1, message: error.message });
            else updated++;
          } catch (e) {
            failures.push({ index: -1, message: e instanceof Error ? e.message : "Update failed" });
          }
        }
      }

      return { inserted, updated, skipped, failures };
    },

    async deleteById(module, hospitalId, ids) {
      if (!ids.length) return 0;
      if (isConfig(module)) {
        let q = sb().from(configModuleTable).delete().in("id", ids);
        if (hospitalId) q = q.eq("hospital_id", hospitalId);
        const { count } = await q;
        return count ?? 0;
      }
      let q = sb().from(module.table).delete().in("id", ids);
      if (module.tenantScoped) q = applyHospitalFilter(q, hospitalId);
      const { count } = await q;
      return count ?? 0;
    },
  };

  return provider;
}

// ---------------------------------------------------------------------------
// db browse
// ---------------------------------------------------------------------------

async function browseDb(
  module: DataModule,
  hospitalId: string | null,
  query: BrowseQuery
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const searchable = module.fields.filter(
    (f) =>
      !f.system &&
      (f.type === "string" ||
        f.type === "text" ||
        f.type === "email" ||
        f.type === "phone")
  );
  const searchCols = searchable.slice(0, 6).map((f) => f.column);

  const columns = query.columns?.length
    ? query.columns.map((k) => col(module, k)).filter((c): c is string => Boolean(c))
    : module.fields.filter((f) => !f.system).map((f) => f.column);
  const select = [...new Set([...columns, "id"])].join(",");

  const base = sb().from(module.table).select(select, { count: "exact" });
  let q: typeof base = base;
  if (module.tenantScoped) q = applyHospitalFilter(q, hospitalId);

  if (query.filters) {
    for (const [key, value] of Object.entries(query.filters)) {
      const c = col(module, key);
      if (!c || value === undefined || value === null || value === "") continue;
      q = q.eq(c, value);
    }
  }
  if (query.search?.trim()) {
    const term = query.search.trim();
    if (searchCols.length) {
      q = q.or(searchCols.map((c) => `${c}.ilike.%${term}%`).join(","));
    }
  }

  const sortCol =
    (query.sort?.column && col(module, query.sort.column)) ||
    (module.titleField && col(module, module.titleField)) ||
    "created_at";
  const asc = query.sort ? query.sort.asc : false;
  q = q.order(sortCol, { ascending: asc });

  if (!query.all) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 25;
    q = q.range((page - 1) * pageSize, page * pageSize - 1);
  } else {
    q = q.limit(100000);
  }

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  const rows = ((data || []) as unknown as Record<string, unknown>[]).map((r) =>
    fromDbRow(module, r)
  );
  return { rows, total: count ?? rows.length };
}

// ---------------------------------------------------------------------------
// config browse
// ---------------------------------------------------------------------------

async function browseConfig(
  module: DataModule,
  hospitalId: string | null,
  query: BrowseQuery
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  let q = sb()
    .from(configModuleTable)
    .select("*")
    .eq("module_key", module.configModuleKey);
  if (hospitalId) q = q.eq("hospital_id", hospitalId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let rows: Record<string, unknown>[] = ((data || []) as Record<string, unknown>[]).map(
    (r): Record<string, unknown> => {
      const payload = (r.data as Record<string, unknown>) || {};
      return { ...payload, id: r.id, ref_key: r.ref_key };
    }
  );

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

// ---------------------------------------------------------------------------
// config upsert
// ---------------------------------------------------------------------------

async function upsertConfig(
  module: DataModule,
  hospitalId: string | null,
  rows: Record<string, unknown>[],
  opts: UpsertOptions
): Promise<UpsertResult> {
  const refCol = module.uniqueKeys[0];
  let q = sb()
    .from(configModuleTable)
    .select("*")
    .eq("module_key", module.configModuleKey);
  if (hospitalId) q = q.eq("hospital_id", hospitalId);
  const { data: existingRows } = await q;
  const byRef = new Map<string, string>();
  for (const r of (existingRows || []) as Record<string, unknown>[]) {
    if (r.ref_key) byRef.set(String(r.ref_key), String(r.id));
  }

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; data: Record<string, unknown> }[] = [];
  let skipped = 0;
  const failures: UpsertResult["failures"] = [];

  rows.forEach((record) => {
    const refValue = refCol ? String(record[refCol] ?? "").trim() : "";
    const refKey = slug(refValue || String(record.id || "")) || `row-${Math.random().toString(36).slice(2, 8)}`;
    const existingId = refValue ? byRef.get(refKey) : undefined;
    if (existingId !== undefined) {
      if (opts.updateOnMatch) toUpdate.push({ id: existingId, data: record });
      else skipped++;
      return;
    }
    toInsert.push({
      module_key: module.configModuleKey,
      ref_key: refKey,
      data: record,
      ...(hospitalId ? { hospital_id: hospitalId } : {}),
    });
  });

  let inserted = 0;
  let updated = 0;

  if (toInsert.length) {
    for (const batch of chunk(toInsert, 100)) {
      try {
        const { error } = await sb().from(configModuleTable).insert(batch);
        if (error) {
          batch.forEach(() => failures.push({ index: -1, message: error.message }));
        } else inserted += batch.length;
      } catch (e) {
        failures.push({ index: -1, message: e instanceof Error ? e.message : "Insert failed" });
      }
    }
  }
  if (toUpdate.length) {
    for (const u of toUpdate) {
      try {
        const { error } = await sb()
          .from(configModuleTable)
          .update({ data: u.data })
          .eq("id", u.id);
        if (error) failures.push({ index: -1, message: error.message });
        else updated++;
      } catch (e) {
        failures.push({ index: -1, message: e instanceof Error ? e.message : "Update failed" });
      }
    }
  }

  return { inserted, updated, skipped, failures };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

export type ProviderSelectionOpts = {
  /** On-disk path for the SQLite DB (sqlite/hybrid) or Excel workbook (excel). */
  storageFile?: string;
};

/**
 * Select the active `DataProvider` from the configured storage mode.
 * Business logic and UI never choose a backend directly — they go through this
 * factory. `supabase` preserves the original integrated-hospital behavior.
 * `hybrid` uses the local SQLite store as its transactional backend; cloud sync
 * is handled separately by the sync engine (see PHARMACY_OFFLINE_ARCHITECTURE.md).
 */
export async function createDataProvider(
  mode: StorageMode,
  opts?: ProviderSelectionOpts
): Promise<DataProvider> {
  switch (mode) {
    case "sqlite":
      return sqliteProvider({ path: opts?.storageFile || ":memory:" });
    case "hybrid":
      return sqliteProvider({ path: opts?.storageFile || ":memory:" });
    case "excel": {
      const filePath = opts?.storageFile;
      if (!filePath) {
        throw new Error(
          "Excel storage mode requires a workbook file path (storage_file)."
        );
      }
      return excelProvider({ filePath });
    }
    case "supabase":
    default:
      return supabaseProvider();
  }
}
