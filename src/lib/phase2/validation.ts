import { z } from "zod";

export const labOrderCreateSchema = z.object({
  patient_name: z.string().min(2).max(120),
  patient_phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Valid 10-digit Indian mobile required"),
  patient_email: z.string().email().optional().or(z.literal("")),
  doctor_name: z.string().max(120).optional(),
  appointment_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional(),
  priority: z.enum(["normal", "urgent"]).optional(),
  test_ids: z.array(z.string()).min(1),
  test_names: z.array(z.string()).optional(),
  prices: z.array(z.number().nonnegative()).optional(),
});

export const labStatusSchema = z.object({
  status: z.enum([
    "pending",
    "sample_collected",
    "processing",
    "completed",
    "delivered",
    "cancelled",
  ]),
  report_url: z.string().url().optional().or(z.literal("")),
  findings: z.string().max(5000).optional(),
});

export const medicineSchema = z.object({
  name: z.string().min(1).max(200),
  generic_name: z.string().max(200).optional(),
  manufacturer: z.string().max(200).optional(),
  batch_number: z.string().max(100).optional(),
  sku: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  purchase_price: z.number().nonnegative(),
  selling_price: z.number().nonnegative(),
  stock_qty: z.number().int(),
  reorder_level: z.number().int().nonnegative().optional(),
  expiry_date: z.string().optional().nullable(),
  unit: z.string().max(40).optional(),
});

export const pharmacySaleSchema = z.object({
  patient_name: z.string().min(1).max(120),
  patient_phone: z.string().max(15).optional(),
  patient_age: z.number().int().positive().max(150).optional().nullable(),
  sale_type: z.enum(["walk_in", "prescription"]).default("walk_in"),
  prescription_id: z.string().optional().nullable(),
  payment_method: z
    .enum(["cash", "upi", "gpay", "phonepe", "card", "online", "razorpay", "other"])
    .default("cash"),
  payment_status: z.enum(["pending", "paid", "refunded", "cancelled"]).optional(),
  discount: z.number().nonnegative().optional(),
  tax: z.number().nonnegative().optional(),
  items: z
    .array(
      z.object({
        medicine_id: z.string().optional(),
        name: z.string(),
        qty: z.number().int().positive(),
        price: z.number().nonnegative(),
      })
    )
    .min(1),
});

export const prescriptionSchema = z.object({
  patient_name: z.string().min(2).max(120),
  patient_phone: z.string().min(10).max(15),
  patient_age: z.number().int().positive().optional().nullable(),
  patient_gender: z.string().max(20).optional(),
  doctor_name: z.string().min(2).max(120),
  doctor_reg_no: z.string().max(60).optional(),
  appointment_id: z.string().optional().nullable(),
  diagnosis: z.string().min(1).max(2000),
  notes: z.string().max(3000).optional(),
  follow_up_date: z.string().optional().nullable(),
  medicines: z
    .array(
      z.object({
        name: z.string().min(1),
        dosage: z.string().default(""),
        morning: z.boolean().default(false),
        afternoon: z.boolean().default(false),
        night: z.boolean().default(false),
        food_instruction: z.string().default(""),
        duration: z.string().default(""),
        notes: z.string().optional(),
      })
    )
    .min(1),
});

export const hospitalBillSchema = z.object({
  patient_name: z.string().min(2).max(120),
  patient_phone: z.string().min(10).max(15),
  patient_email: z.string().email().optional().or(z.literal("")),
  doctor_name: z.string().max(120).optional(),
  appointment_id: z.string().optional().nullable(),
  consultation_fee: z.number().nonnegative().default(0),
  lab_charges: z.number().nonnegative().default(0),
  pharmacy_charges: z.number().nonnegative().default(0),
  other_charges: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  gst_percent: z.number().min(0).max(100).default(0),
  payment_method: z
    .enum([
      "cash",
      "upi",
      "gpay",
      "phonepe",
      "paytm",
      "credit_card",
      "debit_card",
      "net_banking",
      "razorpay",
      "other",
    ])
    .default("cash"),
  payment_status: z
    .enum(["pending", "paid", "refunded", "cancelled", "partial"])
    .default("pending"),
  notes: z.string().max(2000).optional(),
  line_items: z
    .array(z.object({ label: z.string(), amount: z.number() }))
    .optional(),
});
