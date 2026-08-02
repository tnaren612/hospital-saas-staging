/**
 * Enterprise Pharmacy — Import Wizard (pure core).
 * Preview → column mapping → duplicate detection → validation → dry-run → apply
 * → rollback. Nothing here touches the network; it returns plain structures the
 * caller (route or UI) can persist via the offline store or the service layer.
 */

import type {
  ColumnMapping,
  ImportEntity,
  ImportOperation,
  ImportPreview,
  ImportResult,
  ImportRowStatus,
  ImportSchema,
  ParsedRow,
  RollbackReport,
  RowResult,
} from "./types";

/** Build an ImportPreview from parsed rows + headers. */
export function buildPreview(
  rows: ParsedRow[],
  opts?: { headers?: string[]; format?: ImportPreview["format"]; warnings?: string[] }
): ImportPreview {
  const headers =
    opts?.headers || (rows[0] ? Object.keys(rows[0]) : []);
  return {
    format: opts?.format || "csv",
    headers,
    rows,
    total: rows.length,
    warnings: opts?.warnings || [],
  };
}

/** Coerce a raw cell to a target type. Returns null when invalid. */
export function coerceCell(
  value: unknown,
  type?: ImportSchema["rules"][number]["type"]
): { value?: unknown; error?: string } {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }
  switch (type) {
    case "number":
    case "integer": {
      const n = Number(value);
      if (Number.isNaN(n)) return { error: `"${value}" is not a number` };
      if (type === "integer" && !Number.isInteger(n))
        return { error: `"${value}" is not an integer` };
      return { value: n };
    }
    case "boolean": {
      if (value === true || value === "true" || value === 1 || value === "1")
        return { value: true };
      if (value === false || value === "false" || value === 0 || value === "0")
        return { value: false };
      return { error: `"${value}" is not a boolean` };
    }
    case "date": {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) return { error: `"${value}" is not a date` };
      return { value: d.toISOString().slice(0, 10) };
    }
    case "email": {
      const s = String(value);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
        return { error: `"${s}" is not a valid email` };
      return { value: s };
    }
    default:
      return { value: value };
  }
}

/**
 * Validate a mapped row against a schema. Returns the coerced row and any
 * field errors.
 */
export function validateRow(
  row: ParsedRow,
  schema: ImportSchema
): { row: ParsedRow; errors: string[] } {
  const errors: string[] = [];
  const out: ParsedRow = {};
  for (const rule of schema.rules) {
    const raw = row[rule.field];
    if (rule.required && (raw === undefined || raw === null || raw === "")) {
      errors.push(`${rule.label || rule.field} is required`);
      continue;
    }
    const coerced = coerceCell(raw, rule.type);
    if (coerced.error) {
      errors.push(`${rule.label || rule.field}: ${coerced.error}`);
      continue;
    }
    out[rule.field] = coerced.value;
    if (typeof out[rule.field] === "number") {
      if (rule.min !== undefined && Number(out[rule.field]) < rule.min)
        errors.push(`${rule.label || rule.field} must be >= ${rule.min}`);
      if (rule.max !== undefined && Number(out[rule.field]) > rule.max)
        errors.push(`${rule.label || rule.field} must be <= ${rule.max}`);
    }
    if (rule.enum && !rule.enum.includes(out[rule.field]))
      errors.push(`${rule.label || rule.field} has an invalid value`);
  }
  return { row: out, errors };
}

/** Map source headers to schema fields with a best-effort default. */
export function inferMapping(
  headers: string[],
  schema: ImportSchema
): ColumnMapping {
  const mapping: ColumnMapping = {};
  const wanted = schema.rules.map((r) => r.field);
  for (const header of headers) {
    const norm = normalizeKey(header);
    const field =
      wanted.find((f) => normalizeKey(f) === norm) ||
      wanted.find((f) =>
        schema.rules.find((r) => r.field === f && r.label && normalizeKey(r.label) === norm)
      );
    if (field) mapping[header] = field;
  }
  return mapping;
}

