/**
 * Payment production fail-closed helpers (Critical C-04 / C-05).
 */

/** True on Vercel production or NODE_ENV=production (not test). */
export function isProductionRuntime(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  const vercel = process.env.VERCEL_ENV;
  if (vercel === "production") return true;
  if (vercel === "preview" || vercel === "development") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * Explicit allow for mock payments in non-prod only.
 * Production never allows mock verify/create completion.
 */
export function allowMockPayments(): boolean {
  if (isProductionRuntime()) return false;
  if (process.env.ALLOW_MOCK_PAYMENTS === "false") return false;
  return true;
}
