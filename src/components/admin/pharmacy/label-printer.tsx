"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Printer, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/pharmacy/tax";
import { useOfflineEntities } from "@/lib/pharmacy/offline";
import type { Medicine } from "@/lib/phase2/types";
import {
  formatLabel,
  generateBarcodeDataUrl,
  generateQrDataUrl,
  labelSheetHtml,
  printHtmlViaIframe,
} from "@/lib/pharmacy/barcode/generate";
import { detectBarcodeFormat } from "@/lib/pharmacy/barcode/scan";
import { useVirtualList } from "@/lib/pharmacy/virtual-list";

type SelectedLabel = {
  key: string;
  code: string;
  name: string;
  price: number;
  format: "barcode" | "qr";
};

export function LabelPrinter() {
  const cached = useOfflineEntities<Record<string, unknown>>("medicine");
  const [serverMeds, setServerMeds] = useState<Medicine[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedLabel[]>([]);
  const [format, setFormat] = useState<"barcode" | "qr">("barcode");
  const [columns, setColumns] = useState(3);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/phase2/pharmacy?kind=medicines", { cache: "no-store" });
        const json = (await res.json()) as { data?: Medicine[] };
        if (active && Array.isArray(json.data)) setServerMeds(json.data);
      } catch {
        /* offline — cached medicines only */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const meds = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const m of serverMeds) {
      map.set(m.id, { id: m.id, name: m.name, sku: m.sku || "", price: m.selling_price });
    }
    for (const rec of cached) {
      const d = rec.data as Record<string, unknown>;
      map.set(rec.id, {
        id: rec.id,
        name: String(d.name ?? ""),
        sku: String(d.sku ?? ""),
        price: Number(d.selling_price ?? 0),
      });
    }
    return [...map.values()];
  }, [serverMeds, cached]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return meds.filter(
      (m) =>
        String(m.name).toLowerCase().includes(q) ||
        String(m.sku).toLowerCase().includes(q)
    );
  }, [meds, search]);

  const resultsRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualList(results, resultsRef, { rowHeight: 56, overscan: 8 });

  const toggleSelect = (med: Record<string, unknown>) => {
    const code = String(med.sku || med.name || med.id);
    const key = `${med.id}-${format}`;
    setSelected((prev) =>
      prev.some((s) => s.key === key)
        ? prev.filter((s) => s.key !== key)
        : [
            ...prev,
            {
              key,
              code,
              name: String(med.name ?? ""),
              price: Number(med.price ?? 0),
              format,
            },
          ]
    );
  };

  const print = async () => {
    if (!selected.length) {
      toast.error("Select at least one medicine.");
      return;
    }
    setBusy(true);
    try {
      const labels = [];
      for (const s of selected) {
        const imageDataUrl =
          s.format === "qr"
            ? await generateQrDataUrl(s.code, { size: 140 })
            : await generateBarcodeDataUrl(s.code, {
                height: 40,
                width: 190,
                displayValue: true,
              });
        if (imageDataUrl) {
          labels.push({
            code: s.code,
            caption: s.name,
            sub: `${formatMoney(s.price)}`,
            imageDataUrl,
          });
        }
      }
      if (!labels.length) {
        toast.error("Could not generate any labels.");
        return;
      }
      printHtmlViaIframe(
        labelSheetHtml({
          title: "Pharmacy labels",
          labels,
          columns,
        })
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Label generation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Barcode & QR Labels"
        description="Batch label printing for shelf stickers"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{selected.length} selected</Badge>
            <div className="flex overflow-hidden rounded-lg border">
              {(["barcode", "qr"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    format === f ? "bg-primary-600 text-white" : "hover:bg-muted/60"
                  }`}
                >
                  {f === "barcode" ? "Barcode" : "QR"}
                </button>
              ))}
            </div>
            <select
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
              value={columns}
              onChange={(e) => setColumns(Number(e.target.value))}
              aria-label="Labels per row"
            >
              <option value={2}>2 / row</option>
              <option value={3}>3 / row</option>
              <option value={4}>4 / row</option>
            </select>
            <Button size="sm" disabled={busy || !selected.length} onClick={() => void print()}>
              <Printer className="h-4 w-4" aria-hidden /> Print labels
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <Label>Search medicines</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or SKU…"
              autoComplete="off"
            />
            {search.trim() && (
              <div
                ref={resultsRef}
                onScroll={virtual.onScroll}
                className="max-h-96 overflow-auto rounded-lg border"
              >
                <div style={{ height: virtual.totalHeight, position: "relative" }}>
                  <div style={{ transform: `translateY(${virtual.offsetY}px)` }}>
                    {virtual.visible.map((m) => {
                      const code = String(m.sku || m.name);
                      const active = selected.some((s) => s.key === `${m.id}-${format}`);
                      return (
                        <button
                          key={String(m.id)}
                          type="button"
                          onClick={() => toggleSelect(m)}
                          className={`flex w-full items-center justify-between gap-2 border-b px-3 text-left text-sm last:border-0 hover:bg-muted/40 ${
                            active ? "bg-primary/5" : ""
                          }`}
                          style={{ height: 56 }}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{String(m.name ?? "")}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {code} · {formatLabel(detectBarcodeFormat(code))}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-xs">{formatMoney(Number(m.price ?? 0))}</span>
                            {active ? (
                              <Badge variant="outline" className="text-primary">
                                Selected
                              </Badge>
                            ) : (
                              <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {virtual.visible.length === 0 && (
                      <p className="p-4 text-center text-sm text-muted-foreground">
                        No matching medicines.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="font-semibold">Selected labels</h3>
            {selected.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs">{s.code}</div>
                  <div className="truncate">{s.name}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{s.format}</Badge>
                  <Button size="icon" variant="ghost" onClick={() => setSelected(selected.filter((x) => x.key !== s.key))}>
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              </div>
            ))}
            {selected.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Search and click medicines to add labels.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
