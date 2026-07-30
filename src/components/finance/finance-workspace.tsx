"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Loader2, Plus, RefreshCw, Trash2, LogOut } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminLogoutAction } from "@/lib/auth/actions";
import { formatCurrency } from "@/lib/utils";
import {
  EXPENSE_CATEGORIES,
} from "@/lib/finance/validation";
import type { FinanceExpense, FinanceSummary } from "@/lib/finance/types";

export function FinanceWorkspace() {
  const [from, setFrom] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: "general",
    description: "",
    amount: "",
    expense_date: format(new Date(), "yyyy-MM-dd"),
    payment_method: "cash",
    vendor: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/finance?from=${from}&to=${to}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Load failed");
      setSummary(json.summary);
      setExpenses(json.expenses || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const addExpense = async () => {
    if (!form.description || !form.amount) {
      toast.error("Description and amount required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast.success("Expense recorded");
      setForm({
        category: "general",
        description: "",
        amount: "",
        expense_date: format(new Date(), "yyyy-MM-dd"),
        payment_method: "cash",
        vendor: "",
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    try {
      const res = await fetch("/api/admin/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
      toast.success("Deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-lg font-bold">Finance Workspace</h1>
            <p className="text-xs text-muted-foreground">
              Revenue · Expenses · Profit
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/analytics">
              <Button size="sm" variant="outline">
                Analytics
              </Button>
            </Link>
            <Link href="/admin/hospital-billing">
              <Button size="sm" variant="outline">
                Bills
              </Button>
            </Link>
            <Link href="/admin/reports">
              <Button size="sm" variant="outline">
                Reports
              </Button>
            </Link>
            <form action={adminLogoutAction}>
              <Button size="sm" variant="ghost" type="submit">
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-end gap-3">
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
          <Button size="sm" variant="outline" onClick={() => void load()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Revenue (period)"
            value={formatCurrency(summary?.revenue_period ?? 0)}
          />
          <Stat
            label="Expenses (period)"
            value={formatCurrency(summary?.expenses_period ?? 0)}
          />
          <Stat
            label="Profit (period)"
            value={formatCurrency(summary?.profit_period ?? 0)}
            positive={(summary?.profit_period ?? 0) >= 0}
          />
          <Stat
            label="Revenue today (billing)"
            value={formatCurrency(summary?.revenue_today ?? 0)}
          />
        </div>

        <Card>
          <CardContent className="space-y-3 p-5">
            <h2 className="font-semibold">Record expense</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="mb-1 block text-xs">Category</Label>
                <select
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Amount (₹)</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Date</Label>
                <Input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) =>
                    setForm({ ...form, expense_date: e.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="mb-1 block text-xs">Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Vendor</Label>
                <Input
                  value={form.vendor}
                  onChange={(e) =>
                    setForm({ ...form, vendor: e.target.value })
                  }
                />
              </div>
            </div>
            <Button onClick={() => void addExpense()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add expense
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        No expenses in this period.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="px-4 py-3">{e.expense_date}</td>
                        <td className="px-4 py-3 capitalize">
                          {e.category.replace(/_/g, " ")}
                        </td>
                        <td className="px-4 py-3">{e.description}</td>
                        <td className="px-4 py-3 font-medium">
                          {formatCurrency(e.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void remove(e.id)}
                            aria-label="Delete expense"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={`text-xl font-bold tabular-nums ${
            positive === false ? "text-emergency" : ""
          }`}
        >
          {value}
        </div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
