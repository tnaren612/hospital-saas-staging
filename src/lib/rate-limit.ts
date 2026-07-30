/**
 * Rate limiter with optional Upstash Redis for multi-instance (H-06).
 * Falls back to in-memory when UPSTASH_REDIS_REST_URL / TOKEN unset.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; retryAfterMs: number; backend: "memory" } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0, backend: "memory" };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, existing.resetAt - now),
      backend: "memory",
    };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: limit - existing.count,
    retryAfterMs: 0,
    backend: "memory",
  };
}

function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN &&
      process.env.UPSTASH_REDIS_REST_URL !== "your_upstash_url"
  );
}

/**
 * Sync rate limit (memory). Prefer rateLimitAsync on hot auth/payment paths when Redis available.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; retryAfterMs: number; backend?: string } {
  return memoryRateLimit(key, limit, windowMs);
}

/**
 * Async rate limit — uses Upstash REST when configured (H-06 multi-instance).
 */
export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; remaining: number; retryAfterMs: number; backend: string }> {
  if (!upstashConfigured()) {
    return memoryRateLimit(key, limit, windowMs);
  }

  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const redisKey = `rl:${key}`;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    // INCR + EXPIRE pipeline via Upstash REST
    const incrRes = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, String(windowSec), "NX"],
        ["TTL", redisKey],
      ]),
      signal: AbortSignal.timeout(1500),
    });

    if (!incrRes.ok) {
      return memoryRateLimit(key, limit, windowMs);
    }

    const json = (await incrRes.json()) as { result?: unknown }[];
    const count = Number(
      Array.isArray(json) && json[0] && typeof json[0] === "object"
        ? (json[0] as { result?: number }).result
        : 0
    );
    const ttl = Number(
      Array.isArray(json) && json[2] && typeof json[2] === "object"
        ? (json[2] as { result?: number }).result
        : windowSec
    );

    if (!Number.isFinite(count) || count <= 0) {
      return memoryRateLimit(key, limit, windowMs);
    }

    if (count > limit) {
      return {
        ok: false,
        remaining: 0,
        retryAfterMs: Math.max(0, (Number.isFinite(ttl) && ttl > 0 ? ttl : windowSec) * 1000),
        backend: "upstash",
      };
    }

    return {
      ok: true,
      remaining: Math.max(0, limit - count),
      retryAfterMs: 0,
      backend: "upstash",
    };
  } catch {
    return memoryRateLimit(key, limit, windowMs);
  }
}

/** Best-effort client IP from common proxy headers. */
export function clientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

/** Test helper */
export function clearRateLimitBuckets(): void {
  buckets.clear();
}
