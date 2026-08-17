/**
 * Pharmacy Enterprise Demo Store
 * In-memory fallback when Supabase is not configured
 */

import type {
  PharmacyBranch,
  PharmacyShift,
  PharmacySettings,
  PharmacyReturn,
  PharmacyHeldBill,
  PharmacyDashboardStats,
} from "./types";
import { gatedDemoStore } from "@/lib/supabase/demo-gate";

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

const defaultSettings: PharmacySettings = {
  hospital_id: "demo",
  receipt_header: "",
  receipt_footer: "Thank you for your purchase. Get well soon!",
  receipt_paper_size: "80mm",
  show_logo: true,
  show_hospital_address: true,
  show_phone: true,
  show_gst: true,
  show_drug_license: true,
  show_doctor_name: true,
  show_patient_address: false,
  show_batch_details: true,
  show_expiry: true,
  show_mrp: true,
  show_savings: true,
  show_barcode: true,
  show_qr_code: true,
  show_return_policy: true,
  return_policy_text: "Medicines once sold will not be returned. Exchange within 7 days with bill.",
  default_gst_percent: 12,
  inclusive_tax: false,
  max_discount_percent: 10,
  require_discount_approval: false,
  low_stock_threshold: 10,
  expiry_alert_days: 90,
  critical_expiry_days: 30,
  enable_barcode_scanner: true,
  enable_keyboard_shortcuts: true,
  enable_sound_effects: true,
  auto_print_receipt: false,
  require_patient_for_sale: false,
  allow_credit_sales: false,
  enable_cash: true,
  enable_upi: true,
  enable_card: true,
  enable_insurance: true,
  enable_credit: false,
  enable_wallet: false,
  drug_license_number: "DL-MH-2024-12345",
  gst_number: "27AAAAA0000A1Z5",
  pharmacist_name: "Mr. Demo Pharmacist",
  pharmacist_registration: "MH/PHARM/2024/001",
  standalone_mode: false,
};

const demoBranches: PharmacyBranch[] = [
  {
    id: "branch-1",
    hospital_id: "demo",
    code: "MAIN",
    name: "Main Pharmacy",
    address: "Ground Floor, Hospital Building",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    phone: "+91 22 1234 5678",
    email: "pharmacy@hospital.invalid",
    manager_name: "Mr. Demo Manager",
    is_active: true,
    is_default: true,
    created_at: now(),
    updated_at: now(),
  },
];

const demoShifts: PharmacyShift[] = [
  {
    id: "shift-1",
    hospital_id: "demo",
    branch_id: "branch-1",
    user_id: "demo-user",
    user_name: "Demo Pharmacist",
    shift_date: today(),
    start_time: now(),
    end_time: null,
    opening_cash: 5000,
    closing_cash: null,
    total_sales: 0,
    total_returns: 0,
    total_transactions: 0,
    status: "open",
    notes: null,
    created_at: now(),
    updated_at: now(),
  },
];

/** Minimal POS line shape used by the demo store to persist line_items. */
type PosSaleItemLike = {
  medicine_id?: string | null;
  name: string;
  qty: number;
  price: number;
  gst_percent?: number | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  discount?: number;
};

