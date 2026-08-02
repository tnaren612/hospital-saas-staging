/**
 * Enterprise Pharmacy â€” Cloud Reachability & Offline-First Bootstrap
 *
 * A dead Supabase connection must never surface to the pharmacist as a generic
 * "fetch failed". This module classifies failures into distinct kinds and
 * decides what may degrade to offline operation:
 *
 *   network / offline   â†’ cloud unavailable â†’ degrade gracefully (offline mode)
 *   unauthorized(401)   â†’ session failure    â†’ NEVER "working offline"
 *   forbidden(403)      â†’ permission failure â†’ NEVER "working offline"
 *   server / malformed  â†’ real backend error â†’ surfaced, not hidden
 *   storage             â†’ local IndexedDB failure â†’ blocking billing error
 *
 * The core (classifier, bootstrap, monitor) is framework-free and unit tested.
 */

import type { OfflineStorage } from "./storage";

export type CloudFailureKind =
  | "network"
  | "offline"
  | "unauthorized"
  | "forbidden"
  | "server"
  | "storage";

export type CloudState = "connected" | "unavailable" | "syncing" | "error";

export const CLOUD_UNAVAILABLE_MSG =
  "Cloud unavailable â€” working offline (will retry automatically)";
export const SESSION_EXPIRED_MSG = "Session expired â€” please sign in again.";

export class CloudError extends Error {
  readonly kind: CloudFailureKind;
  readonly status: number | null;
  constructor(kind: CloudFailureKind, message: string, status: number | null = null) {
    super(message);
    this.name = "CloudError";
    this.kind = kind;
    this.status = status;
  }
}

/** Transport-level / gateway signatures of an unreachable cloud backend. */
const NETWORK_HINTS: RegExp[] = [
  /fetch failed/i,
  /failed to fetch/i,
  /network error/i,
  /networkerror/i,
  /load failed/i,
  /connection refused/i,
  /econn/i,
  /enotfound/i,
  /etimedout/i,
  /eai_/i,
  /und_err/i,
  /getaddrinfo/i,
  /socket hang up/i,
  /request timed out/i,
];

/** 5xx bodies produced by these routes ONLY when the Supabase backend died. */
const GATEWAY_HINTS: RegExp[] = [
  /internal server error/i,
  /pull failed/i,
  /push failed/i,
  /service unavailable/i,
  /bad gateway/i,
  /gateway timeout/i,
];

function matchesHints(message: string, hints: RegExp[]): boolean {
  return hints.some((re) => re.test(message));
}

export function isCloudUnavailable(kind: CloudFailureKind | null | undefined): boolean {
  return kind === "network" || kind === "offline";
}

/**
 * Classify an error into a failure kind. Order matters:
 * explicit 401/403 win over any network hint (a session failure is never
 * presented as offline); 5xx with gateway signatures count as cloud
 * unavailability; other 5xx are real server errors.
 */
export function classifyFetchError(
  err: unknown,
  res?: { status: number; bodyError?: string | null }
): CloudFailureKind {
  if (err instanceof CloudError) return err.kind;
  const message = err instanceof Error ? err.message : String(err ?? "");
  const text = [message, res?.bodyError].filter(Boolean).join(" ");

  if (res) {
    if (res.status === 401) return "unauthorized";
    if (res.status === 403) return "forbidden";
    if (res.status >= 400 && res.status < 500) return "server";
    if (matchesHints(text, NETWORK_HINTS)) return "network";
    if (res.status >= 500 && matchesHints(text, GATEWAY_HINTS)) return "network";
    if (res.status >= 500) return "server";
  }
  if (matchesHints(message, NETWORK_HINTS)) return "network";
  if (message) return "server";
  return "network";
}

export function friendlyCloudMessage(kind: CloudFailureKind): string {
  switch (kind) {
    case "network":
    case "offline":
      return CLOUD_UNAVAILABLE_MSG;
    case "unauthorized":
      return SESSION_EXPIRED_MSG;
    case "forbidden":
      return "You do not have permission to use pharmacy cloud sync.";
    case "storage":
      return "Local storage is unavailable.";
    case "server":
      return "Cloud sync failed â€” please try again later.";
  }
}

// ============================================================================
// Medicine catalog bootstrap (pure, testable)
// ============================================================================

export type MedicineCatalogState = "fresh" | "cached" | "empty" | "error";

export type BootstrapFetchers = {
  dashboard(): Promise<
    | { ok: true; data: { settings: Record<string, unknown>; hospital: Record<string, unknown> } }
    | { ok: false; kind: CloudFailureKind; message: string }
  >;
  medicines(): Promise<
    | { ok: true; data: Array<Record<string, unknown>> }
    | { ok: false; kind: CloudFailureKind; message: string }
  >;
};

export type BootstrapOutcome = {
  settings: {
    settings: Record<string, unknown>;
    hospital: Record<string, unknown>;
  } | null;
  medicines: Array<Record<string, unknown>>;
  catalogState: MedicineCatalogState;
  /** Genuine cloud/network unavailability observed (safe to degrade). */
  cloudKind: CloudFailureKind | null;
  /** Authentication / authorization failure observed (never degrade). */
  authKind: CloudFailureKind | null;
  /** Server-side or local-storage failure observed (never degrade silently). */
  errorKind: CloudFailureKind | null;
};

/**
 * Run the POS bootstrap against injected fetchers. On success the medicine
 * catalog is persisted into the local cache (narrow M6 continuity fix â€” no
 * stock-authority semantics added). On cloud failure it falls back to the
 * cache silently and reports the catalog state so the UI can say exactly
 * what is and is not available.
 */
