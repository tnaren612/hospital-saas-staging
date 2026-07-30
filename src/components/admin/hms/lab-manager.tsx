"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FlaskConical, Loader2, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { LabOrder, LabTest } from "@/lib/phase2/types";

const STATUSES = [
  "pending",
  "sample_collected",
  "processing",
  "completed",
  "delivered",
] as const;

export function LabManager() {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [reportUrl, setReportUrl] = useState("");
  const [form, setForm] = useState({
    patient_name: "",
    patient_phone: "",
    patient_email: "",
    doctor_name: "",
    notes: "",
    priority: "normal" as "normal" | "urgent",
    test_ids: [] as string[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, t] = await Promise.all([
        fetch("/api/phase2/lab?kind=orders", { cache: "no-store" }),
        fetch("/api/phase2/lab?kind=tests", { cache: "no-store" }),
      ]);
      const oj = await o.json();
      const tj = await t.json();
      setOrders(oj.data || []);
      setTests(tj.data || []);
    } catch {
      toast.error("Failed to load lab data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createOrder = async () => {
    if (!form.patient_name || form.patient_phone.length < 10 || !form.test_ids.length) {
      toast.error("Name, phone, and at least one test required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/phase2/lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      toast.success(`Order ${json.data.order_number} created`);
      setForm({
        patient_name: "",
        patient_phone: "",
        patient_email: "",
        doctor_name: "",
        notes: "",
        priority: "normal",
        test_ids: [],
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/phase2/lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          id,
          status,
          report_url:
            status === "completed" || status === "delivered"
              ? reportUrl || undefined
              : undefined,
          findings:
            status === "completed" || status === "delivered"
              ? "Report finalized."
              : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      toast.success(`Status → ${status}`);
      if (status === "completed" || status === "delivered") setReportUrl("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const filtered = statusFilter
    ? orders.filter((o) => o.status === statusFilter)
    : orders;

  const pending = orders.filter((o) =>
    ["pending", "sample_collected", "processing"].includes(o.status)
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laboratory Management"
        description="Orders, sample collection, processing, and report status"
        actions={
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending pipeline</p>
            <p className="text-2xl font-bold">{pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total orders</p>
            <p className="text-2xl font-bold">{orders.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Catalog tests</p>
            <p className="text-2xl font-bold">{tests.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <Plus className="h-4 w-4" /> New lab order
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Patient name</Label>
              <Input
                className="mt-1"
                value={form.patient_name}
                onChange={(e) => setForm({ ...form, patient_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="lab-phone">Phone</Label>
              <Input
                id="lab-phone"
                className="mt-1"
                value={form.patient_phone}
                maxLength={10}
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, patient_phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="lab-email">Patient email (report notify)</Label>
              <Input
                id="lab-email"
                type="email"
                className="mt-1"
                value={form.patient_email}
                onChange={(e) =>
                  setForm({ ...form, patient_email: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="lab-doctor">Doctor</Label>
              <Input
                id="lab-doctor"
                className="mt-1"
                value={form.doctor_name}
                onChange={(e) => setForm({ ...form, doctor_name: e.target.value })}
                placeholder="Ordering clinician"
              />
            </div>
            <div>
              <Label htmlFor="lab-notes">Notes</Label>
              <Input
                id="lab-notes"
                className="mt-1"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="lab-priority">Priority</Label>
              <select
                id="lab-priority"
                className="mt-1 flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={form.priority}
                onChange={(e) =>
                  setForm({
                    ...form,
                    priority: e.target.value as "normal" | "urgent",
                  })
                }
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Tests</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {tests.map((t) => {
                const on = form.test_ids.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      on
                        ? "border-primary-500 bg-primary-50 text-primary-800"
                        : "border-border text-muted-foreground"
                    }`}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        test_ids: on
                          ? f.test_ids.filter((x) => x !== t.id)
                          : [...f.test_ids, t.id],
                      }))
                    }
                  >
                    {t.name} · ₹{t.price}
                  </button>
                );
              })}
            </div>
          </div>
          <Button disabled={busy} onClick={() => void createOrder()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Create order
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="lab-filter" className="mb-1 block text-xs">
            Filter status
          </Label>
          <select
            id="lab-filter"
            className="flex h-11 min-w-[140px] rounded-xl border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="lab-report-url" className="mb-1 block text-xs">
            Report URL (on complete/deliver)
          </Label>
          <Input
            id="lab-report-url"
            value={reportUrl}
            onChange={(e) => setReportUrl(e.target.value)}
            placeholder="https://… or storage path"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground" role="status">
              Loading lab orders…
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No lab orders match this filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => (
                    <tr key={o.id} className="border-b border-border/60">
                      <td className="px-4 py-3 font-medium">{o.order_number}</td>
                      <td className="px-4 py-3">
                        <div>{o.patient_name}</div>
                        <div className="text-xs text-muted-foreground">{o.patient_phone}</div>
                      </td>
                      <td className="px-4 py-3">₹{Number(o.total_amount).toFixed(0)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{o.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
                          value={o.status}
                          disabled={busy}
                          onChange={(e) => void setStatus(o.id, e.target.value)}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
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
