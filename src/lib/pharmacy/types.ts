/**
 * Pharmacy Enterprise Types
 * Branches, Shifts, POS, Receipts, Returns, Settings
 */

export type PharmacyBranch = {
  id: string;
  hospital_id: string;
  code: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  manager_name?: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type PharmacyShift = {
  id: string;
  hospital_id: string;
  branch_id?: string | null;
  user_id?: string | null;
  user_name: string;
  shift_date: string;
  start_time: string;
  end_time?: string | null;
  opening_cash: number;
  closing_cash?: number | null;
  total_sales: number;
  total_returns: number;
  total_transactions: number;
  status: "open" | "closed" | "cancelled";
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type PharmacySettings = {
  hospital_id: string;
  receipt_header: string;
  receipt_footer: string;
  receipt_paper_size: "58mm" | "80mm" | "A4";
  show_logo: boolean;
  show_hospital_address: boolean;
  show_phone: boolean;
  show_gst: boolean;
  show_drug_license: boolean;
  show_doctor_name: boolean;
  show_patient_address: boolean;
  show_batch_details: boolean;
  show_expiry: boolean;
  show_mrp: boolean;
  show_savings: boolean;
  show_barcode: boolean;
  show_qr_code: boolean;
  show_return_policy: boolean;
  return_policy_text: string;
  default_gst_percent: number;
  inclusive_tax: boolean;
  max_discount_percent: number;
  require_discount_approval: boolean;
  low_stock_threshold: number;
  expiry_alert_days: number;
  critical_expiry_days: number;
  enable_barcode_scanner: boolean;
  enable_keyboard_shortcuts: boolean;
  enable_sound_effects: boolean;
  auto_print_receipt: boolean;
  require_patient_for_sale: boolean;
  allow_credit_sales: boolean;
  enable_cash: boolean;
  enable_upi: boolean;
  enable_card: boolean;
  enable_insurance: boolean;
  enable_credit: boolean;
  enable_wallet: boolean;
  drug_license_number: string;
  gst_number: string;
  pharmacist_name: string;
  pharmacist_registration: string;
  standalone_mode: boolean;
  created_at?: string;
  updated_at?: string;
};

export type PharmacyReturn = {
  id: string;
  hospital_id: string;
  return_number: string;
  original_sale_id?: string | null;
  original_sale_number?: string | null;
  patient_name: string;
  patient_phone?: string | null;
  patient_age?: number | null;
  return_reason: string;
  return_type: "refund" | "exchange" | "credit_note";
  subtotal: number;
  refund_amount: number;
  refund_method?: string | null;
  refund_reference?: string | null;
  status: "pending" | "approved" | "completed" | "rejected";
  approved_by?: string | null;
  approved_at?: string | null;
  processed_by?: string | null;
  processed_at?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  items?: PharmacyReturnItem[];
};

export type PharmacyReturnItem = {
  id: string;
  return_id: string;
  medicine_id?: string | null;
  medicine_name: string;
  batch_number?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  reason?: string | null;
  created_at: string;
};

export type PharmacyHeldBill = {
  id: string;
  hospital_id: string;
  branch_id?: string | null;
  shift_id?: string | null;
  reference: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  items: CartItem[];
  discount: number;
  notes?: string | null;
  held_by?: string | null;
  held_by_name?: string | null;
  created_at: string;
};

export type CartItem = {
  medicine_id: string;
  name: string;
  generic_name?: string;
  manufacturer?: string;
  batch_number?: string;
  expiry_date?: string | null;
  mrp: number;
  selling_price: number;
  quantity: number;
  discount_percent?: number;
  discount_amount?: number;
  gst_percent?: number;
  prescription_required?: boolean;
  schedule?: string;
};

export type PaymentMethod = {
  id: string;
  name: string;
  type: "cash" | "upi" | "card" | "insurance" | "credit" | "wallet" | "other";
  enabled: boolean;
  icon?: string;
};

export type PharmacyDashboardStats = {
  today_sales: number;
  today_transactions: number;
  today_returns: number;
  today_discount: number;
  today_tax: number;
  today_customers: number;
  low_stock_count: number;
  expiring_count: number;
  expired_count: number;
  out_of_stock_count: number;
  pending_prescriptions: number;
  active_shift?: PharmacyShift | null;
  recent_sales: Array<Record<string, unknown>>;
  top_medicines: { name: string; quantity: number; revenue: number }[];
  payment_breakdown: { method: string; amount: number; count: number }[];
  hourly_sales: { hour: number; amount: number; count: number }[];
};

/**
 * Minimal sale shape consumed by the receipt generator. Loose by design so any
 * persistence backend (Supabase row, demo store, API response) can be passed.
 */
export type SaleForReceipt = {
  id?: string;
  sale_number?: string;
  created_at?: string;
  [key: string]: unknown;
};

export type ReceiptData = {
  sale: SaleForReceipt;
  hospital: {
    name: string;
    address: string;
    phone: string;
    email: string;
    gst: string;
    drug_license: string;
    logo_url: string;
  };
  branch?: PharmacyBranch | null;
  cashier_name: string;
  pharmacist_name: string;
  settings: PharmacySettings;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  grand_total: number;
  amount_paid: number;
  amount_returned: number;
  payment_method: string;
  payment_reference?: string;
  customer_name: string;
  customer_phone?: string;
  doctor_name?: string;
  prescription_number?: string;
  /** Enterprise additions — all optional so existing receipts are unchanged. */
  cgst?: number;
  sgst?: number;
  igst?: number;
  tax_type?: "intra" | "inter";
  patient_id?: string | null;
  patient_age?: number | null;
  transaction_id?: string;
  printed_by?: string;
};
