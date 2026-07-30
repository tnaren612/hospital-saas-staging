"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { IndianRupee, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { HospitalBill } from "@/lib/phase2/types";

export function HospitalBillingManager() {
  const [bills, setBills] = useState<HospitalBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    patient_name: "",
    patient_phone: "",
    doctor_name: "",
    consultation_fee: 500,
    lab_charges: 0,
    pharmacy_charges: 0,
    other_charges: 0,
    discount: 0,
    gst_percent: 0,
    payment_method: "upi",
    payment_status: "paid" as const,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/phase2/bills", { cache: "no-store" });
      const json = await res.json();
      setBills(json.data || []);
    } catch {
      toast.error("Failed to load bills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sub =
    form.consultation_fee +
    form.lab_charges +
    form.pharmacy_charges +
    form.other_charges -
    form.discount;
  const gst = Math.round(sub * (form.gst_percent / 100) * 100) / 100;
  const total = Math.max(0, sub + gst);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/phase2/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          line_items: [
            { label: "Consultation", amount: form.consultation_fee },
            { label: "Lab", amount: form.lab_charges },
            { label: "Pharmacy", amount: form.pharmacy_charges },
            { label: "Other", amount: form.other_charges },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.success(`Bill ${json.data.bill_number} · ₹${json.data.grand_total}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const revenue = bills
    .filter((b) => b.payment_status === "paid")
    .reduce((s, b) => s + Number(b.grand_total), 0);
  const outstanding = bills
    .filter((b) => b.payment_status === "pending")
    .reduce((s, b) => s + Number(b.grand_total), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hospital Billing"
        description="Consultation, lab, pharmacy charges · GST · multi-method payments"
        actions={
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="text-2xl font-bold">₹{revenue.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-2xl font-bold text-amber-600">₹{outstanding.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Bills</p>
            <p className="text-2xl font-bold">{bills.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
          <div>
            <Label>Patient</Label>
            <Input className="mt-1" value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input className="mt-1" value={form.patient_phone} onChange={(e) => setForm({ ...form, patient_phone: e.target.value })} />
          </div>
          <div>
            <Label>Doctor</Label>
            <Input className="mt-1" value={form.doctor_name} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} />
          </div>
          {(
            [
              ["consultation_fee", "Consultation"],
              ["lab_charges", "Lab"],
              ["pharmacy_charges", "Pharmacy"],
              ["other_charges", "Other"],
              ["discount", "Discount"],
              ["gst_percent", "GST %"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input
                type="number"
                className="mt-1"
                value={form[key]}
                onChange={(e) =>
                  setForm({ ...form, [key]: Number(e.target.value) || 0 })
                }
              />
            </div>
          ))}
          <div>
            <Label>Payment method</Label>
            <select
              className="mt-1 flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
            >
              {["cash", "upi", "gpay", "phonepe", "paytm", "credit_card", "debit_card", "net_banking"].map(
                (m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                )
              )}
            </select>
          </div>
          <div className="flex items-end">
            <p className="text-lg font-bold">
              Total: ₹{total.toFixed(2)}
            </p>
          </div>
          <div className="sm:col-span-3">
            <Button disabled={busy} onClick={() => void create()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <IndianRupee className="h-4 w-4" />}
              Generate bill
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : bills.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No bills yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Bill</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id} className="border-b border-border/60">
                      <td className="px-4 py-3 font-medium">{b.bill_number}</td>
                      <td className="px-4 py-3">
                        {b.patient_name}
                        <div className="text-xs text-muted-foreground">{b.patient_phone}</div>
                      </td>
                      <td className="px-4 py-3">₹{Number(b.grand_total).toFixed(0)}</td>
                      <td className="px-4 py-3">{b.payment_method}</td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            b.payment_status === "paid"
                              ? "bg-emerald-600 text-white"
                              : "bg-amber-500 text-white"
                          }
                        >
                          {b.payment_status}
                        </Badge>
                      </td>
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
