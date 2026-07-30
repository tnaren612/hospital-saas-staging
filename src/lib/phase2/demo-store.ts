/**
 * In-memory Phase 2 store when Supabase tables are unavailable (local demo).
 */

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

function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ref(prefix: string) {
  return `${prefix}-${Date.now().toString().slice(-8)}-${Math.floor(100 + Math.random() * 900)}`;
}

const DEFAULT_TESTS: LabTest[] = [
  { id: "t1", code: "CBC", name: "CBC", slug: "cbc", sample_type: "blood", price: 350 },
  { id: "t2", code: "LIPID", name: "Lipid Profile", slug: "lipid", sample_type: "blood", price: 600 },
  { id: "t3", code: "SUGAR", name: "Blood Sugar", slug: "sugar", sample_type: "blood", price: 150 },
  { id: "t4", code: "THY", name: "Thyroid", slug: "thyroid", sample_type: "blood", price: 700 },
  { id: "t5", code: "URINE", name: "Urine Test", slug: "urine", sample_type: "urine", price: 200 },
  { id: "t6", code: "XRAY", name: "X-Ray", slug: "xray", sample_type: "na", price: 500 },
  { id: "t7", code: "MRI", name: "MRI", slug: "mri", sample_type: "na", price: 4500 },
  { id: "t8", code: "CT", name: "CT Scan", slug: "ct", sample_type: "na", price: 3500 },
  { id: "t9", code: "ECG", name: "ECG", slug: "ecg", sample_type: "na", price: 400 },
  { id: "t10", code: "ECHO", name: "Echo", slug: "echo", sample_type: "na", price: 1800 },
  { id: "t11", code: "USG", name: "Ultrasound", slug: "usg", sample_type: "na", price: 900 },
  { id: "t12", code: "COVID", name: "COVID Test", slug: "covid", sample_type: "swab", price: 500 },
  { id: "t13", code: "VIT", name: "Vitamin Tests", slug: "vitamins", sample_type: "blood", price: 1200 },
  { id: "t14", code: "BLOOD", name: "Blood Test", slug: "blood", sample_type: "blood", price: 300 },
];

const g = globalThis as unknown as {
  __ssh_phase2?: {
    tests: LabTest[];
    orders: LabOrder[];
    reports: LabReport[];
    medicines: Medicine[];
    sales: PharmacySale[];
    prescriptions: Prescription[];
    bills: HospitalBill[];
  };
};

function store() {
  if (!g.__ssh_phase2) {
    g.__ssh_phase2 = {
      tests: [...DEFAULT_TESTS],
      orders: [],
      reports: [],
      medicines: [
        {
          id: "m1",
          name: "Salbutamol Inhaler",
          manufacturer: "Cipla",
          batch_number: "SB2401",
          category: "Respiratory",
          purchase_price: 80,
          selling_price: 120,
          stock_qty: 45,
          reorder_level: 10,
          expiry_date: "2027-06-30",
        },
        {
          id: "m2",
          name: "Montelukast 10mg",
          manufacturer: "Sun Pharma",
          batch_number: "MT2402",
          category: "Respiratory",
          purchase_price: 60,
          selling_price: 95,
          stock_qty: 8,
          reorder_level: 15,
          expiry_date: "2026-09-15",
        },
        {
          id: "m3",
          name: "Paracetamol 650",
          manufacturer: "GSK",
          batch_number: "PC2403",
          category: "Analgesics",
          purchase_price: 12,
          selling_price: 25,
          stock_qty: 200,
          reorder_level: 40,
          expiry_date: "2027-01-01",
        },
      ],
      sales: [],
      prescriptions: [],
      bills: [],
    };
  }
  return g.__ssh_phase2;
}

