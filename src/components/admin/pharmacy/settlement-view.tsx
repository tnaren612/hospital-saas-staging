"use client";

import { useMemo, useState } from "react";
import { Printer, Download } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/pharmacy/tax";
import { useOfflineEntities } from "@/lib/pharmacy/offline";
import { downloadTextFile, rowsToTableHtml, toCsv } from "@/lib/hms/export";
import { printHtmlViaIframe } from "@/lib/pharmacy/barcode/generate";
import {
  methodLabel,
  outstandingBalances,
  settlementReport,
} from "@/lib/pharmacy/pos-offline";

type SaleRow = Record<string, unknown>;
type ReturnRow = Record<string, unknown>;

const today = new Date().toISOString().slice(0, 10);

export function SettlementView() {
  const sales = useOfflineEntities<SaleRow>("sale");
  const returns = useOfflineEntities<ReturnRow>("return");
  const [since, setSince] = useState(today);
  const [until, setUntil] = useState(today);

  const report = useMemo(
    () =>
      settlementReport(
        sales.map((r) => r.data),
        returns.map((r) => r.data),
        { since: `${since}T00:00:00`, until: `${until}T23:59:59` }
      ),
    [sales, returns, since, until]
  );

  const outstanding = useMemo(
    () => outstandingBalances(sales.map((r) => r.data)),
    [sales]
  );

  const exportCsv = () => {
    const rows = report.byMethod.map((m) => ({
      method: methodLabel(m.method),
      amount: m.amount,
      count: m.count,
    }));
    const csv = toCsv(rows);
    downloadTextFile(`settlement-${since}-to-${until}.csv`, csv);
  };

  const printReport = () => {
    const body = outstanding.map((o, i) => [
      String(i + 1),
      o.saleNumber,
      o.patientName,
      methodLabel(o.paymentMethod),
      o.grandTotal.toFixed(2),
      o.amountPaid.toFixed(2),
      o.balance.toFixed(2),
      o.createdAt.slice(0, 10),
    ]);
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Settlement Report</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; }
  h1 { font-size: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
  th { background: #eef; }
  .row { display: flex; justify-content: space-between; max-width: 340px; }
</style></head><body>
  <h1>Settlement Report — ${since} to ${until}</h1>
  ${rowsToTableHtml(report.byMethod.map((m) => ({ Method: methodLabel(m.method), Amount: m.amount.toFixed(2), Transactions: String(m.count) })))}
  <p><strong>Total sales:</strong> ${formatMoney(report.totalSales)} · <strong>Transactions:</strong> ${report.transactionCount}</p>
  <p><strong>Refunds:</strong> ${formatMoney(report.refunds)} (${report.returnCount}) · <strong>Cash drawer estimate:</strong> ${formatMoney(report.cashDrawer)}</p>
  <p><strong>Outstanding:</strong> ${formatMoney(report.outstandingTotal)} (${report.outstandingCount} bills)</p>
  <h2>Outstanding balances</h2>
  ${rowsToTableHtml(body.map((row) => ({ "#": row[0], "Sale No": row[1], Patient: row[2], Method: row[3], "Grand Total": row[4], Paid: row[5], Balance: row[6], Date: row[7] })))}
</body></html>`;
    printHtmlViaIframe(html);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settlement"
        description="Payment history, outstanding balances and daily settlement"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" aria-hidden /> CSV
            </Button>
            <Button size="sm" onClick={printReport}>
              <Printer className="h-4 w-4" aria-hidden /> Print report
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="settle-since">From</Label>
          <Input id="settle-since" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="settle-until">To</Label>
          <Input id="settle-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total sales</div>
            <div className="text-xl font-bold">{formatMoney(report.totalSales)}</div>
            <div className="text-xs text-muted-foreground">{report.transactionCount} transactions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Cash drawer</div>
            <div className="text-xl font-bold">{formatMoney(report.cashDrawer)}</div>
            <div className="text-xs text-muted-foreground">cash collected − refunds</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Refunds</div>
            <div className="text-xl font-bold text-rose-600">{formatMoney(report.refunds)}</div>
            <div className="text-xs text-muted-foreground">{report.returnCount} returns</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Outstanding</div>
            <div className="text-xl font-bold text-amber-600">{formatMoney(report.outstandingTotal)}</div>
            <div className="text-xs text-muted-foreground">{report.outstandingCount} unpaid bills</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Payment methods</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2">
            {report.byMethod.map((m) => (
              <div key={m.method} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium">{methodLabel(m.method)}</span>
                <span className="text-xs text-muted-foreground">{m.count} payments</span>
                <span className="font-semibold">{formatMoney(m.amount)}</span>
              </div>
            ))}
            {report.byMethod.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No payments in this range yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Outstanding balances</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2">
            {outstanding.slice(0, 50).map((o) => (
              <div key={o.saleNumber} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">
                    {o.saleNumber || "—"} <span className="text-muted-foreground">· {o.patientName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {o.createdAt.slice(0, 10)} · {methodLabel(o.paymentMethod)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">paid {formatMoney(o.amountPaid)}</span>
                  <Badge variant="outline" className="text-amber-600">
                    {formatMoney(o.balance)} due
                  </Badge>
                </div>
              </div>
            ))}
            {outstanding.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No outstanding balances — everything is settled.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
