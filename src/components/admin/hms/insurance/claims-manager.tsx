"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Plus,
  Search,
  FileText,
  IndianRupee,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { hmsGet } from "@/lib/hms/client-api";
import { formatDate } from "@/lib/utils";
import type { InsuranceClaim } from "@/lib/insurance/types";

const statusColor: Record<string, "warning" | "success" | "danger" | "secondary" | "outline" | "default"> = {
  draft: "secondary",
  submitted: "warning",
  in_process: "warning",
  approved: "success",
  partially_approved: "warning",
  rejected: "danger",
  settled: "default",
  cancelled: "outline",
};

const statusLabel: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_process: "In Process",
  approved: "Approved",
  partially_approved: "Partial",
  rejected: "Rejected",
  settled: "Settled",
  cancelled: "Cancelled",
};

export function ClaimsManager() {
  const router = useRouter();
  const [items, setItems] = useState<InsuranceClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const res = await hmsGet<{ data: InsuranceClaim[] }>(
        "/api/admin/insurance/claims",
        params
      );
      setItems(res.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const filtered = q
    ? items.filter(
        (i) =>
          (i.claim_number || "").toLowerCase().includes(q.toLowerCase()) ||
          (i.patient_name || "").toLowerCase().includes(q.toLowerCase()) ||
          (i.provider_name || "").toLowerCase().includes(q.toLowerCase()) ||
          (i.policy_number || "").toLowerCase().includes(q.toLowerCase())
      )
    : items;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insurance Claims"
        description="Manage and track insurance claims"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(!createOpen)}>
            <Plus className="mr-1.5 h-4 w-4" /> New Claim
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search claims…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Status</Label>
          <select
            className="flex h-11 min-w-[140px] rounded-xl border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="in_process">In Process</option>
            <option value="approved">Approved</option>
            <option value="partially_approved">Partial</option>
            <option value="rejected">Rejected</option>
            <option value="settled">Settled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Claim #</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No claims found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((claim) => (
                    <tr
                      key={claim.id}
                      className="border-t border-border cursor-pointer hover:bg-muted/30"
                      onClick={() =>
                        router.push(`/admin/insurance/claims/${claim.id}`)
                      }
                    >
                      <td className="px-4 py-3 font-mono text-xs font-medium">
                        {claim.claim_number}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {claim.patient_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {claim.provider_name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <IndianRupee className="h-3 w-3" />
                          {claim.claim_amount.toLocaleString("en-IN")}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusColor[claim.status] || "secondary"}>
                          {statusLabel[claim.status] || claim.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {claim.submitted_date
                          ? formatDate(claim.submitted_date)
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/admin/insurance/claims/${claim.id}`);
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
