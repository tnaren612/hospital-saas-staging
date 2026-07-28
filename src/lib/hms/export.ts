/**
 * Client-side export helpers (CSV / Excel-friendly / print).
 */

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8"
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  return "\uFEFF" + lines.join("\n");
}

/** Excel opens CSV; filename .xls with tab-separated is widely accepted. */
export function downloadExcel(
  filename: string,
  rows: Record<string, unknown>[]
) {
  if (!rows.length) {
    downloadTextFile(filename.replace(/\.xlsx?$/i, ".csv"), "");
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v).replace(/\t/g, " ");
    return s;
  };
  const lines = [
    headers.join("\t"),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join("\t")),
  ];
  downloadTextFile(
    filename.endsWith(".xls") ? filename : `${filename}.xls`,
    "\uFEFF" + lines.join("\n"),
    "application/vnd.ms-excel;charset=utf-8"
  );
}

export function printHtmlReport(title: string, tableHtml: string) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
  <style>
    body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}
    h1{font-size:20px;margin:0 0 8px}
    p{color:#64748b;font-size:12px;margin:0 0 16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}
    th{background:#f1f5f9}
    @media print{button{display:none}}
  </style></head><body>
  <h1>${title}</h1>
  <p>Sri Srinivasa Hospital · Generated ${new Date().toLocaleString()}</p>
  ${tableHtml}
  <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  w.document.close();
}

export function rowsToTableHtml(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "<p>No data</p>";
  const headers = Object.keys(rows[0]);
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${headers.map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
