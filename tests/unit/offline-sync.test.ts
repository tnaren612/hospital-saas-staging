import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MemoryOfflineStorage,
  type OfflineStorage,
} from "../../src/lib/pharmacy/offline/storage";
import { SyncEngine } from "../../src/lib/pharmacy/offline/sync";
import {
  nextBackoffMs,
  shouldRetryNow,
  fingerprint,
  opTargetKey,
} from "../../src/lib/pharmacy/offline/queue";
import { enqueueMutation } from "../../src/lib/pharmacy/offline/index";
import type {
  OfflineMutation,
  PullResult,
  PullResultItem,
  PushResult,
  SyncTransport,
} from "../../src/lib/pharmacy/offline/types";

function makeOp(over: Partial<OfflineMutation> = {}): OfflineMutation {
  return {
    id: "op-1",
    hospitalId: "h1",
    entity: "sale",
    action: "create",
    payload: { sale_number: "PH-1", grand_total: 100 },
    targetKey: "sale::PH-1",
    seq: 0,
    createdAt: "2026-07-31T00:00:00.000Z",
    status: "pending",
    attempts: 0,
    maxAttempts: 12,
    ...over,
  };
}

describe("offline queue helpers", () => {
  it("computes exponential backoff that grows and stays capped", () => {
    // jitter floor is 0.85x base, so a first attempt can be as low as 850ms.
    assert.equal(nextBackoffMs({ ...makeOp(), attempts: 0 }) >= 850, true);
    assert.equal(nextBackoffMs({ ...makeOp(), attempts: 20 }) <= 60_000, true);
  });

  it("respects retry timing after an attempt", () => {
    const op = makeOp({ lastAttemptAt: new Date().toISOString() });
    assert.equal(shouldRetryNow(op), false);
    const old = makeOp({ lastAttemptAt: new Date(Date.now() - 120_000).toISOString() });
    assert.equal(shouldRetryNow(old), true);
  });

  it("never retries past maxAttempts or non-retryable statuses", () => {
    assert.equal(shouldRetryNow(makeOp({ attempts: 12, status: "pending" })), false);
    assert.equal(shouldRetryNow(makeOp({ status: "applied" })), false);
    assert.equal(shouldRetryNow(makeOp({ status: "blocked" })), false);
  });

  it("fingerprints op identity and derives the cache target key", () => {
    const a = makeOp();
    const b = makeOp();
    assert.equal(fingerprint(a), fingerprint(b));
    // opTargetKey is derived from the payload id/_clientId, not op.targetKey.
    const withId = makeOp({ payload: { id: "PH-1", grand_total: 100 } });
    assert.equal(opTargetKey(withId), "sale::PH-1");
  });

  it("dedupes a pending op with identical payload", async () => {
    const storage: OfflineStorage = new MemoryOfflineStorage();
    await storage.init();
    const first = await enqueueMutation(storage, {
      id: "op-1",
      hospitalId: "h1",
      entity: "sale",
      action: "create",
      payload: { sale_number: "PH-1", grand_total: 100 },
      targetKey: "sale::PH-1",
    });
    const dup = await enqueueMutation(storage, {
      id: "op-1",
      hospitalId: "h1",
      entity: "sale",
      action: "create",
      payload: { sale_number: "PH-1", grand_total: 100 },
      targetKey: "sale::PH-1",
    });
    assert.equal(first?.id, dup?.id); // same op, not duplicated
    assert.equal((await storage.listQueue()).length, 1);
  });
});

describe("SyncEngine", () => {
  it("pushes pending ops and removes them from the queue on success", async () => {
    const storage: OfflineStorage = new MemoryOfflineStorage();
    await storage.init();
    const transport: SyncTransport = {
      async push(req) {
        return {
          serverTime: "2026-07-31T00:00:00.000Z",
          results: req.ops.map((o) => ({
            opId: o.id,
            ok: true,
            serverId: "server-" + o.payload.sale_number,
          })),
        } satisfies PushResult;
      },
      async pull<T = unknown>(): Promise<PullResult<T>> {
        return { entity: "sale", rows: [], serverTime: "2026-07-31T00:00:00.000Z" };
      },
    };
    await enqueueMutation(storage, {
      id: "op-2",
      hospitalId: "h1",
      entity: "sale",
      action: "create",
      payload: { sale_number: "PH-1" },
      targetKey: "sale::PH-1",
    });

    const engine = new SyncEngine({ storage, transport, actor: "test" });
    const res = await engine.pushOnce();
    assert.equal(res.pushed, 1);
    assert.equal(res.failed, 0);
    assert.equal((await storage.listQueue()).length, 0);
  });

  it("marks failures as retryable and increments attempts", async () => {
    const storage: OfflineStorage = new MemoryOfflineStorage();
    await storage.init();
    const transport: SyncTransport = {
      async push() {
        return { serverTime: "x", results: [{ opId: "op-1", ok: false, error: "boom" }] };
      },
      async pull<T = unknown>(): Promise<PullResult<T>> {
        return { entity: "sale", rows: [], serverTime: "x" };
      },
    };
    await storage.enqueue(makeOp());
    const engine = new SyncEngine({ storage, transport });
    const res = await engine.pushOnce();
    assert.equal(res.failed, 1);
    const [op] = await storage.listQueue();
    assert.equal(op.status, "failed");
    assert.equal(op.attempts, 1);
  });

  it("keeps blocked ops forever (never drops invoices)", async () => {
    const storage: OfflineStorage = new MemoryOfflineStorage();
    await storage.init();
    const transport: SyncTransport = {
      async push() {
        return { serverTime: "x", results: [{ opId: "op-1", ok: false, blocked: true, error: "no endpoint" }] };
      },
      async pull<T = unknown>(): Promise<PullResult<T>> {
        return { entity: "sale", rows: [], serverTime: "x" };
      },
    };
    await storage.enqueue(makeOp());
    const engine = new SyncEngine({ storage, transport });
    const res = await engine.pushOnce();
    assert.equal(res.blocked, 1);
    assert.equal((await storage.listQueue()).length, 1);
    const stats = await engine.stats();
    assert.equal(stats.blockedCount, 1);
  });

  it("syncNow records lastSyncAt and the pull merge count", async () => {
    const storage: OfflineStorage = new MemoryOfflineStorage();
    await storage.init();
    const transport: SyncTransport = {
      async push() {
        return { serverTime: "x", results: [] };
      },
      async pull<T = unknown>(): Promise<PullResult<T>> {
        return {
          entity: "sale",
          rows: [
            { id: "s1", updatedAt: "2026-07-31T01:00:00.000Z", data: { sale_number: "PH-9" } } as unknown as PullResultItem<T>,
          ],
          serverTime: "x",
        };
      },
    };
    const engine = new SyncEngine({ storage, transport, pullEntities: ["sale"] });
    const res = await engine.syncNow();
    assert.equal(res.pulled, 1);
    assert.notEqual(await storage.getMeta("lastSyncAt"), null);
    const cached = await storage.getEntity<{ sale_number: string }>("sale", "s1");
    assert.equal(cached?.data.sale_number, "PH-9");
  });
});
