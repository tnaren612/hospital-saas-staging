/**
 * Shared on-disk SQLite path for offline POS and local sync.
 * Both routes must open the same file; :memory: is not a production sync store.
 * Multi-tenant deployments isolate hospitals with a UUID suffix on that file.
 */

import { getPharmacySqlite, type PharmacySqliteStore } from "./sqlite-store";

const HOSPITAL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pharmacySqlitePath(): string | undefined {
  const raw = process.env.PHARMACY_SQLITE_PATH;
  if (!raw || !raw.trim()) return undefined;
  return raw.trim();
}

/** Only a hospital UUID becomes a file suffix — never "local", never a path. */
export function tenantSqliteKey(hospitalId?: string | null): string | null {
  const raw = (hospitalId || "").trim();
  if (!raw || raw === "local" || raw === "demo") return null;
  if (!HOSPITAL_UUID_RE.test(raw)) return null;
  return raw.toLowerCase();
}

/** Same base path for /offline and /sync; one file per hospital UUID. */
export function pharmacySqlitePathForHospital(
  hospitalId?: string | null
): string | undefined {
  const base = pharmacySqlitePath();
  if (!base) return undefined;
  if (base === ":memory:") return base;
  const tenant = tenantSqliteKey(hospitalId);
  if (!tenant) return base;
  const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
  const dir = slash >= 0 ? base.slice(0, slash + 1) : "";
  const file = slash >= 0 ? base.slice(slash + 1) : base;
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  return `${dir}${stem}-${tenant}${ext}`;
}

/** Local (standalone) mode: no Supabase. `backend=sqlite` must not fork a second DB. */
export function isPharmacyLocalMode(hasSupabase: boolean): boolean {
  return !hasSupabase;
}

export function requirePersistentPharmacySqlitePath(
  path: string | undefined,
  nodeEnv = process.env.NODE_ENV
): string | undefined {
  if (nodeEnv === "production" && (!path || path === ":memory:")) {
    throw new Error(
      "PHARMACY_SQLITE_PATH must point to a persistent file for pharmacy sync"
    );
  }
  return path;
}

export function getSharedPharmacySqlite(
  hospitalId?: string | null
): PharmacySqliteStore {
  const path = requirePersistentPharmacySqlitePath(
    pharmacySqlitePathForHospital(hospitalId)
  );
  return getPharmacySqlite(path);
}
