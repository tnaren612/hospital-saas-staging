/**
 * Pharmacy M6 — Cloud failure classification, offline-first bootstrap,
 * queue preservation and recovery. Regression tests for the "fetch failed"
 * UX: only genuine cloud/network unavailability degrades to offline mode;
 * 401/403 never do; local storage failures stay blocking.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CloudError,
  CLOUD_UNAVAILABLE_MSG,
  SESSION_EXPIRED_MSG,
  classifyFetchError,
  createCloudMonitor,
  isCloudUnavailable,
  runBootstrap,
} from "../../src/lib/pharmacy/offline/cloud";
import { MemoryOfflineStorage } from "../../src/lib/pharmacy/offline/storage";
import { SyncEngine } from "../../src/lib/pharmacy/offline/sync";
import {
  createHttpSyncTransport,
} from "../../src/lib/pharmacy/offline/index";
import {
  buildMedicineIndex,
  findMedicineByBarcode,
} from "../../src/lib/pharmacy/barcode/scan";
import type {
  CachedEntity,
  SyncTransport,
} from "../../src/lib/pharmacy/offline/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeOp(over: Partial<{ id: string; lastAttemptAt: string }> = {}) {
  return {
    id: over.id ?? "op-1",
    hospitalId: "h1",
    entity: "sale" as const,
    action: "create" as const,
    payload: { sale_number: "PH-1", grand_total: 100 },
    targetKey: "sale::PH-1",
    seq: 0,
    createdAt: "2026-07-31T00:00:00.000Z",
    status: "pending" as const,
    attempts: 0,
    maxAttempts: 12,
    lastAttemptAt: over.lastAttemptAt ?? null,
  };
}

function networkTransport(): SyncTransport {
  return {
    async push() {
      throw new CloudError("network", "fetch failed", 500);
    },
    async pull() {
      throw new CloudError("network", "fetch failed", 500);
    },
  };
}

function authTransport(kind: "unauthorized" | "forbidden"): SyncTransport {
  return {
    async push() {
      throw new CloudError(kind, kind === "unauthorized" ? "Unauthorized" : "Forbidden", kind === "unauthorized" ? 401 : 403);
    },
    async pull() {
      throw new CloudError(kind, kind === "unauthorized" ? "Unauthorized" : "Forbidden", kind === "unauthorized" ? 401 : 403);
    },
  };
}

const okFetchers = {
  dashboard: async () => ({
    ok: true as const,
    data: { settings: { pharmacist_name: "A" }, hospital: { name: "H" } },
  }),
  medicines: async () => ({
    ok: true as const,
    data: [{ id: "m1", name: "Para", selling_price: 10, barcode: "8901234567890" }],
  }),
};

// ---------------------------------------------------------------------------
// 1. Classification model
// ---------------------------------------------------------------------------

test("classify: TypeError 'fetch failed' / 'Failed to fetch' → network (cloud unavailable)", () => {
  assert.equal(classifyFetchError(new TypeError("fetch failed")), "network");
  assert.equal(classifyFetchError(new TypeError("Failed to fetch")), "network");
  assert.equal(classifyFetchError(new Error("connect ECONNREFUSED")), "network");
  assert.ok(isCloudUnavailable(classifyFetchError(new TypeError("fetch failed"))));
});

test("classify: 500 from these routes (Supabase died) → network, not server", () => {
  assert.equal(
    classifyFetchError(new Error("Pull failed"), { status: 500, bodyError: "Pull failed" }),
    "network"
  );
  assert.equal(
    classifyFetchError(new Error("HTTP 500"), { status: 500, bodyError: "Internal Server Error" }),
    "network"
  );
});

test("classify: genuine server errors stay server, never offline", () => {
  assert.equal(classifyFetchError(new Error("boom"), { status: 500, bodyError: "boom" }), "server");
  assert.equal(classifyFetchError(new Error("bad request"), { status: 400 }), "server");
  assert.equal(classifyFetchError(new Error("unknown"), { status: 500, bodyError: "boom" }), "server");
});

test("classify: 401 → unauthorized and 403 → forbidden (never 'offline')", () => {
  assert.equal(classifyFetchError(new Error("Unauthorized"), { status: 401 }), "unauthorized");
  assert.equal(classifyFetchError(new Error("Forbidden"), { status: 403 }), "forbidden");
  assert.equal(isCloudUnavailable("unauthorized"), false);
  assert.equal(isCloudUnavailable("forbidden"), false);
});

test("classify: CloudError passthrough and empty-error default", () => {
  assert.equal(classifyFetchError(new CloudError("forbidden", "nope", 403)), "forbidden");
  assert.equal(classifyFetchError(new Error("")), "network");
});

// ---------------------------------------------------------------------------
// 2. Bootstrap: cloud failure + cache
// ---------------------------------------------------------------------------

test("bootstrap: network failure with cache → POS stays usable (cached catalog)", async () => {
  const storage = new MemoryOfflineStorage();
  await storage.putEntity("medicine", "m1", { id: "m1", name: "Para", selling_price: 10, barcode: "8901234567890" }, "local");

  const outcome = await runBootstrap(
    {
      dashboard: async () => ({ ok: false as const, kind: "network" as const, message: "fetch failed" }),
      medicines: async () => ({ ok: false as const, kind: "network" as const, message: "fetch failed" }),
    },
    storage
  );

  assert.equal(outcome.catalogState, "cached");
  assert.equal(outcome.cloudKind, "network");
  assert.equal(outcome.authKind, null);
  assert.equal(outcome.errorKind, null);
  // Cache is still fully readable — search/scan continue against it.
  const cached = await storage.listEntities("medicine");
  assert.equal(cached.length, 1);
});

test("bootstrap: network failure with NO cache → explicit catalog-unavailable state", async () => {
  const storage = new MemoryOfflineStorage();
  const outcome = await runBootstrap(
    {
      dashboard: async () => ({ ok: false as const, kind: "network" as const, message: "fetch failed" }),
      medicines: async () => ({ ok: false as const, kind: "network" as const, message: "fetch failed" }),
    },
    storage
  );
  assert.equal(outcome.catalogState, "empty");
  assert.equal(outcome.cloudKind, "network");
});

test("bootstrap: successful fetch persists the catalog into the local cache", async () => {
  const storage = new MemoryOfflineStorage();
  const outcome = await runBootstrap(okFetchers, storage);
  assert.equal(outcome.catalogState, "fresh");
  assert.equal(outcome.medicines.length, 1);
  const cached = await storage.listEntities("medicine");
  assert.equal(cached.length, 1);
  assert.equal((cached[0].data as { barcode: string }).barcode, "8901234567890");
  assert.notEqual(await storage.getMeta("medicineCatalogAt"), null);
});

// ---------------------------------------------------------------------------
// 3. Bootstrap: auth/server/storage are NOT offline
// ---------------------------------------------------------------------------

test("bootstrap: 401 is an auth failure, not offline mode", async () => {
  const storage = new MemoryOfflineStorage();
  await storage.putEntity("medicine", "m1", { id: "m1", name: "Para" }, "local");
  const outcome = await runBootstrap(
    {
      dashboard: async () => ({ ok: false as const, kind: "unauthorized" as const, message: "Unauthorized" }),
      medicines: async () => ({ ok: false as const, kind: "unauthorized" as const, message: "Unauthorized" }),
    },
    storage
  );
  assert.equal(outcome.authKind, "unauthorized");
  assert.equal(outcome.cloudKind, null);
  assert.equal(outcome.catalogState, "error");
});

test("bootstrap: 403 is a permission failure, not offline mode", async () => {
  const storage = new MemoryOfflineStorage();
  const outcome = await runBootstrap(
    {
      dashboard: async () => ({ ok: false as const, kind: "forbidden" as const, message: "Forbidden" }),
      medicines: async () => ({ ok: false as const, kind: "forbidden" as const, message: "Forbidden" }),
    },
    storage
  );
  assert.equal(outcome.authKind, "forbidden");
  assert.equal(outcome.cloudKind, null);
  assert.equal(outcome.catalogState, "error");
});

test("bootstrap: local storage failure stays a blocking error", async () => {
  const storage = new MemoryOfflineStorage();
  // Storage that throws on write — simulates a broken IndexedDB.
  const broken = {
    ...storage,
    putEntity: async () => {
      throw new Error("QuotaExceededError");
    },
    listEntities: async () => {
      throw new Error("QuotaExceededError");
    },
  };
  const outcome = await runBootstrap(
    {
      dashboard: async () => ({ ok: true as const, data: { settings: {}, hospital: {} } }),
      medicines: async () => okFetchers.medicines(),
    },
    broken as unknown as MemoryOfflineStorage
  );
  assert.equal(outcome.errorKind, "storage");
  assert.equal(outcome.cloudKind, null);
  assert.equal(outcome.catalogState, "error");
});

// ---------------------------------------------------------------------------
// 4. Sync: network failure preserves the queue, no spam
// ---------------------------------------------------------------------------

test("sync: network failure keeps ops pending (queue preserved, no error toast entries)", async () => {
  const storage = new MemoryOfflineStorage();
  await storage.init();
  await storage.enqueue(makeOp());
  const engine = new SyncEngine({ storage, transport: networkTransport(), pullEntities: ["sale"] });

  const result = await engine.syncNow();
  assert.equal(result.errors.length, 0, "network failure must not toast");
  assert.equal(result.failed, 0, "network failure must not mark ops failed");

  const [op] = await storage.listQueue();
  assert.equal(op.id, "op-1");
  assert.equal(op.status, "pending", "op must stay pending for retry");
  assert.equal(op.attempts, 0, "network failures must not burn attempt budget");
  assert.equal(await storage.getMeta("lastSyncError"), CLOUD_UNAVAILABLE_MSG);
  assert.equal(await storage.getMeta("lastSyncAt"), null, "no successful sync to record");
});

test("sync: repeated network failures → no duplication, no loss, stable message", async () => {
  const storage = new MemoryOfflineStorage();
  await storage.init();
  await storage.enqueue(makeOp());
  const engine = new SyncEngine({ storage, transport: networkTransport(), pullEntities: [] });

  await engine.syncNow();
  // Model time passing: the op's backoff window has elapsed, so it is due again.
  await storage.updateOp("op-1", { lastAttemptAt: new Date(Date.now() - 120_000).toISOString() });
  await engine.syncNow();
  await storage.updateOp("op-1", { lastAttemptAt: new Date(Date.now() - 120_000).toISOString() });
  await engine.syncNow();

  const queue = await storage.listQueue();
  assert.equal(queue.length, 1, "exactly one queued op — no duplication");
  assert.equal(queue[0].id, "op-1", "no loss");
  assert.equal(queue[0].status, "pending");
  assert.equal(queue[0].attempts, 0);
});

test("sync: 401 stays an auth failure — never becomes 'working offline'", async () => {
  const storage = new MemoryOfflineStorage();
  await storage.init();
  await storage.enqueue(makeOp());
  const engine = new SyncEngine({ storage, transport: authTransport("unauthorized"), pullEntities: [] });

  const result = await engine.syncNow();
  assert.ok(result.errors.some((e) => e.includes("Session expired")), "auth error must surface");
  assert.equal(await storage.getMeta("lastSyncError"), SESSION_EXPIRED_MSG);
  assert.equal(await storage.getMeta("lastSyncAt"), null);
  const [op] = await storage.listQueue();
  assert.equal(op.status, "failed", "auth failure marks the op failed — never pending-offline");
});

test("sync: 403 stays a permission failure — never becomes 'working offline'", async () => {
  const storage = new MemoryOfflineStorage();
  await storage.init();
  await storage.enqueue(makeOp());
  const engine = new SyncEngine({ storage, transport: authTransport("forbidden"), pullEntities: [] });

  const result = await engine.syncNow();
  assert.ok(result.errors.some((e) => e.includes("forbidden")));
  assert.notEqual(await storage.getMeta("lastSyncError"), CLOUD_UNAVAILABLE_MSG);
});

test("sync: recovery — cloud returns, retry pushes the preserved queue", async () => {
  const storage = new MemoryOfflineStorage();
  await storage.init();
  await storage.enqueue(makeOp());

  let attempts = 0;
  const transport: SyncTransport = {
    async push(req) {
      attempts++;
      if (attempts === 1) throw new CloudError("network", "fetch failed", 500);
      return {
        serverTime: "2026-08-02T00:00:00.000Z",
        results: req.ops.map((o) => ({ opId: o.id, ok: true, serverId: "srv-1" })),
      };
    },
    async pull() {
      return { entity: "sale", rows: [], serverTime: "2026-08-02T00:00:00.000Z" };
    },
  };
  const engine = new SyncEngine({ storage, transport, pullEntities: [] });

  const first = await engine.syncNow();
  assert.equal(first.pushed, 0);
  assert.equal((await storage.listQueue()).length, 1);

  // Backoff window elapses, cloud is back.
  await storage.updateOp("op-1", { lastAttemptAt: new Date(Date.now() - 120_000).toISOString() });
  const second = await engine.syncNow();
  assert.equal(second.pushed, 1);
  assert.equal((await storage.listQueue()).length, 0, "queue drains after recovery");
  assert.notEqual(await storage.getMeta("lastSyncAt"), null);
});

// ---------------------------------------------------------------------------
// 5. HTTP transport classification (real fetch → CloudError)
// ---------------------------------------------------------------------------

test("transport: non-ok responses throw classified CloudErrors", async () => {
  const transport = createHttpSyncTransport();
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Pull failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
    await assert.rejects(
      transport.pull({ entity: "sale", sinceIso: "1970-01-01T00:00:00.000Z" }),
      (err: unknown) =>
        err instanceof CloudError &&
        err.kind === "network" &&
        err.message === CLOUD_UNAVAILABLE_MSG
    );

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
    await assert.rejects(
      transport.pull({ entity: "sale", sinceIso: "1970-01-01T00:00:00.000Z" }),
      (err: unknown) => err instanceof CloudError && err.kind === "unauthorized" && err.status === 401
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 6. Cloud monitor: reachability states
// ---------------------------------------------------------------------------

function manualSchedule() {
  const tasks: Array<{ fn: () => void; ms: number; id: number }> = [];
  let nextId = 1;
  return {
    schedule: (fn: () => void, ms: number) => {
      const task = { fn, ms, id: nextId++ };
      tasks.push(task);
      return task.id;
    },
    cancel: (handle: unknown) => {
      const i = tasks.findIndex((t) => t.id === handle);
      if (i >= 0) tasks.splice(i, 1);
    },
    pending: () => tasks.map((t) => t.ms).sort((a, b) => a - b),
    runNext: () => {
      const task = tasks.shift();
      if (task) task.fn();
    },
  };
}

test("monitor: navigator.onLine=true but Supabase unreachable → cloud becomes unavailable", async () => {
  const sched = manualSchedule();
  const states: string[] = [];
  const monitor = createCloudMonitor({
    probe: async () => "network",
    navigatorOnline: () => true, // browser thinks it is online
    schedule: sched.schedule,
    cancel: sched.cancel,
    probeUnavailableMs: 15_000,
    onState: (state) => states.push(state),
  });
  monitor.start();
  await Promise.resolve();
  assert.equal(monitor.getState(), "unavailable");
  assert.deepEqual(states, ["unavailable"]);
  assert.deepEqual(sched.pending(), [15_000], "bounded backoff, no tight loop");
});

test("monitor: navigator offline → unavailable; probe recovery → connected", async () => {
  const sched = manualSchedule();
  const states: string[] = [];
  let online = false;
  let probeOk = false;
  const monitor = createCloudMonitor({
    probe: async () => (probeOk ? "ok" : "network"),
    navigatorOnline: () => online,
    schedule: sched.schedule,
    cancel: sched.cancel,
    onState: (state) => states.push(state),
  });
  monitor.start();
  await Promise.resolve();
  assert.equal(monitor.getState(), "unavailable");

  // Network comes back at the OS level; probe succeeds.
  online = true;
  probeOk = true;
  await monitor.refresh();
  assert.equal(monitor.getState(), "connected");
  assert.deepEqual(states, ["unavailable", "connected"]);
});

test("monitor: 401 from the probe → error state, never 'unavailable'", async () => {
  const sched = manualSchedule();
  const online = true;
  const monitor = createCloudMonitor({
    probe: async () => "unauthorized",
    navigatorOnline: () => online,
    schedule: sched.schedule,
    cancel: sched.cancel,
    onState: () => {},
  });
  monitor.start();
  await Promise.resolve();
  assert.equal(monitor.getState(), "error");
  assert.equal(monitor.getState() === "unavailable", false);
});

// ---------------------------------------------------------------------------
// 7. Scanner/catalog continuity with cloud unavailable
// ---------------------------------------------------------------------------

test("scanner: cached medicine exact barcode resolution works with no network", async () => {
  const cached: CachedEntity[] = [
    {
      entity: "medicine",
      id: "m1",
      hospitalId: "local",
      data: { id: "m1", name: "Paracetamol 500", sku: "8901234567890", selling_price: 10, stock_qty: 5 },
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      entity: "medicine",
      id: "m2",
      hospitalId: "local",
      data: { id: "m2", name: "ORS", barcode: "036000291450", selling_price: 25 },
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  // Same merge the POS performs (cached rows → indexed medicines with price).
  const medicines = cached.map((rec) => {
    const d = rec.data as Record<string, unknown>;
    return {
      id: rec.id,
      name: String(d.name ?? ""),
      sku: d.sku ? String(d.sku) : null,
      barcode: d.barcode ? String(d.barcode) : null,
      selling_price: d.selling_price ?? null,
    };
  });
  const index = buildMedicineIndex(medicines);
  const found = findMedicineByBarcode(index, "036000291450");
  assert.ok(found, "exact barcode must resolve from cache alone");
  assert.equal(found.id, "m2");
  assert.equal((found as unknown as { selling_price: number }).selling_price, 25);
});
