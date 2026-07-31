/**
 * Backup & restore for the Data Management engine.
 *
 * A backup is a structured JSON manifest containing every registered table's
 * records plus an integrity checksum. Restore re-inserts idempotently
 * (upsert on unique keys). Backup metadata is recorded in `datahub_backups`.
 */

import { createHash } from "crypto";
import type { DataModule } from "./types";
import { getAllModules, getModule } from "./registry";
import type { DataProvider } from "./provider";
import { writeDataAudit } from "./audit";

export const BACKUP_VERSION = 1;

export type BackupTable = {
  table: string;
  moduleKey: string;
  rows: Record<string, unknown>[];
};

export type BackupManifest = {
  version: number;
  createdAt: string;
  hospitalId: string | null;
  checksum: string;
  tables: BackupTable[];
};

export type RestoreResult = {
  tables: number;
  restored: number;
  failed: number;
  failures: string[];
};

/** Dump every registered module into a backup manifest. */
export async function createBackup(
  provider: DataProvider,
  hospitalId: string | null
): Promise<BackupManifest> {
  const tables: BackupTable[] = [];
  for (const mod of getAllModules()) {
    try {
      const { rows } = await provider.browse(mod, hospitalId, { all: true });
      tables.push({ table: mod.table, moduleKey: mod.key, rows });
    } catch (e) {
      // Skip modules that fail to read (e.g. table not yet migrated) — non-fatal.
      console.warn("[datahub-backup] skip module", mod.key, e);
    }
  }
  const manifest: BackupManifest = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    hospitalId,
    checksum: "",
    tables,
  };
  manifest.checksum = computeChecksum(canonicalJson(manifest));
  return manifest;
}

export function serializeBackup(manifest: BackupManifest): string {
  return canonicalJson(manifest);
}

export function parseBackup(text: string): BackupManifest {
  const parsed = JSON.parse(text) as BackupManifest;
  if (!parsed || parsed.version !== BACKUP_VERSION || !Array.isArray(parsed.tables)) {
    throw new Error("Unsupported or corrupt backup file.");
  }
  return parsed;
}

/** Canonical, deterministic JSON for checksumming. */
export function canonicalJson(manifest: BackupManifest): string {
  const stable: BackupManifest = {
    version: manifest.version,
    createdAt: manifest.createdAt,
    hospitalId: manifest.hospitalId,
    checksum: "",
    tables: manifest.tables.map((t) => ({
      table: t.table,
      moduleKey: t.moduleKey,
      rows: t.rows.map((r) => sortKeys(r)),
    })),
  };
  return JSON.stringify(stable);
}

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

export function computeChecksum(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Recompute checksum for a manifest text and compare to embedded value. */
export function verifyBackup(
  text: string
): { ok: boolean; expectedChecksum: string; actualChecksum: string } {
  const manifest = parseBackup(text);
  const expected = manifest.checksum;
  const recomputed = computeChecksum(canonicalJson(manifest));
  return {
    ok: recomputed === expected,
    expectedChecksum: expected,
    actualChecksum: recomputed,
  };
}

/** Idempotently restore a manifest's tables. */
export async function restoreBackup(
  provider: DataProvider,
  hospitalId: string | null,
  manifest: BackupManifest
): Promise<RestoreResult> {
  const result: RestoreResult = { tables: 0, restored: 0, failed: 0, failures: [] };
  for (const table of manifest.tables) {
    const mod: DataModule | null = getModule(table.moduleKey);
    if (!mod || !table.rows.length) continue;
    try {
      const r = await provider.upsertRows(mod, hospitalId, table.rows, {
        updateOnMatch: true,
      });
      result.tables++;
      result.restored += r.inserted + r.updated;
      result.failed += r.skipped + r.failures.length;
      for (const f of r.failures) result.failures.push(`${table.moduleKey}: ${f.message}`);
    } catch (e) {
      result.failed++;
      result.failures.push(
        `${table.moduleKey}: ${e instanceof Error ? e.message : "restore failed"}`
      );
    }
  }
  return result;
}

export async function auditBackupAction(opts: {
  action: "backup" | "restore";
  hospitalId?: string | null;
  actor?: { email?: string | null; id?: string | null };
  ipAddress?: string | null;
  fileName?: string;
  rows?: number;
}) {
  await writeDataAudit({
    action: opts.action,
    moduleKey: "*",
    fileName: opts.fileName,
    rowsExported: opts.action === "backup" ? opts.rows ?? 0 : undefined,
    rowsImported: opts.action === "restore" ? opts.rows ?? 0 : undefined,
    userEmail: opts.actor?.email,
    userId: opts.actor?.id,
    ipAddress: opts.ipAddress,
    hospitalId: opts.hospitalId,
    meta: { scope: "full-database" },
  });
}
