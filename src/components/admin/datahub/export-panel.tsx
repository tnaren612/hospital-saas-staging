"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadBlob } from "./table-browser";
import type { CatalogModule } from "./data-management-manager";

type ExportField = {
  key: string;
  label: string;
  type: string;
  system: boolean;
};

const FORMATS = [
  { id: "xlsx", label: "Excel (.xlsx)" },
  { id: "csv", label: "CSV" },
  { id: "pdf", label: "PDF (print)" },
] as const;

export function ExportPanel({ modules }: { modules: CatalogModule[] }) {
  const [moduleKey, setModuleKey] = useState(modules[0]?.key || "");
  const [fields, setFields] = useState<ExportField[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<(typeof FORMATS)[number]["id"]>("xlsx");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!moduleKey) return;
    let active = true;
    fetch(`/api/admin/datahub/${moduleKey}/columns`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (active && !json.error) {
          const exportable: ExportField[] = json.data.exportable;
          setFields(exportable);
          setSelected(new Set(exportable.map((f) => f.key)));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [moduleKey]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = (on: boolean) => {
    setSelected(on ? new Set(fields.map((f) => f.key)) : new Set());
  };

  const doExport = async () => {
    if (!selected.size) {
      toast.error("Select at least one column");
      return;
    }
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/datahub/${moduleKey}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          search,
          columns: [...selected],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Export failed");
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const name = disp.match(/filename="?([^"]+)"?/)?.[1] || `${moduleKey}.${format}`;
      if (format === "pdf") {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener");
      } else {
        downloadBlob(blob, name);
      }
      toast.success(`Exported ${name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
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
            <div>
              <label className="mb-1.5 block text-xs font-medium">
                Filter (search)
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Export only matching…"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium">Columns to export</label>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => toggleAll(true)} className="text-primary-600 hover:underline">
                  Select all
                </button>
                <span className="text-muted-foreground">·</span>
                <button type="button" onClick={() => toggleAll(false)} className="text-muted-foreground hover:underline">
                  None
                </button>
              </div>
            </div>
            <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-3">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.has(f.key)}
                    onChange={() => toggle(f.key)}
                  />
                  {f.label}
                  {f.system && (
                    <span className="text-[10px] text-muted-foreground">(system)</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 p-6">
            <label className="text-xs font-medium">Format</label>
            {FORMATS.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="export-format"
                  checked={format === f.id}
                  onChange={() => setFormat(f.id)}
                />
                {f.label}
              </label>
            ))}
            <Button
              className="mt-2 w-full"
              onClick={() => void doExport()}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
