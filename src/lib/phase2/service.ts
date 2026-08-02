/**
 * Phase 2 service — Supabase when available, demo store otherwise.
 * C-07: all service-role queries filter/stamp hospital_id when provided.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { demoPhase2 } from "@/lib/phase2/demo-store";
import type {
  HospitalBill,
  LabOrder,
  LabReport,
  LabTest,
  Medicine,
  PharmacySale,
  Prescription,
  Phase2DashboardStats,
} from "@/lib/phase2/types";

export type Phase2TenantOpts = {
  hospitalId?: string | null;
};

function canUseDb() {
  return hasSupabaseConfig();
}

function client() {
  return createServiceRoleClient();
}

/**
 * Chain .eq("hospital_id") onto a query when tenant is known.
 * Accepts any Supabase query builder — the precise generic type varies per
 * table/column shape and causes TS2589 (infinite instantiation) when captured.
 */
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

export async function getPhase2Stats(
  opts?: Phase2TenantOpts
): Promise<Phase2DashboardStats> {
  if (!canUseDb()) return demoPhase2.stats();
  try {
    const sb = client();
    const hid = opts?.hospitalId;
    const today = new Date().toISOString().slice(0, 10);
    const [
      { count: labPending },
      { data: sales },
      { data: meds },
      { count: rxToday },
      { data: bills },
    ] = await Promise.all([
      withHospitalEq(
        sb
          .from("lab_orders")
          .select("*", { count: "exact", head: true })
          .in("status", ["pending", "sample_collected", "processing"]),
        hid
      ),
      withHospitalEq(
        sb
          .from("pharmacy_sales")
          .select("grand_total, created_at")
          .gte("created_at", `${today}T00:00:00`),
        hid
      ),
      withHospitalEq(
        sb.from("medicines").select("stock_qty, reorder_level, expiry_date"),
        hid
      ),
      withHospitalEq(
        sb
          .from("prescriptions")
          .select("*", { count: "exact", head: true })
          .gte("created_at", `${today}T00:00:00`),
        hid
      ),
      withHospitalEq(
        sb
          .from("hospital_bills")
          .select("grand_total, payment_status, created_at")
          .gte("created_at", `${today}T00:00:00`),
        hid
      ),
    ]);
    const soon = new Date();
    soon.setDate(soon.getDate() + 90);
    const soonStr = soon.toISOString().slice(0, 10);
    const salesToday = ((sales || []) as { grand_total?: number }[]).reduce(
      (s: number, x) => s + Number(x.grand_total || 0),
      0
    );
    const billsPaid = (
      (bills || []) as { payment_status?: string; grand_total?: number }[]
    )
      .filter((b) => b.payment_status === "paid")
      .reduce((s: number, b) => s + Number(b.grand_total || 0), 0);
    return {
      lab_pending: labPending || 0,
      lab_completed_today: 0,
      pharmacy_sales_today: salesToday,
      low_stock: (
        (meds || []) as {
          stock_qty?: number;
          reorder_level?: number;
        }[]
      ).filter(
        (m) => Number(m.stock_qty) <= Number(m.reorder_level || 10)
      ).length,
      expiring_meds: (
        (meds || []) as { expiry_date?: string | null }[]
      ).filter(
        (m) => m.expiry_date && String(m.expiry_date) <= soonStr
      ).length,
      rx_today: rxToday || 0,
      bills_today: (bills || []).length,
      revenue_today: salesToday + billsPaid,
      outstanding: 0,
    };
  } catch {
    return demoPhase2.stats();
  }
}

export async function listLabTests(
  opts?: Phase2TenantOpts
): Promise<LabTest[]> {
  if (!canUseDb()) return demoPhase2.listTests();
  try {
    let q = client()
      .from("lab_tests")
      .select("*")
      .eq("is_active", true)
      .order("name");
    q = withHospitalEq(q, opts?.hospitalId);
    const { data, error } = await q;
    if (error || !data?.length) return demoPhase2.listTests();
    return data as LabTest[];
  } catch {
    return demoPhase2.listTests();
  }
}

