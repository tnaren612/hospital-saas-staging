/**
 * M7 Hybrid Sync — offline→online engine: retry, conflict, watermark,
 * blocked-op healing, and duplicate-push idempotency.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryOfflineStorage } from "../../src/lib/pharmacy/offline/storage";
import { SyncEngine } from "../../src/lib/pharmacy/offline/sync";
import { enqueueMutation } from "../../src/lib/pharmacy/offline/index";
import {
  applyCloudMedicine,
  applyCloudSale,
  LAST_SYNC_WATERMARK_KEY,
  MemoryHybridCloudStore,
} from "../../src/lib/pharmacy/hybrid-apply";
import type {
  OfflineMutation,
  PullResult,
  PushResult,
  SyncTransport,
} from "../../src/lib/pharmacy/offline/types";

const HOSPITAL = "11111111-1111-1111-1111-111111111111";
const MED_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function medOp(): Omit<OfflineMutation, "seq" | "createdAt" | "status" | "attempts" | "maxAttempts"> {
  return {
    id: MED_ID,
    hospitalId: HOSPITAL,
    entity: "medicine",
    action: "create",
    payload: {
      id: MED_ID,
      name: "Offline Cash Med",
      sku: "8901",
      barcode: "8901",
      stock_qty: 15,
      selling_price: 40,
    },
    targetKey: `medicine::${MED_ID}`,
  };
}

function saleOp(id = "sale-op-1"): Omit<
  OfflineMutation,
  "seq" | "createdAt" | "status" | "attempts" | "maxAttempts"
> {
  return {
    id,
    hospitalId: HOSPITAL,
    entity: "sale",
    action: "create",
    payload: {
      sale_number: "LOC-HYBRID-1",
      patient_name: "Walk-in Customer",
      sale_type: "walk_in",
      items: [{ medicine_id: MED_ID, name: "Offline Cash Med", qty: 1, price: 40 }],
      subtotal: 40,
      discount: 0,
      tax: 0,
      grand_total: 40,
      payment_method: "cash",
      amount_paid: 40,
      amount_returned: 0,
    },
    targetKey: `sale::${id}`,
  };
}

function applyingTransport(cloud: MemoryHybridCloudStore): SyncTransport {
  return {
    async push(req) {
      const results = [];
      for (const op of req.ops) {
        try {
          if (op.entity === "medicine") {
            const applied = await applyCloudMedicine(cloud, op.payload, HOSPITAL);
            results.push({ opId: op.id, ok: true, serverId: applied.id });
          } else if (op.entity === "sale") {
            const applied = await applyCloudSale(cloud, op.payload, HOSPITAL);
            results.push({ opId: op.id, ok: true, serverId: applied.id });
          } else {
            results.push({
              opId: op.id,
              ok: false,
              blocked: true,
              error: `no server apply for entity "${op.entity}" yet`,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "failed";
          results.push({
            opId: op.id,
            ok: false,
            conflict: /insufficient/i.test(message),
            error: message,
          });
        }
      }
      return { serverTime: new Date().toISOString(), results } satisfies PushResult;
    },
    async pull<T = unknown>(): Promise<PullResult<T>> {
      return { entity: "sale", rows: [], serverTime: new Date().toISOString() };
    },
  };
}

describe("M7 hybrid sync engine", () => {
  it("offline→online: medicine then sale apply once; replay does not duplicate", async () => {
    const storage = new MemoryOfflineStorage();
    await storage.init();
    const cloud = new MemoryHybridCloudStore();
    await enqueueMutation(storage, medOp());
    await enqueueMutation(storage, saleOp());

    const engine = new SyncEngine({
      storage,
      transport: applyingTransport(cloud),
      pullEntities: ["sale"],
    });
    const first = await engine.syncNow();
    assert.equal(first.pushed, 2);
    assert.equal(first.conflicts, 0);
    assert.equal((await storage.listQueue()).length, 0);
    assert.equal(cloud.sales.length, 1);
    assert.equal(String(cloud.sales[0].sale_number), "LOC-HYBRID-1");
    assert.equal(Number(cloud.medicines[0].stock_qty), 14);
    assert.ok(await storage.getMeta(LAST_SYNC_WATERMARK_KEY));

    // Duplicate enqueue of the same committed sale (what a confused retry would do).
    await enqueueMutation(storage, saleOp("sale-op-replay"));
    const second = await engine.syncNow();
    assert.equal(second.pushed, 1);
    assert.equal(cloud.sales.length, 1, "still exactly one cloud sale");
    assert.equal(Number(cloud.medicines[0].stock_qty), 14, "stock deducted once");
  });

  it("sale-before-medicine conflicts; retry after medicine apply succeeds once", async () => {
    const storage = new MemoryOfflineStorage();
    await storage.init();
    const cloud = new MemoryHybridCloudStore();
    await enqueueMutation(storage, saleOp());

    const engine = new SyncEngine({
      storage,
      transport: applyingTransport(cloud),
    });
    const failed = await engine.syncNow();
    assert.equal(failed.conflicts, 1);
    assert.equal(cloud.sales.length, 0);

    const [sale] = await storage.listQueue();
    assert.equal(sale.status, "conflict");
    await engine.retryOp(sale.id);
    await enqueueMutation(storage, medOp());

    // Medicine is seq-later; push is seq-ordered so sale would still run first.
    // Manual retry of the sale after medicine is applied on the replica:
    await applyCloudMedicine(cloud, medOp().payload, HOSPITAL);
    await storage.updateOp(sale.id, {
      status: "pending",
      lastAttemptAt: null,
      attempts: 0,
    });
    const recovered = await engine.syncNow();
    assert.equal(recovered.conflicts, 0);
    assert.equal(cloud.sales.length, 1);
    assert.equal(Number(cloud.medicines[0].stock_qty), 14);
  });

  it("heals previously blocked medicine ops now that apply exists", async () => {
    const storage = new MemoryOfflineStorage();
    await storage.init();
    const cloud = new MemoryHybridCloudStore();
    const blocked = await storage.enqueue({
      ...medOp(),
      createdAt: new Date().toISOString(),
      status: "blocked",
      attempts: 1,
      maxAttempts: 12,
      lastError: 'no server apply for entity "medicine" yet',
    });
    assert.equal(blocked.status, "blocked");

    const engine = new SyncEngine({
      storage,
      transport: applyingTransport(cloud),
    });
    const res = await engine.syncNow();
    assert.equal(res.pushed, 1);
    assert.equal(cloud.medicines.length, 1);
    assert.equal((await storage.listQueue()).length, 0);
  });

  it("retryOp resets failed/conflict to pending without duplicating the op", async () => {
    const storage = new MemoryOfflineStorage();
    await storage.init();
    await storage.enqueue({
      ...saleOp(),
      createdAt: new Date().toISOString(),
      status: "failed",
      attempts: 3,
      maxAttempts: 12,
      lastError: "boom",
      lastAttemptAt: new Date().toISOString(),
    });
    const engine = new SyncEngine({
      storage,
      transport: applyingTransport(new MemoryHybridCloudStore()),
    });
    const reset = await engine.retryOp("sale-op-1");
    assert.equal(reset?.status, "pending");
    assert.equal(reset?.attempts, 0);
    assert.equal((await storage.listQueue()).length, 1);
  });

  it("network failure then recovery still applies exactly once", async () => {
    const storage = new MemoryOfflineStorage();
    await storage.init();
    const cloud = new MemoryHybridCloudStore();
    await enqueueMutation(storage, medOp());
    await enqueueMutation(storage, saleOp());

    let attempts = 0;
    const inner = applyingTransport(cloud);
    const transport: SyncTransport = {
      async push(req) {
        attempts += 1;
        if (attempts === 1) {
          const { CloudError } = await import("../../src/lib/pharmacy/offline/cloud");
          throw new CloudError("network", "fetch failed", 500);
        }
        return inner.push(req);
      },
      pull: inner.pull,
    };
    const engine = new SyncEngine({ storage, transport });
    const first = await engine.syncNow();
    assert.equal(first.pushed, 0);
    assert.equal((await storage.listQueue()).length, 2);

    await storage.updateOp(MED_ID, { lastAttemptAt: new Date(Date.now() - 120_000).toISOString() });
    await storage.updateOp("sale-op-1", {
      lastAttemptAt: new Date(Date.now() - 120_000).toISOString(),
    });
    const second = await engine.syncNow();
    assert.equal(second.pushed, 2);
    assert.equal(cloud.sales.length, 1);
    assert.equal(Number(cloud.medicines[0].stock_qty), 14);
  });
});
