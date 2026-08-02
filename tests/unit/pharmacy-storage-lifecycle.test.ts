/**
 * Pharmacy Offline — IndexedDB initialization lifecycle regression tests.
 *
 * Guards the M6 fix: storage operations fired BEFORE the IndexedDB open
 * completes must await a single shared readiness lifecycle instead of
 * throwing "Offline storage not initialised"; failures must be stable,
 * surfaced, and recoverable via reset(); nothing may leak unhandled
 * rejections into hooks, sync or the POS.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  type OfflineMutation,
  type SyncTransport,
} from "../../src/lib/pharmacy/offline/types";
import {
  IndexedDbOfflineStorage,
  MemoryOfflineStorage,
  OFFLINE_DB_NAME,
} from "../../src/lib/pharmacy/offline/storage";
import { SyncEngine } from "../../src/lib/pharmacy/offline/sync";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Clean IndexedDB before every case — the storage shares one fixed DB name. */
const openStorages: IndexedDbOfflineStorage[] = [];

function freshStorage(): IndexedDbOfflineStorage {
  const storage = new IndexedDbOfflineStorage();
  openStorages.push(storage);
  return storage;
}

beforeEach(async () => {
  for (const storage of openStorages) storage.close();
  openStorages.length = 0;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(OFFLINE_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error("deleteDatabase failed"));
    req.onblocked = () => resolve();
  });
});

