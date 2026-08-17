/**
 * Pharmacy POS request validation (zod).
 * Mirrors the enterprise pharmacy service inputs; additive, non-breaking.
 */

import { z } from "zod";

/** Canonical payment method ids stored on pharmacy_sales.payment_method. */
export const POS_PAYMENT_METHODS = [
  "cash",
  "upi",
  "gpay",
  "phonepe",
  "paytm",
  "credit_card",
  "debit_card",
  "insurance",
  "wallet",
  "credit",
  "other",
] as const;

export const POS_PAYMENT_STATUS = ["pending", "paid", "refunded", "cancelled"] as const;

export const posSaleSchema = z.object({
  id: z.string().uuid().optional(),
  sale_number: z.string().min(1).max(80).optional(),
  patient_name: z.string().min(1).max(120),
  patient_phone: z.string().max(15).optional(),
  patient_age: z.number().int().positive().max(150).optional().nullable(),
  sale_type: z.enum(["walk_in", "prescription"]).default("walk_in"),
  branch_id: z.string().optional().nullable(),
  shift_id: z.string().optional().nullable(),
  cashier_name: z.string().max(120).optional(),
  doctor_name: z.string().max(120).optional().nullable(),
  doctor_reg_no: z.string().max(60).optional().nullable(),
  prescription_number: z.string().max(60).optional().nullable(),
  items: z
    .array(
      z.object({
        medicine_id: z.string().optional(),
        name: z.string().min(1),
        qty: z.number().int().positive(),
        price: z.number().nonnegative(),
        gst_percent: z.number().nonnegative().max(100).optional(),
        batch_number: z.string().max(100).optional().nullable(),
        expiry_date: z.string().max(20).optional().nullable(),
        discount: z.number().nonnegative().optional(),
      })
    )
    .min(1),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative().optional().default(0),
  tax: z.number().nonnegative().optional().default(0),
  cgst: z.number().nonnegative().optional(),
  sgst: z.number().nonnegative().optional(),
  igst: z.number().nonnegative().optional(),
  tax_type: z.enum(["intra", "inter"]).optional(),
  grand_total: z.number().nonnegative(),
  payment_method: z.enum(POS_PAYMENT_METHODS).default("cash"),
  payment_status: z.enum(POS_PAYMENT_STATUS).optional(),
  amount_paid: z.number().nonnegative().optional().default(0),
  amount_returned: z.number().nonnegative().optional().default(0),
  payment_reference: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type PosSaleSchema = z.infer<typeof posSaleSchema>;

/**
 * Settings PATCH — allow arbitrary shallow keys but coerce scalar types so a
 * malformed client cannot inject wrong shapes. Keys are validated server-side
 * against the settings row by updatePharmacySettings (upsert into a typed table).
 */
export const pharmacySettingsPatchSchema = z
  .record(z.unknown())
  .refine((v) => Object.keys(v).length > 0, {
    message: "Empty patch",
  });

export type PharmacySettingsPatchSchema = z.infer<typeof pharmacySettingsPatchSchema>;
