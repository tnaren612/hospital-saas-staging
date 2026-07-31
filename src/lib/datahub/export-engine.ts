/**
 * Export engine — browse records and serialize to CSV / XLSX / PDF.
 *
 * Reuses the existing pure CSV helpers from `src/lib/hms/export.ts` and
 * SheetJS for real .xlsx output. PDF is produced as a printable HTML report
 * (the same approach the app uses elsewhere) so the browser can print to PDF.
 */

import * as XLSX from "xlsx";
import type {
  DataManagementConfig,
  DataModule,
  DataField,
} from "./types";
import type { BrowseQuery } from "./provider";
import { getExportableFields } from "./registry";
import { toCsv, rowsToTableHtml, escapeHtml } from "@/lib/hms/export";
import { writeDataAudit } from "./audit";
import type { DataProvider } from "./provider";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export type ExportResult = {
  format: ExportFormat;
  filename: string;
  contentType: string;
  /** CSV/XLSX payload (xlsx is ArrayBuffer; csv is string). */
  data: string | ArrayBuffer;
  rowCount: number;
};

export type ExportEngineInput = {
  module: DataModule;
  hospitalId: string | null;
  provider: DataProvider;
  config: DataManagementConfig;
  query: BrowseQuery;
  format: ExportFormat;
  actor?: { email?: string | null; id?: string | null };
  ipAddress?: string | null;
};

function buildWorksheet(module: DataModule, rows: Record<string, unknown>[]) {
  const exportable = getExportableFields(module);
  const headers = exportable.map((f) => f.label);
  const aoa: unknown[][] = [headers];
  for (const row of rows) {
    aoa.push(exportable.map((f) => row[f.key]));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = exportable.map(() => ({ wch: 18 }));
  return { ws, exportable, headers };
}

function labelValueRows(
  module: DataModule,
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  const exportable = getExportableFields(module);
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const f of exportable) out[f.label] = row[f.key];
    return out;
  });
}

function stamp(base: string): string {
  return base + "-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "");
}

export async function runExport(input: ExportEngineInput): Promise<ExportResult> {
  const { module, hospitalId, provider, query, format, actor, ipAddress } = input;

  // Export always fetches ALL matching rows (ignores pagination).
  const { rows } = await provider.browse(module, hospitalId, {
    ...query,
    all: true,
  });

  const ext = format === "xlsx" ? "xlsx" : format;
  const filename = `${stamp(module.key)}.${ext}`;

  let data: string | ArrayBuffer;
  let contentType: string;

  if (format === "xlsx") {
    const { ws } = buildWorksheet(module, rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, module.label.slice(0, 31) || "Data");
    data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    contentType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else if (format === "pdf") {
    const title = `${module.label} — Export`;
    const html = reportHtml(title, rowsToTableHtml(labelValueRows(module, rows)));
    data = html;
    contentType = "text/html;charset=utf-8";
  } else {
    data = toCsv(labelValueRows(module, rows));
    contentType = "text/csv;charset=utf-8";
  }

  await writeDataAudit({
    action: "export",
    moduleKey: module.key,
    fileName: filename,
    rowsExported: rows.length,
    userEmail: actor?.email,
    userId: actor?.id,
    ipAddress,
    hospitalId,
    meta: { format },
  });

  return { format, filename, contentType, data, rowCount: rows.length };
}

function reportHtml(title: string, tableHtml: string): string {
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html><html><head><title>${safeTitle}</title>
  <style>
    body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}
    h1{font-size:20px;margin:0 0 8px}
    p{color:#64748b;font-size:12px;margin:0 0 16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;white-space:nowrap}
    th{background:#f1f5f9}
  </style></head><body>
  <h1>${safeTitle}</h1>
  <p>Generated ${new Date().toLocaleString()} &middot; ${new Date().toLocaleDateString()}</p>
  ${tableHtml}
  <script>window.onload=function(){window.print()}</script>
  </body></html>`;
}

/** Describe exportable fields (used by the UI to pick columns). */
export function exportColumnOptions(module: DataModule): DataField[] {
  return getExportableFields(module);
}
