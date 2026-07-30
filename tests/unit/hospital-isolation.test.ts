import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertWriteHospital,
  canAccessTenantRow,
  filterByHospital,
  proveIsolation,
} from "../../src/lib/hospital/isolation";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("hospital_id multi-tenant isolation", () => {
  it("proves one hospital cannot access another hospital data", () => {
    const proof = proveIsolation();
    assert.equal(proof.ok, true, JSON.stringify(proof.cases));
  });

  it("denies cross-tenant read", () => {
    const d = canAccessTenantRow({
      rowHospitalId: B,
      actorHospitalId: A,
    });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "cross_tenant_denied");
  });

  it("allows same-tenant read", () => {
    const d = canAccessTenantRow({
      rowHospitalId: A,
      actorHospitalId: A,
    });
    assert.equal(d.allowed, true);
  });

  it("hospital admin may NOT read cross-tenant (C-06)", () => {
    const d = canAccessTenantRow({
      rowHospitalId: B,
      actorHospitalId: A,
      isAdmin: true,
    });
    assert.equal(d.allowed, false);
  });

  it("platform admin may read cross-tenant", () => {
    const d = canAccessTenantRow({
      rowHospitalId: B,
      actorHospitalId: A,
      isPlatformAdmin: true,
    });
    assert.equal(d.allowed, true);
  });

  it("filterByHospital removes foreign rows", () => {
    const rows = [
      { id: "1", hospital_id: A },
      { id: "2", hospital_id: B },
      { id: "3", hospital_id: A },
    ];
    const filtered = filterByHospital(rows, A);
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((r) => r.hospital_id === A));
  });

  it("assertWriteHospital blocks cross-tenant write", () => {
    assert.throws(
      () =>
        assertWriteHospital({
          payloadHospitalId: B,
          actorHospitalId: A,
        }),
      /CROSS_TENANT/
    );
  });

  it("assertWriteHospital stamps actor hospital", () => {
    const id = assertWriteHospital({
      payloadHospitalId: null,
      actorHospitalId: A,
    });
    assert.equal(id, A);
  });
});
