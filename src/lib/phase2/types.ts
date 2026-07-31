/** Phase 2 domain types — Lab, Pharmacy, Prescriptions, Hospital Bills */

export type LabOrderStatus =
  | "pending"
  | "sample_collected"
  | "processing"
  | "completed"
  | "delivered"
  | "cancelled";

export type LabTest = {
  id: string;
  category_id?: string | null;
  code: string;
  name: string;
  slug: string;
  description?: string;
  sample_type: string;
  price: number;
  turnaround_hours?: number;
  is_package?: boolean;
  is_active?: boolean;
};

export type LabOrder = {
  id: string;
  order_number: string;
  patient_id?: string | null;
  patient_name: string;
  patient_phone: string;
  patient_email?: string;
  doctor_name?: string;
  appointment_id?: string | null;
  status: LabOrderStatus;
  priority?: string;
  notes?: string;
  total_amount: number;
  collected_at?: string | null;
  completed_at?: string | null;
  items?: { test_name: string; price: number; status?: string }[];
  report_url?: string;
  created_at: string;
};

export type LabReport = {
  id: string;
  order_id: string;
  report_number: string;
  patient_name: string;
  title: string;
  status: string;
  report_url: string;
  findings: string;
  reported_at?: string | null;
  created_at: string;
};

export type Medicine = {
  id: string;
  name: string;
  generic_name?: string;
  manufacturer: string;
  batch_number: string;
  sku?: string;
  category?: string;
  purchase_price: number;
  selling_price: number;
  stock_qty: number;
  reorder_level: number;
  expiry_date?: string | null;
  unit?: string;
  is_active?: boolean;
};

export type PharmacySale = {
  id: string;
  sale_number: string;
  patient_name: string;
  patient_phone?: string;
  patient_age?: number | null;
  sale_type: "walk_in" | "prescription";
  subtotal?: number;
  discount?: number;
  tax?: number;
  grand_total: number;
  payment_method: string;
  payment_status: string;
  line_items: {
    medicine_id?: string;
    name: string;
    qty: number;
    price: number;
  }[];
  created_at: string;
};

export type RxMedicine = {
  name: string;
  dosage: string;
  morning: boolean;
  afternoon: boolean;
  night: boolean;
  food_instruction: string;
  duration: string;
  notes?: string;
};

export type Prescription = {
  id: string;
  prescription_number: string;
  patient_id?: string | null;
  patient_name: string;
  patient_phone: string;
  patient_age?: number | null;
  patient_gender?: string;
  doctor_name: string;
  doctor_reg_no?: string;
  appointment_id?: string | null;
  diagnosis: string;
  notes: string;
  follow_up_date?: string | null;
  medicines: RxMedicine[];
  status: "draft" | "active" | "dispensed" | "cancelled";
  created_at: string;
};

export type HospitalBill = {
  id: string;
  bill_number: string;
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
  gst_amount: number;
  grand_total: number;
  payment_method: string;
  payment_status: "pending" | "paid" | "refunded" | "cancelled" | "partial";
  line_items: { label: string; amount: number }[];
  notes?: string;
  paid_at?: string | null;
  created_at: string;
};

export type Phase2DashboardStats = {
  lab_pending: number;
  lab_completed_today: number;
  pharmacy_sales_today: number;
  low_stock: number;
  expiring_meds: number;
  rx_today: number;
  bills_today: number;
  revenue_today: number;
  outstanding: number;
};
