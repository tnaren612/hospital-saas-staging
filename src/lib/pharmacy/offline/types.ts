/**
 * Enterprise Pharmacy — Offline-First Core Types
 *
 * The pharmacy keeps working with no internet:
 *  - mutations are queued (IndexedDB) and applied optimistically to the local cache
 *  - a background sync engine pushes the queue when online and pulls server rows
 *  - conflicts resolve last-write-wins (by updatedAt) and are always audited
 */

export type SyncEntity =
  | "settings"
  | "branch"
  | "shift"
  | "sale"
  | "return"
  | "held_bill"
  | "medicine"
  | "customer"
  | "supplier"
  | "purchase_order"
  | "category";

export type SyncOpAction = "create" | "update" | "delete";

export type SyncOpStatus =
  | "pending"
  | "syncing"
  | "applied"
  | "failed"
  | "conflict"
  | "blocked"
  | "dropped";

export type OfflineMutation = {
  id: string;
  hospitalId: string;
  entity: SyncEntity;
  action: SyncOpAction;
  payload: Record<string, unknown>;
  /** Local entity key the op targets after apply (entity::id), if known. */
  targetKey?: string | null;
  seq: number;
  createdAt: string;
  status: SyncOpStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string | null;
  lastAttemptAt?: string | null;
};

export type CachedEntity<T = unknown> = {
  entity: SyncEntity;
  id: string;
  hospitalId: string;
  data: T;
  updatedAt: string;
  deletedAt?: string | null;
};

export type OfflineAuditEntry = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  entity: SyncEntity;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
};

export type OfflineMeta = Record<string, string>;

export type SyncStats = {
  lastSyncAt: string | null;
  lastAttemptAt: string | null;
  pendingCount: number;
  failedCount: number;
  blockedCount: number;
  appliedCount: number;
  lastError: string | null;
};

export type SyncResult = {
  pushed: number;
  failed: number;
  blocked: number;
  dropped: number;
  pulled: number;
  conflicts: number;
  errors: string[];
};

export type IntegrityCheck = {
  ok: boolean;
  checkedAt: string;
  checks: Array<{
    entity: SyncEntity;
    counted: number;
    recorded: number;
    match: boolean;
  }>;
  /** Present when the check could not run (e.g. storage unavailable). */
  error?: string;
};

/** Pull request: entity + ISO timestamp of last sync (inclusive boundary). */
export type PullRequest = {
  entity: SyncEntity;
  sinceIso: string;
  limit?: number;
};

/** Push request sent to the sync API. */
export type PushRequest = {
  ops: OfflineMutation[];
};

export type PushResultItem = {
  opId: string;
  ok: boolean;
  error?: string | null;
  conflict?: boolean;
  /** Entity has no server apply support yet — keep queued, never drop. */
  blocked?: boolean;
  serverId?: string | null;
  updatedAt?: string | null;
};

export type PushResult = {
  results: PushResultItem[];
  serverTime: string;
};

export type PullResultItem<T = unknown> = {
  id: string;
  updatedAt: string;
  data: T;
};

export type PullResult<T = unknown> = {
  entity: SyncEntity;
  rows: PullResultItem<T>[];
  serverTime: string;
};

/** Transport used by the sync engine (the sync API route implements it). */
export type SyncTransport = {
  push(req: PushRequest): Promise<PushResult>;
  pull<T = unknown>(req: PullRequest): Promise<PullResult<T>>;
};
