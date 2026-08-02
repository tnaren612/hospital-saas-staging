/**
 * Security guards shared by API routes (pure — unit tested).
 */

/**
 * Fail-closed CRON secret check: when CRON_SECRET is unset the endpoint must
 * deny all requests (never fall open to anonymous callers).
 */
export function verifyCronSecret(secret: string, provided: string): boolean {
  return Boolean(secret && provided && secret === provided);
}

/** Deterministic rate-limit key for patient logins (email + IP scoped). */
export function patientLoginRateLimitKey(email: string, ip: string): string {
  const normalized = email.trim().toLowerCase();
  return `patient-login:${normalized}${ip ? `:${ip}` : ""}`;
}

/**
 * Ownership check for patient-scoped resources: the requested patientId must
 * be the authenticated patient's own portal id. No cross-account access.
 */
export function resolveOwnPatientId(
  requestedId: string | null,
  ownPatientId: string | null
):
  | { ok: true; patientId: string }
  | { ok: false; error: string; status: number } {
  if (!ownPatientId) {
    return {
      ok: false,
      error: "No patient profile linked to this account",
      status: 403,
    };
  }
  if (requestedId && requestedId !== ownPatientId) {
    return {
      ok: false,
      error: "Not authorized to access these preferences",
      status: 403,
    };
  }
  return { ok: true, patientId: ownPatientId };
}
