/**
 * Per-field validation and type coercion for the Data Management engine.
 *
 * Raw string values from CSV/Excel are coerced to the module field's declared
 * type and validated (required, enum membership, email/phone shape, date,
 * numeric bounds). Returns issues with row/column context for the error report.
 */

import type { DataField, DataModule, ValidationIssue } from "./types";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TRUE_SET = new Set(["true", "1", "yes", "y", "on"]);
const FALSE_SET = new Set(["false", "0", "no", "n", "off"]);

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

/** Coerce a raw value to a field's type. Returns ok=false + message on failure. */
export function coerceValue(
  field: DataField,
  raw: unknown
): { value: unknown; ok: boolean; message?: string } {
  if (isBlank(raw)) {
    return { value: undefined, ok: true };
  }
  const s = String(raw).trim();

  switch (field.type) {
    case "string":
    case "text":
      return { value: s, ok: true };
    case "string_array": {
      const parts = s
        .split(/[;,\n]/)
        .map((p) => p.trim())
        .filter(Boolean);
      return { value: parts, ok: true };
    }
    case "number": {
      const n = Number(s);
      if (Number.isNaN(n)) return { value: undefined, ok: false, message: `"${s}" is not a valid number` };
      if (field.min !== undefined && n < field.min)
        return { value: undefined, ok: false, message: `must be >= ${field.min}` };
      if (field.max !== undefined && n > field.max)
        return { value: undefined, ok: false, message: `must be <= ${field.max}` };
      return { value: n, ok: true };
    }
    case "integer": {
      const n = Number(s);
      if (Number.isNaN(n) || !Number.isInteger(n))
        return { value: undefined, ok: false, message: `"${s}" is not a valid whole number` };
      if (field.min !== undefined && n < field.min)
        return { value: undefined, ok: false, message: `must be >= ${field.min}` };
      if (field.max !== undefined && n > field.max)
        return { value: undefined, ok: false, message: `must be <= ${field.max}` };
      return { value: n, ok: true };
    }
    case "boolean": {
      const lower = s.toLowerCase();
      if (TRUE_SET.has(lower)) return { value: true, ok: true };
      if (FALSE_SET.has(lower)) return { value: false, ok: true };
      return { value: undefined, ok: false, message: `"${s}" is not a valid boolean (true/false)` };
    }
    case "email": {
      if (!EMAIL_RE.test(s))
        return { value: undefined, ok: false, message: `"${s}" is not a valid email` };
      return { value: s.toLowerCase(), ok: true };
    }
    case "phone": {
      const digits = s.replace(/[^0-9]/g, "");
      if (digits.length < 7 || digits.length > 15)
        return { value: undefined, ok: false, message: `"${s}" is not a valid phone number` };
      return { value: digits, ok: true };
    }
    case "date": {
      const d = new Date(s);
      if (Number.isNaN(d.getTime()))
        return { value: undefined, ok: false, message: `"${s}" is not a valid date` };
      const iso = d.toISOString().slice(0, 10);
      return { value: iso, ok: true };
    }
    case "datetime": {
      const d = new Date(s);
      if (Number.isNaN(d.getTime()))
        return { value: undefined, ok: false, message: `"${s}" is not a valid date/time` };
      return { value: d.toISOString(), ok: true };
    }
    case "enum": {
      if (!field.options || !field.options.length)
        return { value: s, ok: true };
      const match = field.options.find(
        (o) => o.toLowerCase() === s.toLowerCase()
      );
      if (!match)
        return {
          value: undefined,
          ok: false,
          message: `"${s}" is not one of: ${field.options.join(", ")}`,
        };
      return { value: match, ok: true };
    }
    default:
      return { value: s, ok: true };
  }
}

/**
 * Validate + coerce a field-keyed record. Returns issues and the coerced
 * record (undefined optional fields dropped).
 */
export function validateRecord(
  module: DataModule,
  record: Record<string, unknown>,
  rowNumber: number
): { issues: ValidationIssue[]; record: Record<string, unknown> } {
  const issues: ValidationIssue[] = [];
  const coerced: Record<string, unknown> = {};

  for (const field of module.fields) {
    if (field.system || field.importable === false) continue;
    const raw = record[field.key];

    if (field.required && isBlank(raw)) {
      issues.push({
        row: rowNumber,
        column: field.key,
        message: `"${field.label}" is required`,
        severity: "error",
      });
      continue;
    }
    if (isBlank(raw)) {
      // optional + empty -> leave unset
      continue;
    }

    const result = coerceValue(field, raw);
    if (!result.ok) {
      issues.push({
        row: rowNumber,
        column: field.key,
        message: result.message || `Invalid value for "${field.label}"`,
        severity: "error",
      });
      continue;
    }
    coerced[field.key] = result.value;
  }

  return { issues, record: coerced };
}

/** True if an issue list contains any errors. */
export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