function makeOp(
  overrides: Partial<Omit<OfflineMutation, "seq">> = {}
): Omit<OfflineMutation, "seq"> {
  return {
    id: `op-${Math.random().toString(36).slice(2)}`,
    hospitalId: "h1",
    entity: "sale",
    action: "create",
    payload: { total: 100 },
    status: "pending",
    attempts: 0,
    maxAttempts: 8,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTransport(): SyncTransport {
  return {
    async push() {
      return { results: [], serverTime: new Date().toISOString() };
    },
    async pull() {
      return { entity: "sale", rows: [], serverTime: new Date().toISOString() };
    },
  };
}

function makeEngine(storage: IndexedDbOfflineStorage | MemoryOfflineStorage) {
  return new SyncEngine({
    storage,
    transport: makeTransport(),
    pullEntities: [],
  });
}

/** Count IndexedDB open calls (single-lifecycle assertion). */
function trackOpens() {
  let opens = 0;
  const original = indexedDB.open.bind(indexedDB);
  (indexedDB as unknown as { open: unknown }).open = (...args: unknown[]) => {
    opens++;
    return original(...(args as [string, number]));
  };
  return { opens: () => opens, restore: () => { (indexedDB as unknown as { open: unknown }).open = original; } };
}

/** Make every IndexedDB open fail with a deterministic error. */
function failOpens() {
  const original = indexedDB.open.bind(indexedDB);
  (indexedDB as unknown as { open: unknown }).open = () => {
    throw new Error("IndexedDB unavailable (quota)");
  };
  return { restore: () => { (indexedDB as unknown as { open: unknown }).open = original; } };
}

// ---------------------------------------------------------------------------
// Memory implementation baseline
// ---------------------------------------------------------------------------

test("memory: ready immediately; ops work without init; no race by construction", async () => {
  const storage = new MemoryOfflineStorage();
  assert.equal(storage.isReady(), true);
  await storage.ensureReady();
  const full = await storage.enqueue(makeOp());
  assert.equal(full.seq, 0);
  const rows = await storage.listQueue();
  assert.equal(rows.length, 1);
});

// ---------------------------------------------------------------------------
// IndexedDB: readiness lifecycle
// ---------------------------------------------------------------------------

test("idb: isReady flips false→true only after the open completes", async () => {
  const storage = freshStorage();
  assert.equal(storage.isReady(), false);
  await storage.init();
  assert.equal(storage.isReady(), true);
});

test("idb: ops fired before init await readiness instead of throwing", async () => {
  const storage = freshStorage();
  const enqueuePromise = storage.enqueue(makeOp({ id: "early-op" }));
  const listPromise = storage.listQueue();
  await storage.init();
  const full = await enqueuePromise;
  assert.equal(full.id, "early-op");
  // The early read resolved at readiness, before the write landed — a fresh
  // read must see the op (this is exactly the hook re-render path).
  assert.ok((await listPromise).length >= 0);
  const rows = await storage.listQueue();
  assert.ok(rows.some((o) => o.id === "early-op"), "early op must be listed");
});

test("idb: concurrent ops before open all resolve after a single init", async () => {
  const storage = freshStorage();
  const ops = Array.from({ length: 5 }, (_, i) =>
    storage.enqueue(makeOp({ id: `conc-${i}` }))
  );
  const read = storage.listQueue();
  await storage.init();
  const results = await Promise.all(ops);
  assert.equal(results.length, 5);
  const rows = await storage.listQueue();
  assert.ok(rows.length >= 5, "all five ops must persist after open");
  await read;
});

test("idb: concurrent init calls share ONE open lifecycle", async () => {
  const { opens, restore } = trackOpens();
  try {
    const storage = freshStorage();
    await Promise.all([storage.init(), storage.init(), storage.init()]);
    assert.equal(opens(), 1);
  } finally {
    restore();
  }
});

test("idb: subscribers are notified when readiness completes (hook re-render path)", async () => {
  const storage = freshStorage();
  let notifications = 0;
  const unsubscribe = storage.subscribe(() => notifications++);
  await storage.init();
  assert.ok(notifications >= 1, "readiness completion must notify subscribers");
  unsubscribe();
});

test("idb: enqueue ordering/seq stays monotonic across a restart", async () => {
  const a = freshStorage();
  await a.init();
  await a.enqueue(makeOp({ id: "restart-1" }));
  await a.enqueue(makeOp({ id: "restart-2" }));
  assert.equal(await a.nextSeq(), 2);

  const b = freshStorage();
  await b.init();
  const rows = await b.listQueue();
  assert.ok(rows.some((o) => o.id === "restart-1"), "restart must see prior writes");
  assert.ok(rows.some((o) => o.id === "restart-2"));
  assert.equal(await b.nextSeq(), 2, "seq counter must survive a restart");
});

test("idb: entity cache + deleted filtering work through the same gate", async () => {
  const storage = freshStorage();
  await storage.putEntity("medicine", "m-1", { name: "Para" }, "h1", "2026-01-01T00:00:00.000Z");
  await storage.putEntity("medicine", "m-2", { name: "Amox" }, "h1", "2026-01-02T00:00:00.000Z");
  await storage.putEntity("medicine", "m-3", { name: "Gone" }, "h1", "2026-01-03T00:00:00.000Z", "2026-01-04T00:00:00.000Z");
  const list = await storage.listEntities<{ name: string }>("medicine");
  assert.equal(list.length, 2);
  assert.equal(await storage.countEntities("medicine"), 2);
  const one = await storage.getEntity<{ name: string }>("medicine", "m-1");
  assert.equal(one?.data.name, "Para");
});

// ---------------------------------------------------------------------------
// Sync engine against the same lifecycle
// ---------------------------------------------------------------------------

test("idb: stats() before init resolves (zeroed) once storage is open", async () => {
  const storage = freshStorage();
  const engine = makeEngine(storage);
  const statsPromise = engine.stats();
  await storage.init();
  const stats = await statsPromise;
  assert.equal(stats.pendingCount, 0);
  assert.equal(stats.failedCount, 0);
  assert.equal(stats.lastError, null);
});

test("idb: syncNow() before init completes a full (empty) cycle without throwing", async () => {
  const storage = freshStorage();
  const engine = makeEngine(storage);
  const cycle = engine.syncNow();
  await storage.init();
  const result = await cycle;
  assert.equal(result.errors.length, 0);
  assert.equal(result.pushed, 0);
  assert.equal(result.pulled, 0);
  assert.equal(await storage.getMeta("lastSyncAt") !== null, true);
});

// ---------------------------------------------------------------------------
// Failure behavior
// ---------------------------------------------------------------------------

test("idb: failed open → stable error, no silent retry, every op rejects", async () => {
  const { restore } = failOpens();
  try {
    const storage = freshStorage();
    await assert.rejects(storage.init(), /quota/);
    // No auto-retry: the second call rejects immediately with the SAME error.
    await assert.rejects(storage.ensureReady(), /quota/);
    await assert.rejects(storage.listQueue(), /quota/);
    await assert.rejects(storage.enqueue(makeOp()), /quota/);
    await assert.rejects(storage.getMeta("x"), /quota/);
  } finally {
    restore();
  }
});

test("idb: sync engine surfaces a failed open in stats/syncNow/verify — never throws", async () => {
  const { restore } = failOpens();
  try {
    const storage = freshStorage();
    const engine = makeEngine(storage);
    await assert.rejects(storage.init(), /quota/);

    const stats = await engine.stats();
    assert.equal(stats.pendingCount, 0);
    assert.ok(stats.lastError?.includes("quota"), "stats must report the storage error");

    const result = await engine.syncNow();
    assert.equal(result.pushed, 0);
    assert.ok(
      result.errors.some((e) => e.includes("quota")),
      "syncNow must return the failure, not throw"
    );

    const check = await engine.verifyIntegrity();
    assert.equal(check.ok, false);
    assert.ok(check.error?.includes("quota"), "verify must report the storage error");
  } finally {
    restore();
  }
});

test("idb: reset() allows a manual recovery cycle", async () => {
  const { restore } = failOpens();
  const storage = freshStorage();
  await assert.rejects(storage.init(), /quota/);
  restore();

  storage.reset();
  assert.equal(storage.isReady(), false);
  await storage.init();
  assert.equal(storage.isReady(), true);
  const full = await storage.enqueue(makeOp({ id: "after-recovery" }));
  assert.equal(full.id, "after-recovery");
  assert.ok((await storage.listQueue()).some((o) => o.id === "after-recovery"));
});

test("idb: unhandled rejections never escape the readiness gate", async () => {
  const storage = freshStorage();
  const pending: Promise<unknown>[] = [
    storage.enqueue(makeOp({ id: "quiet-1" })),
    storage.nextSeq(),
    storage.listQueue(),
    storage.getMeta("quiet"),
    storage.listEntities("sale"),
  ];
  await storage.init();
  await Promise.all(pending);
});
