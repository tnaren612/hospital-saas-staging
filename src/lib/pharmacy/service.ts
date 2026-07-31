/**
 * Pharmacy Enterprise Service
 * Supabase when available, demo store otherwise.
 * All queries filter/stamp hospital_id for tenant isolation.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { roundMoney } from "./tax";
import { demoPharmacy } from "./demo-store";
import type {
  PharmacyBranch,
  PharmacyShift,
  PharmacySettings,
  PharmacyReturn,
  PharmacyHeldBill,
  PharmacyDashboardStats,
} from "./types";

export type PharmacyTenantOpts = {
  hospitalId?: string | null;
};

function canUseDb() {
  return hasSupabaseConfig();
}

function client() {
  return createServiceRoleClient();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withHospitalEq(query: any, hospitalId?: string | null) {
  if (hospitalId) return query.eq("hospital_id", hospitalId);
  return query;
}

function stampHospital<T extends Record<string, unknown>>(
  row: T,
  hospitalId?: string | null
): T {
  if (!hospitalId) return row;
  return { ...row, hospital_id: hospitalId };
}

// ============================================================================
// SETTINGS
// ============================================================================

export async function getPharmacySettings(
  opts?: PharmacyTenantOpts
): Promise<PharmacySettings> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.settings();
  try {
    const sb = client();
    const { data, error } = await sb
      .from("pharmacy_settings")
      .select("*")
      .eq("hospital_id", opts.hospitalId)
      .maybeSingle();
    if (error || !data) {
      // Auto-create default settings
      const { data: created } = await sb
        .from("pharmacy_settings")
        .insert({ hospital_id: opts.hospitalId })
        .select()
        .single();
      return (created as PharmacySettings) || demoPharmacy.settings();
    }
    return data as PharmacySettings;
  } catch {
    return demoPharmacy.settings();
  }
}

export async function updatePharmacySettings(
  patch: Partial<PharmacySettings>,
  opts?: PharmacyTenantOpts
): Promise<PharmacySettings> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.updateSettings(patch);
  try {
    const sb = client();
    const { data, error } = await sb
      .from("pharmacy_settings")
      .upsert({ ...patch, hospital_id: opts.hospitalId })
      .eq("hospital_id", opts.hospitalId)
      .select()
      .single();
    if (error) throw error;
    return data as PharmacySettings;
  } catch {
    return demoPharmacy.updateSettings(patch);
  }
}

// ============================================================================
// BRANCHES
// ============================================================================

export async function listBranches(
  opts?: PharmacyTenantOpts
): Promise<PharmacyBranch[]> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.branches();
  try {
    let q = client()
      .from("pharmacy_branches")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name");
    q = withHospitalEq(q, opts.hospitalId);
    const { data, error } = await q;
    if (error) return demoPharmacy.branches();
    return (data || []) as PharmacyBranch[];
  } catch {
    return demoPharmacy.branches();
  }
}

export async function createBranch(
  input: Omit<PharmacyBranch, "id" | "created_at" | "updated_at" | "hospital_id">,
  opts?: PharmacyTenantOpts
): Promise<PharmacyBranch> {
  if (!canUseDb() || !opts?.hospitalId) {
    return demoPharmacy.createBranch({
      ...input,
      hospital_id: opts?.hospitalId || "demo",
    });
  }
  try {
    const sb = client();
    const { data, error } = await sb
      .from("pharmacy_branches")
      .insert(stampHospital(input, opts.hospitalId))
      .select()
      .single();
    if (error) throw error;
    return data as PharmacyBranch;
  } catch {
    return demoPharmacy.createBranch({
      ...input,
      hospital_id: opts?.hospitalId || "demo",
    });
  }
}

export async function updateBranch(
  id: string,
  patch: Partial<PharmacyBranch>,
  opts?: PharmacyTenantOpts
): Promise<PharmacyBranch | null> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.updateBranch(id, patch);
  try {
    const sb = client();
    let q = sb.from("pharmacy_branches").update(patch).eq("id", id);
    q = withHospitalEq(q, opts.hospitalId);
    const { data, error } = await q.select().single();
    if (error) throw error;
    return data as PharmacyBranch;
  } catch {
    return demoPharmacy.updateBranch(id, patch);
  }
}

export async function deleteBranch(
  id: string,
  opts?: PharmacyTenantOpts
): Promise<boolean> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.deleteBranch(id);
  try {
    const sb = client();
    let q = sb.from("pharmacy_branches").delete().eq("id", id);
    q = withHospitalEq(q, opts.hospitalId);
    const { error } = await q;
    if (error) throw error;
    return true;
  } catch {
    return demoPharmacy.deleteBranch(id);
  }
}

// ============================================================================
// SHIFTS
// ============================================================================

export async function listShifts(
  opts?: PharmacyTenantOpts
): Promise<PharmacyShift[]> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.shifts();
  try {
    let q = client()
      .from("pharmacy_shifts")
      .select("*")
      .order("start_time", { ascending: false })
      .limit(50);
    q = withHospitalEq(q, opts.hospitalId);
    const { data, error } = await q;
    if (error) return demoPharmacy.shifts();
    return (data || []) as PharmacyShift[];
  } catch {
    return demoPharmacy.shifts();
  }
}

export async function getActiveShift(
  opts?: PharmacyTenantOpts
): Promise<PharmacyShift | null> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.activeShift();
  try {
    let q = client()
      .from("pharmacy_shifts")
      .select("*")
      .eq("status", "open")
      .order("start_time", { ascending: false })
      .limit(1);
    q = withHospitalEq(q, opts.hospitalId);
    const { data, error } = await q.maybeSingle();
    if (error) return demoPharmacy.activeShift();
    return (data as PharmacyShift) || null;
  } catch {
    return demoPharmacy.activeShift();
  }
}

export async function openShift(
  input: {
    user_name: string;
    user_id?: string;
    branch_id?: string;
    opening_cash: number;
    notes?: string;
  },
  opts?: PharmacyTenantOpts
): Promise<PharmacyShift> {
  if (!canUseDb() || !opts?.hospitalId) {
    return demoPharmacy.createShift({
      hospital_id: opts?.hospitalId || "demo",
      branch_id: input.branch_id || null,
      user_id: input.user_id || null,
      user_name: input.user_name,
      shift_date: new Date().toISOString().slice(0, 10),
      start_time: new Date().toISOString(),
      end_time: null,
      opening_cash: input.opening_cash,
      closing_cash: null,
      total_sales: 0,
      total_returns: 0,
      total_transactions: 0,
      status: "open",
      notes: input.notes || null,
    });
  }
  try {
    const sb = client();
    const { data, error } = await sb
      .from("pharmacy_shifts")
      .insert(
        stampHospital(
          {
            user_name: input.user_name,
            user_id: input.user_id || null,
            branch_id: input.branch_id || null,
            opening_cash: input.opening_cash,
            notes: input.notes || null,
            status: "open",
          },
          opts.hospitalId
        )
      )
      .select()
      .single();
    if (error) throw error;
    return data as PharmacyShift;
  } catch {
    return demoPharmacy.createShift({
      hospital_id: opts?.hospitalId || "demo",
      branch_id: input.branch_id || null,
      user_id: input.user_id || null,
      user_name: input.user_name,
      shift_date: new Date().toISOString().slice(0, 10),
      start_time: new Date().toISOString(),
      end_time: null,
      opening_cash: input.opening_cash,
      closing_cash: null,
      total_sales: 0,
      total_returns: 0,
      total_transactions: 0,
      status: "open",
      notes: input.notes || null,
    });
  }
}

export async function closeShift(
  id: string,
  closing_cash: number,
  opts?: PharmacyTenantOpts
): Promise<PharmacyShift | null> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.closeShift(id, closing_cash);
  try {
    const sb = client();
    let q = sb
      .from("pharmacy_shifts")
      .update({
        end_time: new Date().toISOString(),
        closing_cash,
        status: "closed",
      })
      .eq("id", id);
    q = withHospitalEq(q, opts.hospitalId);
    const { data, error } = await q.select().single();
    if (error) throw error;
    return data as PharmacyShift;
  } catch {
    return demoPharmacy.closeShift(id, closing_cash);
  }
}

// ============================================================================
// RETURNS
// ============================================================================

export async function listReturns(
  opts?: PharmacyTenantOpts
): Promise<PharmacyReturn[]> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.returns();
  try {
    let q = client()
      .from("pharmacy_returns")
      .select("*, items:pharmacy_return_items(*)")
      .order("created_at", { ascending: false })
      .limit(100);
    q = withHospitalEq(q, opts.hospitalId);
    const { data, error } = await q;
    if (error) return demoPharmacy.returns();
    return (data || []) as PharmacyReturn[];
  } catch {
    return demoPharmacy.returns();
  }
}

export async function createReturn(
  input: Omit<PharmacyReturn, "id" | "created_at" | "updated_at" | "hospital_id">,
  opts?: PharmacyTenantOpts
): Promise<PharmacyReturn> {
  if (!canUseDb() || !opts?.hospitalId) {
    return demoPharmacy.createReturn({
      ...input,
      hospital_id: opts?.hospitalId || "demo",
    });
  }
  try {
    const sb = client();
    const { items, ...rest } = input;
    const { data, error } = await sb
      .from("pharmacy_returns")
      .insert(stampHospital(rest, opts.hospitalId))
      .select()
      .single();
    if (error) throw error;
    if (items && items.length > 0) {
      await sb.from("pharmacy_return_items").insert(
        items.map((item) => ({
          ...item,
          return_id: data.id,
        }))
      );
    }
    return { ...(data as PharmacyReturn), items };
  } catch {
    return demoPharmacy.createReturn({
      ...input,
      hospital_id: opts?.hospitalId || "demo",
    });
  }
}

// ============================================================================
// HELD BILLS
// ============================================================================

export async function listHeldBills(
  opts?: PharmacyTenantOpts
): Promise<PharmacyHeldBill[]> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.heldBills();
  try {
    let q = client()
      .from("pharmacy_held_bills")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    q = withHospitalEq(q, opts.hospitalId);
    const { data, error } = await q;
    if (error) return demoPharmacy.heldBills();
    return (data || []) as PharmacyHeldBill[];
  } catch {
    return demoPharmacy.heldBills();
  }
}

export async function createHeldBill(
  input: Omit<PharmacyHeldBill, "id" | "created_at" | "hospital_id">,
  opts?: PharmacyTenantOpts
): Promise<PharmacyHeldBill> {
  if (!canUseDb() || !opts?.hospitalId) {
    return demoPharmacy.createHeldBill({
      ...input,
      hospital_id: opts?.hospitalId || "demo",
    });
  }
  try {
    const sb = client();
    const { data, error } = await sb
      .from("pharmacy_held_bills")
      .insert(stampHospital(input, opts.hospitalId))
      .select()
      .single();
    if (error) throw error;
    return data as PharmacyHeldBill;
  } catch {
    return demoPharmacy.createHeldBill({
      ...input,
      hospital_id: opts?.hospitalId || "demo",
    });
  }
}

export async function deleteHeldBill(
  id: string,
  opts?: PharmacyTenantOpts
): Promise<boolean> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.deleteHeldBill(id);
  try {
    const sb = client();
    let q = sb.from("pharmacy_held_bills").delete().eq("id", id);
    q = withHospitalEq(q, opts.hospitalId);
    const { error } = await q;
    if (error) throw error;
    return true;
  } catch {
    return demoPharmacy.deleteHeldBill(id);
  }
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

export async function getPharmacyDashboardStats(
  opts?: PharmacyTenantOpts
): Promise<PharmacyDashboardStats> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.dashboardStats();
  try {
    const sb = client();
    const hid = opts.hospitalId;
    const today = new Date().toISOString().slice(0, 10);
    const todayStart = `${today}T00:00:00`;

    const [
      { data: todaySales },
      { data: todayReturns },
      { data: meds },
      { count: pendingRx },
      activeShift,
    ] = await Promise.all([
      withHospitalEq(
        sb
          .from("pharmacy_sales")
          .select("grand_total, payment_method, created_at")
          .gte("created_at", todayStart),
        hid
      ),
      withHospitalEq(
        sb
          .from("pharmacy_returns")
          .select("refund_amount")
          .gte("created_at", todayStart),
        hid
      ),
      withHospitalEq(
        sb.from("medicines").select("stock_qty, expiry_date, min_stock_level"),
        hid
      ),
      withHospitalEq(
        sb
          .from("prescriptions")
          .select("*", { count: "exact", head: true })
          .eq("status", "active"),
        hid
      ),
      getActiveShift(opts),
    ]);

    const salesArr = (todaySales || []) as Array<{
      grand_total?: number;
      payment_method?: string;
      created_at?: string;
      customer_phone?: string | null;
    }>;
    const returnsArr = (todayReturns || []) as Array<{ refund_amount?: number }>;
    const medsArr = (meds || []) as Array<{
      stock_qty?: number;
      min_stock_level?: number;
      expiry_date?: string | null;
    }>;

    const today_sales = salesArr.reduce(
      (s, x) => s + Number(x.grand_total || 0),
      0
    );
    const today_returns = returnsArr.reduce(
      (s, x) => s + Number(x.refund_amount || 0),
      0
    );

    const low_stock_count = medsArr.filter(
      (m) => Number(m.stock_qty) <= Number(m.min_stock_level || 10)
    ).length;
    const out_of_stock_count = medsArr.filter(
      (m) => Number(m.stock_qty) === 0
    ).length;

    const soon = new Date();
    soon.setDate(soon.getDate() + 90);
    const soonStr = soon.toISOString().slice(0, 10);
    const expiring_count = medsArr.filter(
      (m) => m.expiry_date && String(m.expiry_date) <= soonStr
    ).length;
    const expired_count = medsArr.filter(
      (m) => m.expiry_date && String(m.expiry_date) < today
    ).length;

    // Payment breakdown
    const paymentMap = new Map<string, { amount: number; count: number }>();
    salesArr.forEach((s) => {
      const method = s.payment_method || "Cash";
      const existing = paymentMap.get(method) || { amount: 0, count: 0 };
      existing.amount += Number(s.grand_total || 0);
      existing.count += 1;
      paymentMap.set(method, existing);
    });
    const payment_breakdown = Array.from(paymentMap.entries()).map(
      ([method, v]) => ({ method, ...v })
    );

    return {
      today_sales,
      today_transactions: salesArr.length,
      today_returns,
      today_discount: 0,
      today_tax: 0,
      today_customers: new Set(salesArr.map((s) => s.customer_phone).filter(Boolean))
        .size,
      low_stock_count,
      expiring_count,
      expired_count,
      out_of_stock_count,
      pending_prescriptions: pendingRx || 0,
      active_shift: activeShift,
      recent_sales: salesArr.slice(0, 10),
      top_medicines: [],
      payment_breakdown,
      hourly_sales: [],
    };
  } catch {
    return demoPharmacy.dashboardStats();
  }
}

// ============================================================================
// AUDIT LOG
// ============================================================================

export async function logPharmacyAction(
  action: string,
  entityType: string,
  entityId: string | null,
  details?: Record<string, unknown>,
  opts?: PharmacyTenantOpts
): Promise<void> {
  if (!canUseDb() || !opts?.hospitalId) return;
  try {
    const sb = client();
    await sb.from("pharmacy_audit_log").insert({
      hospital_id: opts.hospitalId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: details || null,
    });
  } catch {
    /* ignore */
  }
}

