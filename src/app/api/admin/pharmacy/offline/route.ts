import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { rolesForPhase2Module } from "@/lib/auth/roles";
import {
  sqliteSaleSchema,
  medicineInputSchema,
  batchInputSchema,
  addStockInputSchema,
  adjustmentInputSchema,
  purchaseInputSchema,
  returnInputSchema,
  type MedicineInput,
  type BatchInput,
  type SqliteSaleInput,
} from "@/lib/pharmacy/sqlite-store";
import { POS_PAYMENT_METHODS } from "@/lib/pharmacy/validation";
import { getSharedPharmacySqlite } from "@/lib/pharmacy/sqlite-path";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

const KINDS = [
  "medicines",
  "batches",
  "movements",
  "purchases",
  "sales",
  "payments",
  "returns",
  "patients",
  "settings",
  "dashboard",
  "branches",
  "shifts",
  "held_bills",
] as const;

const ACTIONS = [
  "medicine",
  "batch",
  "medicine-with-batch",
  "add-stock",
  "adjustment",
  "purchase",
  "sale",
  "return",
  "settings",
  "branch",
  "shift",
  "held_bill",
] as const;

async function openPharmacyStore() {
  const tenant = await getTenantContext();
  return getSharedPharmacySqlite(tenant.hospitalId);
}

export async function GET(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("pharmacy");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as (typeof KINDS)[number] | null;
  const search = url.searchParams.get("search") || undefined;
  const since = url.searchParams.get("since") || undefined;
  const saleNumber = url.searchParams.get("sale_number") || undefined;
  const limit = Number(url.searchParams.get("limit") || 200);

  if (!kind || !(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Unsupported kind" }, { status: 400 });
  }

  try {
    const store = await openPharmacyStore();
    let data: unknown;
    switch (kind) {
      case "medicines":
        data = store.listMedicines({ search, limit });
        break;
      case "batches":
        data = store.listBatches(url.searchParams.get("medicine_id") || undefined);
        break;
      case "movements":
        data = store.listMovements({
          medicineId: url.searchParams.get("medicine_id") || undefined,
          limit,
        });
        break;
      case "purchases":
        data = store.listPurchases({ limit });
        break;
      case "sales":
        data = url.searchParams.get("sale_number")
          ? store.getSale(url.searchParams.get("sale_number")!)
          : store.listSales({ sinceIso: since, limit });
        break;
      case "payments":
        data = store.listPayments({ saleNumber, sinceIso: since });
        break;
      case "returns":
        data = store.listReturns({ limit });
        break;
      case "patients":
        data = store.listPatients({ search, limit });
        break;
      case "settings":
        data = store.getSettings();
        break;
      case "dashboard":
        data = store.dashboardStats();
        break;
      case "branches":
        data = store.listBranches();
        break;
      case "shifts":
        data = store.listShifts();
        break;
      case "held_bills":
        data = store.listHeldBills();
        break;
    }
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const saleActionSchema = sqliteSaleSchema
  .omit({})
  .extend({
    payment_method: z.enum(POS_PAYMENT_METHODS).default("cash"),
  });

export async function POST(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("pharmacy");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") as (typeof ACTIONS)[number] | null;
  if (!action || !(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const store = await openPharmacyStore();
    let data: unknown;

    switch (action) {
      case "medicine": {
        const parsed = medicineInputSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: "Validation failed", details: parsed.error.flatten() },
            { status: 400 }
          );
        }
        data = store.createMedicine(parsed.data as MedicineInput);
        break;
      }
      case "batch": {
        const parsed = batchInputSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: "Validation failed", details: parsed.error.flatten() },
            { status: 400 }
          );
        }
        data = store.addBatch(parsed.data as BatchInput);
        break;
      }
      case "medicine-with-batch": {
        const medParsed = medicineInputSchema.safeParse(body);
        if (!medParsed.success) {
          return NextResponse.json(
            { error: "Validation failed", details: medParsed.error.flatten(), kind: "validation" },
            { status: 400 }
          );
        }
        const batchNumber =
          typeof body.batch_number === "string" && String(body.batch_number).trim()
            ? String(body.batch_number).trim()
            : `B-OPEN`;
        data = store.createMedicineWithOpeningBatch(medParsed.data as MedicineInput, {
          batch_number: batchNumber,
          expiry_date:
            typeof body.expiry_date === "string" ? String(body.expiry_date) : null,
          selling_price: Number(body.selling_price || 0),
          purchase_price: Number(body.purchase_price || 0),
          qty: Number(body.qty ?? body.stock_qty ?? 0),
        });
        break;
      }
      case "add-stock": {
        const parsed = addStockInputSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: "Validation failed", details: parsed.error.flatten() },
            { status: 400 }
          );
        }
        data = store.addStock(parsed.data);
        break;
      }
      case "adjustment": {
        const parsed = adjustmentInputSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: "Validation failed", details: parsed.error.flatten() },
            { status: 400 }
          );
        }
        data = store.adjustStock(parsed.data);
        break;
      }
      case "purchase": {
        const parsed = purchaseInputSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: "Validation failed", details: parsed.error.flatten() },
            { status: 400 }
          );
        }
        data = store.createPurchase(parsed.data);
        break;
      }
      case "sale": {
        const parsed = saleActionSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: "Validation failed", details: parsed.error.flatten(), kind: "validation" },
            { status: 400 }
          );
        }
        data = store.createSaleIdempotent(parsed.data as SqliteSaleInput);
        break;
      }
      case "return": {
        const parsed = returnInputSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: "Validation failed", details: parsed.error.flatten(), kind: "validation" },
            { status: 400 }
          );
        }
        data = store.createReturnIdempotent(parsed.data);
        break;
      }
      case "settings": {
        data = store.saveSettings(body as Record<string, unknown>);
        break;
      }
      case "branch": {
        data = store.createBranch({
          name: String(body.name || "Main Pharmacy"),
          ...body,
        });
        break;
      }
      case "shift": {
        data = store.openShift({
          user_name: String(body.user_name || "Cashier"),
          user_id: body.user_id || null,
          branch_id: body.branch_id || null,
          opening_cash: Number(body.opening_cash || 0),
          notes: body.notes || null,
        });
        break;
      }
      case "held_bill": {
        data = store.createHeldBill({
          reference: String(body.reference || "HELD"),
          customer_name: body.customer_name || null,
          customer_phone: body.customer_phone || null,
          items: Array.isArray(body.items) ? body.items : [],
          discount: Number(body.discount || 0),
          notes: body.notes || null,
          held_by: body.held_by || null,
          held_by_name: body.held_by_name || null,
        });
        break;
      }
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Operation failed";
    // Structured failures: stock/business conflicts are a 409 with kind
    // "stock" (the POS must never treat them as server errors or as a
    // successful sale); everything else is a server failure.
    if (
      /insufficient stock|no available stock|cannot sell expired|negative|already exists|not found|no batch found|at most .* can be returned|immutable/i.test(
        message
      )
    ) {
      return NextResponse.json(
        { error: message, kind: "stock" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message, kind: "server" }, { status: 500 });
  }
}
