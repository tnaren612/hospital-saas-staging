"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Pill, RefreshCw, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Medicine } from "@/lib/phase2/types";
import { PortalLogout } from "@/components/auth/portal-logout";

export function PharmacyManager() {
  const [meds, setMeds] = useState<Medicine[]>([]);
  const [alerts, setAlerts] = useState<{ low_stock: Medicine[]; expiring: Medicine[] }>({
    low_stock: [],
    expiring: [],
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saleMedId, setSaleMedId] = useState("");
  const [saleQty, setSaleQty] = useState(1);
  const [stockAddQty, setStockAddQty] = useState(1);
  const [patientName, setPatientName] = useState("Walk-in Patient");
  const [actionError, setActionError] = useState("");
  const [newSku, setNewSku] = useState({ name: "", purchase_price: 0, selling_price: 0, stock_qty: 0, reorder_level: 10 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([
        fetch("/api/phase2/pharmacy?kind=medicines", { cache: "no-store" }),
        fetch("/api/phase2/pharmacy?kind=alerts", { cache: "no-store" }),
      ]);
      const mj = await m.json();
      const aj = await a.json();
      setMeds(mj.data || []);
      setAlerts({ low_stock: aj.low_stock || [], expiring: aj.expiring || [] });
      if (!saleMedId && mj.data?.[0]?.id) setSaleMedId(mj.data[0].id);
    } catch {
      toast.error("Failed to load pharmacy");
    } finally {
      setLoading(false);
    }
  }, [saleMedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sell = async () => {
    const med = meds.find((m) => m.id === saleMedId);
    if (!med) return;
    if (saleQty > med.stock_qty) {
      setActionError(`Only ${med.stock_qty} ${med.unit || "units"} of ${med.name} are available. Enter ${med.stock_qty} or less.`);
      return;
    }
    setActionError("");
    setBusy(true);
    try {
      const res = await fetch("/api/phase2/pharmacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sale",
          patient_name: patientName,
          sale_type: "walk_in",
          payment_method: "upi",
          items: [
            {
              medicine_id: med.id,
              name: med.name,
              qty: saleQty,
              price: med.selling_price,
            },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error("Sale could not be completed. Please check the available stock.");
      toast.success(`Sale ${json.data.sale_number} · ₹${json.data.grand_total}`);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sale could not be completed.";
      setActionError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const addStock = async () => {
    const med = meds.find((m) => m.id === saleMedId);
    if (!med || stockAddQty < 1) return;
    setActionError("");
    setBusy(true);
    try {
      const res = await fetch("/api/phase2/pharmacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: med.id,
          name: med.name,
          generic_name: med.generic_name,
          manufacturer: med.manufacturer,
          batch_number: med.batch_number,
          category: med.category,
          purchase_price: med.purchase_price,
          selling_price: med.selling_price,
          stock_qty: med.stock_qty + stockAddQty,
          reorder_level: med.reorder_level,
          expiry_date: med.expiry_date,
          unit: med.unit,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error("Stock could not be updated. Please try again.");
      toast.success(`${med.name} stock updated to ${json.data.stock_qty}`);
      setStockAddQty(1);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Stock could not be updated.";
      setActionError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const createSku = async () => {
    if (!newSku.name.trim() || newSku.stock_qty < 0 || newSku.selling_price < 0 || newSku.purchase_price < 0) {
      setActionError("Enter a medicine name and valid non-negative prices and stock.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch("/api/phase2/pharmacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newSku, category: "General", unit: "unit" }),
      });
      if (!res.ok) throw new Error("New SKU could not be created. Please check the details.");
      const json = await res.json();
      toast.success(`${json.data.name} added to pharmacy stock`);
      setNewSku({ name: "", purchase_price: 0, selling_price: 0, stock_qty: 0, reorder_level: 10 });
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "New SKU could not be created.";
      setActionError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pharmacy Management"
        description="Inventory, sales, low-stock and expiry alerts"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <PortalLogout />
          </div>
        }
      />
      {actionError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          {actionError}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">SKUs</p>
            <p className="text-2xl font-bold">{meds.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Low stock</p>
            <p className="text-2xl font-bold text-amber-600">{alerts.low_stock.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Expiring (90d)</p>
            <p className="text-2xl font-bold text-rose-600">{alerts.expiring.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Walk-in sale — patient</Label>
            <Input className="mt-1" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
          </div>
          <div>
            <Label>Medicine</Label>
            <select
              className="mt-1 flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={saleMedId}
              onChange={(e) => setSaleMedId(e.target.value)}
            >
              {meds.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (stock {m.stock_qty})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Qty</Label>
            <Input
              type="number"
              min={1}
              className="mt-1"
              value={saleQty}
              onChange={(e) => setSaleQty(Number(e.target.value) || 1)}
            />
          </div>
          <div className="sm:col-span-4">
            <Button disabled={busy || !saleMedId} onClick={() => void sell()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              Record sale
            </Button>
          </div>
          <div className="sm:col-span-2">
            <Label>Add stock</Label>
            <Input
              type="number"
              min={1}
              className="mt-1"
              value={stockAddQty}
              onChange={(e) => setStockAddQty(Number(e.target.value) || 1)}
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button variant="outline" disabled={busy || !saleMedId} onClick={() => void addStock()}>
              Add stock
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <Label>New SKU / medicine name</Label>
            <Input className="mt-1" value={newSku.name} onChange={(e) => setNewSku({ ...newSku, name: e.target.value })} placeholder="e.g. Azithromycin 500" />
          </div>
          <div><Label>Purchase price</Label><Input className="mt-1" type="number" min={0} value={newSku.purchase_price} onChange={(e) => setNewSku({ ...newSku, purchase_price: Number(e.target.value) || 0 })} /></div>
          <div><Label>Selling price</Label><Input className="mt-1" type="number" min={0} value={newSku.selling_price} onChange={(e) => setNewSku({ ...newSku, selling_price: Number(e.target.value) || 0 })} /></div>
          <div><Label>Opening stock</Label><Input className="mt-1" type="number" min={0} value={newSku.stock_qty} onChange={(e) => setNewSku({ ...newSku, stock_qty: Number(e.target.value) || 0 })} /></div>
          <div><Label>Reorder level</Label><Input className="mt-1" type="number" min={0} value={newSku.reorder_level} onChange={(e) => setNewSku({ ...newSku, reorder_level: Number(e.target.value) || 0 })} /></div>
          <div className="sm:col-span-5"><Button disabled={busy} onClick={() => void createSku()}>Add new SKU</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Medicine</th>
                    <th className="px-4 py-3">Manufacturer</th>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {meds.map((m) => (
                    <tr key={m.id} className="border-b border-border/60">
                      <td className="px-4 py-3 font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Pill className="h-3.5 w-3.5 text-primary-600" />
                          {m.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">{m.manufacturer}</td>
                      <td className="px-4 py-3 font-mono text-xs">{m.batch_number}</td>
                      <td className="px-4 py-3">
                        {m.stock_qty <= m.reorder_level ? (
                          <Badge className="bg-amber-500 text-white">{m.stock_qty} low</Badge>
                        ) : (
                          m.stock_qty
                        )}
                      </td>
                      <td className="px-4 py-3">₹{m.selling_price}</td>
                      <td className="px-4 py-3 text-xs">{m.expiry_date || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
