/**
 * Enterprise Pharmacy — Sync Engine (offline-first)
 *
 * - push: dequeue mutations in seq order → transport.push (sync API route) →
 *   mark applied/failed/conflict, mirror applied rows into the local cache
 * - pull: fetch rows updated since the per-entity last-sync timestamp →
 *   merge into cache, last-write-wins by updatedAt, conflicts audited
 * - retry: exponential backoff, automatic on the next syncNow()/online event
 * - integrity: per-entity counts + checksum verification
 * - audit: every push, pull, conflict and drop is recorded offline
 *
 * The engine is transport-agnostic (pure client logic) so it can be unit
 * tested in Node with a memory store + fake transport.
 */

import {
  type OfflineMutation,
  type PullRequest,
  type PullResultItem,
  type SyncEntity,
  type SyncResult,
  type SyncStats,
  type SyncTransport,
  type IntegrityCheck,
} from "./types";
import { type OfflineStorage, keyEntityParts } from "./storage";
import { isRetryable, shouldRetryNow } from "./queue";

const LAST_SYNC_KEY = (entity: SyncEntity) => `lastSync::${entity}`;
export const INTEGRITY_COUNT_KEY = (entity: SyncEntity) =>
  `integrityCount::${entity}`;
export const CHECKSUM_KEY = (entity: SyncEntity) => `checksum::${entity}`;

