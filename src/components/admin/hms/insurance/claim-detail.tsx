"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  FileText,
  ChevronDown,
  Loader2,
  Send,
  History,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/admin/ui/skeleton";
import { hmsGet, hmsMutate } from "@/lib/hms/client-api";
import { formatDate, formatCurrency } from "@/lib/utils";
import type {
  InsuranceClaim,
  ClaimStatusHistory,
  ClaimDocument,
} from "@/lib/insurance/types";

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

const statusActions: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["in_process", "cancelled"],
  in_process: ["approved", "partially_approved", "rejected", "cancelled"],
  approved: ["settled", "cancelled"],
  partially_approved: ["settled", "cancelled"],
  rejected: ["submitted", "cancelled"],
  settled: [],
  cancelled: [],
};

export function ClaimDetailView() {
  const params = useParams();
  const router = useRouter();
  const claimId = params.id as string;

  const [claim, setClaim] = useState<InsuranceClaim | null>(null);
  const [history, setHistory] = useState<ClaimStatusHistory[]>([]);
  const [documents, setDocuments] = useState<ClaimDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementRef, setSettlementRef] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [claimRes, historyRes, docsRes] = await Promise.all([
        hmsGet<{ data: InsuranceClaim }>(
          `/api/admin/insurance/claims/${claimId}`
        ),
        hmsGet<{ data: ClaimStatusHistory[] }>(
          `/api/admin/insurance/claims/${claimId}/history`
        ),
        hmsGet<{ data: ClaimDocument[] }>(
          `/api/admin/insurance/claims/${claimId}/documents`
        ),
      ]);
      setClaim(claimRes.data);
      setHistory(historyRes.data || []);
      setDocuments(docsRes.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    void load();
  }, [load]);

  const performAction = async () => {
    if (!actionStatus) {
      toast.error("Please select an action");
      return;
    }

    // Validate
    if (
      actionStatus === "approved" ||
      actionStatus === "partially_approved"
    ) {
      if (!approvedAmount || Number(approvedAmount) <= 0) {
        toast.error("Approved amount is required");
        return;
      }
    }
    if (actionStatus === "settled") {
      if (!settlementAmount || Number(settlementAmount) <= 0) {
        toast.error("Settlement amount is required");
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        status: actionStatus,
        notes: actionNotes || null,
      };
      if (
        (actionStatus === "approved" ||
          actionStatus === "partially_approved") &&
        approvedAmount
      ) {
        payload.approved_amount = Number(approvedAmount);
      }
      if (actionStatus === "rejected" && rejectionReason) {
        payload.rejection_reason = rejectionReason;
      }
      if (actionStatus === "settled") {
        payload.settlement_amount = Number(settlementAmount);
        payload.settlement_ref = settlementRef || null;
      }

      await hmsMutate(
        `/api/admin/insurance/claims/${claimId}`,
        "PATCH",
        payload
      );
      toast.success(
        `Claim ${statusLabel[actionStatus] || actionStatus} successfully`
      );
      setActionOpen(false);
      setActionStatus("");
      setApprovedAmount("");
      setSettlementAmount("");
      setSettlementRef("");
      setRejectionReason("");
      setActionNotes("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !claim) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/admin/insurance/claims")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Claims
        </Button>
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Claim not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const possibleActions = statusActions[claim.status] || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/admin/insurance/claims")}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Claim {claim.claim_number}
            </h1>
            <p className="text-sm text-muted-foreground">
              Created {formatDate(claim.created_at)}
            </p>
          </div>
        </div>
        <Badge variant={statusColor[claim.status] || "secondary"} className="text-sm px-3 py-1">
          {statusLabel[claim.status] || claim.status}
        </Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground">Total Bill</div>
            <div className="mt-1 text-xl font-bold">
              {formatCurrency(claim.total_bill_amount)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground">Claim Amount</div>
            <div className="mt-1 text-xl font-bold">
              {formatCurrency(claim.claim_amount)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground">Approved</div>
            <div className="mt-1 text-xl font-bold text-green-600">
              {claim.approved_amount
                ? formatCurrency(claim.approved_amount)
                : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground">Settled</div>
            <div className="mt-1 text-xl font-bold text-primary">
              {claim.settlement_amount
                ? formatCurrency(claim.settlement_amount)
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Claim Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Claim Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Patient</span>
              <span className="font-medium">
                {claim.patient_name || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Insurance Provider</span>
              <span>{claim.provider_name || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Policy</span>
              <span className="font-mono text-xs">
                {claim.policy_number || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pre-auth #</span>
              <span className="font-mono text-xs">
                {claim.authorization_number || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deductible</span>
              <span>{formatCurrency(claim.deductible_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Co-pay</span>
              <span>{formatCurrency(claim.copay_amount)}</span>
            </div>
            {claim.submitted_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Submitted</span>
                <span>{formatDate(claim.submitted_date)}</span>
              </div>
            )}
            {claim.settlement_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Settlement Date</span>
                <span>{formatDate(claim.settlement_date)}</span>
              </div>
            )}
            {claim.settlement_ref && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Settlement Ref</span>
                <span className="font-mono text-xs">
                  {claim.settlement_ref}
                </span>
              </div>
            )}
            {claim.rejection_reason && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950">
                <strong>Rejection Reason:</strong> {claim.rejection_reason}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ChevronDown className="h-4 w-4" /> Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {possibleActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No further actions available for claims with status{" "}
                <strong>{statusLabel[claim.status]}</strong>.
              </p>
            ) : actionOpen ? (
              <div className="space-y-3">
                <div>
                  <Label className="mb-1 block text-xs">Action</Label>
                  <select
                    className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    value={actionStatus}
                    onChange={(e) => setActionStatus(e.target.value)}
                  >
                    <option value="">Select action…</option>
                    {possibleActions.map((a) => (
                      <option key={a} value={a}>
                        {statusLabel[a] || a}
                      </option>
                    ))}
                  </select>
                </div>

                {["approved", "partially_approved"].includes(actionStatus) && (
                  <div>
                    <Label className="mb-1 block text-xs">
                      Approved Amount (₹)
                    </Label>
                    <Input
                      type="number"
                      value={approvedAmount}
                      onChange={(e) => setApprovedAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                )}

                {actionStatus === "settled" && (
                  <>
                    <div>
                      <Label className="mb-1 block text-xs">
                        Settlement Amount (₹)
                      </Label>
                      <Input
                        type="number"
                        value={settlementAmount}
                        onChange={(e) => setSettlementAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">
                        Settlement Reference
                      </Label>
                      <Input
                        value={settlementRef}
                        onChange={(e) => setSettlementRef(e.target.value)}
                        placeholder="Cheque / transaction ref"
                      />
                    </div>
                  </>
                )}

                {actionStatus === "rejected" && (
                  <div>
                    <Label className="mb-1 block text-xs">
                      Rejection Reason
                    </Label>
                    <Textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Reason for rejection…"
                    />
                  </div>
                )}

                <div>
                  <Label className="mb-1 block text-xs">Notes</Label>
                  <Textarea
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Additional notes…"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => void performAction()}
                    disabled={saving || !actionStatus}
                  >
                    {saving ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : null}
                    Confirm
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActionOpen(false);
                      setActionStatus("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => setActionOpen(true)}
                className="w-full"
              >
                <Send className="mr-2 h-4 w-4" />
                Update Status
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Status History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">To</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      No status history available.
                    </td>
                  </tr>
                ) : (
                  history.map((h) => (
                    <tr key={h.id} className="border-t border-border">
                      <td className="px-4 py-3 text-xs">
                        {formatDate(h.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {h.from_status ? (
                          <Badge variant="outline">
                            {statusLabel[h.from_status] || h.from_status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={statusColor[h.to_status] || "secondary"}
                        >
                          {statusLabel[h.to_status] || h.to_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {h.change_reason || h.notes || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" /> Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents attached to this claim.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-xl border border-border p-3"
                >
                  <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {doc.file_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {doc.document_type}
                      {doc.file_size && ` · ${(doc.file_size / 1024).toFixed(0)} KB`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
