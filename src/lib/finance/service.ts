/**
 * Finance service — revenue from appointments/payments + expense ledger.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { demoFinance } from "@/lib/finance/demo-store";
import type { FinanceExpense, FinanceSummary } from "@/lib/finance/types";
import type { ExpenseCreateInput } from "@/lib/finance/validation";

function canUseDb() {
  return hasSupabaseConfig();
}

function client() {
  return createServiceRoleClient();
}

export async function listExpenses(opts?: {
  from?: string;
  to?: string;
  hospitalId?: string | null;
}): Promise<FinanceExpense[]> {
  if (!canUseDb()) {
    let rows = demoFinance.list();
    if (opts?.from) rows = rows.filter((e) => e.expense_date >= opts.from!);
    if (opts?.to) rows = rows.filter((e) => e.expense_date <= opts.to!);
    return rows;
  }
  try {
    let q = client()
      .from("finance_expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .limit(500);
    if (opts?.hospitalId) q = q.eq("hospital_id", opts.hospitalId);
    if (opts?.from) q = q.gte("expense_date", opts.from);
    if (opts?.to) q = q.lte("expense_date", opts.to);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(mapExpense);
  } catch {
    return demoFinance.list();
  }
}

function mapExpense(r: Record<string, unknown>): FinanceExpense {
  return {
    id: String(r.id),
    category: String(r.category || "general"),
    description: String(r.description || ""),
    amount: Number(r.amount) || 0,
    expense_date: String(r.expense_date),
    payment_method: String(r.payment_method || "cash"),
    vendor: r.vendor ? String(r.vendor) : null,
    reference_no: r.reference_no ? String(r.reference_no) : null,
    notes: r.notes ? String(r.notes) : "",
    created_at: r.created_at ? String(r.created_at) : undefined,
  };
}

export async function createExpense(
  input: ExpenseCreateInput,
  recordedBy?: string | null,
  hospitalId?: string | null
): Promise<FinanceExpense> {
  const base = {
    category: input.category || "general",
    description: input.description,
    amount: input.amount,
    expense_date:
      input.expense_date || new Date().toISOString().slice(0, 10),
    payment_method: input.payment_method || "cash",
    vendor: input.vendor || null,
    reference_no: input.reference_no || null,
    notes: input.notes || "",
    recorded_by: recordedBy || null,
  };
  const row = hospitalId ? { ...base, hospital_id: hospitalId } : base;

  if (!canUseDb()) {
    return demoFinance.create({
      category: base.category,
      description: base.description,
      amount: base.amount,
      expense_date: base.expense_date,
      payment_method: base.payment_method,
      vendor: base.vendor,
      reference_no: base.reference_no,
      notes: base.notes,
    });
  }

  try {
    const { data, error } = await client()
      .from("finance_expenses")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return mapExpense(data as Record<string, unknown>);
  } catch {
    return demoFinance.create({
      category: base.category,
      description: base.description,
      amount: base.amount,
      expense_date: base.expense_date,
      payment_method: base.payment_method,
      vendor: base.vendor,
      reference_no: base.reference_no,
      notes: base.notes,
    });
  }
}

export async function deleteExpense(id: string): Promise<boolean> {
  if (!canUseDb()) return demoFinance.remove(id);
  try {
    const { error } = await client()
      .from("finance_expenses")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return true;
  } catch {
    return demoFinance.remove(id);
  }
}

async function appointmentRevenue(from: string, to: string): Promise<number> {
  if (!canUseDb()) return 0;
  try {
    const { data, error } = await client()
      .from("appointments")
      .select("consultation_fee, status, date")
      .gte("date", from)
      .lte("date", to)
      .eq("status", "completed")
      .limit(5000);
    if (error) throw error;
    return (data || []).reduce((s, r) => {
      const fee = Number(r.consultation_fee);
      return s + (Number.isFinite(fee) && fee > 0 ? fee : 500);
    }, 0);
  } catch {
    return 0;
  }
}

async function billingRevenue(): Promise<{ today: number; month: number }> {
  try {
    const { getRevenue } = await import("@/lib/payments/payment-service");
    return await getRevenue();
  } catch {
    return { today: 0, month: 0 };
  }
}

export async function getFinanceSummary(
  from: string,
  to: string
): Promise<FinanceSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const [expenses, apptRev, billing] = await Promise.all([
    listExpenses({ from, to }),
    appointmentRevenue(from, to),
    billingRevenue(),
  ]);

  const expenses_period = expenses.reduce((s, e) => s + e.amount, 0);
  const expenses_today = expenses
    .filter((e) => e.expense_date === today)
    .reduce((s, e) => s + e.amount, 0);

  // Prefer billing month if present; else completed appointment fees
  const revenue_period = Math.max(apptRev, billing.month > 0 ? billing.month : 0);
  // If range is not "this month only", still use appt rev primarily
  const revenue_final =
    apptRev > 0 ? apptRev + (billing.month > 0 ? 0 : 0) : billing.month || apptRev;

  const byCat = new Map<string, number>();
  for (const e of expenses) {
    byCat.set(e.category, (byCat.get(e.category) || 0) + e.amount);
  }

  const rev = revenue_final || revenue_period;

  return {
    revenue_period: rev,
    expenses_period,
    profit_period: rev - expenses_period,
    revenue_today: billing.today || 0,
    expenses_today,
    by_category: Array.from(byCat.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    from,
    to,
  };
}
