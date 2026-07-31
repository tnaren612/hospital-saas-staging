/**
 * Enterprise Pharmacy — Offline-First public API
 * Re-exports, client hooks and the default HTTP transport.
 */

import { useEffect, useState } from "react";
import {
  getOfflineStorage,
  type OfflineStorage,
} from "./storage";
import type { CachedEntity } from "./types";
import { findDedupCandidate } from "./queue";
import { SyncEngine } from "./sync";
import type {
  OfflineMutation,
  PullRequest,
  PushRequest,
  PushResult,
  PullResult,
  SyncEntity,
  SyncResult,
  SyncTransport,
  IntegrityCheck,
  SyncStats,
} from "./types";

export * from "./types";
export * from "./storage";
export * from "./queue";
export * from "./sync";

// ============================================================================
// HTTP transport → /api/admin/pharmacy/sync (auth via same-origin session)
// ============================================================================

export function createHttpSyncTransport(baseUrl = ""): SyncTransport {
  return {
    async push(req: PushRequest): Promise<PushResult> {
      const res = await fetch(`${baseUrl}/api/admin/pharmacy/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: PushResult;
        error?: string;
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error || `Sync push failed (${res.status})`);
      }
      return json.data;
    },
    async pull<T = unknown>(req: PullRequest): Promise<PullResult<T>> {
      const qs = new URLSearchParams({
        entity: req.entity,
        since: req.sinceIso,
        limit: String(req.limit ?? 500),
      });
      const res = await fetch(
        `${baseUrl}/api/admin/pharmacy/sync?${qs.toString()}`,
        { credentials: "same-origin" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        data?: PullResult<T>;
        error?: string;
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error || `Sync pull failed (${res.status})`);
      }
      return json.data;
    },
  };
}

// ============================================================================
// Mutation entry point — dedupe → enqueue → optimistic cache → audit
// ============================================================================

export async function enqueueMutation(
  storage: OfflineStorage,
  input: Omit<OfflineMutation, "seq" | "createdAt" | "status" | "attempts" | "maxAttempts">,
  opts?: { optimistic?: boolean; actor?: string }
): Promise<OfflineMutation | null> {
  const pending = await storage.listQueue();
  const dup = findDedupCandidate(pending, input);
  if (dup) return dup;

  const op: OfflineMutation = {
    ...input,
    seq: 0,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    maxAttempts: 12,
  };
  const saved = await storage.enqueue(op);

  if (opts?.optimistic !== false && op.targetKey) {
    const parts = op.targetKey.split("::");
    await storage.putEntity(
      op.entity,
      parts[1],
      op.payload,
      op.hospitalId,
      new Date().toISOString()
    );
  }
  await storage.appendAudit({
    actor: opts?.actor || "cashier",
    action: "mutation.enqueued",
    entity: op.entity,
    entityId: op.targetKey?.split("::")[1] || null,
    details: { opId: op.id, action: op.action },
  });
  return saved;
}

// ============================================================================
// Client hooks
// ============================================================================

/** Re-render on every offline store change (queue, cache, meta, audit). */
export function useOfflineStore(): OfflineStorage {
  const [, force] = useState(0);
  useEffect(() => {
    const storage = getOfflineStorage();
    void storage.init();
    return storage.subscribe(() => force((v) => v + 1));
  }, []);
  return getOfflineStorage();
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setOnline(isOnlineNow());
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function isOnlineNow(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

/** Singleton engine for the session. */
export function getSyncEngine(
  opts?: { actor?: string; pullEntities?: SyncEntity[]; baseUrl?: string }
): SyncEngine {
  const key = opts?.baseUrl || "";
  if (!engines.has(key)) {
    engines.set(
      key,
      new SyncEngine({
        storage: getOfflineStorage(),
        transport: createHttpSyncTransport(key),
        actor: opts?.actor || "cashier",
        pullEntities: opts?.pullEntities,
      })
    );
  }
  return engines.get(key)!;
}

const engines = new Map<string, SyncEngine>();

export type OfflineSyncHookState = {
  online: boolean;
  stats: SyncStats;
  syncing: boolean;
  lastResult: SyncResult | null;
  integrity: IntegrityCheck | null;
};

export function useOfflineSync(
  opts?: { actor?: string; autoSync?: boolean; pullEntities?: SyncEntity[] }
): OfflineSyncHookState & {
  syncNow: () => Promise<SyncResult>;
  verify: () => Promise<IntegrityCheck>;
} {
  const storage = useOfflineStore();
  const online = useOnlineStatus();
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityCheck | null>(null);
  const [stats, setStats] = useState<SyncStats>({
    lastSyncAt: null,
    lastAttemptAt: null,
    pendingCount: 0,
    failedCount: 0,
    blockedCount: 0,
    appliedCount: 0,
    lastError: null,
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const engine = getSyncEngine(opts);
      const s = await engine.stats();
      if (alive) setStats(s);
    })();
    return () => {
      alive = false;
    };
  }, [storage]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncNow = async (): Promise<SyncResult> => {
    setSyncing(true);
    try {
      const engine = getSyncEngine(opts);
      const result = await engine.syncNow();
      setLastResult(result);
      setStats(await engine.stats());
      return result;
    } finally {
      setSyncing(false);
    }
  };

  const verify = async (): Promise<IntegrityCheck> => {
    const engine = getSyncEngine(opts);
    const check = await engine.verifyIntegrity();
    setIntegrity(check);
    return check;
  };

  useEffect(() => {
    if (!opts?.autoSync) return;
    if (!online) return;
    void syncNow();
  }, [online, opts?.autoSync]); // eslint-disable-line react-hooks/exhaustive-deps

  void storage;

  return { online, stats, syncing, lastResult, integrity, syncNow, verify };
}

/** Subscribe to a cached entity list (auto-refreshes on storage changes). */
export function useOfflineEntities<T>(
  entity: SyncEntity,
  hospitalId?: string
): CachedEntity<T>[] {
  const storage = useOfflineStore();
  const [items, setItems] = useState<CachedEntity<T>[]>([]);
  useEffect(() => {
    let alive = true;
    void storage.listEntities<T>(entity, hospitalId).then((rows) => {
      if (alive) setItems(rows);
    });
    return () => {
      alive = false;
    };
  }, [storage, entity, hospitalId]);
  return items;
}
