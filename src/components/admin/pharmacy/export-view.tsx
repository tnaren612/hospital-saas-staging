"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  useOfflineEntities,
  useOfflineStore,
} from "@/lib/pharmacy/offline";
import type { SyncEntity } from "@/lib/pharmacy/offline";
import {
  downloadTextFile,
  toCsv,
  downloadExcel,
} from "@/lib/hms/export";
import { formatMoney } from "@/lib/pharmacy/tax";

type ExportTarget = {
  entity: SyncEntity;
  label: string;
  fields: Array<{ key: string; label: string }>;
};

const TARGETS: ExportTarget[] = [
  {
    entity: "medicine",
    label: "Medicines",
    fields: [
      { key: "name", label: "Name" },
      { key: "generic_name", label: "Generic" },
      { key: "manufacturer", label: "Brand" },
      { key: "sku", label: "SKU" },
      { key: "barcode", label: "Barcode" },
      { key: "batch_number", label: "Batch" },
      { key: "purchase_price", label: "Purchase price" },
      { key: "selling_price", label: "Selling price" },
      { key: "stock_qty", label: "Stock" },
      { key: "reorder_level", label: "Reorder" },
      { key: "expiry_date", label: "Expiry" },
      { key: "schedule", label: "Schedule" },
    ],
  },
  {
    entity: "sale",
    label: "Sales",
    fields: [
      { key: "sale_number", label: "Sale #" },
      { key: "patient_name", label: "Customer" },
      { key: "sale_type", label: "Type" },
      { key: "subtotal", label: "Subtotal" },
      { key: "discount", label: "Discount" },
      { key: "tax", label: "Tax" },
      { key: "grand_total", label: "Total" },
      { key: "payment_method", label: "Payment" },
      { key: "payment_status", label: "Status" },
      { key: "cashier_name", label: "Cashier" },
      { key: "created_at", label: "Date" },
    ],
  },
  {
    entity: "customer",
    label: "Customers",
    fields: [
      { key: "name", label: "Name" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address" },
      { key: "city", label: "City" },
    ],
  },
  {
    entity: "supplier",
    label: "Suppliers",
    fields: [
      { key: "name", label: "Name" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address" },
    ],
  },
  {
    entity: "purchase_order",
    label: "Purchase orders",
    fields: [
      { key: "po_number", label: "PO #" },
      { key: "supplier_name", label: "Supplier" },
      { key: "status", label: "Status" },
      { key: "total_amount", label: "Total" },
      { key: "created_at", label: "Date" },
    ],
  },
];

export function ExportView() {
  const storage = useOfflineStore();
  const [targetIdx, setTargetIdx] = useState(0);
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const target = TARGETS[targetIdx];
  const rows = useOfflineEntities<Record<string, unknown>>(target.entity);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const allSelected = useMemo(
    () => target.fields.every((f) => selected[f.key]),
    [target, selected]
  );

  const rowsForExport = useMemo(() => {
    const fields = target.fields.filter((f) => selected[f.key]).map((f) => f.key);
    return rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const k of fields) out[k] = r.data[k];
      return out;
    });
  }, [rows, selected, target]);

  const doExport = async () => {
    if (rowsForExport.length === 0) {
      toast.error("No data to export");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `pharmacy-${target.entity}-${stamp}`;
    if (format === "xlsx") {
      downloadExcel(name, rowsForExport);
    } else {
      downloadTextFile(`${name}.csv`, toCsv(rowsForExport));
    }
    await storage.appendAudit({
      actor: "cashier",
      action: "export.downloaded",
      entity: target.entity,
      details: { format, rows: rowsForExport.length },
    });
    toast.success(`Exported ${rowsForExport.length} rows`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Export Data"
        description={`${rows.length} cached ${target.label.toLowerCase()} available offline`}
      />

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="exp-entity">Dataset</Label>
              <select
                id="exp-entity"
                className="h-11 w-56 rounded-xl border border-input bg-background px-3 text-sm"
                value={targetIdx}
                onChange={(e) => setTargetIdx(Number(e.target.value))}
              >
                {TARGETS.map((t, i) => (
                  <option key={t.entity} value={i}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-format">Format</Label>
              <select
                id="exp-format"
                className="h-11 w-44 rounded-xl border border-input bg-background px-3 text-sm"
                value={format}
                onChange={(e) => setFormat(e.target.value as "csv" | "xlsx")}
              >
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (.xls)</option>
              </select>
            </div>
            <Button
              size="sm"
              onClick={() => void doExport()}
              disabled={rowsForExport.length === 0}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export {rowsForExport.length} rows
            </Button>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Fields</h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  for (const f of target.fields) next[f.key] = !allSelected;
                  setSelected(next);
                }}
              >
                {allSelected ? "Select none" : "Select all"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {target.fields.map((f) => (
                <label
                  key={f.key}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={!!selected[f.key]}
                    onChange={(e) =>
                      setSelected({ ...selected, [f.key]: e.target.checked })
                    }
                    className="h-4 w-4 accent-primary-600"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="font-semibold">Cached data ({rows.length})</h2>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  {target.fields
                    .filter((f) => selected[f.key])
                    .map((f) => (
                      <th key={f.key} className="py-2 pr-3">
                        {f.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    {target.fields
                      .filter((f) => selected[f.key])
                      .map((f) => (
                        <td key={f.key} className="py-2 pr-3">
                          {f.key === "grand_total" || f.key === "total_amount"
                            ? formatMoney(Number(r.data[f.key]) || 0)
                            : String(r.data[f.key] ?? "")}
                        </td>
                      ))}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="py-6 text-center text-sm text-muted-foreground">
                      Nothing cached yet — open the related page once while online, or import data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
