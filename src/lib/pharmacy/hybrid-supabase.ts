/**
 * Supabase adapter for M7 hybrid apply. Service-role client only.
 */

import {
  applyErrorMessage,
  missingSchemaColumn,
  type HybridCloudStore,
} from "./hybrid-apply";

async function insertStrippingUnknownColumns(
  sb: Sb,
  table: string,
  row: Record<string, unknown>
): Promise<Record<string, unknown>> {
  let current: Record<string, unknown> = { ...row };
  for (let attempt = 0; attempt < 24; attempt++) {
    const { data, error } = await sb.from(table).insert(current).select().single();
    if (!error) return data as Record<string, unknown>;
    const col = missingSchemaColumn(String(error.message || ""));
    if (!col || !(col in current)) {
      throw new Error(applyErrorMessage(error));
    }
    const { [col]: _dropped, ...rest } = current;
    void _dropped;
    current = rest;
  }
  throw new Error("Apply failed");
}

// Service-role client is untyped (custom Database maps). Keep the adapter loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (table: string) => any };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withHospital(query: any, hospitalId: string) {
  return query.eq("hospital_id", hospitalId);
}

export function createSupabaseHybridStore(sb: Sb): HybridCloudStore {
  return {
    async findSaleByNumber(hospitalId, saleNumber) {
      const { data, error } = await withHospital(
        sb.from("pharmacy_sales").select("*").eq("sale_number", saleNumber),
        hospitalId
      ).maybeSingle();
      if (error) throw error;
      return (data as Record<string, unknown>) || null;
    },

    async insertSale(row) {
      return insertStrippingUnknownColumns(sb, "pharmacy_sales", row);
    },

    async findMedicineById(id) {
      const { data, error } = await sb.from("medicines").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as Record<string, unknown>) || null;
    },

    async findMedicineBySku(hospitalId, sku) {
      const { data, error } = await withHospital(
        sb.from("medicines").select("*").eq("sku", sku),
        hospitalId
      ).maybeSingle();
      if (error) throw error;
      return (data as Record<string, unknown>) || null;
    },

    async findMedicineByBarcode(hospitalId, barcode) {
      const { data, error } = await withHospital(
        sb.from("medicines").select("*").eq("barcode", barcode),
        hospitalId
      ).maybeSingle();
      if (error) {
        if (/barcode/i.test(error.message)) return null;
        throw error;
      }
      return (data as Record<string, unknown>) || null;
    },

    async insertMedicine(row) {
      return insertStrippingUnknownColumns(sb, "medicines", row);
    },

    async getMedicineStock(id) {
      const { data, error } = await sb
        .from("medicines")
        .select("stock_qty")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return Number((data as { stock_qty?: number }).stock_qty ?? 0);
    },

    async decrementMedicineStock(id, qty) {
      const { data, error } = await sb
        .from("medicines")
        .select("stock_qty")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const current = Number((data as { stock_qty?: number } | null)?.stock_qty ?? 0);
      if (!data || current < qty) {
        throw new Error(`Insufficient stock. Available: ${data ? current : 0}`);
      }
      const { error: updateError } = await sb
        .from("medicines")
        .update({ stock_qty: current - qty })
        .eq("id", id);
      if (updateError) throw updateError;
    },

    async insertStockMovement(row) {
      await insertStrippingUnknownColumns(sb, "pharmacy_stock_movements", row);
    },

    async findByName(entity, hospitalId, name) {
      const table = tableFor(entity);
      let q = sb.from(table).select("*").ilike("name", name);
      if (entity !== "category") q = withHospital(q, hospitalId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return (data as Record<string, unknown>) || null;
    },

    async findById(entity, id) {
      const { data, error } = await sb.from(tableFor(entity)).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as Record<string, unknown>) || null;
    },

    async insertRow(entity, row) {
      return insertStrippingUnknownColumns(
        sb,
        tableFor(entity),
        sanitizeRow(entity, row)
      );
    },

    async findPurchaseOrderByNumber(hospitalId, poNumber) {
      const { data, error } = await withHospital(
        sb.from("pharmacy_purchase_orders").select("*").eq("po_number", poNumber),
        hospitalId
      ).maybeSingle();
      if (error) throw error;
      return (data as Record<string, unknown>) || null;
    },
  };
}

function tableFor(
  entity: "customer" | "supplier" | "category" | "purchase_order"
): string {
  if (entity === "customer") return "pharmacy_customers";
  if (entity === "supplier") return "pharmacy_suppliers";
  if (entity === "category") return "pharmacy_categories";
  return "pharmacy_purchase_orders";
}

function sanitizeRow(
  entity: "customer" | "supplier" | "category" | "purchase_order",
  row: Record<string, unknown>
): Record<string, unknown> {
  if (entity === "category") {
    return { id: row.id, name: row.name, description: row.description || "" };
  }
  if (entity === "supplier") {
    return {
      id: row.id,
      hospital_id: row.hospital_id,
      name: row.name,
      phone: row.phone || "",
      email: row.email || "",
      address: row.address || "",
      is_active: row.is_active !== false,
    };
  }
  if (entity === "customer") {
    return {
      id: row.id,
      hospital_id: row.hospital_id,
      name: row.name,
      phone: row.phone || "",
      email: row.email || "",
      address: row.address || "",
    };
  }
  return {
    id: row.id,
    hospital_id: row.hospital_id,
    po_number: row.po_number,
    supplier_id: row.supplier_id ?? null,
    status: row.status || "draft",
    total_amount: row.total_amount || 0,
    notes: row.notes || "",
    line_items: row.line_items || [],
  };
}
