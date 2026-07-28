"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Download,
  IndianRupee,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  Pie,
  PieChart,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import {
  isPaymentSuccessful,
  type PaymentAnalytics,
  type PaymentRecord,
  type PaymentSettings,
} from "@/lib/payments/types";

type Revenue = {
  today: number;
  month: number;
  pending: number;
  completed: number;
  refunds: number;
};

const CHART_COLORS = [
  "#1a5ff5",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#64748b",
];

export function BillingManager() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [analytics, setAnalytics] = useState<PaymentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, sRes, aRes] = await Promise.all([
        fetch(
          `/api/payments/history?scope=admin${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
          { cache: "no-store" }
        ),
        fetch("/api/payments/settings?admin=1", { cache: "no-store" }),
        fetch("/api/payments/analytics", { cache: "no-store" }),
      ]);
      const hJson = await hRes.json();
      const sJson = await sRes.json();
      const aJson = await aRes.json().catch(() => ({}));
      if (!hRes.ok) throw new Error(hJson.error || "Failed to load payments");
      if (!sRes.ok) throw new Error(sJson.error || "Failed to load settings");
      setPayments(hJson.data || []);
      setRevenue(hJson.revenue || null);
      setSettings(sJson.data);
      if (aRes.ok) setAnalytics(aJson.data || null);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Billing load failed (run migrations 012-014?)"
      );
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/payments/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSettings(json.data);
      toast.success("Payment settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const refund = async (
    payment_id: string,
    action: "request" | "approve" | "reject" | "complete"
  ) => {
    const reason =
      action === "request" || action === "complete"
        ? prompt("Refund reason (optional)") || ""
        : "";
    try {
      const res = await fetch("/api/payments/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id, action, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Refund failed");
      toast.success(`Refund ${action}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refund failed");
    }
  };

  const exportCsv = () => {
    const header = [
      "reference",
      "status",
      "method",
      "provider",
      "total",
      "currency",
      "transaction_id",
      "created_at",
    ];
    const lines = [
      header.join(","),
      ...payments.map((p) =>
        [
          p.payment_reference,
          p.payment_status,
          p.payment_method,
          p.payment_provider,
          p.total_amount,
          p.currency,
          p.transaction_id,
          p.created_at,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => payments, [payments]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Payments"
        description="Cash / online payments · invoices · refunds · tax · gateway toggles"
        onRefresh={() => void load()}
        loading={loading}
        actions={
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      {/* Revenue cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        {[
          { label: "Today's Revenue", value: analytics?.today ?? revenue?.today },
          { label: "Monthly Revenue", value: analytics?.month ?? revenue?.month },
          {
            label: "Completed",
            value: analytics?.completed ?? revenue?.completed,
          },
          { label: "Pending", value: analytics?.pending ?? revenue?.pending },
          { label: "Cash", value: analytics?.cash },
          { label: "Online", value: analytics?.online },
          { label: "Failed", value: analytics?.failed },
          { label: "Refunds", value: analytics?.refunds ?? revenue?.refunds },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="mt-1 flex items-center gap-1 text-xl font-bold">
                <IndianRupee className="h-4 w-4 text-primary-600" />
                {formatCurrency(Number(c.value || 0))}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Analytics charts */}
      {analytics && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Cash vs Online</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Cash", value: analytics.cash || 0 },
                        { name: "Online", value: analytics.online || 0 },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      label
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#1a5ff5" />
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Doctor revenue</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.byDoctor || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide />
                    <YAxis />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {(analytics.byDoctor || []).map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Department revenue</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.byDepartment || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide />
                    <YAxis />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="value" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">
                Failed payments ({analytics.failedCount})
              </h3>
              <ul className="max-h-56 space-y-2 overflow-auto text-sm">
                {(analytics.failedList || []).length === 0 ? (
                  <li className="text-muted-foreground">No failed payments</li>
                ) : (
                  analytics.failedList.map((p) => (
                    <li
                      key={p.id}
                      className="flex justify-between gap-2 border-b border-border pb-1"
                    >
                      <span className="truncate font-mono text-xs">
                        {p.payment_reference}
                      </span>
                      <span>{formatCurrency(p.total_amount)}</span>
                    </li>
                  ))
                )}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Settings */}
      {settings && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Payment settings</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ["cash_enabled", "Cash at hospital"],
                  ["online_payment_enabled", "Online payment"],
                  ["razorpay_enabled", "Razorpay"],
                  ["stripe_enabled", "Stripe"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(settings[key])}
                    onChange={(e) =>
                      setSettings({ ...settings, [key]: e.target.checked })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Currency">
                <Input
                  value={settings.currency}
                  onChange={(e) =>
                    setSettings({ ...settings, currency: e.target.value })
                  }
                />
              </Field>
              <Field label="Tax %">
                <Input
                  type="number"
                  value={settings.tax_percentage}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      tax_percentage: Number(e.target.value) || 0,
                    })
                  }
                />
              </Field>
              <Field label="Invoice prefix">
                <Input
                  value={settings.invoice_prefix}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      invoice_prefix: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Hospital name">
                <Input
                  value={settings.hospital_name}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      hospital_name: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="GSTIN">
                <Input
                  value={settings.gstin}
                  onChange={(e) =>
                    setSettings({ ...settings, gstin: e.target.value })
                  }
                />
              </Field>
              <Field label="Razorpay Key ID (public)">
                <Input
                  value={settings.razorpay_key_id}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      razorpay_key_id: e.target.value,
                    })
                  }
                  placeholder="rzp_live_… (secret in env)"
                />
              </Field>
              <Field label="Stripe publishable key">
                <Input
                  value={settings.stripe_publishable_key}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      stripe_publishable_key: e.target.value,
                    })
                  }
                  placeholder="pk_live_… (secret in env)"
                />
              </Field>
              <div className="md:col-span-2 lg:col-span-3">
                <Field label="Hospital address">
                  <Input
                    value={settings.hospital_address}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        hospital_address: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <Field label="Invoice terms">
                  <Textarea
                    value={settings.terms}
                    onChange={(e) =>
                      setSettings({ ...settings, terms: e.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Secrets never leave the server: set{" "}
              <code>RAZORPAY_KEY_SECRET</code> and{" "}
              <code>STRIPE_SECRET_KEY</code> in Vercel / .env.local. Card
              numbers are never stored.
            </p>
            <Button onClick={() => void saveSettings()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search reference / transaction…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="flex h-11 rounded-xl border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {[
            "pending",
            "paid",
            "completed",
            "failed",
            "refund_requested",
            "refund_approved",
            "refund_rejected",
            "refunded",
          ].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No payments yet. Run migration 012 and create a payment
                      from booking.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.payment_reference}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.transaction_id || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {p.payment_method} · {p.payment_provider}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatCurrency(p.total_amount)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            isPaymentSuccessful(p.payment_status)
                              ? "success"
                              : p.payment_status === "failed"
                                ? "danger"
                                : p.payment_status.includes("refund")
                                  ? "warning"
                                  : "outline"
                          }
                          className="capitalize"
                        >
                          {p.payment_status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {p.invoice_id ? (
                          <a
                            href={`/api/invoices/${p.invoice_id}?format=html`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-700 underline dark:text-primary-300"
                          >
                            Open
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {isPaymentSuccessful(p.payment_status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void refund(p.id, "request")}
                            >
                              Request refund
                            </Button>
                          )}
                          {p.payment_status === "refund_requested" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void refund(p.id, "approve")}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void refund(p.id, "reject")}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {p.payment_status === "refund_approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void refund(p.id, "complete")}
                            >
                              Mark refunded
                            </Button>
                          )}
                        </div>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {children}
    </div>
  );
}
