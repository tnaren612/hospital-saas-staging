"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { hmsGet } from "@/lib/hms/client-api";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { InsuranceProvider, ClaimsReportRow, ProviderSummary } from "@/lib/insurance/types";

type ReportData = {
  data: ClaimsReportRow[];
  summary: {
    total_claims: number;
    total_claim_amount: number;
    total_approved_amount: number;
    total_settled_amount: number;
    pending_count: number;
    approved_count: number;
    settled_count: number;
    rejected_count: number;
  };
};

export function InsuranceReports() {
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [reportType, setReportType] = useState<"claims" | "provider-summary">("claims");
  const [status, setStatus] = useState("");
  const [providers, setProviders] = useState<InsuranceProvider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [providerSummary, setProviderSummary] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await hmsGet<{ data: InsuranceProvider[] }>(
          "/api/admin/insurance/providers",
          { active: "true" }
        );
        setProviders(res.data || []);
      } catch {
        // table may not exist yet
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (reportType === "provider-summary") {
        const res = await hmsGet<{ data: ProviderSummary[] }>(
          "/api/admin/insurance/reports",
          { type: "provider-summary", from, to }
        );
        setProviderSummary(res.data || []);
        setReportData(null);
      } else {
        const params: Record<string, string> = { from, to };
        if (status) params.status = status;
        if (providerId) params.provider_id = providerId;
        const res = await hmsGet<ReportData>("/api/admin/insurance/reports", params);
        setReportData(res);
        setProviderSummary([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Report failed");
    } finally {
      setLoading(false);
    }
  }, [from, to, reportType, status, providerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadCsv = () => {
    if (!reportData?.data?.length) return;
    const headers = [
      "Claim #", "Patient", "Provider", "Policy", "Amount",
      "Approved", "Settled", "Status", "Submitted",
    ];
    const rows = reportData.data.map((r) => [
      r.claim_number,
      r.patient_name,
      r.provider_name,
      r.policy_number,
      r.claim_amount,
      r.approved_amount || "",
      r.settlement_amount || "",
      r.status,
      r.submitted_date || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `insurance-claims-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insurance Reports"
        description="Claims and provider summary reports"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          reportData?.data?.length ? (
            <Button size="sm" variant="outline" onClick={downloadCsv}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-5">
          <div>
            <Label className="mb-1 block text-xs">Report Type</Label>
            <select
              className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
              value={reportType}
              onChange={(e) =>
                setReportType(e.target.value as "claims" | "provider-summary")
              }
            >
              <option value="claims">Claims Report</option>
              <option value="provider-summary">Provider Summary</option>
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          {reportType === "claims" && (
            <>
              <div>
                <Label className="mb-1 block text-xs">Status</Label>
                <select
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="settled">Settled</option>
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Provider</Label>
                <select
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                >
                  <option value="">All</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.provider_name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {reportData?.summary && reportType === "claims" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Total Claims</div>
              <div className="text-xl font-bold">{reportData.summary.total_claims}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Claim Amount</div>
              <div className="text-xl font-bold">
                {formatCurrency(reportData.summary.total_claim_amount)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Approved</div>
              <div className="text-xl font-bold text-green-600">
                {formatCurrency(reportData.summary.total_approved_amount)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Settled</div>
              <div className="text-xl font-bold text-primary">
                {formatCurrency(reportData.summary.total_settled_amount)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Claims Report Table */}
      {reportData?.data?.length ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Claim #</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Approved</th>
                    <th className="px-4 py-3">Settled</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.data.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">{r.claim_number}</td>
                      <td className="px-4 py-3 font-medium">{r.patient_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.provider_name}</td>
                      <td className="px-4 py-3">{formatCurrency(r.claim_amount)}</td>
                      <td className="px-4 py-3">
                        {r.approved_amount ? formatCurrency(r.approved_amount) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.settlement_amount ? formatCurrency(r.settlement_amount) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{r.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.submitted_date ? formatDate(r.submitted_date) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Provider Summary */}
      {providerSummary.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Claims</th>
                    <th className="px-4 py-3">Claim Amount</th>
                    <th className="px-4 py-3">Approved</th>
                    <th className="px-4 py-3">Settled</th>
                    <th className="px-4 py-3">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {providerSummary.map((p) => (
                    <tr key={p.provider_id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{p.provider_name}</td>
                      <td className="px-4 py-3">{p.total_claims}</td>
                      <td className="px-4 py-3">{formatCurrency(p.total_claim_amount)}</td>
                      <td className="px-4 py-3">{formatCurrency(p.total_approved_amount)}</td>
                      <td className="px-4 py-3">{formatCurrency(p.total_settled_amount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="warning">{p.pending_claims}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !reportData?.data?.length && providerSummary.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No data found for the selected period.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