export const demoPhase2 = {
  listTests: () => store().tests,
  listOrders: () => [...store().orders].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  listReports: () => [...store().reports].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  listMedicines: () => store().medicines,
  listSales: () => [...store().sales].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  listPrescriptions: () =>
    [...store().prescriptions].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  listBills: () => [...store().bills].sort((a, b) => b.created_at.localeCompare(a.created_at)),

  createOrder(input: {
    patient_name: string;
    patient_phone: string;
    patient_email?: string;
    doctor_name?: string;
    notes?: string;
    tests: { name: string; price: number }[];
  }): LabOrder {
    const total = input.tests.reduce((s, t) => s + t.price, 0);
    const order: LabOrder = {
      id: id("lab"),
      order_number: ref("LAB"),
      patient_name: input.patient_name,
      patient_phone: input.patient_phone,
      patient_email: input.patient_email || "",
      doctor_name: input.doctor_name || "",
      status: "pending",
      notes: input.notes || "",
      total_amount: total,
      items: input.tests.map((t) => ({
        test_name: t.name,
        price: t.price,
        status: "pending",
      })),
      created_at: new Date().toISOString(),
    };
    store().orders.unshift(order);
    return order;
  },

  updateOrderStatus(
    orderId: string,
    status: LabOrder["status"],
    extra?: { report_url?: string; findings?: string }
  ) {
    const order = store().orders.find((o) => o.id === orderId);
    if (!order) return null;
    order.status = status;
    if (status === "sample_collected") order.collected_at = new Date().toISOString();
    if (status === "completed" || status === "delivered") {
      order.completed_at = new Date().toISOString();
      if (extra?.report_url || extra?.findings) {
        const report: LabReport = {
          id: id("rpt"),
          order_id: order.id,
          report_number: ref("RPT"),
          patient_name: order.patient_name,
          title: `Lab Report — ${order.order_number}`,
          status: status === "delivered" ? "delivered" : "final",
          report_url: extra?.report_url || "",
          findings: extra?.findings || "",
          reported_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        store().reports.unshift(report);
        order.report_url = report.report_url;
      }
    }
    return order;
  },

  upsertMedicine(med: Omit<Medicine, "id"> & { id?: string }) {
    const s = store();
    if (med.id) {
      const i = s.medicines.findIndex((m) => m.id === med.id);
      if (i >= 0) {
        s.medicines[i] = { ...s.medicines[i], ...med, id: med.id };
        return s.medicines[i];
      }
    }
    const row: Medicine = {
      id: med.id || id("med"),
      name: med.name,
      generic_name: med.generic_name || "",
      manufacturer: med.manufacturer || "",
      batch_number: med.batch_number || "",
      category: med.category || "General",
      purchase_price: med.purchase_price,
      selling_price: med.selling_price,
      stock_qty: med.stock_qty,
      reorder_level: med.reorder_level ?? 10,
      expiry_date: med.expiry_date || null,
      unit: med.unit || "strip",
    };
    s.medicines.unshift(row);
    return row;
  },

  createSale(input: {
    patient_name: string;
    patient_phone?: string;
    sale_type: "walk_in" | "prescription";
    payment_method: string;
    items: { medicine_id?: string; name: string; qty: number; price: number }[];
    discount?: number;
    tax?: number;
  }): PharmacySale {
    const subtotal = input.items.reduce((s, i) => s + i.qty * i.price, 0);
    const discount = input.discount || 0;
    const tax = input.tax || 0;
    const sale: PharmacySale = {
      id: id("sale"),
      sale_number: ref("PH"),
      patient_name: input.patient_name,
      patient_phone: input.patient_phone || "",
      sale_type: input.sale_type,
      grand_total: Math.max(0, subtotal - discount + tax),
      payment_method: input.payment_method,
      payment_status: "paid",
      line_items: input.items,
      created_at: new Date().toISOString(),
    };
    for (const item of input.items) {
      if (!item.medicine_id) continue;
      const m = store().medicines.find((x) => x.id === item.medicine_id);
      if (m && m.stock_qty < item.qty) {
        throw new Error(`Insufficient stock for ${item.name}. Available: ${m.stock_qty}`);
      }
      if (m) m.stock_qty -= item.qty;
    }
    store().sales.unshift(sale);
    return sale;
  },

  createPrescription(input: Omit<Prescription, "id" | "prescription_number" | "created_at" | "status">) {
    const rx: Prescription = {
      ...input,
      id: id("rx"),
      prescription_number: ref("RX"),
      status: "active",
      medicines: input.medicines,
      created_at: new Date().toISOString(),
    };
    store().prescriptions.unshift(rx);
    return rx;
  },

  createBill(input: {
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
  }): HospitalBill {
    const sub =
      input.consultation_fee +
      input.lab_charges +
      input.pharmacy_charges +
      input.other_charges -
      input.discount;
    const gst_amount = Math.round(sub * (input.gst_percent / 100) * 100) / 100;
    const bill: HospitalBill = {
      id: id("bill"),
      bill_number: ref("BILL"),
      patient_name: input.patient_name,
      patient_phone: input.patient_phone,
      patient_email: input.patient_email || "",
      doctor_name: input.doctor_name || "",
      consultation_fee: input.consultation_fee,
      lab_charges: input.lab_charges,
      pharmacy_charges: input.pharmacy_charges,
      other_charges: input.other_charges,
      discount: input.discount,
      gst_percent: input.gst_percent,
      gst_amount,
      grand_total: Math.max(0, sub + gst_amount),
      payment_method: input.payment_method,
      payment_status: input.payment_status,
      line_items: input.line_items || [],
      notes: input.notes || "",
      paid_at:
        input.payment_status === "paid" ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
    };
    store().bills.unshift(bill);
    return bill;
  },

  stats(): Phase2DashboardStats {
    const today = new Date().toISOString().slice(0, 10);
    const sales = store().sales.filter((s) => s.created_at.startsWith(today));
    const bills = store().bills.filter((b) => b.created_at.startsWith(today));
    const revenue =
      sales.reduce((s, x) => s + x.grand_total, 0) +
      bills
        .filter((b) => b.payment_status === "paid")
        .reduce((s, x) => s + x.grand_total, 0);
    const soon = new Date();
    soon.setDate(soon.getDate() + 90);
    return {
      lab_pending: store().orders.filter((o) =>
        ["pending", "sample_collected", "processing"].includes(o.status)
      ).length,
      lab_completed_today: store().orders.filter(
        (o) =>
          o.status === "completed" ||
          (o.completed_at && o.completed_at.startsWith(today))
      ).length,
      pharmacy_sales_today: sales.reduce((s, x) => s + x.grand_total, 0),
      low_stock: store().medicines.filter((m) => m.stock_qty <= m.reorder_level)
        .length,
      expiring_meds: store().medicines.filter(
        (m) => m.expiry_date && m.expiry_date <= soon.toISOString().slice(0, 10)
      ).length,
      rx_today: store().prescriptions.filter((p) =>
        p.created_at.startsWith(today)
      ).length,
      bills_today: bills.length,
      revenue_today: revenue,
      outstanding: store().bills
        .filter((b) => b.payment_status === "pending")
        .reduce((s, b) => s + b.grand_total, 0),
    };
  },
};
