/**
 * Enterprise Pharmacy — Offline Storage
 *
 * IndexedDB-backed storage (browser) with an in-memory twin (tests/SSR).
 * Stores:
 *   queue    — pending mutations (append-only log, seq ordered)
 *   entities — cached entity rows (key: "entity::id")
 *   meta     — kv (last sync timestamps, counters, import batches)
 *   audit    — offline audit trail
 */

import type {
  CachedEntity,
  OfflineAuditEntry,
  OfflineMutation,
  SyncEntity,
} from "./types";

export type EntityRecord = CachedEntity;

export interface OfflineStorage {
  init(): Promise<void>;
  /**
   * Deterministic readiness gate: every public operation awaits this before
   * touching the database. Idempotent — concurrent callers share ONE
   * initialization lifecycle (single IndexedDB open). Resolves when the DB
   * is open; rejects with a stable error when initialization has failed.
   */
  ensureReady(): Promise<void>;
  isReady(): boolean;
  /** Forget a failed initialization so a later call can retry (manual recovery). */
  reset?(): void;

  // --- queue ---
  enqueue(op: Omit<OfflineMutation, "seq">): Promise<OfflineMutation>;
  nextSeq(): Promise<number>;
  listQueue(
    statuses?: OfflineMutation["status"][],
    limit?: number
  ): Promise<OfflineMutation[]>;
  updateOp(
    id: string,
    patch: Partial<OfflineMutation>
  ): Promise<OfflineMutation | null>;
  removeOp(id: string): Promise<void>;
  clearQueue(): Promise<number>;

  // --- cache ---
  putEntity<T>(
    entity: SyncEntity,
    id: string,
    data: T,
    hospitalId: string,
    updatedAt?: string,
    deletedAt?: string | null
  ): Promise<void>;
  getEntity<T>(entity: SyncEntity, id: string): Promise<CachedEntity<T> | null>;
  listEntities<T>(
    entity: SyncEntity,
    hospitalId?: string
  ): Promise<CachedEntity<T>[]>;
  countEntities(entity: SyncEntity): Promise<number>;
  deleteEntity(entity: SyncEntity, id: string): Promise<void>;

  // --- meta ---
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  deleteMeta(key: string): Promise<void>;

  // --- audit ---
  appendAudit(entry: Omit<OfflineAuditEntry, "id" | "ts">): Promise<void>;
  listAudit(limit?: number): Promise<OfflineAuditEntry[]>;

  // --- events (client) ---
  subscribe(listener: () => void): () => void;
  notify(): void;
}

export function entityKey(entity: SyncEntity, id: string): string {
  return `${entity}::${id}`;
}

export function keyEntityParts(key: string): {
  entity: SyncEntity;
  id: string;
} {
  const sep = key.indexOf("::");
  return {
    entity: key.slice(0, sep) as SyncEntity,
    id: key.slice(sep + 2),
  };
}

export function createUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// In-memory implementation (tests, SSR, fallback when IndexedDB unavailable)
// ============================================================================

export class MemoryOfflineStorage implements OfflineStorage {
  private ready = true;
  private seqCounter = 0;
  private queue = new Map<string, OfflineMutation>();
  private entities = new Map<string, EntityRecord>();
  private meta = new Map<string, string>();
  private audit: OfflineAuditEntry[] = [];
  private listeners = new Set<() => void>();

  async init(): Promise<void> {
    this.ready = true;
  }
  async ensureReady(): Promise<void> {
    this.ready = true;
  }
  isReady(): boolean {
    return this.ready;
  }

  async enqueue(
    op: Omit<OfflineMutation, "seq">
  ): Promise<OfflineMutation> {
    const full: OfflineMutation = {
      ...op,
      seq: this.seqCounter++,
      createdAt: op.createdAt || new Date().toISOString(),
    };
    this.queue.set(full.id, full);
    this.notify();
    return full;
  }

  async nextSeq(): Promise<number> {
    return this.seqCounter;
  }

  async listQueue(
    statuses?: OfflineMutation["status"][],
    limit?: number
  ): Promise<OfflineMutation[]> {
    let items = [...this.queue.values()].sort((a, b) => a.seq - b.seq);
    if (statuses) items = items.filter((o) => statuses.includes(o.status));
    if (limit && limit > 0) items = items.slice(0, limit);
    return items;
  }

  async updateOp(
    id: string,
    patch: Partial<OfflineMutation>
  ): Promise<OfflineMutation | null> {
    const cur = this.queue.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.queue.set(id, next);
    this.notify();
    return next;
  }

  async removeOp(id: string): Promise<void> {
    this.queue.delete(id);
    this.notify();
  }

  async clearQueue(): Promise<number> {
    const n = this.queue.size;
    this.queue.clear();
    this.notify();
    return n;
  }

  async putEntity<T>(
    entity: SyncEntity,
    id: string,
    data: T,
    hospitalId: string,
    updatedAt?: string,
    deletedAt?: string | null
  ): Promise<void> {
    this.entities.set(entityKey(entity, id), {
      entity,
      id,
      hospitalId,
      data,
      updatedAt: updatedAt || new Date().toISOString(),
      deletedAt: deletedAt ?? null,
    });
    this.notify();
  }

