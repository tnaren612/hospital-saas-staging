/**
 * Enterprise Pharmacy — Import Wizard core types.
 * Pure, transport-agnostic: the wizard never touches the network or DB, so it
 * is unit-testable and works identically client- or server-side.
 */

/** Source formats the wizard can read. */
export type ImportFormat = "csv" | "json" | "xlsx" | "sql";

/** Which enterprise entity a file imports into. */
export type ImportEntity =
  | "medicine"
  | "sale"
  | "customer"
  | "supplier"
  | "category";

/** A single raw row, keyed by source column header. */
export type ParsedRow = Record<string, unknown>;

/** Result of parsing + previewing a file. */
export type ImportPreview = {
  format: ImportFormat;
  headers: string[];
  rows: ParsedRow[];
  total: number;
  warnings: string[];
};

/** sourceColumn -> targetField */
export type ColumnMapping = Record<string, string>;

export type ImportRowStatus = "ok" | "duplicate" | "error";

export type RowResult = {
  index: number;
  status: ImportRowStatus;
  data?: ParsedRow;
  errors?: string[];
  duplicateOf?: number;
};

export type ImportResult = {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  rows: RowResult[];
  startedAt: string;
  finishedAt: string;
};

/** A reversible mutation produced by a dry-run/apply. */
export type ImportOperation = {
  kind: "insert" | "update" | "delete";
  entity: ImportEntity;
  id?: string;
  /** Row as it exists before the op (used to roll back). */
  before?: ParsedRow | null;
  /** Row as it will exist after the op. */
  after?: ParsedRow;
};

/** A field-level validation rule for an import schema. */
export type ImportFieldRule = {
  field: string;
  label?: string;
  required?: boolean;
  type?: "string" | "number" | "integer" | "boolean" | "date" | "email";
  min?: number;
  max?: number;
  unique?: boolean;
  /** Accepts an array of allowed values. */
  enum?: unknown[];
};

export type ImportSchema = {
  entity: ImportEntity;
  /** Primary key / dedupe field (e.g. sku, batch_number, phone). */
  keyField: string;
  rules: ImportFieldRule[];
};

export type RollbackReport = {
  rolledBack: number;
  failed: number;
  errors: string[];
};

export type ImportLogEntry = {
  id: string;
  ts: string;
  actor: string;
  format: ImportFormat;
  entity: ImportEntity;
  fileName: string;
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  result: ImportResult | null;
};
