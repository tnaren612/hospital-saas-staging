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

type ReturnRow = Record<string, unknown> & {
  return_number?: string;
  original_sale_number?: string | null;
  patient_name?: string;
  return_reason?: string;
  return_type?: string;
  refund_amount?: number;
  status?: string;
  items?: Array<Record<string, unknown>>;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "text-amber-600",
  approved: "text-blue-600",
  completed: "text-emerald-600",
  rejected: "text-rose-600",
};

export function ReturnsView() {
  const storage = useOfflineStore();
  const returns = useOfflineEntities<ReturnRow>("return");
  const medicines = useOfflineEntities<Record<string, unknown>>("medicine");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    patient_name: "",
    patient_phone: "",
    original_sale_number: "",
    return_reason: "wrong_item",
    return_type: "refund",
    refund_method: "cash",
    items: [] as Array<{ name: string; qty: string; unit_price: string; reason?: string }>,
  });

  const itemTotal = useMemo(
    () =>
      form.items.reduce(
        (s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
        0
      ),
    [form.items]
  );

  const createReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_name.trim()) {
      toast.error("Patient name is required");
      return;
    }
    const validItems = form.items.filter(
      (it) => it.name.trim() && Number(it.qty) > 0
    );
    if (!validItems.length) {
      toast.error("Add at least one returned medicine");
      return;
    }
    const id = createUuid();
    const payload: Record<string, unknown> = {
      _clientId: id,
      return_number: `RET-${Date.now().toString().slice(-8)}`,
      original_sale_number: form.original_sale_number.trim() || null,
      patient_name: form.patient_name.trim(),
      patient_phone: form.patient_phone.trim() || null,
      return_reason: form.return_reason,
      return_type: form.return_type,
      refund_method: form.refund_method,
      subtotal: Number(itemTotal.toFixed(2)),
      refund_amount: Number(itemTotal.toFixed(2)),
      status: "pending",
      items: validItems.map((it) => ({
        medicine_name: it.name.trim(),
        quantity: Number(it.qty),
        unit_price: Number(it.unit_price) || 0,
        total_price: Number(((Number(it.qty) || 0) * (Number(it.unit_price) || 0)).toFixed(2)),
        reason: it.reason || form.return_reason,
      })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await enqueueMutation(storage, {
      id,
      hospitalId: "local",
      entity: "return",
      action: "create",
      payload,
      targetKey: `return::${id}`,
    });
    toast.success("Return recorded offline — syncs automatically");
    setShowForm(false);
    setForm({ ...form, patient_name: "", patient_phone: "", original_sale_number: "", items: [] });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Returns & Exchanges"
        description={`${returns.length} returns cached · ${formatMoney(
          returns.reduce((s, r) => s + Number(r.data.refund_amount || 0), 0)
        )} refunded`}
        actions={
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" aria-hidden />
            New return
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <form onSubmit={(e) => void createReturn(e)} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="ret-name">Patient name *</Label>
                  <Input
                    id="ret-name"
                    required
                    value={form.patient_name}
                    onChange={(e) => setForm({ ...form, patient_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ret-phone">Phone</Label>
                  <Input
                    id="ret-phone"
                    value={form.patient_phone}
                    onChange={(e) => setForm({ ...form, patient_phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ret-sale">Original sale #</Label>
                  <Input
                    id="ret-sale"
                    value={form.original_sale_number}
                    onChange={(e) => setForm({ ...form, original_sale_number: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ret-type">Return type</Label>
                  <select
                    id="ret-type"
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    value={form.return_type}
                    onChange={(e) => setForm({ ...form, return_type: e.target.value })}
                  >
                    <option value="refund">Refund</option>
                    <option value="exchange">Exchange</option>
                    <option value="credit_note">Credit note</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ret-reason">Reason</Label>
                  <select
                    id="ret-reason"
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    value={form.return_reason}
                    onChange={(e) => setForm({ ...form, return_reason: e.target.value })}
                  >
                    <option value="wrong_item">Wrong item dispensed</option>
                    <option value="expired">Expired / near expiry</option>
                    <option value="side_effect">Side effects</option>
                    <option value="doctor_changed">Doctor changed prescription</option>
                    <option value="damaged">Damaged packaging</option>
                    <option value="duplicate">Duplicate purchase</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ret-refund">Refund method</Label>
                  <select
                    id="ret-refund"
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    value={form.refund_method}
                    onChange={(e) => setForm({ ...form, refund_method: e.target.value })}
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="wallet">Wallet</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ret-med">Returned medicines (type to pick)</Label>
                <Input
                  id="ret-med"
                  list="ret-medicines"
                  placeholder="Pick a medicine…"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v)
                      setForm({
                        ...form,
                        items: [...form.items, { name: v, qty: "", unit_price: "" }],
                      });
                    e.target.value = "";
                  }}
                />
                <datalist id="ret-medicines">
                  {medicines.map((m) => (
                    <option key={m.id} value={String(m.data.name ?? "")} />
                  ))}
                </datalist>

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
                      {form.items.map((it, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-3">{it.name}</td>
                          <td className="py-2 pr-3">
                            <Input
                              type="number"
                              min="1"
                              className="h-9 w-20"
                              value={it.qty}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  items: form.items.map((x, j) =>
                                    j === i ? { ...x, qty: e.target.value } : x
                                  ),
                                })
                              }
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-9 w-28"
                              value={it.unit_price}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  items: form.items.map((x, j) =>
                                    j === i ? { ...x, unit_price: e.target.value } : x
                                  ),
                                })
                              }
                            />
                          </td>
                          <td className="py-2 pr-3 font-medium">
                            {formatMoney((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}
                          </td>
                          <td className="py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-rose-600"
                              onClick={() =>
                                setForm({
                                  ...form,
                                  items: form.items.filter((_, j) => j !== i),
                                })
                              }
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {form.items.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">
                            No items yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  Refund amount: <span className="font-semibold">{formatMoney(itemTotal)}</span>
                </div>
                <Button type="submit">Record return (offline)</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-2 p-4">
          {returns.map((rec) => {
            const r = rec.data;
            return (
              <div key={rec.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
                <div>
                  <div className="font-medium">
                    {r.return_number || "—"}{" "}
                    <span className="text-sm text-muted-foreground">· {r.patient_name}</span>
                    {r.original_sale_number && (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        (sale {r.original_sale_number})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.return_type} · {r.return_reason} · {rec.updatedAt.slice(0, 10)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{formatMoney(Number(r.refund_amount) || 0)}</span>
                  <Badge variant="outline" className={STATUS_STYLE[String(r.status)] ?? ""}>
                    {r.status || "pending"}
                  </Badge>
                </div>
              </div>
            );
          })}
          {returns.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No returns yet — refunds, exchanges and credit notes are stored offline.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
