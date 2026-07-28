"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { PatientShell } from "@/components/patient/patient-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  isPaymentSuccessful,
  isRefundStatus,
  type PaymentRecord,
} from "@/lib/payments/types";
import { getDemoDashboard } from "@/lib/patient/service";
import toast from "react-hot-toast";

function statusVariant(
  status: string
): "success" | "warning" | "outline" | "danger" {
  if (isPaymentSuccessful(status)) return "success";
  if (status === "failed") return "danger";
  if (isRefundStatus(status)) return "warning";
  return "outline";
}

export function PatientPaymentsPage() {
  const [items, setItems] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const name = getDemoDashboard().patient?.full_name;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payments/history?scope=patient", {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setItems(json.data || []);
      else if (res.status === 401) setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const paid = items.filter((p) => isPaymentSuccessful(p.payment_status));
    const pending = items.filter(
      (p) =>
        p.payment_status === "pending" || p.payment_status === "processing"
    );
    const refunded = items.filter((p) => p.payment_status === "refunded");
    return {
      paidTotal: paid.reduce((s, p) => s + p.total_amount, 0),
      pendingCount: pending.length,
      refundedCount: refunded.length,
    };
  }, [items]);

  const retry = async (p: PaymentRecord) => {
    if (p.payment_status !== "failed" && p.payment_status !== "pending") {
      toast.error("Only failed/pending payments can be retried");
      return;
    }
    try {
      if (p.payment_provider === "razorpay" && (p.transaction_id || p.meta?.razorpay_order_id)) {
        const settingsRes = await fetch("/api/payments/settings", {
          cache: "no-store",
        });
        const settingsJson = await settingsRes.json();
        const key = settingsJson.data?.razorpay_key_id as string | undefined;
        if (!key) {
          throw new Error("Razorpay KEY_ID not configured on server");
        }

        const { openRazorpayCheckout } = await import(
          "@/lib/payments/razorpay-checkout"
        );
        const meta = p.meta || {};
        const amountPaise =
          Number(meta.amount_paise) || Math.round(p.total_amount * 100);
        const orderId = String(
          meta.razorpay_order_id || p.transaction_id || ""
        );

        const rzp = await openRazorpayCheckout({
          key,
          orderId,
          amountPaise,
          currency: p.currency || "INR",
          name: "Sri Srinivasa Hospital",
          description: `Payment ${p.payment_reference}`,
          prefill: {
            name: String(meta.patient_name || ""),
            email: String(meta.patient_email || ""),
            contact: String(meta.patient_phone || ""),
          },
        });

        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_id: p.id,
            appointment_id: p.appointment_id || undefined,
            provider: "razorpay",
            razorpay_order_id: rzp.razorpay_order_id,
            razorpay_payment_id: rzp.razorpay_payment_id,
            razorpay_signature: rzp.razorpay_signature,
            transaction_id: rzp.razorpay_payment_id,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Verification failed");
        toast.success("Payment verified — invoice emailed if configured");
        await load();
        return;
      }

      if (p.payment_provider === "mock") {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_id: p.id,
            appointment_id: p.appointment_id || undefined,
            provider: "mock",
            transaction_id: `pay_mock_${Date.now()}`,
            razorpay_order_id: p.transaction_id,
            razorpay_payment_id: `pay_mock_${Date.now()}`,
            razorpay_signature: "mock_signature",
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Retry failed");
        toast.success("Payment verified");
        await load();
        return;
      }

      toast.error("This payment cannot be retried automatically");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Retry failed";
      if (msg !== "Payment cancelled") toast.error(msg);
    }
  };

  const requestRefund = async (p: PaymentRecord) => {
    if (!isPaymentSuccessful(p.payment_status)) {
      toast.error("Only paid payments can request a refund");
      return;
    }
    const reason = window.prompt("Refund reason (optional)") || "";
    try {
      const res = await fetch("/api/payments/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: p.id,
          action: "request",
          reason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Refund request failed");
      toast.success("Refund requested — hospital admin will review");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refund request failed");
    }
  };

  return (
    <PatientShell patientName={name}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Payments & invoices</h1>
            <p className="text-sm text-muted-foreground">
              Appointment payment status, invoices, transaction IDs, refunds
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Paid total</p>
              <p className="text-lg font-bold">
                {formatCurrency(summary.paidTotal)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-lg font-bold">{summary.pendingCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Refunds</p>
              <p className="text-lg font-bold">{summary.refundedCount}</p>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No payments yet. After booking you can pay cash at the hospital or
              online when enabled by admin.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{p.payment_reference}</p>
                      <Badge
                        variant={statusVariant(p.payment_status)}
                        className="capitalize"
                      >
                        {p.payment_status.replace(/_/g, " ")}
                      </Badge>
                      {isRefundStatus(p.payment_status) && (
                        <Badge variant="warning" className="capitalize">
                          Refund{" "}
                          {p.payment_status === "refunded"
                            ? "done"
                            : "in progress"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(p.total_amount)} · {p.payment_method} /{" "}
                      {p.payment_provider}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Transaction:{" "}
                      <span className="font-mono">
                        {p.transaction_id || "—"}
                      </span>
                    </p>
                    {p.paid_at && (
                      <p className="text-xs text-muted-foreground">
                        Paid at {new Date(p.paid_at).toLocaleString()}
                      </p>
                    )}
                    {p.refund_amount != null && p.refund_amount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Refund amount: {formatCurrency(p.refund_amount)}
                        {p.refund_reason ? ` · ${p.refund_reason}` : ""}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.invoice_id && (
                      <>
                        <a
                          href={`/api/invoices/${p.invoice_id}?format=pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm" variant="outline">
                            <Download className="h-3.5 w-3.5" /> Invoice PDF
                          </Button>
                        </a>
                        <a
                          href={`/api/invoices/${p.invoice_id}?format=html`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm" variant="ghost">
                            HTML
                          </Button>
                        </a>
                      </>
                    )}
                    {(p.payment_status === "failed" ||
                      p.payment_status === "pending") &&
                      p.payment_method === "online" && (
                        <Button size="sm" onClick={() => void retry(p)}>
                          Retry / Verify
                        </Button>
                      )}
                    {isPaymentSuccessful(p.payment_status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void requestRefund(p)}
                      >
                        Request refund
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PatientShell>
  );
}
