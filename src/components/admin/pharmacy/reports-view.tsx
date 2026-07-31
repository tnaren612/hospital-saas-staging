"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/pharmacy/tax";
import { useOfflineEntities, useOfflineStore } from "@/lib/pharmacy/offline";
import {
  downloadTextFile,
  toCsv,
  printHtmlReport,
  rowsToTableHtml,
} from "@/lib/hms/export";

type SaleRow = Record<string, unknown> & {
  sale_number?: string;
  patient_name?: string;
  sale_type?: string;
  subtotal?: number;
  discount?: number;
  tax?: number;
  grand_total?: number;
  payment_method?: string;
  payment_status?: string;
  created_at?: string;
  line_items?: unknown;
};

export function ReportsView() {
  const storage = useOfflineStore();
  const sales = useOfflineEntities<SaleRow>("sale");

  const daily = useMemo(() => {
    const map = new Map<string, { date: string; count: number; revenue: number }>();
    for (const rec of sales) {
      const s = rec.data;
      const day = String(s.created_at ?? "").slice(0, 10);
      if (!day) continue;
      const cur = map.get(day) || { date: day, count: 0, revenue: 0 };
      cur.count++;
      cur.revenue += Number(s.grand_total || 0);
      map.set(day, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 14);
  }, [sales]);

  const byMethod = useMemo(() => {
    const map = new Map<string, { method: string; amount: number; count: number }>();
    for (const rec of sales) {
      const s = rec.data;
      const method = String(s.payment_method || "other");
      const cur = map.get(method) || { method, amount: 0, count: 0 };
      cur.amount += Number(s.grand_total || 0);
      cur.count++;
      map.set(method, cur);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [sales]);

  const topMedicines = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const rec of sales) {
      const items = rec.data.line_items;
      if (!Array.isArray(items)) continue;
      for (const it of items as Array<Record<string, unknown>>) {
        const name = String(it.name ?? "unknown");
        const qty = Number(it.qty ?? it.quantity ?? 0);
        const price = Number(it.price ?? it.selling_price ?? 0);
        const cur = map.get(name) || { name, qty: 0, revenue: 0 };
        cur.qty += qty;
        cur.revenue += qty * price;
        map.set(name, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [sales]);

  const totals = useMemo(() => {
    let revenue = 0;
    let discount = 0;
    let tax = 0;
    for (const rec of sales) {
      revenue += Number(rec.data.grand_total || 0);
      discount += Number(rec.data.discount || 0);
      tax += Number(rec.data.tax || 0);
    }
    return { revenue, discount, tax };
  }, [sales]);

  const exportCsv = async () => {
    if (!sales.length) return;
    const rows = sales.map((r) => ({
      sale_number: r.data.sale_number ?? "",
      patient_name: r.data.patient_name ?? "",
      payment_method: r.data.payment_method ?? "",
      grand_total: r.data.grand_total ?? 0,
      created_at: r.data.created_at ?? "",
    }));
    downloadTextFile(`pharmacy-sales-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
    await storage.appendAudit({
      actor: "cashier",
      action: "report.exported",
      entity: "sale",
      details: { rows: rows.length, report: "sales" },
    });
  };

  const printPdf = () => {
    const rows = sales.map((r) => ({
      "Sale #": r.data.sale_number ?? "",
      Customer: r.data.patient_name ?? "",
      Method: r.data.payment_method ?? "",
      Total: formatMoney(Number(r.data.grand_total) || 0),
      Date: String(r.data.created_at ?? "").slice(0, 10),
    }));
    printHtmlReport(
      "Pharmacy Sales Report",
      rowsToTableHtml(rows) +
        `<p><strong>Total revenue: ${formatMoney(totals.revenue)}</strong></p>`
    );
  };

  const maxRevenue = Math.max(1, ...daily.map((d) => d.revenue));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description={`${sales.length} cached sales — revenue ${formatMoney(totals.revenue)} · tax ${formatMoney(totals.tax)}`}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => void exportCsv()}>
              Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={printPdf}>
              Print / PDF
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{formatMoney(totals.revenue)}</div>
            <div className="text-xs text-muted-foreground">Total revenue</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{formatMoney(totals.tax)}</div>
            <div className="text-xs text-muted-foreground">Total GST/tax</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{formatMoney(totals.discount)}</div>
            <div className="text-xs text-muted-foreground">Discounts given</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="font-semibold">Daily sales (last 14 days)</h2>
          <div className="space-y-2">
            {daily.map((d) => (
              <div key={d.date} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{d.date}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary-600/80"
                    style={{ width: `${(d.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-xs font-semibold">
                  {formatMoney(d.revenue)}
                </span>
                <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                  {d.count}
                </span>
              </div>
            ))}
            {daily.length === 0 && (
              <p className="text-sm text-muted-foreground">No sales cached yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 p-5">
            <h2 className="font-semibold">Payment summary</h2>
            {byMethod.map((m) => (
              <div key={m.method} className="flex items-center justify-between text-sm">
                <span className="capitalize text-muted-foreground">{m.method}</span>
                <span className="font-medium">
                  {formatMoney(m.amount)}{" "}
                  <span className="text-xs text-muted-foreground">({m.count})</span>
                </span>
              </div>
            ))}
            {byMethod.length === 0 && (
              <p className="text-sm text-muted-foreground">No data.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-5">
            <h2 className="font-semibold">Top selling medicines</h2>
            {topMedicines.map((m, i) => (
              <div key={m.name} className="flex items-center justify-between text-sm">
                <span className="truncate pr-3">
                  <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                  {m.name}
                </span>
                <span className="shrink-0 font-medium">
                  {m.qty} × {formatMoney(m.revenue)}
                </span>
              </div>
            ))}
            {topMedicines.length === 0 && (
              <p className="text-sm text-muted-foreground">No data.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
