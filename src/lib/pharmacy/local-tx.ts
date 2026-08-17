/**
 * Pharmacy POS — local transaction bridge (M6 bridge).
 *
 * The authoritative sale/return boundary is the on-disk SQLite store behind
 * `/api/admin/pharmacy/offline`. These wrappers commit a transaction there
 * FIRST; only a committed result may be enqueued for cloud sync and turned
 * into a receipt. A failed transaction returns a structured failure and must
 * never be presented as a successful sale.
 *
 * Same-origin (localhost) requests do not depend on Supabase reachability,
 * so the whole path keeps working with the cloud dead.
 */

import type { SyncEntity } from "./offline/types";

export type LocalTxFailureKind = "validation" | "stock" | "server" | "network";

export type LocalTxResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: LocalTxFailureKind; error: string };

/** POST the sale to the SQLite transaction API (idempotent by sale_number). */
export async function commitSaleLocally(
  payload: Record<string, unknown>
): Promise<LocalTxResult<Record<string, unknown>>> {
  return postAction("sale", payload);
}

/** POST the return to the SQLite transaction API (idempotent per sale). */
export async function commitReturnLocally(
  payload: Record<string, unknown>
): Promise<LocalTxResult<Record<string, unknown>>> {
  return postAction("return", payload);
}

/**
 * Persist a NEW medicine to the authoritative SQLite store (unknown-barcode
 * flow). Returns the created medicine row (with its SQLite id) — the caller
 * then creates its opening batch/stock and refreshes the catalog.
 */
export async function commitMedicineLocally(
  payload: Record<string, unknown>
): Promise<LocalTxResult<Record<string, unknown>>> {
  return postAction("medicine", payload);
}

/** Persist an opening batch + stock for a medicine in the SQLite store. */
export async function commitBatchLocally(
  payload: Record<string, unknown>
): Promise<LocalTxResult<Record<string, unknown>>> {
  return postAction("batch", payload);
}

async function postAction(
  action: string,
  payload: Record<string, unknown>
): Promise<LocalTxResult<Record<string, unknown>>> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/pharmacy/offline?action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      ok: false,
      kind: "network",
      error: err instanceof Error ? err.message : "Local store unreachable",
    };
  }

  const json = (await res.json().catch(() => null)) as {
    data?: unknown;
    error?: string;
    kind?: string;
  } | null;

  if (res.ok && json && json.data !== undefined) {
    return { ok: true, data: json.data as Record<string, unknown> };
  }

  const kind =
    json?.kind === "validation" || json?.kind === "stock" || json?.kind === "server"
      ? json.kind
      : "server";
  return { ok: false, kind, error: json?.error || `HTTP ${res.status}` };
}

export type LocalMedicineRow = Record<string, unknown> & {
  id: string;
  stock_qty?: number;
};

/** Current medicines from the SQLite store (stock-authoritative refresh). */
export async function fetchLocalMedicines(
  limit = 2000
): Promise<LocalMedicineRow[]> {
  const res = await fetch(
    `/api/admin/pharmacy/offline?kind=medicines&limit=${limit}`,
    { cache: "no-store", credentials: "same-origin" }
  );
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
  if (!json || !Array.isArray(json.data)) return [];
  return json.data as LocalMedicineRow[];
}

/** One sale by number from the SQLite store (used for exact-batch returns). */
export async function fetchLocalSale(
  saleNumber: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `/api/admin/pharmacy/offline?kind=sales&sale_number=${encodeURIComponent(saleNumber)}`,
    { cache: "no-store", credentials: "same-origin" }
  );
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
  return json && json.data ? (json.data as Record<string, unknown>) : null;
}

/** Enqueue an already-committed local transaction for cloud sync. */
export function committedTxOp(opts: {
  id: string;
  entity: Extract<SyncEntity, "sale" | "return">;
  payload: Record<string, unknown>;
}) {
  return {
    id: opts.id,
    hospitalId: "local",
    entity: opts.entity,
    action: "create" as const,
    payload: opts.payload,
    targetKey: `${opts.entity}::${opts.id}`,
  };
}
