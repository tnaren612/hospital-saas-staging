/**
 * Enterprise Pharmacy — Export datasets.
 * Pure functions that shape raw service data into exportable row arrays for
 * Inventory, Sales, Customers, Suppliers, Payments and Reports.
 */

import type { ExportColumns } from "./index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export const MEDICINE_COLUMNS: ExportColumns = [
  { key: "name", label: "Medicine" },
  { key: "generic_name", label: "Generic Name" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "batch_number", label: "Batch" },
  { key: "sku", label: "SKU" },
  { key: "category", label: "Category" },
  { key: "stock_qty", label: "Stock" },
  { key: "reorder_level", label: "Reorder" },
  { key: "purchase_price", label: "Purchase Price" },
  { key: "selling_price", label: "Selling Price" },
  { key: "expiry_date", label: "Expiry" },
  { key: "schedule", label: "Schedule" },
];

export function inventoryRows(medicines: Row[]): Row[] {
  return medicines.map((m) => ({
    name: m.name,
    generic_name: m.generic_name,
    manufacturer: m.manufacturer,
    batch_number: m.batch_number,
    sku: m.sku,
    category: m.category,
    stock_qty: Number(m.stock_qty ?? 0),
    reorder_level: Number(m.reorder_level ?? 0),
    purchase_price: Number(m.purchase_price ?? 0),
    selling_price: Number(m.selling_price ?? 0),
    expiry_date: m.expiry_date,
    schedule: m.schedule,
  }));
}

export function salesRows(sales: Row[]): Row[] {
  return sales.map((s) => ({
    sale_number: s.sale_number,
    created_at: s.created_at,
    patient_name: s.patient_name,
    patient_phone: s.customer_phone ?? s.patient_phone,
    doctor_name: s.doctor_name,
    prescription_number: s.prescription_number,
    items: (s.line_items || []).length,
    subtotal: Number(s.subtotal ?? 0),
    discount: Number(s.discount ?? 0),
    tax: Number(s.tax ?? 0),
    grand_total: Number(s.grand_total ?? 0),
    payment_method: s.payment_method,
    payment_status: s.payment_status,
    cashier: s.cashier_name,
  }));
}

export function customerRows(customers: Row[]): Row[] {
  return customers.map((c) => ({
    name: c.name || c.patient_name,
    phone: c.phone || c.patient_phone,
    email: c.email,
    age: c.age,
    gender: c.gender,
    address: c.address,
    created_at: c.created_at,
  }));
}

export function supplierRows(suppliers: Row[]): Row[] {
  return suppliers.map((s) => ({
    name: s.name,
    contact_person: s.contact_person,
    phone: s.phone,
    email: s.email,
    address: s.address,
    gst_number: s.gst_number,
  }));
}

export function paymentRows(sales: Row[]): Row[] {
  return sales.map((s) => ({
    sale_number: s.sale_number,
    created_at: s.created_at,
    patient_name: s.patient_name,
    payment_method: s.payment_method,
    payment_status: s.payment_status,
    amount: Number(s.grand_total ?? 0),
    amount_paid: Number(s.amount_paid ?? s.grand_total ?? 0),
    amount_returned: Number(s.amount_returned ?? 0),
    payment_reference: s.payment_reference,
  }));
}

export function reportRows(stats: Row): Row[] {
  return [
    { metric: "today_sales", value: stats.today_sales },
    { metric: "today_transactions", value: stats.today_transactions },
    { metric: "today_returns", value: stats.today_returns },
    { metric: "low_stock", value: stats.low_stock_count },
    { metric: "expiring", value: stats.expiring_count },
    { metric: "expired", value: stats.expired_count },
    { metric: "out_of_stock", value: stats.out_of_stock_count },
    { metric: "pending_prescriptions", value: stats.pending_prescriptions },
  ];
}
