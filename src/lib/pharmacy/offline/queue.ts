/**
 * Enterprise Pharmacy — Mutation Queue Helpers (pure, unit tested)
 *
 * Queue semantics:
 *  - ops are ordered by an ever-increasing seq
 *  - a pending op with identical entity+payload+action is never duplicated
 *  - retry uses exponential backoff, capped
 *  - ops that can never be applied server-side (no endpoint yet) are "blocked",
 *    kept forever in the queue (never silently dropped — no data loss)
 */

import type { OfflineMutation } from "./types";

export const DEFAULT_MAX_ATTEMPTS = 12;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 60_000;

export function nextBackoffMs(op: OfflineMutation): number {
  const exp = Math.min(op.attempts, 10);
  const jitter = Math.random() * 0.3 + 0.85;
  return Math.min(BACKOFF_BASE_MS * 2 ** exp * jitter, BACKOFF_CAP_MS);
}

export function isRetryable(status: string): boolean {
  return status === "pending" || status === "failed";
}

export function shouldRetryNow(
  op: OfflineMutation,
  now: number = Date.now()
): boolean {
  if (!isRetryable(op.status)) return false;
  if (op.attempts >= op.maxAttempts) return false;
  if (!op.lastAttemptAt) return true;
  const waited = now - Date.parse(op.lastAttemptAt);
  return waited >= nextBackoffMs(op);
}

export function sameMutation(
  a: Pick<OfflineMutation, "entity" | "action" | "payload">,
  b: Pick<OfflineMutation, "entity" | "action" | "payload">
): boolean {
  if (a.entity !== b.entity || a.action !== b.action) return false;
  return JSON.stringify(a.payload) === JSON.stringify(b.payload);
}

export function findDedupCandidate(
  ops: OfflineMutation[],
  candidate: Pick<OfflineMutation, "entity" | "action" | "payload">
): OfflineMutation | null {
  return (
    ops.find(
      (o) =>
        isRetryable(o.status) && sameMutation(o, candidate)
    ) || null
  );
}

export function fingerprint(op: OfflineMutation): string {
  return `${op.entity}:${op.action}:${op.hospitalId}:${JSON.stringify(op.payload)}`;
}

/** Payload key used to look up the cached entity an op will produce. */
export function opTargetKey(op: OfflineMutation): string | null {
  const raw = op.payload?.id ?? op.payload?._clientId ?? null;
  if (typeof raw === "string" && raw) return `${op.entity}::${raw}`;
  return null;
}