// ============================================================================
// POS SALES (enterprise checkout)
// ============================================================================

/** A POS line item — richer than the phase2 shape (batch/expiry/gst/discount). */
export type PosSaleLineItem = {
  medicine_id?: string;
  name: string;
  qty: number;
  price: number;
  gst_percent?: number;
  batch_number?: string | null;
  expiry_date?: string | null;
  discount?: number;
};

export type PosSaleInput = {
  patient_name: string;
  patient_phone?: string;
  patient_age?: number | null;
  sale_type: "walk_in" | "prescription";
  branch_id?: string | null;
  shift_id?: string | null;
  cashier_name?: string;
  doctor_name?: string | null;
  doctor_reg_no?: string | null;
  prescription_number?: string | null;
  items: PosSaleLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  tax_type?: string;
  grand_total: number;
  payment_method: string;
  payment_status?: "pending" | "paid" | "refunded" | "cancelled";
  amount_paid: number;
  amount_returned: number;
  payment_reference?: string | null;
  notes?: string | null;
};

/**
 * Create a POS sale with the full enterprise column set.
 * Validates + decrements stock, writes stock movements, and audits the action.
 * Follows the phase2 createPharmacySale pattern (patient_age fallback, tenant
 * isolation, rethrow of "Insufficient stock" errors).
 */
