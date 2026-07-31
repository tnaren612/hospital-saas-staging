/**
 * Template generation for the Data Management engine.
 *
 * Produces an .xlsx template per module: a header row, a sample data row
 * (which can be pasted over) and a "Validation Rules" sheet describing every
 * importable field (type, required, unique, allowed enum options, notes).
 */

import * as XLSX from "xlsx";
import type { DataModule } from "./types";
import { getImportableFields } from "./registry";

export function buildTemplateWorkbook(module: DataModule): ArrayBuffer {
  const importable = getImportableFields(module);

  const headers = importable.map((f) => f.label);
  const sampleRow = importable.map((f) => f.sample ?? "");

  const ws = XLSX.utils.aoa_to_sheet([
    headers,
    sampleRow,
    ["", "…", "…", "…", "…", "…", "…"],
  ]);
  ws["!cols"] = headers.map(() => ({ wch: 20 }));
  ws["!ref"] = `A1:${XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: 1, c: Math.max(0, headers.length - 1) },
  })}`;

  // Validation rules sheet.
  const rulesAoa: unknown[][] = [
    ["Field", "Type", "Required", "Unique", "Allowed Values", "Notes"],
  ];
  for (const f of importable) {
    rulesAoa.push([
      f.label,
      f.type,
      f.required ? "Yes" : "No",
      f.unique ? "Yes" : "No",
      f.options?.join(", ") ?? (f.type === "string_array" ? "separate with ;" : ""),
      f.note ?? "",
    ]);
  }
  const wsRules = XLSX.utils.aoa_to_sheet(rulesAoa);
  wsRules["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 40 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.utils.book_append_sheet(wb, wsRules, "Validation Rules");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

export function templateFilename(module: DataModule): string {
  return `${module.key}-template.xlsx`;
}
