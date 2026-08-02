/**
 * File ingestion for the Data Management engine.
 *
 * Detects format from filename, reads CSV (robust parser) or XLSX/XLS
 * (SheetJS) and returns a normalized shape: a header row plus data rows of
 * string values, ready for mapping + validation.
 */

import * as XLSX from "xlsx";

export type ParsedFile = {
  format: "xlsx" | "xls" | "csv";
  headers: string[];
  /** Data rows (excluding the header row), same length as headers. */
  rows: string[][];
  sheetName: string;
};

const CSV_EXT = /\.csv$/i;
const XLSX_EXT = /\.xlsx$/i;
const XLS_EXT = /\.xls$/i;

export function sniffFormat(filename: string): "xlsx" | "xls" | "csv" | null {
  if (CSV_EXT.test(filename)) return "csv";
  if (XLSX_EXT.test(filename)) return "xlsx";
  if (XLS_EXT.test(filename)) return "xls";
  return null;
}

/** Parse file bytes into normalized headers + rows. */
export function parseDataFile(
  filename: string,
  bytes: ArrayBuffer
): ParsedFile {
  const format = sniffFormat(filename);
  if (!format) {
    throw new Error(
      "Unsupported file type. Allowed: .xlsx, .xls, .csv"
    );
  }

  if (format === "csv") {
    const text = new TextDecoder("utf-8")
      .decode(bytes)
      .replace(/^﻿/, ""); // strip BOM
    const { headers, rows } = parseCsv(text);
    return { format, headers, rows, sheetName: "Sheet1" };
  }

  const wb = XLSX.read(bytes, { type: "array" });
  const firstSheetName = wb.SheetNames[0] || "Sheet1";
  const ws = wb.Sheets[firstSheetName];
  if (!ws) {
    throw new Error("The workbook contains no data sheet.");
  }
  const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });

  // Find the first non-empty row as the header.
  let headerIdx = -1;
  for (let i = 0; i < aoa.length; i++) {
    if (Array.isArray(aoa[i]) && aoa[i].some((c) => String(c).trim() !== "")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error("The file appears to be empty.");
  }

  const headers = (aoa[headerIdx] || []).map((h) => String(h ?? "").trim());
  const rows = aoa
    .slice(headerIdx + 1)
    .filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => headers.map((_, i) => String(r[i] ?? "").trim()));
  return { format, headers, rows, sheetName: firstSheetName };
}

/**
 * Minimal but robust CSV parser: handles quoted fields, embedded commas,
 * escaped quotes and newlines within fields.
 */
export function parseCsv(text: string): {
  headers: string[];
  rows: string[][];
} {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
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
      continue;
    }
    if (ch === ",") {
      pushField();
      continue;
    }
    if (ch === "\n") {
      pushRow();
      continue;
    }
    if (ch === "\r") {
      // handle \r\n — the \n will close the row
      if (text[i + 1] !== "\n") pushRow();
      continue;
    }
    field += ch;
  }
  // flush trailing
  if (field !== "" || row.length) pushRow();

  // trim trailing empty rows
  while (records.length && records[records.length - 1].every((c) => c.trim() === "")) {
    records.pop();
  }
  if (!records.length) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((r) => headers.map((_, i) => (r[i] ?? "").trim()));
  return { headers, rows };
}
