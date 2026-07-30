/**
 * Pure multi-tenant isolation rules (unit-testable without DB).
 * Hospital admins are scoped to their hospital (C-06) — no global admin bypass.
 * Platform ops use service_role / isPlatformAdmin only.
 */

export type TenantAccessDecision =
  | { allowed: true; reason: string }
  | { allowed: false; reason: string };

/**
 * Can actor from hospital A access a row owned by hospital B?
 */
export function canAccessTenantRow(input: {
  rowHospitalId: string | null | undefined;
  actorHospitalId: string | null | undefined;
  /**
   * @deprecated Prefer isPlatformAdmin. Hospital admin must NOT bypass tenant.
   * Kept as alias of isPlatformAdmin for call-site compatibility.
   */
  isAdmin?: boolean;
  /** True platform operator only (service role path) — not hospital admin */
  isPlatformAdmin?: boolean;
  /**
   * H-07: after migration 029, null hospital rows are denied by default.
   * Pass allowLegacyNull=true only during transition.
   */
  allowLegacyNull?: boolean;
}): TenantAccessDecision {
  const {
    rowHospitalId,
    actorHospitalId,
    allowLegacyNull = false,
  } = input;

  // C-06: hospital admin (isAdmin) does NOT bypass tenant — only isPlatformAdmin
  if (input.isPlatformAdmin === true) {
    return { allowed: true, reason: "platform_admin_bypass" };
  }

  if (!actorHospitalId) {
    return { allowed: false, reason: "actor_has_no_hospital" };
  }

  if (rowHospitalId == null || rowHospitalId === "") {
    if (allowLegacyNull) {
      return { allowed: true, reason: "legacy_null_row" };
    }
    return { allowed: false, reason: "null_hospital_denied" };
  }

  if (rowHospitalId === actorHospitalId) {
    return { allowed: true, reason: "same_hospital" };
  }

  return { allowed: false, reason: "cross_tenant_denied" };
}

/**
 * Filter list to only rows the actor may see.
 */
export function filterByHospital<T extends { hospital_id?: string | null }>(
  rows: T[],
  actorHospitalId: string | null | undefined,
  options?: {
    isAdmin?: boolean;
    isPlatformAdmin?: boolean;
    allowLegacyNull?: boolean;
  }
): T[] {
  return rows.filter(
    (r) =>
      canAccessTenantRow({
        rowHospitalId: r.hospital_id,
        actorHospitalId,
        isAdmin: options?.isAdmin,
        isPlatformAdmin: options?.isPlatformAdmin,
        allowLegacyNull: options?.allowLegacyNull,
      }).allowed
  );
}

/**
 * Assert write payload hospital matches actor (throws if cross-tenant).
 */
export function assertWriteHospital(input: {
  payloadHospitalId?: string | null;
  actorHospitalId: string | null | undefined;
  isAdmin?: boolean;
  isPlatformAdmin?: boolean;
}): string | null {
  const { payloadHospitalId, actorHospitalId } = input;
  const platform =
    input.isPlatformAdmin === true;
  if (platform) return payloadHospitalId || actorHospitalId || null;
  if (!actorHospitalId) {
    throw new Error("TENANT_REQUIRED");
  }
  if (payloadHospitalId && payloadHospitalId !== actorHospitalId) {
    throw new Error("CROSS_TENANT_WRITE_DENIED");
  }
  return actorHospitalId;
}

/**
 * Simulation: hospital A must not see hospital B rows.
 */
export function proveIsolation(): {
  ok: boolean;
  cases: { name: string; ok: boolean }[];
} {
  const hospitalA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const hospitalB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  const cases = [
    {
      name: "same tenant allowed",
      ok: canAccessTenantRow({
        rowHospitalId: hospitalA,
        actorHospitalId: hospitalA,
      }).allowed,
    },
    {
      name: "cross tenant denied",
      ok: !canAccessTenantRow({
        rowHospitalId: hospitalB,
        actorHospitalId: hospitalA,
      }).allowed,
    },
    {
      name: "hospital admin cannot read other tenant (C-06)",
      ok: !canAccessTenantRow({
        rowHospitalId: hospitalB,
        actorHospitalId: hospitalA,
        isAdmin: true,
      }).allowed,
    },
    {
      name: "platform admin can read other tenant",
      ok: canAccessTenantRow({
        rowHospitalId: hospitalB,
        actorHospitalId: hospitalA,
        isPlatformAdmin: true,
      }).allowed,
    },
    {
      name: "null hospital denied by default (H-07)",
      ok: !canAccessTenantRow({
        rowHospitalId: null,
        actorHospitalId: hospitalA,
      }).allowed,
    },
    {
      name: "legacy null allowed when opted in",
      ok: canAccessTenantRow({
        rowHospitalId: null,
        actorHospitalId: hospitalA,
        allowLegacyNull: true,
      }).allowed,
    },
    {
      name: "filter removes foreign hospital",
      ok:
        filterByHospital(
          [
            { hospital_id: hospitalA, id: "1" },
            { hospital_id: hospitalB, id: "2" },
          ],
          hospitalA
        ).length === 1,
    },
    {
      name: "write assert blocks cross tenant",
      ok: (() => {
        try {
          assertWriteHospital({
            payloadHospitalId: hospitalB,
            actorHospitalId: hospitalA,
          });
          return false;
        } catch {
          return true;
        }
      })(),
    },
  ];

  return { ok: cases.every((c) => c.ok), cases };
}