export async function listLabOrders(
  opts?: Phase2TenantOpts
): Promise<LabOrder[]> {
  if (!canUseDb()) return demoPhase2.listOrders();
  try {
    let q = client()
      .from("lab_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    q = withHospitalEq(q, opts?.hospitalId);
    const { data, error } = await q;
    if (error) return demoPhase2.listOrders();
    return (data || []) as LabOrder[];
  } catch {
    return demoPhase2.listOrders();
  }
}

export async function createLabOrder(
  input: {
    patient_name: string;
    patient_phone: string;
    patient_email?: string;
    doctor_name?: string;
    notes?: string;
    priority?: string;
    tests: { id?: string; name: string; price: number }[];
  },
  opts?: Phase2TenantOpts
): Promise<LabOrder> {
  const total = input.tests.reduce((s, t) => s + t.price, 0);
  if (!canUseDb()) {
    return demoPhase2.createOrder({
      ...input,
      tests: input.tests.map((t) => ({ name: t.name, price: t.price })),
    });
  }
  try {
    const sb = client();
    const order_number = `LAB-${Date.now().toString().slice(-8)}`;
    const { data, error } = await sb
      .from("lab_orders")
      .insert(
        stampHospital(
          {
            order_number,
            patient_name: input.patient_name,
            patient_phone: input.patient_phone,
            patient_email: input.patient_email || "",
            doctor_name: input.doctor_name || "",
            notes: input.notes || "",
            priority: input.priority || "normal",
            status: "pending",
            total_amount: total,
          },
          opts?.hospitalId
        )
      )
      .select()
      .single();
    if (error || !data) throw error;
    await sb.from("lab_order_items").insert(
      input.tests.map((t) =>
        stampHospital(
          {
            order_id: data.id,
            test_id: t.id || null,
            test_name: t.name,
            price: t.price,
            status: "pending",
          },
          opts?.hospitalId
        )
      )
    );
    return {
      ...(data as LabOrder),
      items: input.tests.map((t) => ({
        test_name: t.name,
        price: t.price,
        status: "pending",
      })),
    };
  } catch {
    return demoPhase2.createOrder({
      ...input,
      tests: input.tests.map((t) => ({ name: t.name, price: t.price })),
    });
  }
}

export async function updateLabOrderStatus(
  orderId: string,
  status: LabOrder["status"],
  extra?: { report_url?: string; findings?: string },
  opts?: Phase2TenantOpts
) {
  if (!canUseDb()) return demoPhase2.updateOrderStatus(orderId, status, extra);
  try {
    const sb = client();
    const patch: Record<string, unknown> = { status };
    if (status === "sample_collected")
      patch.collected_at = new Date().toISOString();
    if (status === "completed" || status === "delivered") {
      patch.completed_at = new Date().toISOString();
    }
    if (status === "delivered") patch.delivered_at = new Date().toISOString();
    let q = sb.from("lab_orders").update(patch).eq("id", orderId);
    q = withHospitalEq(q, opts?.hospitalId);
    const { data, error } = await q.select().single();
    if (error) throw error;
    if (
      (status === "completed" || status === "delivered") &&
      (extra?.report_url || extra?.findings)
    ) {
      await sb.from("lab_reports").insert(
        stampHospital(
          {
            order_id: orderId,
            report_number: `RPT-${Date.now().toString().slice(-8)}`,
            patient_name: data.patient_name,
            title: `Lab Report — ${data.order_number}`,
            status: status === "delivered" ? "delivered" : "final",
            report_url: extra?.report_url || "",
            findings: extra?.findings || "",
            reported_at: new Date().toISOString(),
          },
          opts?.hospitalId
        )
      );
    }

    if (
      (status === "completed" || status === "delivered") &&
      data.patient_email
    ) {
      try {
        const { getNotificationService } = await import(
          "@/lib/notifications/notification-service"
        );
        const svc = getNotificationService();
        await svc.send({
          channel: "email",
          templateId: "lab_report_ready",
          recipient: String(data.patient_email),
          force: true,
          vars: {
            patientName: data.patient_name,
            orderNumber: data.order_number,
            reportUrl: extra?.report_url || "",
          },
          meta: { lab_order_id: orderId, source: "lab_status" },
        });
      } catch {
        /* ignore */
      }
    }

    return data as LabOrder;
  } catch {
    return demoPhase2.updateOrderStatus(orderId, status, extra);
  }
}

export async function listMedicines(
  opts?: Phase2TenantOpts
): Promise<Medicine[]> {
  if (!canUseDb()) return demoPhase2.listMedicines();
  try {
    let q = client()
      .from("medicines")
      .select("*")
      .order("name")
      .limit(200);
    q = withHospitalEq(q, opts?.hospitalId);
    const { data, error } = await q;
    if (error || !data?.length) return demoPhase2.listMedicines();
    return data as Medicine[];
  } catch {
    return demoPhase2.listMedicines();
  }
}

export async function saveMedicine(
  med: Omit<Medicine, "id"> & { id?: string },
  opts?: Phase2TenantOpts
): Promise<Medicine> {
  if (!canUseDb()) return demoPhase2.upsertMedicine(med);
  try {
    const sb = client();
    if (med.id) {
      let q = sb
        .from("medicines")
        .update(stampHospital({ ...med }, opts?.hospitalId))
        .eq("id", med.id);
      q = withHospitalEq(q, opts?.hospitalId);
      const { data, error } = await q.select().single();
      if (error) throw error;
      return data as Medicine;
    }
    const { data, error } = await sb
      .from("medicines")
      .insert(stampHospital({ ...med }, opts?.hospitalId))
      .select()
      .single();
    if (error) throw error;
    return data as Medicine;
  } catch {
    return demoPhase2.upsertMedicine(med);
  }
}

export async function createPharmacySale(
  input: {
    patient_name: string;
    patient_phone?: string;
    patient_age?: number | null;
    sale_type: "walk_in" | "prescription";
    payment_method: string;
    payment_status?: "pending" | "paid" | "refunded" | "cancelled";
    items: {
      medicine_id?: string;
      name: string;
      qty: number;
      price: number;
    }[];
    discount?: number;
    tax?: number;
    prescription_id?: string | null;
  },
  opts?: Phase2TenantOpts
): Promise<PharmacySale> {
  if (!canUseDb()) return demoPhase2.createSale(input);
  try {
    const subtotal = input.items.reduce((s, i) => s + i.qty * i.price, 0);
    const grand = Math.max(
      0,
      subtotal - (input.discount || 0) + (input.tax || 0)
    );
    const paymentStatus = input.payment_status || "paid";
    const sb = client();
    for (const item of input.items) {
      if (!item.medicine_id) continue;
      let stockQuery = sb
        .from("medicines")
        .select("stock_qty")
        .eq("id", item.medicine_id);
      stockQuery = withHospitalEq(stockQuery, opts?.hospitalId);
      const { data: stock, error: stockError } = await stockQuery.maybeSingle();
      if (stockError) throw stockError;
      if (!stock || Number(stock.stock_qty) < item.qty) {
        throw new Error(`Insufficient stock for ${item.name}. Available: ${Number(stock?.stock_qty || 0)}`);
      }
    }
    const saleRow = stampHospital(
      {
        sale_number: `PH-${Date.now().toString().slice(-8)}`,
        patient_name: input.patient_name,
        patient_phone: input.patient_phone || "",
        patient_age: input.patient_age ?? null,
        sale_type: input.sale_type,
        prescription_id: input.prescription_id || null,
        subtotal,
        discount: input.discount || 0,
        tax: input.tax || 0,
        grand_total: grand,
        payment_method: input.payment_method,
        payment_status: paymentStatus,
        line_items: input.items,
      },
      opts?.hospitalId
    );
    let { data, error } = await sb
      .from("pharmacy_sales")
      .insert(saleRow)
      .select()
      .single();
    // Older DBs without patient_age column — retry without it
    if (error && /patient_age/i.test(error.message)) {
      const { patient_age: _age, ...withoutAge } = saleRow as Record<
        string,
        unknown
      > & { patient_age?: unknown };
      void _age;
      const retry = await sb
        .from("pharmacy_sales")
        .insert(withoutAge)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    for (const item of input.items) {
      if (!item.medicine_id) continue;
      let mq = sb
        .from("medicines")
        .select("stock_qty")
        .eq("id", item.medicine_id);
      mq = withHospitalEq(mq, opts?.hospitalId);
      const { data: m } = await mq.maybeSingle();
      if (m) {
        let uq = sb
          .from("medicines")
          .update({ stock_qty: Math.max(0, Number(m.stock_qty) - item.qty) })
          .eq("id", item.medicine_id);
        uq = withHospitalEq(uq, opts?.hospitalId);
        const { error: updateError } = await uq;
        if (updateError) throw updateError;
        await sb.from("pharmacy_stock_movements").insert(
          stampHospital(
            {
              medicine_id: item.medicine_id,
              movement_type: "out",
              quantity: item.qty,
              reference: data.sale_number,
            },
            opts?.hospitalId
          )
        );
      }
    }
    return data as PharmacySale;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Insufficient stock")) throw error;
    return demoPhase2.createSale(input);
  }
}

export async function listPrescriptions(
  opts?: Phase2TenantOpts
): Promise<Prescription[]> {
  if (!canUseDb()) return demoPhase2.listPrescriptions();
  try {
    let q = client()
      .from("prescriptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    q = withHospitalEq(q, opts?.hospitalId);
    const { data, error } = await q;
    if (error) return demoPhase2.listPrescriptions();
    return (data || []) as Prescription[];
  } catch {
    return demoPhase2.listPrescriptions();
  }
}

export async function createPrescription(
  input: Omit<
    Prescription,
    "id" | "prescription_number" | "created_at" | "status"
  >,
  opts?: Phase2TenantOpts
): Promise<Prescription> {
  if (!canUseDb()) return demoPhase2.createPrescription(input);
  try {
    const { data, error } = await client()
      .from("prescriptions")
      .insert(
        stampHospital(
          {
            prescription_number: `RX-${Date.now().toString().slice(-8)}`,
            ...input,
            status: "active",
          },
          opts?.hospitalId
        )
      )
      .select()
      .single();
    if (error) throw error;
    return data as Prescription;
  } catch {
    return demoPhase2.createPrescription(input);
  }
}

export async function listHospitalBills(
  opts?: Phase2TenantOpts
): Promise<HospitalBill[]> {
  if (!canUseDb()) return demoPhase2.listBills();
  try {
    let q = client()
      .from("hospital_bills")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    q = withHospitalEq(q, opts?.hospitalId);
    const { data, error } = await q;
    if (error) return demoPhase2.listBills();
    return (data || []) as HospitalBill[];
  } catch {
    return demoPhase2.listBills();
  }
}

export async function createHospitalBill(
  input: {
    patient_name: string;
    patient_phone: string;
    patient_email?: string;
    doctor_name?: string;
    consultation_fee: number;
    lab_charges: number;
    pharmacy_charges: number;
    other_charges: number;
    discount: number;
    gst_percent: number;
    payment_method: string;
    payment_status: HospitalBill["payment_status"];
    notes?: string;
    line_items?: { label: string; amount: number }[];
  },
  opts?: Phase2TenantOpts
): Promise<HospitalBill> {
  const sub =
    input.consultation_fee +
    input.lab_charges +
    input.pharmacy_charges +
    input.other_charges -
    input.discount;
  const gst_amount = Math.round(sub * (input.gst_percent / 100) * 100) / 100;
  const grand_total = Math.max(0, sub + gst_amount);
  if (!canUseDb()) return demoPhase2.createBill(input);
  try {
    const { data, error } = await client()
      .from("hospital_bills")
      .insert(
        stampHospital(
          {
            bill_number: `BILL-${Date.now().toString().slice(-8)}`,
            ...input,
            gst_amount,
            grand_total,
            paid_at:
              input.payment_status === "paid"
                ? new Date().toISOString()
                : null,
          },
          opts?.hospitalId
        )
      )
      .select()
      .single();
    if (error) throw error;
    return data as HospitalBill;
  } catch {
    return demoPhase2.createBill(input);
  }
}

export async function listLabReports(
  opts?: Phase2TenantOpts
): Promise<LabReport[]> {
  if (!canUseDb()) return demoPhase2.listReports();
  try {
    let q = client()
      .from("lab_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    q = withHospitalEq(q, opts?.hospitalId);
    const { data, error } = await q;
    if (error) return demoPhase2.listReports();
    return (data || []) as LabReport[];
  } catch {
    return demoPhase2.listReports();
  }
}

export async function globalSearch(q: string, opts?: Phase2TenantOpts) {
  const query = q.trim().toLowerCase();
  if (!query) {
    return {
      patients: [] as string[],
      medicines: [] as Medicine[],
      prescriptions: [] as Prescription[],
      reports: [] as LabReport[],
      bills: [] as HospitalBill[],
    };
  }
  const [meds, rx, reports, bills, orders] = await Promise.all([
    listMedicines(opts),
    listPrescriptions(opts),
    listLabReports(opts),
    listHospitalBills(opts),
    listLabOrders(opts),
  ]);
  return {
    medicines: meds.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.manufacturer.toLowerCase().includes(query) ||
        m.batch_number.toLowerCase().includes(query)
    ),
    prescriptions: rx.filter(
      (p) =>
        p.patient_name.toLowerCase().includes(query) ||
        p.prescription_number.toLowerCase().includes(query) ||
        p.diagnosis.toLowerCase().includes(query)
    ),
    reports: reports.filter(
      (r) =>
        r.patient_name.toLowerCase().includes(query) ||
        r.report_number.toLowerCase().includes(query)
    ),
    bills: bills.filter(
      (b) =>
        b.patient_name.toLowerCase().includes(query) ||
        b.bill_number.toLowerCase().includes(query) ||
        b.patient_phone.includes(query)
    ),
    orders: orders.filter(
      (o) =>
        o.patient_name.toLowerCase().includes(query) ||
        o.order_number.toLowerCase().includes(query) ||
        o.patient_phone.includes(query)
    ),
  };
}
