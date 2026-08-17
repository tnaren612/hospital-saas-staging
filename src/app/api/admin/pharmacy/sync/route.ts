import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { rolesForPhase2Module } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";
import {
  createBranch,
  createHeldBill,
  createPosSale,
  createReturn,
  getPharmacySettings,
  listBranches,
  listHeldBills,
  listReturns,
  listSales,
  listShifts,
  openShift,
  updatePharmacySettings,
} from "@/lib/pharmacy/service";
import { posSaleSchema } from "@/lib/pharmacy/validation";
import type { SyncEntity } from "@/lib/pharmacy/offline/types";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import {
  applyCloudCategory,
  applyCloudCustomer,
  applyCloudMedicine,
  applyCloudPurchaseOrder,
  applyCloudSupplier,
  classifyApplyFailure,
} from "@/lib/pharmacy/hybrid-apply";
import { createSupabaseHybridStore } from "@/lib/pharmacy/hybrid-supabase";
import {
  getPharmacySqlite,
  medicineInputSchema,
  returnInputSchema,
  sqliteSaleSchema,
  type PharmacySqliteStore,
} from "@/lib/pharmacy/sqlite-store";

export const dynamic = "force-dynamic";

/**
 * Local (standalone / fully offline) mode: when Supabase is not configured —
 * or explicitly requested with `?backend=sqlite` — every push op and pull is
 * served by the on-disk SQLite pharmacy store so the app keeps working with
 * the internet completely unavailable.
 */
function isLocalMode(request: Request): boolean {
  const url = new URL(request.url);
  if (url.searchParams.get("backend") === "sqlite") return true;
  return !hasSupabaseConfig();
}

const SYNC_ENTITIES = [
  "settings",
  "branch",
  "shift",
  "sale",
  "return",
  "held_bill",
  "medicine",
  "customer",
  "supplier",
  "purchase_order",
  "category",
] as const;

const opSchema = z.object({
  id: z.string().min(1).max(120),
  hospitalId: z.string().default("local"),
  entity: z.enum(SYNC_ENTITIES),
  action: z.enum(["create", "update", "delete"]),
  payload: z.record(z.string(), z.unknown()),
});

const bodySchema = z.object({ ops: z.array(opSchema).max(100) });

const PULL_ENTITIES = new Set<SyncEntity>([
  "settings",
  "branch",
  "shift",
  "return",
  "held_bill",
  "sale",
]);

const rowUpdatedAt = (row: Record<string, unknown>): string =>
  typeof row.updated_at === "string"
    ? row.updated_at
    : new Date().toISOString();

export async function GET(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("pharmacy");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;

  const tenant = await getTenantContext();
  const opts = { hospitalId: tenant.hospitalId };

  const url = new URL(request.url);
  const entity = url.searchParams.get("entity") as SyncEntity | null;
  const since = url.searchParams.get("since") || "1970-01-01T00:00:00.000Z";
  const limit = Math.min(Number(url.searchParams.get("limit") || 500), 2000);

  if (!entity || !PULL_ENTITIES.has(entity)) {
    return NextResponse.json({ error: "Unsupported pull entity" }, { status: 400 });
  }

  const local = isLocalMode(request);
  const store = local ? getPharmacySqlite() : null;

  if (local && store) {
    const LOCAL_PULL_ENTITIES = new Set([
      "settings",
      "branch",
      "shift",
      "return",
      "held_bill",
      "sale",
      "medicine",
    ]);
    if (!LOCAL_PULL_ENTITIES.has(entity)) {
      return NextResponse.json({ error: "Unsupported pull entity" }, { status: 400 });
    }
    try {
      let rows: Array<Record<string, unknown>> = [];
      switch (entity) {
        case "settings":
          rows = [store.getSettings() as unknown as Record<string, unknown>];
          break;
        case "medicine":
          rows = store.listMedicines({ limit: 2000 });
          break;
        case "branch":
          rows = store.listBranches();
          break;
        case "shift":
          rows = store.listShifts();
          break;
        case "return":
          rows = store.listReturns({ limit: 2000 });
          break;
        case "held_bill":
          rows = store.listHeldBills();
          break;
        case "sale":
          rows = store.listSales({ sinceIso: since, limit });
          break;
      }
      const filtered = rows.filter((r) => rowUpdatedAt(r) >= since);
      return NextResponse.json({
        data: {
          entity,
          rows: filtered.map((r) => ({
            id: String(r.id),
            updatedAt: rowUpdatedAt(r),
            data: r,
          })),
          serverTime: new Date().toISOString(),
        },
      });
    } catch {
      return NextResponse.json({ error: "Pull failed" }, { status: 500 });
    }
  }

  try {
    let rows: Array<Record<string, unknown>> = [];
    switch (entity) {
      case "settings": {
        const s = await pullOrEmpty(async () => [await getPharmacySettings(opts)]);
        rows = s as Array<Record<string, unknown>>;
        break;
      }
      case "branch":
        rows = await pullOrEmpty(() => listBranches(opts));
        break;
      case "shift":
        rows = await pullOrEmpty(() => listShifts(opts));
        break;
      case "return":
        rows = await pullOrEmpty(() => listReturns(opts));
        break;
      case "held_bill":
        rows = await pullOrEmpty(() => listHeldBills(opts));
        break;
      case "sale":
        rows = await pullOrEmpty(() => listSales({ ...opts, sinceIso: since, limit }));
        break;
    }

    const filtered = rows.filter((r) => rowUpdatedAt(r) >= since);
    return NextResponse.json({
      data: {
        entity,
        rows: filtered.map((r) => ({
          id: String(r.id),
          updatedAt: rowUpdatedAt(r),
          data: r,
        })),
        serverTime: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/demo-fallback-disabled/i.test(message)) {
      return NextResponse.json({
        data: { entity, rows: [], serverTime: new Date().toISOString() },
      });
    }
    return NextResponse.json({ error: "Pull failed" }, { status: 500 });
  }
}

async function pullOrEmpty<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/demo-fallback-disabled/i.test(message)) return [];
    throw err;
  }
}

