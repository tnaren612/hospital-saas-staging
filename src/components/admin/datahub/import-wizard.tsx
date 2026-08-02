"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  UploadCloud,
  Download,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { downloadBlob } from "./table-browser";
import { toCsv } from "@/lib/hms/export";
import type { ImportSummary, ImportRow } from "@/lib/datahub/types";
import type { CatalogModule } from "./data-management-manager";

type FieldMeta = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
};

const STATE_LABEL: Record<ImportRow["state"], { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  update: { label: "Update", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  duplicate: { label: "Duplicate", cls: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300" },
  invalid: { label: "Invalid", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
};

export function ImportWizard({ modules }: { modules: CatalogModule[] }) {
  const [moduleKey, setModuleKey] = useState(modules[0]?.key || "");
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [mapping, setMapping] = useState<Record<string, string> | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);

  // Load field metadata for mapping editor.
  useEffect(() => {
    if (!moduleKey) return;
    let active = true;
    fetch(`/api/admin/datahub/${moduleKey}/columns`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (active && !json.error) {
          setFields(json.data.importable);
          setMapping(null);
          setSummary(null);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [moduleKey]);

  const run = async (mode: "preview" | "commit") => {
    if (!file) {
      toast.error("Choose a file first");
      return;
    }
    setBusy(mode);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      if (mapping) form.append("mapping", JSON.stringify(mapping));
      const res = await fetch(`/api/admin/datahub/${moduleKey}/import`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      setSummary(json.data);
      if (mode === "preview" && !mapping) {
        setMapping(json.data.appliedMapping);
      }
      toast.success(
        mode === "preview" ? "Preview ready" : "Import committed"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  const saveReusableMapping = async () => {
    if (!mapping || !Object.keys(mapping).length) return;
    const name = window.prompt("Name this reusable mapping");
    if (!name) return;
    try {
      const res = await fetch("/api/admin/datahub/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, moduleKey, columnMap: mapping }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast.success("Mapping saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const downloadErrorReport = () => {
    if (!summary || !summary.errorReportRows.length) return;
    const csv = toCsv(summary.errorReportRows);
    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `${moduleKey}-import-errors.csv`
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium">Module</label>
              <select
                className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={moduleKey}
                onChange={(e) => setModuleKey(e.target.value)}
              >
                {modules.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <a
                href={`/api/admin/datahub/${moduleKey}/template`}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-input px-3 text-sm font-medium text-primary-600 hover:bg-muted"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Download template
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <input
              id="import-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setSummary(null);
              }}
            />
            <label
              htmlFor="import-file"
              className="cursor-pointer text-sm text-muted-foreground"
            >
              <UploadCloud className="mx-auto mb-2 h-8 w-8 text-primary-500" />
              {file ? (
                <span className="font-medium text-foreground">{file.name}</span>
              ) : (
                <span>Click to choose an .xlsx / .xls / .csv file</span>
              )}
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void run("preview")}
              disabled={!file || busy !== null}
            >
              {busy === "preview" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              Preview & validate
            </Button>
            <Button
              variant="teal"
              onClick={() => void run("commit")}
              disabled={!file || busy !== null || !summary}
            >
              {busy === "commit" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Commit import
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <>
          <SummaryCards summary={summary} />

          {mapping && Object.keys(mapping).length > 0 && (
            <Card>
              <CardContent className="p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Column mapping</h3>
                  <Button size="sm" variant="outline" onClick={() => void saveReusableMapping()}>
                    <Download className="h-4 w-4" />
                    Save as mapping
                  </Button>
                </div>
                <div className="space-y-2">
                  {Object.entries(mapping).map(([excelCol]) => (
                    <div
                      key={excelCol}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="w-48 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
                        {excelCol}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <select
                        value={mapping[excelCol]}
                        onChange={(e) =>
                          setMapping((prev) => ({
                            ...prev,
                            [excelCol]: e.target.value,
                          }))
                        }
                        className="h-9 flex-1 rounded-lg border border-input bg-background px-2 text-xs"
                      >
                        <option value="">(ignore)</option>
                        {fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void run("preview")}
                    disabled={busy !== null}
                  >
                    Re-preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {summary.errorReportRows.length > 0 && (
            <Button variant="outline" size="sm" onClick={downloadErrorReport}>
              <Download className="h-4 w-4" /> Download error report
            </Button>
          )}

          {summary.rows && summary.rows.length > 0 && (
            <PreviewTable rows={summary.rows.slice(0, 50)} />
          )}
        </>
      )}
    </div>
  );
}

function SummaryCards({ summary }: { summary: ImportSummary }) {
  const items = [
    { label: "Total rows", value: summary.totalRows },
    { label: "Imported", value: summary.imported, cls: "text-emerald-600" },
    { label: "Updated", value: summary.updated, cls: "text-amber-600" },
    { label: "Duplicates", value: summary.duplicates, cls: "text-slate-500" },
    { label: "Failed", value: summary.failed, cls: "text-rose-600" },
    { label: "Validation errors", value: summary.validationErrors.length, cls: "text-rose-600" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <Card key={it.label}>
          <CardContent className="p-4">
            <div className={`text-2xl font-bold ${it.cls || ""}`}>
              {it.value}
            </div>
            <div className="text-xs text-muted-foreground">{it.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PreviewTable({ rows }: { rows: ImportRow[] }) {
  const keys = Object.keys(rows[0]?.record || {});
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="mb-3 text-sm font-semibold">
          Preview (first {rows.length} rows)
        </h3>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-max text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">State</th>
                {keys.map((k) => (
                  <th key={k} className="px-3 py-2 font-semibold">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rowNumber} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{r.rowNumber}</td>
                  <td className="px-3 py-2">
                    <Badge className={STATE_LABEL[r.state].cls}>
                      {STATE_LABEL[r.state].label}
                    </Badge>
                  </td>
                  {keys.map((k) => (
                    <td
                      key={k}
                      className="max-w-[160px] truncate px-3 py-2 text-muted-foreground"
                      title={String(r.record[k] ?? "")}
                    >
                      {String(r.record[k] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && rows.length < 50 && rows.length < 100 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {rows.some((r) => r.state === "invalid")
              ? "Some rows are invalid — see the error report before committing."
              : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
