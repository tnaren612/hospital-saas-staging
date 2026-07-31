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

export const dynamic = "force-dynamic";

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

  try {
    let rows: Array<Record<string, unknown>> = [];
    switch (entity) {
      case "settings": {
        const s = await getPharmacySettings(opts);
        rows = [s as unknown as Record<string, unknown>];
        break;
      }
      case "branch":
        rows = await listBranches(opts);
        break;
      case "shift":
        rows = await listShifts(opts);
        break;
      case "return":
        rows = await listReturns(opts);
        break;
      case "held_bill":
        rows = await listHeldBills(opts);
        break;
      case "sale":
        rows = await listSales({ ...opts, sinceIso: since, limit });
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

  for (const op of parsed.data.ops) {
    try {
      const ledger = await ledgerLookup(sb, op.id, tenant.hospitalId);
      if (ledger) {
        results.push({
          opId: op.id,
          ok: ledger.status === "applied",
          error: ledger.status === "applied" ? null : (ledger.error || "failed earlier"),
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
        await sb.from("pharmacy_sync_ledger").insert({
          op_id: op.id,
          hospital_id: tenant.hospitalId,
          entity: op.entity,
          action: op.action,
          status,
          response,
          error,
        });
      };

      let applied: Record<string, unknown> | null = null;
      switch (op.entity) {
        case "sale": {
          const sale = posSaleSchema.safeParse(op.payload);
          if (!sale.success) throw new Error("Invalid sale payload");
          applied = (await createPosSale(sale.data, opts)) as Record<string, unknown> | null;
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
          // Entities without a server apply path yet are never dropped:
          // the client keeps them queued as "blocked" until support lands.
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
      const isConflict =
        /insufficient stock|already exists|conflict/i.test(message);
      await sb?.from("pharmacy_sync_ledger").insert({
        op_id: op.id,
        hospital_id: tenant.hospitalId,
        entity: op.entity,
        action: op.action,
        status: isConflict ? "conflict" : "failed",
        response: null,
        error: message,
      });
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
