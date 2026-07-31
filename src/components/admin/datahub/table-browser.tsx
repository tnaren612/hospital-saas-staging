"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CatalogModule } from "./data-management-manager";

type FieldMeta = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  unique: boolean;
  options: string[];
  system: boolean;
};

type Row = Record<string, unknown>;

export function TableBrowser({ module }: { module: CatalogModule }) {
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ column: string; asc: boolean } | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);

  // Load column metadata once.
  useEffect(() => {
    let active = true;
    fetch(`/api/admin/datahub/${module.key}/columns`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (active && !json.error) setFields(json.data.importable);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [module.key]);

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sort) {
      params.set("sort", sort.column);
      params.set("asc", sort.asc ? "1" : "0");
    }
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== "")
    );
    if (Object.keys(activeFilters).length) {
      params.set("filters", JSON.stringify(activeFilters));
    }
    return params;
  }, [page, pageSize, debouncedSearch, sort, filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/datahub/${module.key}?${buildQuery().toString()}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setRows(json.data.rows);
      setTotal(json.data.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [module.key, buildQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleFields = useMemo(
    () => fields.filter((f) => !f.system || f.key === "id"),
    [fields]
  );

  const enumFilters = useMemo(
    () => fields.filter((f) => f.type === "enum" && f.options?.length).slice(0, 4),
    [fields]
  );

  const toggleSort = (key: string) => {
    setSort((s) => {
      if (s?.column === key) return { column: key, asc: !s.asc };
      return { column: key, asc: true };
    });
    setPage(1);
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/datahub/${module.key}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "csv",
          search: debouncedSearch,
          filters: Object.fromEntries(
            Object.entries(filters).filter(([, v]) => v !== "")
          ),
          sort,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Export failed");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const name =
        disposition.match(/filename="?([^"]+)"?/)?.[1] || `${module.key}.csv`;
      downloadBlob(blob, name);
      toast.success("Exported current filtered data as CSV");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{module.label}</h2>
          <p className="text-xs text-muted-foreground">
            Table <code className="font-mono">{module.table}</code> · {total.toLocaleString()}{" "}
            records
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search…"
              className="w-56 pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void doExport()}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            CSV
          </Button>
        </div>
      </div>

      {enumFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {enumFilters.map((f) => (
            <select
              key={f.key}
              value={filters[f.key] || ""}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, [f.key]: e.target.value }));
                setPage(1);
              }}
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
            >
              <option value="">{f.label}: all</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-max text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {visibleFields.map((f) => (
                <th
                  key={f.key}
                  className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-semibold"
                  onClick={() => toggleSort(f.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {f.label}
                    {sort?.column === f.key ? (
                      sort.asc ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={visibleFields.length || 1} className="px-3 py-10">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={visibleFields.length || 1} className="p-6">
                  <EmptyState title="No records found" description="Try adjusting your search or filters." />
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  {visibleFields.map((f) => (
                    <td
                      key={f.key}
                      className="max-w-[240px] truncate whitespace-nowrap px-3 py-2 text-muted-foreground"
                      title={formatCell(row[f.key])}
                    >
                      {formatCell(row[f.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-9 rounded-lg border border-input bg-background px-2"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span>
            Page {page} of {totalPages} · {total.toLocaleString()} total
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