/** Apply one queued mutation to the local SQLite store (standalone mode). */
function applyLocalOp(
  store: PharmacySqliteStore,
  op: z.infer<typeof opSchema>
): { id: string } {
  switch (op.entity) {
    case "sale": {
      const sale = sqliteSaleSchema.safeParse(op.payload);
      if (!sale.success) throw new Error("Invalid sale payload");
      // Idempotent: the active POS commits sales through the offline route
      // first; pushing the queued op here must return the existing sale and
      // never double-deduct stock.
      return store.createSaleIdempotent(sale.data);
    }
    case "return": {
      const ret = returnInputSchema.safeParse(op.payload);
      if (!ret.success) throw new Error("Invalid return payload");
      return { id: String(store.createReturnIdempotent(ret.data).id) };
    }
    case "medicine": {
      const med = medicineInputSchema.safeParse(op.payload);
      if (!med.success) throw new Error("Invalid medicine payload");
      // Idempotent: the active POS commits medicines through the offline
      // route FIRST (SQLite authority); a queued push of the same op must
      // return the existing medicine and never create a duplicate.
      const barcode =
        typeof op.payload.barcode === "string" && String(op.payload.barcode).trim()
          ? String(op.payload.barcode).trim()
          : null;
      const sku =
        typeof op.payload.sku === "string" && String(op.payload.sku).trim()
          ? String(op.payload.sku).trim()
          : null;
      let existing: Record<string, unknown> | null = barcode
        ? store.findMedicineByBarcode(barcode)
        : null;
      if (!existing && sku) {
        existing =
          store
            .listMedicines({ limit: 2000 })
            .find((m) => String(m.sku ?? "") === sku) ?? null;
      }
      if (existing) return { id: String(existing.id) };
      const created = store.createMedicine(med.data);
      const batchNumber =
        typeof op.payload.batch_number === "string" &&
        String(op.payload.batch_number).trim()
          ? String(op.payload.batch_number).trim()
          : null;
      if (batchNumber) {
        store.addBatch({
          medicine_id: String(created.id),
          batch_number: batchNumber,
          expiry_date:
            typeof op.payload.expiry_date === "string"
              ? String(op.payload.expiry_date)
              : null,
          purchase_price: Number(op.payload.purchase_price || 0),
          selling_price: Number(op.payload.selling_price || 0),
          mrp: typeof op.payload.mrp === "number" ? op.payload.mrp : null,
          qty: Number(op.payload.stock_qty || 0),
        });
      }
      return { id: String(created.id) };
    }
    case "held_bill":
      return { id: String(store.createHeldBill({
        reference: String(op.payload.reference || "HELD"),
        customer_name:
          typeof op.payload.customer_name === "string"
            ? op.payload.customer_name
            : null,
        customer_phone:
          typeof op.payload.customer_phone === "string"
            ? op.payload.customer_phone
            : null,
        items: Array.isArray(op.payload.items) ? op.payload.items : [],
        discount: Number(op.payload.discount || 0),
        notes: typeof op.payload.notes === "string" ? op.payload.notes : null,
        held_by: typeof op.payload.held_by === "string" ? op.payload.held_by : null,
        held_by_name:
          typeof op.payload.held_by_name === "string"
            ? op.payload.held_by_name
            : null,
      }).id)};
    case "branch":
      return { id: String(store.createBranch({
        name: String(op.payload.name || "Main Pharmacy"),
        code: typeof op.payload.code === "string" ? op.payload.code : undefined,
        address:
          typeof op.payload.address === "string" ? op.payload.address : null,
        city: typeof op.payload.city === "string" ? op.payload.city : null,
        state: typeof op.payload.state === "string" ? op.payload.state : null,
        pincode:
          typeof op.payload.pincode === "string" ? op.payload.pincode : null,
        phone: typeof op.payload.phone === "string" ? op.payload.phone : null,
        email: typeof op.payload.email === "string" ? op.payload.email : null,
        manager_name:
          typeof op.payload.manager_name === "string"
            ? op.payload.manager_name
            : null,
        is_default: Boolean(op.payload.is_default),
      }).id)};
    case "shift":
      return { id: String(store.openShift({
        user_name: String(op.payload.user_name || "Cashier"),
        user_id:
          typeof op.payload.user_id === "string" ? op.payload.user_id : null,
        branch_id:
          typeof op.payload.branch_id === "string" ? op.payload.branch_id : null,
        opening_cash: Number(op.payload.opening_cash || 0),
        notes: typeof op.payload.notes === "string" ? op.payload.notes : null,
      }).id)};
    case "settings":
      store.saveSettings(op.payload as Record<string, unknown>);
      return { id: "settings" };
    case "customer":
    case "supplier":
    case "category":
    case "purchase_order": {
      const localId =
        (typeof op.payload.id === "string" && op.payload.id) ||
        (typeof op.payload._clientId === "string" && op.payload._clientId) ||
        op.id;
      return { id: String(localId) };
    }
    default:
      throw new Error(`no server apply for entity "${op.entity}" yet`);
  }
}