export async function runBootstrap(
  fetchers: BootstrapFetchers,
  storage: OfflineStorage
): Promise<BootstrapOutcome> {
  const outcome: BootstrapOutcome = {
    settings: null,
    medicines: [],
    catalogState: "empty",
    cloudKind: null,
    authKind: null,
    errorKind: null,
  };

  const dash = await fetchers.dashboard();
  if (dash.ok) {
    outcome.settings = {
      settings: dash.data.settings,
      hospital: dash.data.hospital,
    };
  } else if (isCloudUnavailable(dash.kind)) {
    outcome.cloudKind = dash.kind;
  } else if (dash.kind === "unauthorized" || dash.kind === "forbidden") {
    outcome.authKind = dash.kind;
  } else {
    outcome.errorKind = dash.kind;
  }

  const meds = await fetchers.medicines();
  if (meds.ok) {
    const rows = meds.data.filter((m) => m && m.id != null);
    outcome.medicines = rows;
    outcome.catalogState = "fresh";
    try {
      for (const m of rows) {
        await storage.putEntity("medicine", String(m.id), m, "local");
      }
      if (rows.length > 0) {
        await storage.setMeta("medicineCatalogAt", new Date().toISOString());
      }
    } catch {
      // Local persistence failed â€” this is a blocking storage problem, not
      // offline mode. The server rows are still usable for this session.
      outcome.errorKind = "storage";
      outcome.catalogState = "error";
    }
  } else if (isCloudUnavailable(meds.kind)) {
    outcome.cloudKind = meds.kind;
    let cachedCount = 0;
    try {
      cachedCount = (await storage.listEntities("medicine")).length;
    } catch {
      outcome.errorKind = "storage";
      outcome.catalogState = "error";
    }
    if (outcome.errorKind !== "storage") {
      outcome.catalogState = cachedCount > 0 ? "cached" : "empty";
    }
  } else if (meds.kind === "unauthorized" || meds.kind === "forbidden") {
    outcome.authKind = meds.kind;
    outcome.catalogState = "error";
  } else {
    outcome.errorKind = meds.kind;
    outcome.catalogState = "error";
  }

  return outcome;
}

// ============================================================================
// Cloud monitor (framework-free; hook wrapper lives below)
// ============================================================================

export type CloudMonitorOpts = {
  /** Returns "ok" or a failure kind. Must never throw. */
  probe: () => Promise<"ok" | CloudFailureKind>;
  navigatorOnline?: () => boolean;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
  /** Probe cadence while unavailable (default 15s â€” bounded, not aggressive). */
  probeUnavailableMs?: number;
  /** Probe cadence while connected (default 60s). */
  probeConnectedMs?: number;
  onState: (
    state: CloudState,
    detail: { kind: CloudFailureKind | null; message: string | null }
  ) => void;
};

export type CloudMonitor = {
  start(): void;
  stop(): void;
  refresh(): Promise<void>;
  getState(): CloudState;
};

export function createCloudMonitor(opts: CloudMonitorOpts): CloudMonitor {
  let state: CloudState = "connected";
  let timer: unknown = null;
  let running = false;
  const online =
    opts.navigatorOnline ??
    (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const schedule = opts.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = opts.cancel ??
    ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  const setState = (
    next: CloudState,
    kind: CloudFailureKind | null,
    message: string | null
  ) => {
    state = next;
    opts.onState(next, { kind, message });
  };

  const arm = () => {
    if (!running || timer != null) return;
    const ms =
      state === "connected"
        ? (opts.probeConnectedMs ?? 60_000)
        : (opts.probeUnavailableMs ?? 15_000);
    timer = schedule(() => {
      timer = null;
      void refresh();
    }, ms);
  };

  const refresh = async (): Promise<void> => {
    if (!running) return;
    if (!online()) {
      setState("unavailable", "offline", "You are offline.");
      arm();
      return;
    }
    const result = await opts.probe();
    if (!running) return;
    if (result === "ok") {
      setState("connected", null, null);
    } else if (isCloudUnavailable(result)) {
      setState("unavailable", result, friendlyCloudMessage(result));
    } else {
      setState("error", result, friendlyCloudMessage(result));
    }
    arm();
  };

  return {
    start() {
      if (running) return;
      running = true;
      void refresh();
    },
    stop() {
      running = false;
      if (timer != null) {
        cancel(timer);
        timer = null;
      }
    },
    refresh,
    getState: () => state,
  };
}

/**
 * Default probe: the pharmacy health endpoint (auth-gated same-origin, a
 * one-row Supabase ping in supabase mode, instant ok in local mode). It
 * reports 401/403 distinctly so a session failure never becomes "offline".
 */
export function defaultCloudProbe(baseUrl = ""): () => Promise<"ok" | CloudFailureKind> {
  return async () => {
    try {
      const res = await fetch(`${baseUrl}/api/admin/pharmacy/health`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.ok) return "ok";
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        kind?: CloudFailureKind;
      } | null;
      if (body?.kind) return body.kind;
      return classifyFetchError(new Error(body?.error || `HTTP ${res.status}`), {
        status: res.status,
        bodyError: body?.error ?? null,
      });
    } catch (err) {
      return classifyFetchError(err);
    }
  };
}

// ============================================================================
// React hook (client only)
// ============================================================================

export type CloudStatusInfo = {
  state: CloudState;
  kind: CloudFailureKind | null;
  message: string | null;
};
