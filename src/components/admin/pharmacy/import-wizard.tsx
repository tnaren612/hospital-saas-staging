"use client";

import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FileUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { parseDataFile, type ParsedFile } from "@/lib/datahub/parse";
import {
  enqueueMutation,
  useOfflineEntities,
  useOfflineStore,
} from "@/lib/pharmacy/offline";
import type { SyncEntity } from "@/lib/pharmacy/offline";
import { createUuid } from "@/lib/pharmacy/offline/storage";

type TargetDef = {
  entity: SyncEntity;
  label: string;
  fields: Array<{ key: string; label: string; required?: boolean }>;
  requiredField: string;
};

const TARGETS: TargetDef[] = [
  {
    entity: "medicine",
    label: "Medicines",
    requiredField: "name",
    fields: [
      { key: "name", label: "Medicine name", required: true },
      { key: "generic_name", label: "Generic name" },
      { key: "manufacturer", label: "Manufacturer / brand" },
      { key: "sku", label: "SKU" },
      { key: "barcode", label: "Barcode" },
      { key: "batch_number", label: "Batch number" },
      { key: "unit", label: "Unit" },
      { key: "purchase_price", label: "Purchase price" },
      { key: "selling_price", label: "Selling price" },
      { key: "stock_qty", label: "Opening stock" },
      { key: "reorder_level", label: "Reorder level" },
      { key: "expiry_date", label: "Expiry date" },
      { key: "schedule", label: "Schedule (OTC/H/H1/X)" },
      { key: "composition", label: "Composition" },
    ],
  },
  {
    entity: "customer",
    label: "Customers",
    requiredField: "name",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address" },
      { key: "city", label: "City" },
    ],
  },
  {
    entity: "supplier",
    label: "Suppliers",
    requiredField: "name",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address" },
    ],
  },
];