export async function createPosSale(
  input: PosSaleInput,
  opts?: PharmacyTenantOpts
): Promise<Record<string, unknown> | null> {
  if (!canUseDb() || !opts?.hospitalId) {
    return demoPharmacy.createPosSale(input);
  }
  const sb = client();
  // 1) Stock validation
  for (const item of input.items) {
    if (!item.medicine_id) continue;
    let stockQuery = sb
      .from("medicines")
      .select("stock_qty")
      .eq("id", item.medicine_id);
    stockQuery = withHospitalEq(stockQuery, opts.hospitalId);
    const { data: stock, error: stockError } = await stockQuery.maybeSingle();
    if (stockError) throw stockError;
    if (!stock || Number(stock.stock_qty) < item.qty) {
      throw new Error(
        `Insufficient stock for ${item.name}. Available: ${Number(stock?.stock_qty || 0)}`
      );
    }
  }

  const saleRow = stampHospital(
    {
      sale_number: `PH-${Date.now().toString().slice(-8)}`,
      patient_name: input.patient_name,
      patient_phone: input.patient_phone || "",
      patient_age: input.patient_age ?? null,
      sale_type: input.sale_type,
      prescription_id: null,
      branch_id: input.branch_id ?? null,
      shift_id: input.shift_id ?? null,
      cashier_name: input.cashier_name ?? "",
      customer_phone: input.patient_phone ?? "",
      prescription_number: input.prescription_number ?? null,
      doctor_name: input.doctor_name ?? null,
      doctor_reg_no: input.doctor_reg_no ?? null,
      subtotal: input.subtotal,
      discount: input.discount,
      tax: input.tax,
      grand_total: input.grand_total,
      amount_paid: input.amount_paid,
      amount_returned: input.amount_returned,
      payment_method: input.payment_method,
      payment_status: input.payment_status || "paid",
      payment_reference: input.payment_reference ?? null,
      notes: input.notes ?? null,
      sold_by: input.cashier_name ?? "",
      line_items: input.items.map((i) => ({
        medicine_id: i.medicine_id ?? null,
        name: i.name,
        quantity: i.qty,
        qty: i.qty,
        price: i.price,
        selling_price: i.price,
        gst_percent: i.gst_percent ?? null,
        batch_number: i.batch_number ?? null,
        expiry_date: i.expiry_date ?? null,
        discount: i.discount ?? 0,
        total: roundMoney(i.price * i.qty),
      })),
    },
    opts.hospitalId
  );

  let { data, error } = await sb.from("pharmacy_sales").insert(saleRow).select().single();
  // Older DBs without patient_age column — retry without it
  if (error && /patient_age/i.test(error.message)) {
    const { patient_age: _age, ...withoutAge } = saleRow as Record<string, unknown> & {
      patient_age?: unknown;
    };
    void _age;
    const retry = await sb.from("pharmacy_sales").insert(withoutAge).select().single();
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;

  // 2) Decrement stock + record movements
  for (const item of input.items) {
    if (!item.medicine_id) continue;
    let mq = sb.from("medicines").select("stock_qty").eq("id", item.medicine_id);
    mq = withHospitalEq(mq, opts.hospitalId);
    const { data: m } = await mq.maybeSingle();
    if (m) {
      let uq = sb
        .from("medicines")
        .update({ stock_qty: Math.max(0, Number(m.stock_qty) - item.qty) })
        .eq("id", item.medicine_id);
      uq = withHospitalEq(uq, opts.hospitalId);
      const { error: updateError } = await uq;
      if (updateError) throw updateError;
      await sb
        .from("pharmacy_stock_movements")
        .insert(
          stampHospital(
            {
              medicine_id: item.medicine_id,
              movement_type: "out",
              quantity: item.qty,
              reference: (data as { sale_number?: string }).sale_number || "",
            },
            opts.hospitalId
          )
        );
    }
  }

  await logPharmacyAction(
    "sale_create",
    "pharmacy_sale",
    (data as { id?: string }).id ?? null,
    {
      sale_number: (data as { sale_number?: string }).sale_number,
      grand_total: input.grand_total,
      payment_method: input.payment_method,
      items: input.items.length,
    },
    opts
  );

  return data as Record<string, unknown>;
}

/** Fetch a single sale by its sale_number (for reprint / lookup). */
export async function getSaleByNumber(
  saleNumber: string,
  opts?: PharmacyTenantOpts
): Promise<Record<string, unknown> | null> {
  if (!canUseDb() || !opts?.hospitalId) return demoPharmacy.getSaleByNumber(saleNumber);
  try {
    let q = client()
      .from("pharmacy_sales")
      .select("*")
      .eq("sale_number", saleNumber);
    q = withHospitalEq(q, opts.hospitalId);
    const { data, error } = await q.maybeSingle();
    if (error) return null;
    return (data as Record<string, unknown>) || null;
  } catch {
    return null;
  }
}

/** List sales, optionally since a timestamp (offline pull). Additive. */
export async function listSales(
  opts?: PharmacyTenantOpts & { sinceIso?: string; limit?: number }
): Promise<Record<string, unknown>[]> {
  if (!canUseDb() || !opts?.hospitalId) return [];
  try {
    let q = client()
      .from("pharmacy_sales")
      .select("*")
      .order("updated_at", { ascending: true });
    if (opts.sinceIso) q = q.gte("updated_at", opts.sinceIso);
    q = withHospitalEq(q, opts.hospitalId);
    if (opts.limit && opts.limit > 0) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) return [];
    return (data || []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}
