"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { PackagePlus, Search, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/pharmacy/tax";
import {
  enqueueMutation,
  useOfflineEntities,
  useOfflineStore,
} from "@/lib/pharmacy/offline";
import { findDuplicateMedicineKey } from "@/lib/pharmacy/barcode/scan";

type MedicineRow = Record<string, unknown> & {
  id?: string;
  name?: string;
  generic_name?: string;
  manufacturer?: string;
  batch_number?: string;
  sku?: string;
  barcode?: string;
  unit?: string;
  purchase_price?: number;
  selling_price?: number;
  stock_qty?: number;
  min_stock_level?: number;
  reorder_level?: number;
  expiry_date?: string | null;
  schedule?: string;
};

const PAGE_SIZE = 100;

export function InventoryView() {
  const storage = useOfflineStore();
  const cached = useOfflineEntities<MedicineRow>("medicine");
  const [medicines, setMedicines] = useState<MedicineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const [form, setForm] = useState({
    name: "",
    generic_name: "",
    manufacturer: "",
    sku: "",
    barcode: "",
    batch_number: "",
    unit: "tab",
    purchase_price: "",
    selling_price: "",
    stock_qty: "",
    reorder_level: "",
    expiry_date: "",
    schedule: "OTC",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/phase2/pharmacy?kind=medicines", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("fetch failed");
      const json = (await res.json()) as { data?: MedicineRow[] };
      const rows = json.data || [];
      setMedicines(rows);
      await storage.appendAudit({
        actor: "cashier",
        action: "inventory.cache.seeded",
        entity: "medicine",
        details: { rows: rows.length },
      });
      for (const m of rows) {
        if (!m.id) continue;
        await storage.putEntity("medicine", String(m.id), m, "local", undefined);
      }
    } catch {
      // offline — serve from cache
    } finally {
      setLoading(false);
    }
  }, [storage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [q]);

  const merged = useMemo(() => {
    const byId = new Map<string, MedicineRow>();
    for (const m of medicines) if (m.id) byId.set(String(m.id), m);
    for (const rec of cached) byId.set(String(rec.id), rec.data as MedicineRow);
    return [...byId.values()];
  }, [medicines, cached]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return merged;
    return merged.filter((m) =>
      [m.name, m.generic_name, m.manufacturer, m.sku, m.barcode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [merged, q]);

  const stats = useMemo(() => {
    const low = merged.filter(
      (m) => Number(m.stock_qty) <= Number(m.min_stock_level ?? m.reorder_level ?? 10)
    );
    const expiring = merged.filter(
      (m) => m.expiry_date && String(m.expiry_date) <= addDays(90)
    );
    const out = merged.filter((m) => Number(m.stock_qty) === 0);
    const value = merged.reduce(
      (s, m) => s + Number(m.stock_qty || 0) * Number(m.purchase_price || 0),
      0
    );
    return { low, expiring, out, value, total: merged.length };
  }, [merged]);

  const addSku = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error("Medicine name is required.");
      return;
    }
    const dup = findDuplicateMedicineKey(
      merged.map((m) => ({
        id: String(m.id),
        name: String(m.name ?? ""),
        sku: m.sku ? String(m.sku) : null,
        barcode: m.barcode ? String(m.barcode) : null,
        manufacturer: m.manufacturer ? String(m.manufacturer) : null,
      })),
      {
        name,
        manufacturer: form.manufacturer.trim() || null,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
      }
    );
    if (dup) {
      toast.error(
        dup.kind === "name"
          ? `${dup.medicine.name} already exists with this name & manufacturer.`
          : `That ${dup.kind} already belongs to ${dup.medicine.name}.`
      );
      return;
    }
    const payload: Record<string, unknown> = {
      _clientId: crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      name,
      generic_name: form.generic_name.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      batch_number: form.batch_number.trim() || null,
      unit: form.unit || "tab",
      purchase_price: Number(form.purchase_price) || 0,
      selling_price: Number(form.selling_price) || 0,
      stock_qty: Number(form.stock_qty) || 0,
      min_stock_level: Number(form.reorder_level) || 10,
      reorder_level: Number(form.reorder_level) || 10,
      expiry_date: form.expiry_date || null,
      schedule: form.schedule || "OTC",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const op = await enqueueMutation(storage, {
      id: payload._clientId as string,
      hospitalId: "local",
      entity: "medicine",
      action: "create",
      payload,
      targetKey: `medicine::${payload._clientId}`,
    });
    if (op) {
      toast.success(
        "Medicine added offline — will sync to the server when online"
      );
      setShowForm(false);
      setForm({
        name: "",
        generic_name: "",
        manufacturer: "",
        sku: "",
        barcode: "",
        batch_number: "",
        unit: "tab",
        purchase_price: "",
        selling_price: "",
        stock_qty: "",
        reorder_level: "",
        expiry_date: "",
        schedule: "OTC",
      });
    }
  };

  const shown = filtered.slice(0, visible);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pharmacy Inventory"
        description={`${stats.total} medicines · ${formatMoney(stats.value)} stock value`}
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <PackagePlus className="h-4 w-4" />
            Add Medicine
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total medicines</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-600">{stats.low.length}</div>
            <div className="text-xs text-muted-foreground">Low stock</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-rose-600">{stats.expiring.length}</div>
            <div className="text-xs text-muted-foreground">Expiring ≤ 90 days</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{formatMoney(stats.value)}</div>
            <div className="text-xs text-muted-foreground">Stock value (cost)</div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="font-semibold">Add medicine (offline-safe)</h2>
            <form onSubmit={(e) => void addSku(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="med-name">Medicine name *</Label>
                <Input
                  id="med-name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="med-generic">Generic name</Label>
                <Input
                  id="med-generic"
                  value={form.generic_name}
                  onChange={(e) => setForm({ ...form, generic_name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="med-mfr">Manufacturer</Label>
                <Input
                  id="med-mfr"
                  value={form.manufacturer}
                  onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="med-sku">SKU / Barcode</Label>
                <Input
                  id="med-sku"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="med-batch">Batch number</Label>
                <Input
                  id="med-batch"
                  value={form.batch_number}
                  onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="med-pp">Purchase price</Label>
                <Input
                  id="med-pp"
                  type="number"
                  step="0.01"
                  value={form.purchase_price}
                  onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="med-sp">Selling price</Label>
                <Input
                  id="med-sp"
                  type="number"
                  step="0.01"
                  value={form.selling_price}
                  onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="med-qty">Opening stock</Label>
                <Input
                  id="med-qty"
                  type="number"
                  value={form.stock_qty}
                  onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="med-reorder">Reorder level</Label>
                <Input
                  id="med-reorder"
                  type="number"
                  value={form.reorder_level}
                  onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="med-exp">Expiry date</Label>
                <Input
                  id="med-exp"
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  Save (offline-safe)
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              className="pl-10"
              placeholder="Search by name, generic, brand, SKU or barcode…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search medicines"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Medicine</th>
                  <th className="py-2 pr-3">Batch</th>
                  <th className="py-2 pr-3">Stock</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Expiry</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const stock = Number(m.stock_qty || 0);
                  const low = stock <= Number(m.min_stock_level ?? m.reorder_level ?? 10);
                  const expiring = m.expiry_date && String(m.expiry_date) <= addDays(90);
                  const expired = m.expiry_date && String(m.expiry_date) < today();
                  return (
                    <tr key={String(m.id ?? m.sku ?? m.name)} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[m.generic_name, m.manufacturer].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs">{m.batch_number || "—"}</td>
                      <td className="py-2 pr-3">
                        <span className={low ? "font-semibold text-amber-600" : ""}>
                          {stock}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{formatMoney(Number(m.selling_price) || 0)}</td>
                      <td className="py-2 pr-3">
                        {m.expiry_date ? (
                          <span
                            className={expired ? "text-rose-600" : expiring ? "text-amber-600" : ""}
                          >
                            {String(m.expiry_date)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {expired && <Badge variant="outline" className="text-rose-600">Expired</Badge>}
                          {!expired && expiring && (
                            <Badge variant="outline" className="text-amber-600">
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              Expiring
                            </Badge>
                          )}
                          {low && <Badge variant="outline" className="text-amber-600">Low stock</Badge>}
                          {stock === 0 && <Badge variant="outline" className="text-rose-600">Out</Badge>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No medicines found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > visible && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
              >
                Load more ({filtered.length - visible} remaining)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
