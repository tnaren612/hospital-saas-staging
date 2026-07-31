/**
 * Data Management module registry — the single source of truth.
 *
 * Every importable/exportable entity is described here: its backing table,
 * its fields (DB column, type, validation, template samples) and its unique
 * keys for dedupe/upsert. Import, export, templates, mapping, validation and
 * the UI all resolve through this registry — nothing is hardcoded elsewhere.
 *
 * Two source kinds:
 *  - "db":     backed by an existing Supabase table.
 *  - "config": backed by the generic `datahub_config_rows` table (keyed JSON).
 */

import type {
  DataField,
  DataModule,
  DataManagementConfig,
} from "./types";

export const configModuleTable = "datahub_config_rows";

export const DATA_MODULES: DataModule[] = [
  // ------------------------------------------------------------------
  // Patients
  // ------------------------------------------------------------------
  {
    key: "patients",
    label: "Patients",
    description: "Hospital patient registry",
    source: "db",
    table: "hospital_patients",
    titleField: "full_name",
    uniqueKeys: ["phone"],
    fields: [
      field("full_name", "Full Name", "full_name", "string", { required: true, sample: "Ravi Kumar" }),
      field("phone", "Phone", "phone", "phone", { required: true, unique: true, sample: "9876543210" }),
      field("email", "Email", "email", "email", { sample: "ravi@example.com" }),
      field("age", "Age", "age", "integer", { min: 0, max: 120, sample: 42 }),
      field("gender", "Gender", "gender", "enum", { options: ["male", "female", "other"], sample: "male" }),
      field("address", "Address", "address", "text", { sample: "1-2-3, Main Road, Badvel" }),
      field("medical_history", "Medical History", "medical_history", "text", { sample: "Diabetes (2021)" }),
      field("blood_group", "Blood Group", "blood_group", "enum", { options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"], sample: "O+" }),
      field("emergency_contact", "Emergency Contact", "emergency_contact", "phone", { sample: "9123456780" }),
      field("notes", "Notes", "notes", "text", { sample: "" }),
      field("status", "Status", "status", "enum", { options: ["active", "inactive"], sample: "active" }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Doctors
  // ------------------------------------------------------------------
  {
    key: "doctors",
    label: "Doctors",
    description: "Doctor roster",
    source: "db",
    table: "hospital_doctors",
    titleField: "name",
    uniqueKeys: ["name"],
    relationships: [{ module: "departments", field: "department_id" }],
    fields: [
      field("name", "Name", "name", "string", { required: true, unique: true, sample: "Dr. Vara Prasad" }),
      field("title", "Title", "title", "string", { sample: "Consultant" }),
      field("department_id", "Department ID", "department_id", "string", { system: true, sample: "" }),
      field("qualifications", "Qualifications", "qualifications", "string_array", { arrayItemType: "string", sample: "MBBS;MD", note: "Separate multiple values with ;" }),
      field("specializations", "Specializations", "specializations", "string_array", { arrayItemType: "string", sample: "Pulmonology;Critical Care", note: "Separate multiple values with ;" }),
      field("experience_years", "Experience (Years)", "experience_years", "integer", { min: 0, sample: 15 }),
      field("experience_notes", "Experience Notes", "experience_notes", "text", { sample: "" }),
      field("consultation_fee", "Consultation Fee", "consultation_fee", "number", { min: 0, sample: 500 }),
      field("available_days", "Available Days", "available_days", "string_array", { arrayItemType: "string", sample: "mon;tue;wed", note: "Separate multiple values with ;" }),
      field("time_slots", "Time Slots", "time_slots", "string_array", { arrayItemType: "string", sample: "09:00 AM;10:00 AM", note: "Separate multiple values with ;" }),
      field("biography", "Biography", "biography", "text", { sample: "" }),
      field("status", "Status", "status", "enum", { options: ["active", "inactive"], sample: "active" }),
      field("sort_order", "Sort Order", "sort_order", "integer", { sample: 0 }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Employees
  // ------------------------------------------------------------------
  {
    key: "employees",
    label: "Employees",
    description: "Staff / employee records (HR)",
    source: "db",
    table: "hr_employees",
    titleField: "full_name",
    uniqueKeys: ["employee_code"],
    fields: [
      field("employee_code", "Employee Code", "employee_code", "string", { unique: true, sample: "EMP-001" }),
      field("full_name", "Full Name", "full_name", "string", { required: true, sample: "Anil Reddy" }),
      field("email", "Email", "email", "email", { sample: "anil@example.com" }),
      field("phone", "Phone", "phone", "phone", { sample: "9000000000" }),
      field("role_title", "Role Title", "role_title", "string", { sample: "Nurse" }),
      field("department", "Department", "department", "string", { sample: "Nursing" }),
      field("employment_type", "Employment Type", "employment_type", "enum", { options: ["full_time", "part_time", "contract", "intern"], sample: "full_time" }),
      field("join_date", "Join Date", "join_date", "date", { sample: "2024-01-15" }),
      field("salary_monthly", "Monthly Salary", "salary_monthly", "number", { min: 0, sample: 25000 }),
      field("status", "Status", "status", "enum", { options: ["active", "inactive", "terminated"], sample: "active" }),
      field("notes", "Notes", "notes", "text", { sample: "" }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Inventory (general store)
  // ------------------------------------------------------------------
  {
    key: "inventory",
    label: "Inventory",
    description: "Store / inventory items",
    source: "db",
    table: "inventory_items",
    tenantScoped: true,
    titleField: "name",
    uniqueKeys: ["item_code"],
    fields: [
      field("item_code", "Item Code", "item_code", "string", { required: true, unique: true, sample: "INV-1001" }),
      field("barcode", "Barcode", "barcode", "string", { unique: true, sample: "8901234567890" }),
      field("name", "Name", "name", "string", { required: true, sample: "Disposable Gloves" }),
      field("generic_name", "Generic Name", "generic_name", "string", { sample: "" }),
      field("description", "Description", "description", "text", { sample: "" }),
      field("category_id", "Category ID", "category_id", "string", { system: true, sample: "" }),
      field("unit", "Unit", "unit", "string", { required: true, sample: "box" }),
      field("manufacturer", "Manufacturer", "manufacturer", "string", { sample: "" }),
      field("preferred_supplier_id", "Preferred Supplier ID", "preferred_supplier_id", "string", { system: true, sample: "" }),
      field("hsn_code", "HSN Code", "hsn_code", "string", { sample: "3926" }),
      field("gst_percent", "GST %", "gst_percent", "number", { min: 0, max: 100, sample: 18 }),
      field("purchase_price", "Purchase Price", "purchase_price", "number", { min: 0, sample: 120 }),
      field("selling_price", "Selling Price", "selling_price", "number", { min: 0, sample: 150 }),
      field("minimum_stock", "Min Stock", "minimum_stock", "number", { min: 0, sample: 10 }),
      field("maximum_stock", "Max Stock", "maximum_stock", "number", { min: 0, sample: 100 }),
      field("reorder_level", "Reorder Level", "reorder_level", "number", { min: 0, sample: 20 }),
      field("status", "Status", "status", "enum", { options: ["active", "inactive", "discontinued"], sample: "active" }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Medicines (pharmacy stock — same backing table as inventory)
  // ------------------------------------------------------------------
  {
    key: "medicines",
    label: "Medicines",
    description: "Pharmacy medicines (inventory_items)",
    source: "db",
    table: "inventory_items",
    tenantScoped: true,
    titleField: "name",
    uniqueKeys: ["item_code"],
    fields: [
      field("item_code", "Item Code", "item_code", "string", { required: true, unique: true, sample: "MED-2001" }),
      field("barcode", "Barcode", "barcode", "string", { unique: true, sample: "8901234567891" }),
      field("name", "Drug Name", "name", "string", { required: true, sample: "Paracetamol 500mg" }),
      field("generic_name", "Generic Name", "generic_name", "string", { sample: "Paracetamol" }),
      field("description", "Description", "description", "text", { sample: "" }),
      field("category_id", "Category ID", "category_id", "string", { system: true, sample: "" }),
      field("unit", "Unit", "unit", "string", { required: true, sample: "strip" }),
      field("manufacturer", "Manufacturer", "manufacturer", "string", { sample: "" }),
      field("hsn_code", "HSN Code", "hsn_code", "string", { sample: "3004" }),
      field("gst_percent", "GST %", "gst_percent", "number", { min: 0, max: 100, sample: 12 }),
      field("purchase_price", "Purchase Price", "purchase_price", "number", { min: 0, sample: 8 }),
      field("selling_price", "Selling Price", "selling_price", "number", { min: 0, sample: 12 }),
      field("minimum_stock", "Min Stock", "minimum_stock", "number", { min: 0, sample: 50 }),
      field("maximum_stock", "Max Stock", "maximum_stock", "number", { min: 0, sample: 500 }),
      field("reorder_level", "Reorder Level", "reorder_level", "number", { min: 0, sample: 100 }),
      field("expiry_tracking", "Expiry Tracking", "expiry_tracking", "boolean", { sample: true }),
      field("status", "Status", "status", "enum", { options: ["active", "inactive", "discontinued"], sample: "active" }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Suppliers
  // ------------------------------------------------------------------
  {
    key: "suppliers",
    label: "Suppliers",
    description: "Supplier / vendor directory",
    source: "db",
    table: "pharmacy_suppliers",
    titleField: "name",
    uniqueKeys: ["name"],
    fields: [
      field("name", "Name", "name", "string", { required: true, unique: true, sample: "MedPlus Distributors" }),
      field("phone", "Phone", "phone", "phone", { sample: "9876543211" }),
      field("email", "Email", "email", "email", { sample: "sales@medplus.com" }),
      field("address", "Address", "address", "text", { sample: "3-4-5, Market Road" }),
      field("is_active", "Active", "is_active", "boolean", { sample: true }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Appointments
  // ------------------------------------------------------------------
  {
    key: "appointments",
    label: "Appointments",
    description: "Booked appointments",
    source: "db",
    table: "appointments",
    titleField: "patient_name",
    uniqueKeys: ["doctor_name", "date", "time_slot"],
    fields: [
      field("patient_name", "Patient Name", "patient_name", "string", { required: true, sample: "Suresh Kumar" }),
      field("phone", "Phone", "phone", "phone", { required: true, sample: "9876543212" }),
      field("email", "Email", "email", "email", { required: true, sample: "suresh@example.com" }),
      field("age", "Age", "age", "integer", { min: 1, max: 120, sample: 35 }),
      field("gender", "Gender", "gender", "enum", { options: ["male", "female", "other"], sample: "male" }),
      field("problem", "Problem", "problem", "text", { required: true, sample: "Fever and cough" }),
      field("doctor_id", "Doctor ID", "doctor_id", "string", { system: true, sample: "dr-varaprasad" }),
      field("doctor_name", "Doctor Name", "doctor_name", "string", { required: true, sample: "Dr. Vara Prasad" }),
      field("date", "Date", "date", "date", { required: true, sample: "2026-08-10" }),
      field("time_slot", "Time Slot", "time_slot", "string", { required: true, sample: "10:00 AM" }),
      field("period", "Period", "period", "enum", { options: ["morning", "afternoon", "evening"], sample: "morning" }),
      field("type", "Type", "type", "enum", { options: ["in-person", "video"], sample: "in-person" }),
      field("status", "Status", "status", "enum", { options: ["pending", "confirmed", "completed", "cancelled", "upcoming"], sample: "confirmed" }),
      field("notes", "Notes", "notes", "text", { sample: "" }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Laboratory
  // ------------------------------------------------------------------
  {
    key: "laboratory",
    label: "Laboratory",
    description: "Laboratory orders",
    source: "db",
    table: "lab_orders",
    titleField: "order_number",
    uniqueKeys: ["order_number"],
    fields: [
      field("order_number", "Order Number", "order_number", "string", { required: true, unique: true, sample: "LAB-5001" }),
      field("patient_id", "Patient ID", "patient_id", "string", { system: true, sample: "" }),
      field("patient_name", "Patient Name", "patient_name", "string", { sample: "Ravi Kumar" }),
      field("patient_phone", "Patient Phone", "patient_phone", "phone", { sample: "9876543213" }),
      field("patient_email", "Patient Email", "patient_email", "email", { sample: "ravi@example.com" }),
      field("doctor_id", "Doctor ID", "doctor_id", "string", { system: true, sample: "" }),
      field("doctor_name", "Doctor Name", "doctor_name", "string", { sample: "Dr. Vara Prasad" }),
      field("status", "Status", "status", "enum", { options: ["pending", "sample_collected", "processing", "completed", "delivered", "cancelled"], sample: "pending" }),
      field("priority", "Priority", "priority", "enum", { options: ["low", "normal", "high", "urgent", "stat"], sample: "normal" }),
      field("notes", "Notes", "notes", "text", { sample: "" }),
      field("total_amount", "Total Amount", "total_amount", "number", { min: 0, sample: 400 }),
      field("collected_at", "Collected At", "collected_at", "datetime", { system: true }),
      field("completed_at", "Completed At", "completed_at", "datetime", { system: true }),
      field("delivered_at", "Delivered At", "delivered_at", "datetime", { system: true }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Radiology
  // ------------------------------------------------------------------
  {
    key: "radiology",
    label: "Radiology",
    description: "Radiology studies",
    source: "db",
    table: "radiology_studies",
    tenantScoped: true,
    titleField: "study_number",
    uniqueKeys: ["study_number"],
    fields: [
      field("study_number", "Study Number", "study_number", "string", { required: true, unique: true, sample: "RX-9001" }),
      field("patient_id", "Patient ID", "patient_id", "string", { system: true, sample: "" }),
      field("encounter_id", "Encounter ID", "encounter_id", "string", { system: true, sample: "" }),
      field("modality", "Modality", "modality", "enum", { options: ["xray", "ct", "mri", "ultrasound", "mammography", "fluoroscopy", "other"], sample: "xray" }),
      field("body_part", "Body Part", "body_part", "string", { required: true, sample: "Chest" }),
      field("clinical_indication", "Clinical Indication", "clinical_indication", "text", { sample: "Persistent cough" }),
      field("priority", "Priority", "priority", "enum", { options: ["routine", "urgent", "stat"], sample: "routine" }),
      field("status", "Status", "status", "enum", { options: ["ordered", "scheduled", "checked_in", "in_progress", "completed", "reported", "cancelled"], sample: "ordered" }),
      field("accession_number", "Accession Number", "accession_number", "string", { unique: true, sample: "" }),
      field("scheduled_at", "Scheduled At", "scheduled_at", "datetime", { sample: "" }),
      field("findings", "Findings", "findings", "text", { system: true, sample: "" }),
      field("impression", "Impression", "impression", "text", { system: true, sample: "" }),
      field("recommendations", "Recommendations", "recommendations", "text", { system: true, sample: "" }),
      field("cancellation_reason", "Cancellation Reason", "cancellation_reason", "text", { system: true, sample: "" }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Departments
  // ------------------------------------------------------------------
  {
    key: "departments",
    label: "Departments",
    description: "Hospital departments",
    source: "db",
    table: "departments",
    titleField: "name",
    uniqueKeys: ["name"],
    fields: [
      field("name", "Name", "name", "string", { required: true, unique: true, sample: "Cardiology" }),
      field("slug", "Slug", "slug", "string", { unique: true, sample: "cardiology" }),
      field("description", "Description", "description", "text", { sample: "" }),
      field("status", "Status", "status", "enum", { options: ["active", "inactive"], sample: "active" }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Insurance providers
  // ------------------------------------------------------------------
  {
    key: "insurance",
    label: "Insurance",
    description: "Insurance providers",
    source: "db",
    table: "insurance_providers",
    tenantScoped: true,
    titleField: "provider_name",
    uniqueKeys: ["provider_code"],
    fields: [
      field("provider_name", "Provider Name", "provider_name", "string", { required: true, sample: "Star Health" }),
      field("provider_code", "Provider Code", "provider_code", "string", { required: true, unique: true, sample: "STAR-HLTH" }),
      field("provider_type", "Provider Type", "provider_type", "enum", { options: ["government", "private", "corporate", "tpa"], sample: "private" }),
      field("contact_person", "Contact Person", "contact_person", "string", { sample: "Meena" }),
      field("contact_email", "Contact Email", "contact_email", "email", { sample: "claims@star.com" }),
      field("contact_phone", "Contact Phone", "contact_phone", "phone", { sample: "9876543214" }),
      field("address", "Address", "address", "text", { sample: "" }),
      field("registration_number", "Registration Number", "registration_number", "string", { sample: "" }),
      field("is_active", "Active", "is_active", "boolean", { sample: true }),
      field("coverage_notes", "Coverage Notes", "coverage_notes", "text", { sample: "" }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Users (app profiles)
  // ------------------------------------------------------------------
  {
    key: "users",
    label: "Users",
    description: "Application user profiles",
    source: "db",
    table: "profiles",
    titleField: "full_name",
    uniqueKeys: ["email"],
    fields: [
      field("full_name", "Full Name", "full_name", "string", { sample: "Demo User" }),
      field("phone", "Phone", "phone", "phone", { unique: true, sample: "9876543215" }),
      field("email", "Email", "email", "email", { unique: true, sample: "user@example.com" }),
      field("role", "Role", "role", "enum", { options: ["patient", "admin", "staff"], sample: "patient" }),
      field("created_at", "Created At", "created_at", "datetime", { system: true }),
      field("updated_at", "Updated At", "updated_at", "datetime", { system: true }),
    ],
  },

  // ------------------------------------------------------------------
  // Config-backed modules (datahub_config_rows)
  // ------------------------------------------------------------------
  {
    key: "specialties",
    label: "Specialties",
    description: "Medical specialties (config)",
    source: "config",
    table: configModuleTable,
    configModuleKey: "specialties",
    titleField: "name",
    uniqueKeys: ["name"],
    fields: [
      field("name", "Name", "name", "string", { required: true, unique: true, sample: "Cardiology" }),
      field("description", "Description", "description", "text", { sample: "" }),
    ],
  },
  {
    key: "roles",
    label: "Roles",
    description: "Application roles (config)",
    source: "config",
    table: configModuleTable,
    configModuleKey: "roles",
    titleField: "label",
    uniqueKeys: ["role_key"],
    fields: [
      field("role_key", "Role Key", "role_key", "string", { required: true, unique: true, sample: "receptionist" }),
      field("label", "Label", "label", "string", { required: true, sample: "Receptionist" }),
      field("description", "Description", "description", "text", { sample: "" }),
    ],
  },
  {
    key: "pricing",
    label: "Pricing",
    description: "Price list (config)",
    source: "config",
    table: configModuleTable,
    configModuleKey: "pricing",
    titleField: "item",
    uniqueKeys: ["item"],
    fields: [
      field("item", "Item", "item", "string", { required: true, unique: true, sample: "Consultation" }),
      field("department", "Department", "department", "string", { sample: "General" }),
      field("price", "Price", "price", "number", { min: 0, sample: 500 }),
      field("unit", "Unit", "unit", "string", { sample: "visit" }),
      field("active", "Active", "active", "boolean", { sample: true }),
    ],
  },
  {
    key: "taxes",
    label: "Taxes",
    description: "Tax rates (config)",
    source: "config",
    table: configModuleTable,
    configModuleKey: "taxes",
    titleField: "name",
    uniqueKeys: ["name"],
    fields: [
      field("name", "Name", "name", "string", { required: true, unique: true, sample: "GST 18%" }),
      field("rate_percent", "Rate (%)", "rate_percent", "number", { required: true, min: 0, max: 100, sample: 18 }),
      field("description", "Description", "description", "text", { sample: "" }),
      field("active", "Active", "active", "boolean", { sample: true }),
    ],
  },
  {
    key: "payment_methods",
    label: "Payment Methods",
    description: "Accepted payment methods (config)",
    source: "config",
    table: configModuleTable,
    configModuleKey: "payment_methods",
    titleField: "label",
    uniqueKeys: ["code"],
    fields: [
      field("code", "Code", "code", "string", { required: true, unique: true, sample: "upi" }),
      field("label", "Label", "label", "string", { required: true, sample: "UPI" }),
      field("enabled", "Enabled", "enabled", "boolean", { sample: true }),
    ],
  },
];

/** Helper to build a field concisely. */
function field(
  key: string,
  label: string,
  column: string,
  type: DataField["type"],
  extra: Partial<DataField> = {}
): DataField {
  return { key, label, column, type, ...extra };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const moduleIndex = new Map(DATA_MODULES.map((m) => [m.key, m]));

export function getModule(key: string | null | undefined): DataModule | null {
  if (!key) return null;
  return moduleIndex.get(key) ?? null;
}

export function getAllModules(): DataModule[] {
  return DATA_MODULES;
}

export function getField(module: DataModule, key: string): DataField | null {
  return module.fields.find((f) => f.key === key) ?? null;
}

/** Fields the user can actually map on import (non-system, importable). */
export function getImportableFields(module: DataModule): DataField[] {
  return module.fields.filter((f) => !f.system && f.importable !== false);
}

/** Fields the user can export (exportable). */
export function getExportableFields(module: DataModule): DataField[] {
  return module.fields.filter((f) => f.exportable !== false);
}

/** Resolve the stored module enable flags against the full registry. */
export function isModuleEnabled(
  config: Pick<DataManagementConfig, "enabled" | "modules"> | undefined | null,
  moduleKey: string
): boolean {
  if (!config) return true;
  if (config.enabled === false) return false;
  const flag = config.modules?.[moduleKey];
  return flag === undefined ? true : Boolean(flag);
}

/** List modules that are enabled for a given data-management config. */
export function getEnabledModules(
  config: Pick<DataManagementConfig, "enabled" | "modules"> | undefined | null
): DataModule[] {
  return DATA_MODULES.filter((m) => isModuleEnabled(config, m.key));
}

/** Slugify a value for config-module ref_keys (kept local to avoid cycles). */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/**
 * Compute a record's unique identity string from its unique key fields.
 * Must match how the provider computes existing keys so preview and commit
 * agree on what counts as a duplicate / update match.
 */
export function recordUniqueKey(
  module: DataModule,
  record: Record<string, unknown>
): string {
  if (module.source === "config") {
    const ref = module.uniqueKeys[0];
    return slug(String(ref ? record[ref] ?? "" : ""));
  }
  return module.uniqueKeys
    .map((k) => String(record[k] ?? ""))
    .join("|");
}
