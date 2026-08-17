/**
 * pharmacy_sync_ledger writes. 047 grants INSERT/UPDATE to service_role only.
 */

export type LedgerStatus = "applied" | "failed" | "conflict";

export type LedgerRow = {
  op_id: string;
  hospital_id: string;
  entity: string;
  action: string;
  status: LedgerStatus;
  response: Record<string, unknown> | null;
  error: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LedgerClient = { from: (table: string) => any };

export function shouldWriteLedger(
  existing: { status: string } | null,
  next: LedgerStatus
): boolean {
  if (existing?.status === "applied" && next !== "applied") return false;
  return true;
}

export async function writeSyncLedger(
  client: LedgerClient,
  existing: { status: string } | null,
  row: LedgerRow
): Promise<void> {
  if (!shouldWriteLedger(existing, row.status)) return;
  if (!row.hospital_id) {
    throw new Error("pharmacy_sync_ledger requires hospital_id");
  }
  if (existing) {
    const { error } = await client
      .from("pharmacy_sync_ledger")
      .update({
        status: row.status,
        response: row.response,
        error: row.error,
      })
      .eq("op_id", row.op_id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await client.from("pharmacy_sync_ledger").insert(row);
  if (error) throw new Error(error.message);
}
