/**
 * Data Management & Import/Export Engine — public entry point.
 *
 * Import from "@lib/datahub" to use the engine without reaching into
 * individual modules. All behaviour is registry/config driven.
 */

export * from "./types";
export * from "./registry";
export * from "./provider";
export * from "./parse";
export * from "./validation";
export * from "./settings";
export * from "./audit";
export * from "./mappings";
export * from "./records";

export { runImport, autoMapHeaders, normalizeHeader } from "./import-engine";
export type { ImportEngineInput } from "./import-engine";
export { runExport, exportColumnOptions } from "./export-engine";
export type { ExportEngineInput, ExportFormat, ExportResult } from "./export-engine";
export { buildTemplateWorkbook, templateFilename } from "./templates";
export {
  createBackup,
  parseBackup,
  serializeBackup,
  verifyBackup,
  restoreBackup,
  auditBackupAction,
} from "./backup";
export type { BackupManifest, RestoreResult } from "./backup";