async function ledgerLookup(
  sb: NonNullable<Awaited<ReturnType<typeof requireHmsAdmin>>["supabase"]>,
  opId: string,
  hospitalId: string | null
) {
  if (!sb) return null;
  let q = sb.from("pharmacy_sync_ledger").select("*").eq("op_id", opId);
  if (hospitalId) q = q.eq("hospital_id", hospitalId);
  const { data } = await q.maybeSingle();
  return data as {
    op_id: string;
    status: string;
    response?: Record<string, unknown> | null;
    error?: string | null;
  } | null;
}

export async function POST(request: Request) {
  const { assertModuleEnabled } = await import("@/lib/hospital/require-module");
  const mod = await assertModuleEnabled("pharmacy");
  if (!mod.ok) return mod.response;

  const gate = await requireHmsAdmin(rolesForPhase2Module("pharmacy"));
  if (gate.error) return gate.error;
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const tenant = await getTenantContext();
  const opts = { hospitalId: tenant.hospitalId };

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const results = [];
  const sb = gate.supabase;

  const local = isLocalMode(request);
  const store = local ? getPharmacySqlite() : null;

  if (local && store) {
    for (const op of parsed.data.ops) {
      try {
        const applied = applyLocalOp(store, op);
        results.push({
          opId: op.id,
          ok: true,
          serverId: applied.id,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Apply failed";
        const isConflict =
          /insufficient stock|already exists|conflict|expired|not found|negative/i.test(
            message
          );
        results.push({
          opId: op.id,
          ok: false,
          conflict: isConflict,
          error: message,
        });
      }
    }
    return NextResponse.json({
      data: { results, serverTime: new Date().toISOString() },
    });
  }

  for (const op of parsed.data.ops) {
    try {
      const ledger = await ledgerLookup(sb, op.id, tenant.hospitalId);
      // Only an applied ledger row is a replay hit. Failed/conflict must
      // re-attempt so retries can succeed after medicine apply or recovery.
      if (ledger?.status === "applied") {
        results.push({
          opId: op.id,
          ok: true,
          error: null,
          serverId: ledger.response?.id ? String(ledger.response.id) : null,
          updatedAt: null,
        });
        continue;
      }

      const recordLedger = async (
        status: "applied" | "failed" | "conflict",
        response: Record<string, unknown> | null,
        error: string | null
      ) => {
        if (!sb) return;
        const row = {
          op_id: op.id,
          hospital_id: tenant.hospitalId,
          entity: op.entity,
          action: op.action,
          status,
          response,
          error,
        };
        if (ledger) {
          await sb
            .from("pharmacy_sync_ledger")
            .update({ status, response, error })
            .eq("op_id", op.id);
        } else {
          await sb.from("pharmacy_sync_ledger").insert(row);
        }
      };

      let applied: Record<string, unknown> | null = null;
      const hospitalId = tenant.hospitalId;
      const cloudStore =
        sb && hospitalId ? createSupabaseHybridStore(sb) : null;
      switch (op.entity) {
        case "sale": {
          const sale = posSaleSchema.safeParse(op.payload);
          if (!sale.success) throw new Error("Invalid sale payload");
          applied = (await createPosSale(sale.data, opts)) as Record<string, unknown> | null;
          break;
        }
        case "medicine": {
          if (!cloudStore || !hospitalId) throw new Error("Cloud medicine apply requires a hospital");
          applied = (await applyCloudMedicine(cloudStore, op.payload, hospitalId)).row;
          break;
        }
        case "customer": {
          if (!cloudStore || !hospitalId) throw new Error("Cloud customer apply requires a hospital");
          applied = (await applyCloudCustomer(cloudStore, op.payload, hospitalId)).row;
          break;
        }
        case "supplier": {
          if (!cloudStore || !hospitalId) throw new Error("Cloud supplier apply requires a hospital");
          applied = (await applyCloudSupplier(cloudStore, op.payload, hospitalId)).row;
          break;
        }
        case "category": {
          if (!cloudStore || !hospitalId) throw new Error("Cloud category apply requires a hospital");
          applied = (await applyCloudCategory(cloudStore, op.payload, hospitalId)).row;
          break;
        }
        case "purchase_order": {
          if (!cloudStore || !hospitalId) throw new Error("Cloud purchase-order apply requires a hospital");
          applied = (await applyCloudPurchaseOrder(cloudStore, op.payload, hospitalId)).row;
          break;
        }
        case "return":
          applied = await createReturn(
            op.payload as Parameters<typeof createReturn>[0],
            opts
          );
          break;
        case "held_bill":
          applied = await createHeldBill(
            op.payload as Parameters<typeof createHeldBill>[0],
            opts
          );
          break;
        case "branch":
          applied = await createBranch(
            op.payload as Parameters<typeof createBranch>[0],
            opts
          );
          break;
        case "shift":
          applied = await openShift(
            op.payload as Parameters<typeof openShift>[0],
            opts
          );
          break;
        case "settings":
          applied = await updatePharmacySettings(
            op.payload as Parameters<typeof updatePharmacySettings>[0],
            opts
          );
          break;
        default:
          results.push({
            opId: op.id,
            ok: false,
            blocked: true,
            error: `no server apply for entity "${op.entity}" yet`,
          });
          continue;
      }

      if (!applied) throw new Error("Apply returned no row");
      await recordLedger("applied", applied, null);
      results.push({
        opId: op.id,
        ok: true,
        serverId: String(applied.id ?? ""),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Apply failed";
      const isConflict = classifyApplyFailure(message) === "conflict";
      if (sb) {
        const ledger = await ledgerLookup(sb, op.id, tenant.hospitalId);
        if (ledger) {
          await sb
            .from("pharmacy_sync_ledger")
            .update({
              status: isConflict ? "conflict" : "failed",
              response: null,
              error: message,
            })
            .eq("op_id", op.id);
        } else {
          await sb.from("pharmacy_sync_ledger").insert({
            op_id: op.id,
            hospital_id: tenant.hospitalId,
            entity: op.entity,
            action: op.action,
            status: isConflict ? "conflict" : "failed",
            response: null,
            error: message,
          });
        }
      }
      results.push({
        opId: op.id,
        ok: false,
        conflict: isConflict,
        error: message,
      });
    }
  }

  return NextResponse.json({
    data: { results, serverTime: new Date().toISOString() },
  });
}