  async getEntity<T>(
    entity: SyncEntity,
    id: string
  ): Promise<CachedEntity<T> | null> {
    const rec = this.entities.get(entityKey(entity, id));
    return (rec as CachedEntity<T>) || null;
  }

  async listEntities<T>(
    entity: SyncEntity,
    hospitalId?: string
  ): Promise<CachedEntity<T>[]> {
    const items: CachedEntity<T>[] = [];
    for (const rec of this.entities.values()) {
      if (rec.entity !== entity) continue;
      if (hospitalId && rec.hospitalId !== hospitalId) continue;
      if (rec.deletedAt) continue;
      items.push(rec as CachedEntity<T>);
    }
    return items.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  }

  async countEntities(entity: SyncEntity): Promise<number> {
    let n = 0;
    for (const rec of this.entities.values()) {
      if (rec.entity === entity && !rec.deletedAt) n++;
    }
    return n;
  }

  async deleteEntity(entity: SyncEntity, id: string): Promise<void> {
    this.entities.delete(entityKey(entity, id));
    this.notify();
  }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }
  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
    this.notify();
  }
  async deleteMeta(key: string): Promise<void> {
    this.meta.delete(key);
    this.notify();
  }

  async appendAudit(entry: Omit<OfflineAuditEntry, "id" | "ts">): Promise<void> {
    this.audit.push({
      ...entry,
      id: createUuid(),
      ts: new Date().toISOString(),
    });
    if (this.audit.length > 500) this.audit.splice(0, this.audit.length - 500);
    this.notify();
  }

  async listAudit(limit = 100): Promise<OfflineAuditEntry[]> {
    return [...this.audit].reverse().slice(0, limit);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify(): void {
    for (const l of this.listeners) l();
  }
}

// ============================================================================
// IndexedDB implementation (browser)
// ============================================================================

const DB_NAME = "ssh-pharmacy-offline";
const DB_VERSION = 1;

/** Exported for tests that need a clean database per case. */
export const OFFLINE_DB_NAME = DB_NAME;

export class IndexedDbOfflineStorage implements OfflineStorage {
  private db: IDBDatabase | null = null;
  private ready = false;
  /** Single shared initialization lifecycle — all concurrent callers await it. */
  private initPromise: Promise<void> | null = null;
  /** Stable failure: once set, ensureReady() rejects immediately (no retry loop). */
  private initError: Error | null = null;
  private listeners = new Set<() => void>();

  /**
   * Idempotent entry point. Safe to call any number of times — Strict Mode
   * double effects, hooks and direct consumers all share one open lifecycle.
   */
  async init(): Promise<void> {
    return this.ensureReady();
  }

  async ensureReady(): Promise<void> {
    if (this.ready) return;
    if (this.initError) throw this.initError;
    if (!this.initPromise) {
      this.initPromise = this.openDatabase().catch((err: unknown) => {
        this.initError =
          err instanceof Error ? err : new Error(String(err));
        this.initPromise = null;
        this.notify();
        throw this.initError;
      });
    }
    return this.initPromise;
  }

  /** Forget a failure so a later call can attempt initialization again. */
  reset(): void {
    this.initError = null;
    this.initPromise = null;
    this.ready = false;
    this.db = null;
  }

  /**
   * Close the underlying connection (test cleanup / app teardown). A later
   * operation re-opens the database through the normal readiness gate.
   */
  close(): void {
    this.db?.close();
    this.db = null;
    this.ready = false;
    this.initPromise = null;
  }

  private async openDatabase(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("queue")) {
          const store = db.createObjectStore("queue", { keyPath: "id" });
          store.createIndex("seq", "seq");
          store.createIndex("status", "status");
        }
        if (!db.objectStoreNames.contains("entities")) {
          const store = db.createObjectStore("entities", { keyPath: "key" });
          store.createIndex("entity", "entity");
          store.createIndex("updatedAt", "updatedAt");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("audit")) {
          const store = db.createObjectStore("audit", { keyPath: "id" });
          store.createIndex("ts", "ts");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
    this.ready = true;
    this.notify();
  }

  isReady(): boolean {
    return this.ready;
  }

  private async tx(
    store: string,
    mode: IDBTransactionMode = "readonly"
  ): Promise<IDBObjectStore> {
    await this.ensureReady();
    return this.db!.transaction(store, mode).objectStore(store);
  }

