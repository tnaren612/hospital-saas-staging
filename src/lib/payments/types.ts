export type PaymentMethod = "cash" | "online" | "card" | "upi" | "other";
export type PaymentProvider = "none" | "cash" | "razorpay" | "stripe" | "mock";
export type PaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "completed"
  | "failed"
  | "refund_requested"
  | "refund_approved"
  | "refund_rejected"
  | "refunded";

/** Successful capture statuses (paid is canonical; completed is legacy). */
export function isPaymentSuccessful(status: string | null | undefined): boolean {
  return status === "paid" || status === "completed";
}

export function isRefundStatus(status: string | null | undefined): boolean {
  return (
    status === "refund_requested" ||
    status === "refund_approved" ||
    status === "refund_rejected" ||
    status === "refunded"
  );
}

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "partially_paid"
  | "void"
  | "refunded";

export type PaymentSettings = {
  id: string;
  online_payment_enabled: boolean;
  cash_enabled: boolean;
  razorpay_enabled: boolean;
  stripe_enabled: boolean;
  currency: string;
  tax_percentage: number;
  hospital_name: string;
  hospital_address: string;
  invoice_prefix: string;
  gstin: string;
  terms: string;
  razorpay_key_id: string;
  stripe_publishable_key: string;
};

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

export type InvoiceRecord = {
  id: string;
  invoice_number: string;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string;
  patient_email: string;
  appointment_id: string | null;
  package_id: string | null;
  package_name: string;
  doctor_name: string;
  department_name: string;
  subtotal: number;
  discount: number;
  tax: number;
  grand_total: number;
  currency: string;
  status: InvoiceStatus;
  pdf_url: string;
  line_items: InvoiceLineItem[];
  notes: string;
  created_at: string;
};

export type PaymentRecord = {
  id: string;
  payment_reference: string;
  appointment_id: string | null;
  package_id: string | null;
  patient_id: string | null;
  invoice_id: string | null;
  amount: number;
  discount: number;
  tax: number;
  total_amount: number;
  currency: string;
  payment_method: PaymentMethod;
  payment_provider: PaymentProvider;
  transaction_id: string;
  payment_status: PaymentStatus;
  paid_at: string | null;
  refund_amount: number | null;
  refund_reason: string;
  meta: Record<string, unknown>;
  created_at: string;
};

export type CreatePaymentInput = {
  appointment_id?: string;
  package_id?: string;
  package_name?: string;
  patient_id?: string;
  patient_name: string;
  patient_phone: string;
  patient_email?: string;
  doctor_name?: string;
  department_name?: string;
  amount: number;
  discount?: number;
  payment_method: PaymentMethod;
  payment_provider?: PaymentProvider;
  notes?: string;
  line_items?: InvoiceLineItem[];
  /** Tenant stamp (H-01) */
  hospitalId?: string | null;
};

export type GatewayOrderResult = {
  provider: PaymentProvider;
  orderId: string;
  amount: number;
  /** Amount in smallest currency unit (paise for INR) — required by Razorpay Checkout */
  amountPaise?: number;
  currency: string;
  /** Client-side key only (RAZORPAY_KEY_ID / Stripe publishable) — never KEY_SECRET */
  publicKey?: string;
  name?: string;
  description?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  /** Stripe redirect URL or mock instructions */
  checkoutHint?: string;
  raw?: Record<string, unknown>;
};

export type VerifyPaymentInput = {
  payment_id?: string;
  appointment_id?: string;
  provider: PaymentProvider;
  transaction_id?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  stripe_session_id?: string;
  stripe_payment_intent?: string;
};

export type PaymentAnalytics = {
  today: number;
  month: number;
  pending: number;
  completed: number;
  refunds: number;
  failed: number;
  failedCount: number;
  cash: number;
  online: number;
  byProvider: { name: string; value: number }[];
  byDoctor: { name: string; value: number }[];
  byDepartment: { name: string; value: number }[];
  recent: PaymentRecord[];
  refundList: PaymentRecord[];
  failedList: PaymentRecord[];
};

export function calcTax(
  amount: number,
  discount: number,
  taxPercentage: number
): { subtotal: number; tax: number; total: number } {
  const subtotal = Math.max(0, Number(amount) - Number(discount || 0));
  const tax = Math.round(subtotal * (Number(taxPercentage) / 100) * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { subtotal, tax, total };
}

export const DEFAULT_SETTINGS: PaymentSettings = {
  id: "default",
  online_payment_enabled: false,
  cash_enabled: true,
  razorpay_enabled: false,
  stripe_enabled: false,
  currency: "INR",
  tax_percentage: 0,
  hospital_name: "Hospital",
  hospital_address: "",
  invoice_prefix: "INV",
  gstin: "",
  terms:
    "Payment once made is subject to hospital refund policy. For queries contact reception.",
  razorpay_key_id: "",
  stripe_publishable_key: "",
};