const demoReturns: PharmacyReturn[] = [];
const demoHeldBills: PharmacyHeldBill[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const demoPosSales: any[] = [];

const rawDemoPharmacy = {
  settings(): PharmacySettings {
    return { ...defaultSettings };
  },

  updateSettings(patch: Partial<PharmacySettings>): PharmacySettings {
    return { ...defaultSettings, ...patch };
  },

  branches(): PharmacyBranch[] {
    return [...demoBranches];
  },

  createBranch(input: Omit<PharmacyBranch, "id" | "created_at" | "updated_at">): PharmacyBranch {
    const branch: PharmacyBranch = {
      ...input,
      id: `branch-${Date.now()}`,
      created_at: now(),
      updated_at: now(),
    };
    demoBranches.push(branch);
    return branch;
  },

  updateBranch(id: string, patch: Partial<PharmacyBranch>): PharmacyBranch | null {
    const idx = demoBranches.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    demoBranches[idx] = { ...demoBranches[idx], ...patch, updated_at: now() };
    return demoBranches[idx];
  },

  deleteBranch(id: string): boolean {
    const idx = demoBranches.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    demoBranches.splice(idx, 1);
    return true;
  },

  shifts(): PharmacyShift[] {
    return [...demoShifts];
  },

  activeShift(): PharmacyShift | null {
    return demoShifts.find((s) => s.status === "open") || null;
  },

  createShift(input: Omit<PharmacyShift, "id" | "created_at" | "updated_at">): PharmacyShift {
    const shift: PharmacyShift = {
      ...input,
      id: `shift-${Date.now()}`,
      created_at: now(),
      updated_at: now(),
    };
    demoShifts.push(shift);
    return shift;
  },

  closeShift(id: string, closing_cash: number): PharmacyShift | null {
    const idx = demoShifts.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    demoShifts[idx] = {
      ...demoShifts[idx],
      end_time: now(),
      closing_cash,
      status: "closed",
      updated_at: now(),
    };
    return demoShifts[idx];
  },

  returns(): PharmacyReturn[] {
    return [...demoReturns];
  },

  createReturn(input: Omit<PharmacyReturn, "id" | "created_at" | "updated_at">): PharmacyReturn {
    const ret: PharmacyReturn = {
      ...input,
      id: `return-${Date.now()}`,
      created_at: now(),
      updated_at: now(),
    };
    demoReturns.push(ret);
    return ret;
  },

  heldBills(): PharmacyHeldBill[] {
    return [...demoHeldBills];
  },

  createHeldBill(input: Omit<PharmacyHeldBill, "id" | "created_at">): PharmacyHeldBill {
    const bill: PharmacyHeldBill = {
      ...input,
      id: `held-${Date.now()}`,
      created_at: now(),
    };
    demoHeldBills.push(bill);
    return bill;
  },

  deleteHeldBill(id: string): boolean {
    const idx = demoHeldBills.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    demoHeldBills.splice(idx, 1);
    return true;
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createPosSale(input: any): any {
    const existing = input.sale_number
      ? demoPosSales.find((s) => s.sale_number === input.sale_number)
      : null;
    if (existing) return existing;
    const sale = {
      ...input,
      id: input.id || `sale-${Date.now()}`,
      sale_number: input.sale_number || `PH-${Date.now().toString().slice(-8)}`,
      patient_phone: input.patient_phone || "",
      payment_status: input.payment_status || "paid",
      line_items: (input.items || []).map((i: PosSaleItemLike) => ({
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
        total: (i.price || 0) * (i.qty || 0),
      })),
      created_at: now(),
    };
    demoPosSales.push(sale);
    return sale;
  },

  getSaleByNumber(saleNumber: string): Record<string, unknown> | null {
    return demoPosSales.find((s) => s.sale_number === saleNumber) || null;
  },

  dashboardStats(): PharmacyDashboardStats {
    return {
      today_sales: 12450,
      today_transactions: 18,
      today_returns: 250,
      today_discount: 320,
      today_tax: 1494,
      today_customers: 16,
      low_stock_count: 5,
      expiring_count: 8,
      expired_count: 2,
      out_of_stock_count: 3,
      pending_prescriptions: 4,
      active_shift: demoPharmacy.activeShift(),
      recent_sales: [],
      top_medicines: [
        { name: "Paracetamol 500mg", quantity: 45, revenue: 675 },
        { name: "Amoxicillin 250mg", quantity: 28, revenue: 980 },
        { name: "Cetirizine 10mg", quantity: 32, revenue: 480 },
      ],
      payment_breakdown: [
        { method: "Cash", amount: 6450, count: 9 },
        { method: "UPI", amount: 4200, count: 6 },
        { method: "Card", amount: 1800, count: 3 },
      ],
      hourly_sales: Array.from({ length: 12 }, (_, i) => ({
        hour: i + 8,
        amount: Math.floor(Math.random() * 2000) + 500,
        count: Math.floor(Math.random() * 5) + 1,
      })),
    };
  },
};

export const demoPharmacy = gatedDemoStore("pharmacy demo store", rawDemoPharmacy);