  private req<T>(r: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error("IndexedDB error"));
    });
  }

  async enqueue(op: Omit<OfflineMutation, "seq">): Promise<OfflineMutation> {
    const full: OfflineMutation = {
      ...op,
      seq: await this.nextSeq(),
      createdAt: op.createdAt || new Date().toISOString(),
    };
    await this.req((await this.tx("queue", "readwrite")).put(full));
    this.notify();
    return full;
  }

  async nextSeq(): Promise<number> {
    const store = await this.tx("queue");
    const all = await this.req<OfflineMutation[]>(store.getAll() as IDBRequest<OfflineMutation[]>);
    return all.reduce((m, o) => Math.max(m, o.seq), -1) + 1;
  }

  async listQueue(
    statuses?: OfflineMutation["status"][],
    limit?: number
  ): Promise<OfflineMutation[]> {
    const all = await this.req<OfflineMutation[]>(
      (await this.tx("queue")).getAll() as IDBRequest<OfflineMutation[]>
    );
    let items = all.sort((a, b) => a.seq - b.seq);
    if (statuses) items = items.filter((o) => statuses.includes(o.status));
    if (limit && limit > 0) items = items.slice(0, limit);
    return items;
  }

  async updateOp(
    id: string,
    patch: Partial<OfflineMutation>
  ): Promise<OfflineMutation | null> {
    const store = await this.tx("queue", "readwrite");
    const cur = await this.req<OfflineMutation | undefined>(
      store.get(id) as IDBRequest<OfflineMutation | undefined>
    );
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await this.req(store.put(next));
    this.notify();
    return next;
  }

  async removeOp(id: string): Promise<void> {
    await this.req((await this.tx("queue", "readwrite")).delete(id));
    this.notify();
  }

  async clearQueue(): Promise<number> {
    const store = await this.tx("queue", "readwrite");
    const all = await this.req<OfflineMutation[]>(store.getAll() as IDBRequest<OfflineMutation[]>);
    await this.req(store.clear());
    this.notify();
    return all.length;
  }

  async putEntity<T>(
    entity: SyncEntity,
    id: string,
    data: T,
    hospitalId: string,
    updatedAt?: string,
    deletedAt?: string | null
  ): Promise<void> {
    await this.req(
      (await this.tx("entities", "readwrite")).put({
        key: entityKey(entity, id),
        entity,
        id,
        hospitalId,
        data,
        updatedAt: updatedAt || new Date().toISOString(),
        deletedAt: deletedAt ?? null,
      })
    );
    this.notify();
  }

  async getEntity<T>(
    entity: SyncEntity,
    id: string
  ): Promise<CachedEntity<T> | null> {
    const rec = await this.req<EntityRecord | undefined>(
      (await this.tx("entities")).get(entityKey(entity, id)) as IDBRequest<EntityRecord | undefined>
    );
    return (rec as CachedEntity<T>) || null;
  }

  async listEntities<T>(
    entity: SyncEntity,
    hospitalId?: string
  ): Promise<CachedEntity<T>[]> {
    const all = await this.req<EntityRecord[]>(
      (await this.tx("entities")).getAll() as IDBRequest<EntityRecord[]>
    );
    const items = all
      .filter((r) => r.entity === entity)
      .filter((r) => (hospitalId ? r.hospitalId === hospitalId : true))
      .filter((r) => !r.deletedAt);
    return (items as CachedEntity<T>[]).sort((a, b) =>
      a.updatedAt.localeCompare(b.updatedAt)
    );
  }

  async countEntities(entity: SyncEntity): Promise<number> {
    return (await this.listEntities(entity)).length;
  }

  async deleteEntity(entity: SyncEntity, id: string): Promise<void> {
    await this.req((await this.tx("entities", "readwrite")).delete(entityKey(entity, id)));
    this.notify();
  }

  async getMeta(key: string): Promise<string | null> {
    const rec = await this.req<{ key: string; value: string } | undefined>(
      (await this.tx("meta")).get(key) as IDBRequest<{ key: string; value: string } | undefined>
    );
    return rec?.value ?? null;
  }
  async setMeta(key: string, value: string): Promise<void> {
    await this.req((await this.tx("meta", "readwrite")).put({ key, value }));
    this.notify();
  }
  async deleteMeta(key: string): Promise<void> {
    await this.req((await this.tx("meta", "readwrite")).delete(key));
    this.notify();
  }

  async appendAudit(entry: Omit<OfflineAuditEntry, "id" | "ts">): Promise<void> {
    await this.req(
      (await this.tx("audit", "readwrite")).put({
        ...entry,
        id: createUuid(),
        ts: new Date().toISOString(),
      })
    );
    this.notify();
  }

  async listAudit(limit = 100): Promise<OfflineAuditEntry[]> {
    const all = await this.req<OfflineAuditEntry[]>(
      (await this.tx("audit")).getAll() as IDBRequest<OfflineAuditEntry[]>
    );
    return all.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify(): void {
    for (const l of this.listeners) l();
  }
}

// ============================================================================
// Singleton (browser → IndexedDB; elsewhere → memory)
// ============================================================================

let singleton: OfflineStorage | null = null;

export function getOfflineStorage(): OfflineStorage {
  if (!singleton) {
    const canIndexedDb =
      typeof indexedDB !== "undefined" && typeof window !== "undefined";
    singleton = canIndexedDb
      ? new IndexedDbOfflineStorage()
      : new MemoryOfflineStorage();
  }
  return singleton;
}

export function resetOfflineStorage(): void {
  singleton = null;
}
