/**
 * Import engine — parse → map → validate → classify → preview/commit.
 *
 * Pure orchestration on top of the registry, provider, parser and validator.
 * Nothing about specific modules is hardcoded here; behaviour follows the
 * module's field metadata and the tenant's data-management configuration.
 */

import type {
  DataManagementConfig,
  DataModule,
  ImportRow,
  ImportSummary,
  ValidationIssue,
} from "./types";
import type { DataProvider } from "./provider";
import { getImportableFields, recordUniqueKey } from "./registry";
import { parseDataFile } from "./parse";
import { hasErrors, validateRecord } from "./validation";
import { isFormatAllowed, maxUploadBytes } from "./settings";
import { writeDataAudit } from "./audit";

export type ImportEngineInput = {
  module: DataModule;
  hospitalId: string | null;
  provider: DataProvider;
  config: DataManagementConfig;
  file: { name: string; bytes: ArrayBuffer };
  /** Excel column label -> field key. Optional; auto-detected when omitted. */
  mapping?: Record<string, string>;
  mode: "preview" | "commit";
  duplicateMode?: "update" | "skip";
  actor?: { email?: string | null; id?: string | null };
  ipAddress?: string | null;
};

/** Normalize a header/column label for fuzzy matching to field keys/labels. */
export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "");
}

/** Auto-map file headers to module field keys (best-effort). */
export function autoMapHeaders(
  module: DataModule,
  headers: string[]
): Record<string, string> {
  const importable = getImportableFields(module);
  const mapping: Record<string, string> = {};
  const usedFields = new Set<string>();

  for (const header of headers) {
    if (!header.trim()) continue;
    const norm = normalizeHeader(header);
    if (!norm) continue;
    // 1) exact label match
    let field = importable.find(
      (f) => f.label.toLowerCase() === header.trim().toLowerCase()
    );
    // 2) exact key match
    if (!field) field = importable.find((f) => f.key === header.trim());
    // 3) normalized label/key match
    if (!field)
      field = importable.find(
        (f) =>
          normalizeHeader(f.label) === norm || normalizeHeader(f.key) === norm
      );
    if (field && !usedFields.has(field.key)) {
      mapping[header] = field.key;
      usedFields.add(field.key);
    }
  }
  return mapping;
}

/** Build a field-keyed record from a raw row using a column mapping. */
function rowToRecord(
  module: DataModule,
  headers: string[],
  values: string[],
  mapping: Record<string, string>
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i++) {
    const fieldKey = mapping[headers[i]];
    if (!fieldKey || !getImportableFields(module).some((f) => f.key === fieldKey))
      continue;
    record[fieldKey] = values[i] ?? "";
  }
  return record;
}

export async function runImport(input: ImportEngineInput): Promise<ImportSummary> {
  const {
    module,
    hospitalId,
    provider,
    config,
    file,
    mode,
    actor,
    ipAddress,
  } = input;

  const duplicateMode = input.duplicateMode || config.duplicateMode || "update";

  // Format + size guardrails (configurable).
  const format = file.name.split(".").pop()?.toLowerCase() || "";
  if (!isFormatAllowed(config, format)) {
    throw new Error(
      `File format .${format} is not allowed. Allowed: ${config.allowedFormats.join(", ")}.`
    );
  }
  if (file.bytes.byteLength > maxUploadBytes(config)) {
    throw new Error(
      `File exceeds the ${config.maxFileSizeMB} MB upload limit.`
    );
  }

  const parsed = parseDataFile(file.name, file.bytes);
  const appliedMapping = input.mapping || autoMapHeaders(module, parsed.headers);

  const existing = await provider.existingKeys(module, hospitalId);

  const rows: ImportRow[] = [];
  const validationErrors: ValidationIssue[] = [];
  const errorReportRows: Record<string, unknown>[] = [];
  const validRecords: Record<string, unknown>[] = [];
  let invalid = 0;

  parsed.rows.forEach((values, idx) => {
    const rowNumber = idx + 1; // 1-based data row (after header)
    const record = rowToRecord(module, parsed.headers, values, appliedMapping);
    const { issues, record: coerced } = validateRecord(module, record, rowNumber);

    let state: ImportRow["state"];
    if (hasErrors(issues)) {
      state = "invalid";
      invalid++;
      for (const iss of issues) {
        errorReportRows.push({
          Row: rowNumber,
          Column: iss.column,
          Message: iss.message,
          Severity: iss.severity,
        });
      }
    } else {
      const key = recordUniqueKey(module, coerced);
      const isExisting = Boolean(key && existing.has(key));
      if (isExisting) {
        state = duplicateMode === "update" ? "update" : "duplicate";
      } else {
        state = "new";
      }
      validRecords.push(coerced);
    }

    rows.push({ rowNumber, state, record: coerced, issues });
    validationErrors.push(...issues);
  });

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let failed = invalid;

  if (mode === "commit" && validRecords.length) {
    const result = await provider.upsertRows(module, hospitalId, validRecords, {
      updateOnMatch: duplicateMode === "update",
    });
    imported = result.inserted;
    updated = result.updated;
    skipped = result.skipped;
    failed = invalid + result.failures.length;
    // surface DB failures into the error report
    for (const f of result.failures) {
      errorReportRows.push({
        Row: f.index === -1 ? "*" : f.index,
        Column: "*",
        Message: f.message,
        Severity: "error",
      });
    }
  }

  await writeDataAudit({
    action: "import",
    moduleKey: module.key,
    fileName: file.name,
    rowsImported: imported,
    rowsUpdated: updated,
    rowsDuplicates: skipped,
    rowsFailed: failed,
    errors: validationErrors.length,
    userEmail: actor?.email,
    userId: actor?.id,
    ipAddress: ipAddress,
    hospitalId,
    meta: { mode, duplicateMode, committed: mode === "commit" },
  });

  return {
    module: module.key,
    moduleLabel: module.label,
    totalRows: parsed.rows.length,
    imported,
    updated,
    skipped,
    duplicates: skipped,
    failed,
    committed: mode === "commit",
    appliedMapping,
    rows: mode === "preview" ? rows : undefined,
    errorReportRows,
    validationErrors,
  };
}
