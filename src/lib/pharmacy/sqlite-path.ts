/**
 * Shared on-disk SQLite path for offline POS and local sync.
 * Both routes must open the same file; :memory: is not a production sync store.
 */

import { getPharmacySqlite, type PharmacySqliteStore } from "./sqlite-store";

export function pharmacySqlitePath(): string | undefined {
  const raw = process.env.PHARMACY_SQLITE_PATH;
  if (!raw || !raw.trim()) return undefined;
  return raw.trim();
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

export function getSharedPharmacySqlite(): PharmacySqliteStore {
  const path = requirePersistentPharmacySqlitePath(pharmacySqlitePath());
  return getPharmacySqlite(path);
}
