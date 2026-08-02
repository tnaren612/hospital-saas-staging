/**
 * Enterprise Pharmacy — Import format parsers.
 * Pure functions: CSV, JSON, Excel (.xlsx via the installed `xlsx` lib), and
 * SQL INSERT dumps (Postgres / MySQL / SQLite / SQL Server exports).
 */

import type { ImportFormat, ParsedRow } from "./types";

/** Robust CSV parser — handles quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): ParsedRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = String(text || "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c !== "")) rows.push(row);

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => String(h).trim());
  const out: ParsedRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const obj: ParsedRow = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = rows[r][i] ?? "";
    });
    out.push(obj);
  }
  return out;
}

/** JSON parser — accepts an array of objects, or an object wrapper. */
export function parseJson(text: string): ParsedRow[] {
  const data = JSON.parse(String(text || "[]"));
  const arr = Array.isArray(data) ? data : data?.rows ?? data?.data ?? [];
  if (!Array.isArray(arr)) throw new Error("JSON must be an array of row objects");
  return arr as ParsedRow[];
}

/** Excel parser using the installed `xlsx` library (SheetJS). */
export async function parseXlsx(
  buffer: ArrayBuffer | Uint8Array
): Promise<ParsedRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const sheet = wb.Sheets[first];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  return json.map((r) => Object.fromEntries(
    Object.entries(r).map(([k, v]) => [k.trim(), v])
  ));
}

// Non-global so `exec` never carries a stale lastIndex across statements.
const INSERT_RE = /\bINSERT\s+INTO\s+[^\s(]+\s*(?:\(([^)]*)\))?\s*VALUES\s*/i;

/**
 * Parse an SQL dump of INSERT statements (Postgres / MySQL / SQLite / SQL
 * Server all emit a compatible syntax). Returns one row per VALUES tuple.
 * Falls back to column-name inference from the first statement.
 */
export function parseSqlInserts(text: string): ParsedRow[] {
  const src = String(text || "");
  const out: ParsedRow[] = [];
  let currentColumns: string[] | null = null;

  // Tokenize into statements terminated by ';' respecting quotes/parens.
  const statements = splitSqlStatements(src);

  for (const stmt of statements) {
    const m = INSERT_RE.exec(stmt);
    if (!m) continue;
    // Column list may be on the first statement.
    const colsRaw = m[1];
    let columns: string[] | null = currentColumns;
    if (colsRaw) {
      columns = colsRaw.split(",").map((c) => c.trim().replace(/["`]/g, ""));
      currentColumns = columns;
    }
    if (!columns) continue;

    // Extract every VALUES (...) tuple in this statement.
    const tuples = extractValueTuples(stmt.slice(m.index + m[0].length));
    for (const tuple of tuples) {
      const values = splitTopLevel(tuple);
      const obj: ParsedRow = {};
      columns.forEach((col, i) => {
        obj[col] = coerceSqlValue(values[i]);
      });
      out.push(obj);
    }
  }
  return out;
}

function splitSqlStatements(src: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote: string | null = null;
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuote) {
      cur += ch;
      if (ch === inQuote && src[i - 1] !== "\\") inQuote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      inQuote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function extractValueTuples(tail: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  let inQuote: string | null = null;
  for (let i = 0; i < tail.length; i++) {
    const ch = tail[i];
    if (inQuote) {
      cur += ch;
      if (ch === inQuote && tail[i - 1] !== "\\") inQuote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(") {
      if (depth === 0) {
        cur = "";
        depth = 1;
        continue;
      }
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  return out;
}

function splitTopLevel(tuple: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote: string | null = null;
  for (let i = 0; i < tuple.length; i++) {
    const ch = tuple[i];
    if (inQuote) {
      cur += ch;
      if (ch === inQuote && tuple[i - 1] !== "\\") inQuote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = ch;
      cur += ch; // keep the opening quote so coerceSqlValue can strip both
      continue;
    }
    if (ch === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function coerceSqlValue(raw: string | undefined): unknown {
  const v = raw ?? "";
  if (v === "" ) return "";
  const low = v.toLowerCase();
  if (low === "null") return null;
  if (low === "true") return true;
  if (low === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

/** Route a blob of text to the right parser based on its declared format. */
export async function parseInput(
  format: ImportFormat,
  input: string | ArrayBuffer | Uint8Array
): Promise<ParsedRow[]> {
  switch (format) {
    case "csv":
      return parseCsv(String(input));
    case "json":
      return parseJson(String(input));
    case "xlsx":
      return parseXlsx(input as ArrayBuffer | Uint8Array);
    case "sql":
      return parseSqlInserts(String(input));
    default:
      throw new Error(`Unsupported import format: ${String(format)}`);
  }
}