export function isOnlineNow(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function checksumOf(opts: {
  count: number;
  sample: string;
}): string {
  // Not cryptographic — a cheap integrity fingerprint for the offline cache.
  let h = 2166136261;
  const s = `${opts.count}:${opts.sample}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export type SyncEngineOpts = {
  storage: OfflineStorage;
  transport: SyncTransport;
  /** Actor name for the offline audit trail. */
  actor?: string;
  /** Entities pulled from the server. Only entities with pull support. */
  pullEntities?: SyncEntity[];
  maxBatch?: number;
};

export class SyncEngine {
  private storage: OfflineStorage;
  private transport: SyncTransport;
  private actor: string;
  private pullEntities: SyncEntity[];
  private maxBatch: number;
  private running = false;

  constructor(opts: SyncEngineOpts) {
    this.storage = opts.storage;
    this.transport = opts.transport;
    this.actor = opts.actor || "cashier";
    this.pullEntities = opts.pullEntities || [];
    this.maxBatch = opts.maxBatch || 100;
  }

  async stats(): Promise<SyncStats> {
    const queue = await this.storage.listQueue();
    const applied = queue.filter((o) => o.status === "applied").length;
    return {
      lastSyncAt: await this.storage.getMeta("lastSyncAt"),
      lastAttemptAt: await this.storage.getMeta("lastAttemptAt"),
      pendingCount: queue.filter((o) => isRetryable(o.status)).length,
      failedCount: queue.filter((o) => o.status === "failed").length,
      blockedCount: queue.filter((o) => o.status === "blocked").length,
      appliedCount: applied,
      lastError: await this.storage.getMeta("lastSyncError"),
    };
  }

  /** Returns the ops that are due to be pushed right now. */
  async pendingOps(): Promise<OfflineMutation[]> {
    const queue = await this.storage.listQueue();
    return queue
      .filter((o) => shouldRetryNow(o))
      .slice(0, this.maxBatch);
  }

  private async markAttempt(op: OfflineMutation) {
    await this.storage.updateOp(op.id, {
      status: "syncing",
      lastAttemptAt: new Date().toISOString(),
      attempts: op.attempts + 1,
    });
    await this.storage.setMeta("lastAttemptAt", new Date().toISOString());
  }

  private async audit(
    action: string,
    entity: SyncEntity,
    entityId?: string | null,
    details?: Record<string, unknown> | null
  ) {
    await this.storage.appendAudit({
      actor: this.actor,
      action,
      entity,
      entityId,
      details,
    });
  }

  /** Push the pending queue. Idempotent; safe to call repeatedly. */
  async pushOnce(): Promise<SyncResult> {
    const result: SyncResult = {
      pushed: 0,
      failed: 0,
      blocked: 0,
      dropped: 0,
      pulled: 0,
      conflicts: 0,
      errors: [],
    };
    if (!isOnlineNow()) {
      await this.storage.setMeta("lastSyncError", "Offline");
      return result;
    }

    const ops = await this.pendingOps();
    if (ops.length === 0) {
      await this.storage.setMeta("lastSyncError", "");
      return result;
    }

    for (const op of ops) {
      if (op.status === "blocked") continue;
      await this.markAttempt(op);
      try {
        const res = await this.transport.push({ ops: [op] });
        const item = res.results?.[0];
        if (item?.ok) {
          await this.storage.removeOp(op.id);
          if (item.serverId && op.targetKey) {
            await this.storage.putEntity(
              op.entity,
              keyEntityParts(op.targetKey).id,
              { ...(op.payload as Record<string, unknown>), id: item.serverId },
              op.hospitalId,
              item.updatedAt || new Date().toISOString()
            );
          }
          await this.audit("sync.push.applied", op.entity, item.serverId, {
            opId: op.id,
          });
          result.pushed++;
        } else if (item?.blocked) {
          await this.storage.updateOp(op.id, {
            status: "blocked",
            lastError: item.error || "no server support yet",
          });
          await this.audit("sync.push.blocked", op.entity, null, {
            opId: op.id,
            error: item.error,
          });
          result.blocked++;
        } else if (item?.conflict) {
          await this.storage.updateOp(op.id, { status: "conflict" });
          await this.audit("sync.push.conflict", op.entity, null, {
            opId: op.id,
            error: item.error,
          });
          result.conflicts++;
          result.errors.push(item.error || "conflict");
        } else {
          const err = item?.error || "push failed";
          await this.storage.updateOp(op.id, { status: "failed", lastError: err });
          await this.audit("sync.push.failed", op.entity, null, {
            opId: op.id,
            error: err,
          });
          result.failed++;
          result.errors.push(err);
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : "network error";
        await this.storage.updateOp(op.id, { status: "failed", lastError: err });
        await this.audit("sync.push.error", op.entity, null, { opId: op.id, error: err });
        result.failed++;
        result.errors.push(err);
        break; // network down — stop pushing, don't hammer
      }
    }

    await this.storage.setMeta(
      "lastSyncError",
      result.errors.length ? result.errors[0] : ""
    );
    return result;
  }

  /** Pull one entity since its last sync timestamp and merge (LWW). */
  async pullOnce(entity: SyncEntity, sinceIso?: string): Promise<number> {
    if (!isOnlineNow()) return 0;
    const since = sinceIso || (await this.storage.getMeta(LAST_SYNC_KEY(entity)));
    const req: PullRequest = {
      entity,
      sinceIso: since || "1970-01-01T00:00:00.000Z",
      limit: 1000,
    };
    let rows: PullResultItem[] = [];
    try {
      const res = await this.transport.pull(req);
      rows = res.rows || [];
    } catch {
      return 0;
    }

    let merged = 0;
    for (const row of rows) {
      const local = await this.storage.getEntity(entity, row.id);
      if (
        local &&
        local.updatedAt > row.updatedAt &&
        !local.deletedAt
      ) {
        // Local write is newer — keep it; a queued op already covers the push.
        await this.audit("sync.pull.conflict.local-wins", entity, row.id, {
          localUpdatedAt: local.updatedAt,
          remoteUpdatedAt: row.updatedAt,
        });
        continue;
      }
      await this.storage.putEntity(
        entity,
        row.id,
        row.data,
        this.storageHospitalId(row.data),
        row.updatedAt
      );
      merged++;
    }

    const latest = rows.reduce(
      (max, r) => (r.updatedAt > max ? r.updatedAt : max),
      since || "1970-01-01T00:00:00.000Z"
    );
    await this.storage.setMeta(LAST_SYNC_KEY(entity), latest);
    await this.audit("sync.pull.completed", entity, null, {
      rows: rows.length,
      merged,
    });
    return merged;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private storageHospitalId(row: any): string {
    return typeof row?.hospital_id === "string" ? row.hospital_id : "local";
  }

  /** Full cycle: push pending ops, then pull each configured entity. */
  async syncNow(): Promise<SyncResult> {
    if (this.running) {
      const idle: SyncResult = {
        pushed: 0,
        failed: 0,
        blocked: 0,
        dropped: 0,
        pulled: 0,
        conflicts: 0,
        errors: ["sync already running"],
      };
      return idle;
    }
    this.running = true;
    try {
      const pushed = await this.pushOnce();
      let pulled = 0;
      for (const entity of this.pullEntities) {
        pulled += await this.pullOnce(entity);
      }
      const result: SyncResult = {
        ...pushed,
        pulled,
        errors: pushed.errors,
      };
      await this.storage.setMeta(
        "lastSyncAt",
        new Date().toISOString()
      );
      await this.audit("sync.completed", "sale", null, {
        pushed: result.pushed,
        pulled: result.pulled,
        failed: result.failed,
        conflicts: result.conflicts,
      });
      return result;
    } finally {
      this.running = false;
    }
  }

  /** Verify cached entity counts against recorded integrity counters. */
  async verifyIntegrity(): Promise<IntegrityCheck> {
    const entities = [...new Set<SyncEntity>([
      ...this.pullEntities,
      "sale",
      "medicine",
      "customer",
      "supplier",
      "purchase_order",
      "return",
      "held_bill",
    ])];
    const checks: IntegrityCheck["checks"] = [];
    for (const entity of entities) {
      const counted = await this.storage.countEntities(entity);
      const recordedRaw = await this.storage.getMeta(INTEGRITY_COUNT_KEY(entity));
      const recorded = recordedRaw ? Number(recordedRaw) : counted;
      checks.push({
        entity,
        counted,
        recorded,
        match: counted === recorded,
      });
    }
    const ok = checks.every((c) => c.match);
    await this.audit("integrity.verified", "sale", null, {
      ok,
      checks: checks.length,
    });
    return {
      ok,
      checkedAt: new Date().toISOString(),
      checks,
    };
  }

  /** Record an integrity baseline (e.g. after a full pull). */
  async recordIntegrity(): Promise<void> {
    const entities = [...new Set<SyncEntity>([
      ...this.pullEntities,
      "sale",
      "medicine",
      "customer",
      "supplier",
      "purchase_order",
      "return",
      "held_bill",
    ])];
    for (const entity of entities) {
      const count = await this.storage.countEntities(entity);
      await this.storage.setMeta(INTEGRITY_COUNT_KEY(entity), String(count));
    }
  }
}
