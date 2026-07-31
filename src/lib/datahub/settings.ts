/**
 * Data Management configuration — defaults and merge.
 *
 * The effective config is stored on the tenant's hospital settings
 * (`data_management`) and merged over these defaults, so new fields /
 * modules / formats can be switched on without code changes.
 */

import type { DataManagementConfig } from "./types";
import { getAllModules } from "./registry";

export const DEFAULT_DATA_MANAGEMENT: DataManagementConfig = {
  enabled: true,
  allowedFormats: ["xlsx", "xls", "csv"],
  maxFileSizeMB: 10,
  duplicateMode: "update",
  modules: {},
  backup: {
    enabled: true,
    scheduleCron: null,
    keepCount: 5,
  },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeConfig(
  base: DataManagementConfig,
  patch?: Partial<DataManagementConfig>
): DataManagementConfig {
  if (!patch) return base;
  const backup = patch.backup || base.backup;
  const modules = { ...base.modules, ...(patch.modules || {}) };
  return {
    enabled: patch.enabled ?? base.enabled,
    allowedFormats: patch.allowedFormats ?? base.allowedFormats,
    maxFileSizeMB: patch.maxFileSizeMB ?? base.maxFileSizeMB,
    duplicateMode: patch.duplicateMode ?? base.duplicateMode,
    modules,
    backup: {
      enabled: backup.enabled ?? base.backup.enabled,
      scheduleCron: backup.scheduleCron ?? base.backup.scheduleCron,
      keepCount: backup.keepCount ?? base.backup.keepCount,
    },
  };
}

/**
 * Resolve a DataManagementConfig from a possibly-partial persisted value,
 * coercing it into the canonical shape. Unknown persisted fields are dropped.
 */
export function resolveDataManagementConfig(
  source?: Partial<DataManagementConfig> | Record<string, unknown> | null
): DataManagementConfig {
  if (!source || !isRecord(source)) return { ...DEFAULT_DATA_MANAGEMENT };

  const patch: Partial<DataManagementConfig> = {
    enabled:
      typeof source.enabled === "boolean"
        ? source.enabled
        : DEFAULT_DATA_MANAGEMENT.enabled,
    allowedFormats: Array.isArray(source.allowedFormats)
      ? (source.allowedFormats as string[])
      : DEFAULT_DATA_MANAGEMENT.allowedFormats,
    maxFileSizeMB:
      typeof source.maxFileSizeMB === "number"
        ? source.maxFileSizeMB
        : DEFAULT_DATA_MANAGEMENT.maxFileSizeMB,
    duplicateMode:
      source.duplicateMode === "skip" || source.duplicateMode === "update"
        ? source.duplicateMode
        : DEFAULT_DATA_MANAGEMENT.duplicateMode,
    modules:
      isRecord(source.modules) && typeof source.modules === "object"
        ? (source.modules as Record<string, boolean>)
        : DEFAULT_DATA_MANAGEMENT.modules,
  };
  if (isRecord(source.backup)) {
    const b = source.backup;
    patch.backup = {
      enabled:
        typeof b.enabled === "boolean"
          ? b.enabled
          : DEFAULT_DATA_MANAGEMENT.backup.enabled,
      scheduleCron:
        typeof b.scheduleCron === "string" && b.scheduleCron
          ? b.scheduleCron
          : null,
      keepCount:
        typeof b.keepCount === "number"
          ? b.keepCount
          : DEFAULT_DATA_MANAGEMENT.backup.keepCount,
    };
  }

  const merged = mergeConfig({ ...DEFAULT_DATA_MANAGEMENT }, patch);

  // Ensure every registered module has an explicit flag for the settings UI.
  for (const m of getAllModules()) {
    if (merged.modules[m.key] === undefined) merged.modules[m.key] = true;
  }
  return merged;
}

/** Enforce allowed file-size limit, returning bytes. */
export function maxUploadBytes(config: DataManagementConfig): number {
  return Math.max(1, config.maxFileSizeMB) * 1024 * 1024;
}

/** Validate a filename's format against allowed formats. */
export function isFormatAllowed(
  config: DataManagementConfig,
  format: string
): boolean {
  return config.allowedFormats.includes(format);
}
