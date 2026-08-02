"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
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
import { createUuid } from "@/lib/pharmacy/offline/storage";

type PoRow = Record<string, unknown> & {
  po_number?: string;
  supplier_name?: string;
  status?: string;
  total_amount?: number;
  line_items?: Array<Record<string, unknown>>;
};

type LineDraft = { name: string; qty: string; price: string };

const STATUS_STYLE: Record<string, string> = {
  draft: "text-muted-foreground",
  ordered: "text-blue-600",
  received: "text-emerald-600",
  cancelled: "text-rose-600",
};

export function PurchasesView() {
  const storage = useOfflineStore();
  const pos = useOfflineEntities<PoRow>("purchase_order");
  const suppliers = useOfflineEntities<Record<string, unknown>>("supplier");
  const medicines = useOfflineEntities<Record<string, unknown>>("medicine");
  const [showForm, setShowForm] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

  const total = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0),
        0
      ),
    [lines]
  );

  const createPo = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = lines.filter((l) => l.name.trim() && Number(l.qty) > 0);
    if (!valid.length) {
      toast.error("Add at least one line item");
      return;
    }
    const id = createUuid();
    const payload: Record<string, unknown> = {
      _clientId: id,
      po_number: `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(
        pos.length + 1
      ).padStart(3, "0")}`,
      supplier_name: supplierName.trim() || "Walk-in supplier",
      status: "draft",
      total_amount: Number(total.toFixed(2)),
      line_items: valid.map((l) => ({
        name: l.name.trim(),
        quantity: Number(l.qty),
        unit_price: Number(l.price) || 0,
        total: Number(((Number(l.qty) || 0) * (Number(l.price) || 0)).toFixed(2)),
      })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await enqueueMutation(storage, {
      id,
      hospitalId: "local",
      entity: "purchase_order",
      action: "create",
      payload,
      targetKey: `purchase_order::${id}`,
    });
    toast.success("Purchase order saved offline — syncs automatically");
    setShowForm(false);
    setLines([]);
    setSupplierName("");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchase Orders"
        description={`${pos.length} purchase orders cached`}
        actions={
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" aria-hidden />
            New purchase order
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <form onSubmit={(e) => void createPo(e)} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="po-supplier">Supplier</Label>
                  <Input
                    id="po-supplier"
                    list="po-suppliers"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Type or pick from cached suppliers"
                  />
                  <datalist id="po-suppliers">
                    {suppliers.map((s) => (
                      <option key={s.id} value={String(s.data.name ?? "")} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="po-med">Quick add medicine</Label>
                  <Input
                    id="po-med"
                    list="po-medicines"
                    placeholder="Pick medicine, then fill qty + price"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v) setLines([...lines, { name: v, qty: "", price: "" }]);
                      e.target.value = "";
                    }}
                  />
                  <datalist id="po-medicines">
                    {medicines.map((m) => (
                      <option key={m.id} value={String(m.data.name ?? "")} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Medicine</th>
                      <th className="py-2 pr-3">Qty</th>
                      <th className="py-2 pr-3">Unit price</th>
                      <th className="py-2 pr-3">Total</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-3">{l.name}</td>
                        <td className="py-2 pr-3">
                          <Input
                            type="number"
                            min="1"
                            className="h-9 w-20"
                            value={l.qty}
                            onChange={(e) =>
                              setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))
                            }
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            type="number"
                            step="0.01"
                            className="h-9 w-28"
                            value={l.price}
                            onChange={(e) =>
                              setLines(lines.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))
                            }
                          />
                        </td>
                        <td className="py-2 pr-3 font-medium">
                          {formatMoney((Number(l.qty) || 0) * (Number(l.price) || 0))}
                        </td>
                        <td className="py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-rose-600"
                            onClick={() => setLines(lines.filter((_, j) => j !== i))}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {lines.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">
                          No line items yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  Order total:{" "}
                  <span className="font-semibold">{formatMoney(total)}</span>
                </div>
                <Button type="submit">Save purchase order (offline)</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-2 p-4">
          {pos.map((rec) => {
            const p = rec.data;
            const items = Array.isArray(p.line_items) ? p.line_items : [];
            return (
              <div key={rec.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
                <div>
                  <div className="font-medium">
                    {p.po_number || "—"}{" "}
                    <span className="text-sm text-muted-foreground">· {p.supplier_name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {items.length} line items · {rec.updatedAt.slice(0, 10)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{formatMoney(Number(p.total_amount) || 0)}</span>
                  <Badge variant="outline" className={STATUS_STYLE[String(p.status)] ?? ""}>
                    {p.status || "draft"}
                  </Badge>
                </div>
              </div>
            );
          })}
          {pos.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No purchase orders yet — create one, it will sync when online.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