export function ImportWizard() {
  const storage = useOfflineStore();
  const cachedMeds = useOfflineEntities<Record<string, unknown>>("medicine");
  const cachedCustomers = useOfflineEntities<Record<string, unknown>>("customer");
  const cachedSuppliers = useOfflineEntities<Record<string, unknown>>("supplier");

  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [filename, setFilename] = useState("");
  const [targetIdx, setTargetIdx] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [batchId, setBatchId] = useState<string | null>(null);
  const [imported, setImported] = useState(0);
  const [busy, setBusy] = useState(false);

  const target = TARGETS[targetIdx];

  const duplicateKeys = useMemo(
    () => (key: string) =>
      new Set(
        [...cachedMeds, ...cachedCustomers, ...cachedSuppliers]
          .map((r) => String((r.data as Record<string, unknown>)[key] ?? "").trim().toLowerCase())
          .filter(Boolean)
      ),
    [cachedMeds, cachedCustomers, cachedSuppliers]
  );

  const onFile = useCallback(
    async (file: File) => {
      setBatchId(null);
      setImported(0);
      try {
        const bytes = await file.arrayBuffer();
        const data = parseDataFile(file.name, bytes);
        setParsed(data);
        setFilename(file.name);
        const initial: Record<string, string> = {};
        for (const f of target.fields) {
          const match = data.headers.find((h) =>
            h.toLowerCase().includes(f.key.toLowerCase())
          );
          if (match) initial[f.key] = match;
        }
        setMapping(initial);
        toast.success(`Parsed ${data.rows.length} rows from ${file.name}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not parse file");
      }
    },
    [target]
  );

  const detected = useMemo(() => {
    if (!parsed) return { dupes: [] as string[] };
    const key = target.entity === "medicine" ? "sku" : "phone";
    const lookup = duplicateKeys(key);
    const rows: Array<{ row: number; value: string }> = [];
    const seen = new Set<string>();
    parsed.rows.forEach((row, i) => {
      const header = mapping[key];
      if (!header) return;
      const value = String(row[parsed.headers.indexOf(header)] ?? "").trim().toLowerCase();
      if (!value) return;
      if (lookup.has(value) || seen.has(value)) rows.push({ row: i + 2, value });
      seen.add(value);
    });
    return { dupes: rows.map((r) => `Row ${r.row}`) };
  }, [parsed, mapping, target, duplicateKeys]);

  const runImport = async () => {
    if (!parsed) return;
    const requiredHeader = mapping[target.requiredField];
    if (!requiredHeader) {
      toast.error(`Map the "${target.requiredField}" field first`);
      return;
    }
    setBusy(true);
    const id = createUuid();
    let ok = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const payload: Record<string, unknown> = {
          _clientId: createUuid(),
          _importBatchId: id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        for (const f of target.fields) {
          const header = mapping[f.key];
          if (!header) continue;
          const idx = parsed.headers.indexOf(header);
          if (idx < 0) continue;
          const raw = String(row[idx] ?? "").trim();
          if (!raw) continue;
          const numeric =
            f.key === "purchase_price" ||
            f.key === "selling_price" ||
            f.key === "stock_qty" ||
            f.key === "reorder_level";
          payload[f.key] = numeric ? Number(raw) || 0 : raw;
        }
        if (!String(payload[target.requiredField] ?? "").trim()) {
          skipped++;
          continue;
        }
        const op = await enqueueMutation(storage, {
          id: String(payload._clientId),
          hospitalId: "local",
          entity: target.entity,
          action: "create",
          payload,
          targetKey: `${target.entity}::${payload._clientId}`,
        });
        if (op) ok++;
      }
      setBatchId(id);
      setImported(ok);
      await storage.setMeta(`importBatch::${id}`, JSON.stringify({ count: ok, entity: target.entity }));
      toast.success(`Queued ${ok} rows (${skipped} skipped)`);
    } finally {
      setBusy(false);
    }
  };

  const rollback = async () => {
    if (!batchId) return;
    setBusy(true);
    try {
      const queue = await storage.listQueue();
      let removed = 0;
      for (const op of queue) {
        const batch = op.payload?._importBatchId;
        if (batch === batchId) {
          await storage.removeOp(op.id);
          const key = String(op.payload?._clientId ?? "");
          if (key) await storage.deleteEntity(op.entity, key);
          removed++;
        }
      }
      await storage.deleteMeta(`importBatch::${batchId}`);
      await storage.appendAudit({
        actor: "cashier",
        action: "import.rollback",
        entity: target.entity,
        details: { batchId, rows: removed },
      });
      setBatchId(null);
      setImported(0);
      toast.success(`Rolled back ${removed} queued rows`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Import Data"
        description="Excel (.xlsx/.xls), CSV and JSON — field mapping, preview, duplicate detection, rollback"
      />

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="imp-file">Source file</Label>
              <Input
                id="imp-file"
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="imp-target">Import into</Label>
              <select
                id="imp-target"
                className="h-11 w-48 rounded-xl border border-input bg-background px-3 text-sm"
                value={targetIdx}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setTargetIdx(idx);
                  const t = TARGETS[idx];
                  const initial: Record<string, string> = {};
                  if (parsed) {
                    for (const f of t.fields) {
                      const match = parsed.headers.find((h) =>
                        h.toLowerCase().includes(f.key.toLowerCase())
                      );
                      if (match) initial[f.key] = match;
                    }
                  }
                  setMapping(initial);
                }}
              >
                {TARGETS.map((t, i) => (
                  <option key={t.entity} value={i}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filename && (
            <p className="text-xs text-muted-foreground">
              <FileUp className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              {filename} — {parsed?.rows.length ?? 0} data rows, {parsed?.headers.length ?? 0} columns
            </p>
          )}
        </CardContent>
      </Card>

      {parsed && (
        <>
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="font-semibold">Field mapping</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {target.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={`map-${f.key}`}>
                      {f.label}
                      {f.required ? " *" : ""}
                    </Label>
                    <select
                      id={`map-${f.key}`}
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                      value={mapping[f.key] ?? ""}
                      onChange={(e) =>
                        setMapping({ ...mapping, [f.key]: e.target.value })
                      }
                    >
                      <option value="">— none —</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">Preview (first 10 rows)</h2>
                <Badge
                  variant="outline"
                  className={detected.dupes.length ? "text-amber-600" : "text-emerald-600"}
                >
                  {detected.dupes.length ? (
                    <>
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      {detected.dupes.length} duplicate{detected.dupes.length > 1 ? "s" : ""} detected
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3" aria-hidden />
                      No duplicates detected
                    </>
                  )}
                </Badge>
              </div>
              {detected.dupes.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {detected.dupes.slice(0, 12).join(", ")}
                  {detected.dupes.length > 12 ? ` … +${detected.dupes.length - 12} more` : ""}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">#</th>
                      {target.fields.map((f) => (
                        <th key={f.key} className="py-2 pr-3">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{i + 2}</td>
                        {target.fields.map((f) => {
                          const header = mapping[f.key];
                          const idx = header ? parsed.headers.indexOf(header) : -1;
                          const v = idx >= 0 ? row[idx] : "";
                          return (
                            <td key={f.key} className="py-2 pr-3">
                              {String(v ?? "").slice(0, 40)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {parsed.rows.length === 0 && (
                      <tr>
                        <td colSpan={target.fields.length + 1} className="py-6 text-center text-sm text-muted-foreground">
                          No data rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void runImport()} disabled={busy || !!batchId}>
              {busy ? "Importing…" : `Import ${parsed.rows.length} rows`}
            </Button>
            {batchId && (
              <>
                <Badge variant="outline" className="text-emerald-600">
                  {imported} rows queued — will sync automatically
                </Badge>
                <Button variant="outline" onClick={() => void rollback()} disabled={busy}>
                  Rollback import
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
