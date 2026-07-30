import { z } from "zod";

const uuid = z.string().uuid();
const quantity = z.coerce.number().positive().max(1_000_000_000);
const money = z.coerce.number().nonnegative().max(1_000_000_000);

export const inventoryItemBaseSchema = z.object({
  item_code: z.string().trim().min(2).max(60),
  barcode: z.string().trim().max(120).nullable().optional(),
  name: z.string().trim().min(2).max(200),
  generic_name: z.string().trim().max(200).default(""),
  description: z.string().trim().max(3000).default(""),
  category_id: uuid.nullable().optional(),
  unit: z.string().trim().min(1).max(40),
  manufacturer: z.string().trim().max(200).default(""),
  preferred_supplier_id: uuid.nullable().optional(),
  hsn_code: z.string().trim().max(30).nullable().optional(),
  gst_percent: z.coerce.number().min(0).max(100).default(0),
  purchase_price: money,
  selling_price: money,
  minimum_stock: z.coerce.number().nonnegative().default(0),
  maximum_stock: z.coerce.number().nonnegative().nullable().optional(),
  reorder_level: z.coerce.number().nonnegative().default(0),
  expiry_tracking: z.boolean().default(false),
  batch_tracking: z.boolean().default(false),
  serial_tracking: z.boolean().default(false),
  status: z.enum(["active", "inactive", "discontinued"]).default("active"),
});
export const inventoryItemSchema = inventoryItemBaseSchema.superRefine((value, ctx) => {
  if (value.maximum_stock != null && value.maximum_stock < value.minimum_stock) {
    ctx.addIssue({ code: "custom", path: ["maximum_stock"], message: "Maximum stock must be at least minimum stock" });
  }
});
export const inventoryItemUpdateSchema = inventoryItemBaseSchema.partial();

export const supplierSchema = z.object({
  supplier_code: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(200),
  tax_number: z.string().trim().max(60).nullable().optional(),
  address: z.string().trim().max(2000).default(""),
  payment_terms: z.string().trim().max(500).default(""),
  rating: z.coerce.number().min(0).max(5).default(0),
  contact: z.object({
    name: z.string().trim().min(2).max(120),
    designation: z.string().trim().max(120).default(""),
    email: z.string().email().nullable().optional(),
    phone: z.string().trim().min(7).max(20).nullable().optional(),
  }).optional(),
});

export const purchaseOrderSchema = z.object({
  supplier_id: uuid,
  location_id: uuid,
  expected_date: z.string().date().nullable().optional(),
  notes: z.string().max(2000).default(""),
  items: z.array(z.object({
    item_id: uuid, ordered_quantity: quantity, unit_price: money,
    gst_percent: z.coerce.number().min(0).max(100).default(0),
  })).min(1),
});

export const receiptSchema = z.object({
  purchase_order_id: uuid, item_id: uuid, location_id: uuid, quantity,
  unit_cost: money, batch_number: z.string().trim().max(120).nullable().optional(),
  serial_number: z.string().trim().max(200).nullable().optional(),
  expiry_date: z.string().date().nullable().optional(),
});

export const transferSchema = z.object({
  item_id: uuid, from_location_id: uuid, to_location_id: uuid, quantity,
  batch_number: z.string().trim().max(120).nullable().optional(),
  serial_number: z.string().trim().max(200).nullable().optional(),
}).refine((value) => value.from_location_id !== value.to_location_id, {
  message: "Locations must be different", path: ["to_location_id"],
});

export const adjustmentSchema = z.object({
  item_id: uuid, location_id: uuid,
  adjustment_type: z.enum(["increase", "decrease", "damage", "expired", "lost", "return"]),
  quantity, reason: z.string().trim().min(3).max(1000),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).default(""),
});

export const locationSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  location_type: z.enum(["warehouse","store_room","pharmacy","laboratory","radiology","emergency","department"]),
});
