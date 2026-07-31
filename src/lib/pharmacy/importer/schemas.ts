/**
 * Enterprise Pharmacy — Built-in import schemas.
 * These define the fields, types and dedupe keys for each importable entity.
 */

import type { ImportEntity, ImportSchema } from "./types";

export const MEDICINE_SCHEMA: ImportSchema = {
  entity: "medicine",
  keyField: "sku",
  rules: [
    { field: "sku", label: "SKU", required: true, unique: true },
    { field: "name", label: "Name", required: true, max: 200 },
    { field: "generic_name", label: "Generic Name", max: 200 },
    { field: "manufacturer", label: "Manufacturer", max: 200 },
    { field: "batch_number", label: "Batch Number" },
    { field: "category", label: "Category", max: 100 },
    { field: "purchase_price", label: "Purchase Price", type: "number", min: 0 },
    { field: "selling_price", label: "Selling Price", type: "number", min: 0 },
    { field: "stock_qty", label: "Stock Qty", type: "integer", min: 0 },
    { field: "reorder_level", label: "Reorder Level", type: "integer", min: 0 },
    { field: "expiry_date", label: "Expiry Date", type: "date" },
    { field: "schedule", label: "Schedule", enum: ["OTC", "H", "H1", "X", null] },
  ],
};

export const CUSTOMER_SCHEMA: ImportSchema = {
  entity: "customer",
  keyField: "phone",
  rules: [
    { field: "phone", label: "Phone", required: true, unique: true },
    { field: "name", label: "Name", required: true, max: 120 },
    { field: "email", label: "Email", type: "email" },
    { field: "age", label: "Age", type: "integer", min: 0, max: 150 },
    { field: "gender", label: "Gender", enum: ["male", "female", "other", null] },
    { field: "address", label: "Address", max: 500 },
  ],
};

export const SUPPLIER_SCHEMA: ImportSchema = {
  entity: "supplier",
  keyField: "name",
  rules: [
    { field: "name", label: "Name", required: true, unique: true },
    { field: "contact_person", label: "Contact Person", max: 120 },
    { field: "phone", label: "Phone" },
    { field: "email", label: "Email", type: "email" },
    { field: "address", label: "Address", max: 500 },
    { field: "gst_number", label: "GST Number", max: 30 },
  ],
};

export const CATEGORY_SCHEMA: ImportSchema = {
  entity: "category",
  keyField: "name",
  rules: [
    { field: "name", label: "Name", required: true, unique: true, max: 100 },
    { field: "description", label: "Description", max: 500 },
  ],
};

export const SALE_SCHEMA: ImportSchema = {
  entity: "sale",
  keyField: "sale_number",
  rules: [
    { field: "sale_number", label: "Sale Number", required: true, unique: true },
    { field: "patient_name", label: "Patient Name", required: true, max: 120 },
    { field: "patient_phone", label: "Patient Phone", max: 15 },
    { field: "patient_age", label: "Patient Age", type: "integer", min: 0, max: 150 },
    { field: "subtotal", label: "Subtotal", type: "number", min: 0 },
    { field: "discount", label: "Discount", type: "number", min: 0 },
    { field: "tax", label: "Tax", type: "number", min: 0 },
    { field: "grand_total", label: "Grand Total", type: "number", min: 0 },
    { field: "payment_method", label: "Payment Method", max: 40 },
    { field: "created_at", label: "Date", type: "date" },
  ],
};

const SCHEMAS: Record<ImportEntity, ImportSchema> = {
  medicine: MEDICINE_SCHEMA,
  sale: SALE_SCHEMA,
  customer: CUSTOMER_SCHEMA,
  supplier: SUPPLIER_SCHEMA,
  category: CATEGORY_SCHEMA,
};

export function getImportSchema(entity: ImportEntity): ImportSchema {
  return SCHEMAS[entity];
}

export const IMPORTABLE_ENTITIES = Object.keys(SCHEMAS) as ImportEntity[];
