"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/pharmacy/tax";
import { useOfflineEntities, useOfflineStore } from "@/lib/pharmacy/offline";
import { downloadTextFile, toCsv } from "@/lib/hms/export";

type SaleRow = Record<string, unknown> & {
  sale_number?: string;
  patient_name?: string;
  grand_total?: number;
  amount_paid?: number;
  amount_returned?: number;
  payment_method?: string;
  payment_status?: string;
  payment_reference?: string | null;
  created_at?: string;
  cashier_name?: string;
};

const STATUS_STYLE: Record<string, string> = {
  paid: "text-emerald-600",
  pending: "text-amber-600",
  refunded: "text-rose-600",
  cancelled: "text-muted-foreground",
};

export function PaymentsView() {
  const storage = useOfflineStore();
  const sales = useOfflineEntities<SaleRow>("sale");
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("all");

  const summary = useMemo(() => {
    const map = new Map<string, { method: string; amount: number; count: number }>();
    for (const rec of sales) {
      const s = rec.data;
      const m = String(s.payment_method || "other");
      const cur = map.get(m) || { method: m, amount: 0, count: 0 };
      cur.amount += Number(s.amount_paid ?? s.grand_total ?? 0);
      cur.count++;
      map.set(m, cur);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [sales]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sales.filter((rec) => {
      const s = rec.data;
      if (method !== "all" && String(s.payment_method) !== method) return false;
      if (!needle) return true;
      return [s.sale_number, s.patient_name, s.payment_reference]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [sales, q, method]);

  const exportCsv = async () => {
    if (!filtered.length) return;
    const rows = filtered.map((r) => ({
      sale_number: r.data.sale_number ?? "",
      customer: r.data.patient_name ?? "",
      method: r.data.payment_method ?? "",
      amount_paid: r.data.amount_paid ?? 0,
      returned: r.data.amount_returned ?? 0,
      reference: r.data.payment_reference ?? "",
      status: r.data.payment_status ?? "",
      cashier: r.data.cashier_name ?? "",
      date: String(r.data.created_at ?? "").slice(0, 10),
    }));
    downloadTextFile(`pharmacy-payments-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
    await storage.appendAudit({
      actor: "cashier",
      action: "payments.exported",
      entity: "sale",
      details: { rows: rows.length },
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description={`${sales.length} transactions · ${formatMoney(summary.reduce((s, m) => s + m.amount, 0))} collected`}
        actions={
          <Button size="sm" variant="outline" onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((m) => (
          <Card key={m.method}>
            <CardContent className="p-4">
              <div className="text-lg font-bold capitalize">{m.method}</div>
              <div className="text-2xl font-bold">{formatMoney(m.amount)}</div>
              <div className="text-xs text-muted-foreground">{m.count} payments</div>
            </CardContent>
          </Card>
        ))}
        {summary.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No payments cached yet.
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap gap-3">
            <Input
              className="max-w-xs"
              placeholder="Search sale #, customer, reference…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search payments"
            />
            <select
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              aria-label="Filter by payment method"
            >
              <option value="all">All methods</option>
              {[...new Set(sales.map((r) => String(r.data.payment_method || "other")))]
                .sort()
                .map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Sale #</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3">Paid</th>
                  <th className="py-2 pr-3">Returned</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((rec) => {
                  const s = rec.data;
                  return (
                    <tr key={rec.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{s.sale_number || "—"}</td>
                      <td className="py-2 pr-3">{s.patient_name || "Walk-in"}</td>
                      <td className="py-2 pr-3 capitalize">{s.payment_method || "—"}</td>
                      <td className="py-2 pr-3 font-medium">
                        {formatMoney(Number(s.amount_paid ?? s.grand_total) || 0)}
                      </td>
                      <td className="py-2 pr-3">
                        {Number(s.amount_returned || 0) > 0
                          ? formatMoney(Number(s.amount_returned))
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{s.payment_reference || "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge
                          variant="outline"
                          className={STATUS_STYLE[String(s.payment_status)] ?? ""}
                        >
                          {s.payment_status || "—"}
                        </Badge>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {String(s.created_at ?? "").slice(0, 10)}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      No payments found
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