function normalizeKey(s: string): string {
  return String(s || "").toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Run the full wizard pass: map, dedupe, validate. Pure — returns results and
 * (optionally) the reversible operations for apply/rollback.
 */
export function runWizard(
  preview: ImportPreview,
  mapping: ColumnMapping,
  schema: ImportSchema,
  existingKeys?: Set<string>
): {
  results: RowResult[];
  ops: ImportOperation[];
  applied: ParsedRow[];
} {
  const seen = new Map<string, number>();
  const results: RowResult[] = [];
  const ops: ImportOperation[] = [];
  const applied: ParsedRow[] = [];
  const keyOf = (row: ParsedRow) => {
    const v = row[schema.keyField];
    return v === null || v === undefined ? "" : String(v).trim();
  };

  preview.rows.forEach((raw, index) => {
    // Map source columns -> fields.
    const mapped: ParsedRow = {};
    for (const [src, field] of Object.entries(mapping)) {
      if (field && raw[src] !== undefined) mapped[field] = raw[src];
    }
    const { row, errors } = validateRow(mapped, schema);

    // Duplicate detection against existing data and within this file.
    const key = keyOf(row);
    let duplicateOf: number | undefined;
    if (key && existingKeys?.has(key)) duplicateOf = -1; // exists server-side
    if (key && seen.has(key)) duplicateOf = seen.get(key);
    if (key) seen.set(key, index);

    const status: ImportRowStatus =
      errors.length > 0 ? "error" : duplicateOf !== undefined ? "duplicate" : "ok";

    results.push({ index, status, data: row, errors, duplicateOf });
    if (status === "ok") {
      applied.push(row);
      ops.push({
        kind: "insert",
        entity: schema.entity,
        id: key || undefined,
        before: null,
        after: row,
      });
    }
  });

  return { results, ops, applied };
}

export function summarize(results: RowResult[]): {
  total: number;
  ok: number;
  duplicate: number;
  error: number;
} {
  return {
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    duplicate: results.filter((r) => r.status === "duplicate").length,
    error: results.filter((r) => r.status === "error").length,
  };
}

/**
 * Compose an ImportResult + a compensating rollback list.
 * Rollback deletes inserted rows (by id) in reverse order.
 */
export function commit(
  ops: ImportOperation[],
  rows: RowResult[],
  actor: string
): { result: ImportResult; rollback: ImportOperation[] } {
  const startedAt = new Date().toISOString();
  const imported = rows.filter((r) => r.status === "ok").length;
  const duplicates = rows.filter((r) => r.status === "duplicate").length;
  const errors = rows.filter((r) => r.status === "error").length;
  const result: ImportResult = {
    total: rows.length,
    imported,
    duplicates,
    errors,
    rows,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  const rollback: ImportOperation[] = ops
    .filter((o) => o.kind === "insert" && o.id)
    .slice()
    .reverse()
    .map((o) => ({ kind: "delete", entity: o.entity, id: o.id, before: o.after }));
  void actor;
  return { result, rollback };
}

/** Apply a rollback list (pure accounting) — caller persists deletes. */
export function reportRollback(
  rollback: ImportOperation[]
): RollbackReport {
  return {
    rolledBack: rollback.length,
    failed: 0,
    errors: [],
  };
}

/** Generate a downloadable sample template (CSV) for an entity schema. */
export function buildSampleTemplate(schema: ImportSchema): string {
  const headers = schema.rules.map((r) => r.label || r.field);
  const sample = schema.rules.map((r) => {
    switch (r.type) {
      case "number":
      case "integer":
        return "0";
      case "boolean":
        return "true";
      case "date":
        return "2026-01-01";
      case "email":
        return "name@example.com";
      default:
        return r.enum?.length ? String(r.enum[0]) : `e.g. ${r.label || r.field}`;
    }
  });
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [headers.map(esc).join(","), sample.map(esc).join(",")].join("\n");
}

export function entityLabel(entity: ImportEntity): string {
  return entity.charAt(0).toUpperCase() + entity.slice(1);
}
