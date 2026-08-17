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
import {
  CLOUD_UNAVAILABLE_MSG,
  CloudError,
  classifyFetchError,
  isCloudUnavailable,
} from "./cloud";
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
export * from "./cloud";

// ============================================================================
// HTTP transport → /api/admin/pharmacy/sync (auth via same-origin session)
// ============================================================================

/** Classify a non-ok sync response; 401/403 stay auth failures, never offline. */
function classifyTransportError(
  res: Response,
  json: { error?: string }
): CloudError {
  const bodyError = json.error ?? null;
  const kind = classifyFetchError(new Error(bodyError || `HTTP ${res.status}`), {
    status: res.status,
    bodyError,
  });
  const message = isCloudUnavailable(kind)
    ? CLOUD_UNAVAILABLE_MSG
    : bodyError || `Sync request failed (${res.status})`;
  return new CloudError(kind, message, res.status);
}

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
        throw classifyTransportError(res, json);
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
        throw classifyTransportError(res, json);
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
    void storage.init().catch(() => {
      // Storage failure is surfaced through isReady()/useStorageHealth();
      // every storage operation rejects with the stable init error.
    });
    return storage.subscribe(() => force((v) => v + 1));
  }, []);
  return getOfflineStorage();
}

/**
 * Storage readiness/health for UI (e.g. POS banner). Reflects the
 * deterministic initialization lifecycle: `ready` flips true only after the
 * IndexedDB open succeeds; `error` is set once a real failure occurs (and
 * stays stable — no silent retry loop). Manual recovery goes through
 * storage.reset().
 */
export function useStorageHealth(): {
  ready: boolean;
  error: string | null;
} {
  const storage = useOfflineStore();
  const [state, setState] = useState<{ ready: boolean; error: string | null }>({
    ready: storage.isReady(),
    error: null,
  });
  useEffect(() => {
    let alive = true;
    void storage
      .ensureReady()
      .then(() => {
        if (alive) setState({ ready: true, error: null });
      })
      .catch((err: unknown) => {
        if (alive) {
          setState({
            ready: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [storage]);
  return state;
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
  retryOp: (id: string) => Promise<void>;
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
    } catch (err) {
      // Engine never throws by contract, but guard the hook boundary too.
      const message =
        err instanceof Error ? err.message : "Sync failed";
      const failed: SyncResult = {
        pushed: 0,
        failed: 0,
        blocked: 0,
        dropped: 0,
        pulled: 0,
        conflicts: 0,
        errors: [message],
      };
      setLastResult(failed);
      setStats((prev) => ({ ...prev, lastError: message }));
      return failed;
    } finally {
      setSyncing(false);
    }
  };

  const retryOp = async (id: string): Promise<void> => {
    const engine = getSyncEngine(opts);
    await engine.retryOp(id);
    setStats(await engine.stats());
  };

  const verify = async (): Promise<IntegrityCheck> => {
    try {
      const engine = getSyncEngine(opts);
      const check = await engine.verifyIntegrity();
      setIntegrity(check);
      return check;
    } catch (err) {
      const check: IntegrityCheck = {
        ok: false,
        checkedAt: new Date().toISOString(),
        checks: [],
        error: err instanceof Error ? err.message : "storage unavailable",
      };
      setIntegrity(check);
      return check;
    }
  };

  useEffect(() => {
    if (!opts?.autoSync) return;
    if (!online) return;
    // syncNow never throws and waits for storage readiness internally.
    void syncNow();
  }, [online, opts?.autoSync]); // eslint-disable-line react-hooks/exhaustive-deps

  return { online, stats, syncing, lastResult, integrity, syncNow, verify, retryOp };
}

/** Subscribe to a cached entity list (auto-refreshes on storage changes). */
export function useOfflineEntities<T>(
  entity: SyncEntity,
  hospitalId?: string
): CachedEntity<T>[] {
  const storage = useOfflineStore();
  const [items, setItems] = useState<CachedEntity<T>[]>([]);
  const [tick, setTick] = useState(0);

  // Re-read on every store change (queue/cache writes notify subscribers).
  // This also covers the init completion: opening the DB notifies, the tick
  // bumps and the load effect below runs against a ready store.
  useEffect(() => {
    return storage.subscribe(() => setTick((t) => t + 1));
  }, [storage]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await storage.ensureReady();
        const rows = await storage.listEntities<T>(entity, hospitalId);
        if (alive) setItems(rows);
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [storage, entity, hospitalId, tick]);
  return items;
}
