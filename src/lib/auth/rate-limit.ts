/**
 * Auth rate limiter (H-06).
 * Sync path uses memory; checkAuthRateLimitAsync uses Upstash when configured.
 */

import { rateLimit, rateLimitAsync, clearRateLimitBuckets as clearShared } from "@/lib/rate-limit";

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/**
 * Sliding fixed-window limiter (memory).
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const r = rateLimit(key, limit, windowMs);
  return {
    allowed: r.ok,
    retryAfterSeconds: r.ok
      ? 0
      : Math.max(1, Math.ceil(r.retryAfterMs / 1000)),
  };
}

/** Auth defaults: 10 attempts / 15 minutes per key */
export function checkAuthRateLimit(key: string): RateLimitResult {
  return checkRateLimit(key, 10, 15 * 60 * 1000);
}

/** Async auth limit with optional Upstash (H-06) */
export async function checkAuthRateLimitAsync(
  key: string
): Promise<RateLimitResult> {
  const r = await rateLimitAsync(key, 10, 15 * 60 * 1000);
  return {
    allowed: r.ok,
    retryAfterSeconds: r.ok
      ? 0
      : Math.max(1, Math.ceil(r.retryAfterMs / 1000)),
  };
}

/** Test helper — clear all buckets */
export function clearRateLimitBuckets(): void {
  clearShared();
}
