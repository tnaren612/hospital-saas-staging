/**
 * Data Management & Import/Export Engine — core contracts.
 *
 * Everything in this module is driven by a registry of `DataModule`s
 * (see registry.ts). No mappings, labels, or column lists are hardcoded
 * in the UI or routes — they all resolve through this metadata so the
 * engine stays configurable without code changes.
 */

/** Supported scalar value types for a datahub field. */
export type DataFieldType =
  | "string"
  | "text"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "email"
  | "phone"
  | "enum"
  | "string_array";

/** Describes a single field (DB column) of a data module. */
export type DataField = {
  /** Stable machine key used in mappings (e.g. "full_name"). */
  key: string;
  /** Human-readable header shown in templates, tables and exports. */
  label: string;
  /** Underlying database column name (for db-backed modules). */
  column: string;
  type: DataFieldType;
  /** Columns that must be present / non-empty on import. */
  required?: boolean;
  /** Marks a column that uniquely identifies a record (dedupe/upsert). */
  unique?: boolean;
  /** For enum type — the allowed set of values. */
  options?: string[];
  /** Free-form validation hint shown in templates/settings. */
  note?: string;
  /** System field (id, timestamps) — exportable but not importable. */
  system?: boolean;
  /** Importable on CSV/Excel import (default true). */
  importable?: boolean;
  /** Exportable (default true). */
  exportable?: boolean;
  /** Sample value for template generation. */
  sample?: string | number | boolean;
  /** Numeric bounds (number/integer types). */
  min?: number;
  max?: number;
  /** For string_array — item type hint (used by template generation). */
  arrayItemType?: "string" | "number";
};

export type DataModuleSource = "db" | "config";

/** A registered, importable/exportable data module. */
export type DataModule = {
  key: string;
  label: string;
  description: string;
  source: DataModuleSource;
  /** Supabase table name (db modules) or "datahub_config_rows" (config modules). */
  table: string;
  /** For config modules: the module_key value stored on each row. */
  configModuleKey?: string;
  fields: DataField[];
  /** Field keys that uniquely identify a record for dedupe/upsert. */
  uniqueKeys: string[];
  /** Other modules referenced (foreign key), for relationship display. */
  relationships?: { module: string; field: string }[];
  /** Whether the backing table is tenant-scoped (has hospital_id). */
  tenantScoped?: boolean;
  /** Field key used as the display title for a row (list UI). */
  titleField?: string;
};

export type ValidationSeverity = "error" | "warning";

/** A single validation problem tied to a specific row/column. */
export type ValidationIssue = {
  /** 1-based data-row number in the source file (excluding header). */
  row: number;
  /** Field key (or label) the problem relates to. */
  column: string;
  message: string;
  severity: ValidationSeverity;
};

export type ImportRowState = "new" | "update" | "duplicate" | "invalid";

/** A parsed, validated import row (used for preview + commit). */
export type ImportRow = {
  rowNumber: number;
  state: ImportRowState;
  /** Normalized record keyed by field key (excluding system columns). */
  record: Record<string, unknown>;
  issues: ValidationIssue[];
};

/** Result of an import operation (preview or committed). */
export type ImportSummary = {
  module: string;
  moduleLabel: string;
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  duplicates: number;
  failed: number;
  committed: boolean;
  /** Column mapping that was applied: excel column label -> field key. */
  appliedMapping: Record<string, string>;
  /** All parsed rows (present in preview; for commit only summary counts). */
  rows?: ImportRow[];
  /** Flat rows for the downloadable error report (CSV). */
  errorReportRows: Record<string, unknown>[];
  validationErrors: ValidationIssue[];
};

/** A saved, reusable Excel-column -> DB-field mapping. */
export type SavedMapping = {
  id: string;
  name: string;
  moduleKey: string;
  /** excel column label -> field key. */
  columnMap: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

/** Audit record for an import / export / backup / restore / template action. */
export type DataAuditEntry = {
  id: string;
  action:
    | "import"
    | "export"
    | "backup"
    | "restore"
    | "template"
    | "mapping";
  moduleKey: string;
  fileName?: string | null;
  rowsImported?: number;
  rowsExported?: number;
  rowsUpdated?: number;
  rowsFailed?: number;
  rowsDuplicates?: number;
  errors?: number;
  ipAddress?: string | null;
  userEmail?: string | null;
  meta?: Record<string, unknown>;
  createdAt: string;
};

/** Storage mode for the DataHub engine / standalone pharmacy. */
export type StorageMode = "supabase" | "sqlite" | "excel" | "hybrid";

/** Tenant-scoped Data Management configuration (persisted in hospital config). */
export type DataManagementConfig = {
  /** Master toggle for the whole data management module. */
  enabled: boolean;
  /** Which storage backend serves data operations. */
  storage_mode: StorageMode;
  /** Optional on-disk path for the SQLite DB / Excel workbook (local modes). */
  storage_file: string;
  /** Allowed upload formats: "xlsx" | "xls" | "csv". */
  allowedFormats: string[];
  /** Maximum upload size in megabytes. */
  maxFileSizeMB: number;
  /** How to handle records that match an existing unique key. */
  duplicateMode: "update" | "skip";
  /** Per-module enable toggles (module key -> enabled). */
  modules: Record<string, boolean>;
  backup: {
    enabled: boolean;
    /** Optional cron-like schedule expression (metadata for external scheduler). */
    scheduleCron: string | null;
    /** Number of most-recent backups to retain. */
    keepCount: number;
  };
};
