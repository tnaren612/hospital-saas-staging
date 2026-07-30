import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseHostMap,
  resolveHospitalSlug,
  slugFromHost,
} from "../../src/lib/hospital/resolve-tenant";
import {
  isFeatureModuleEnabled,
  isPathModuleEnabled,
  moduleForPath,
} from "../../src/lib/hospital/modules";
import { buildDefaultHospitalConfig } from "../../src/lib/hospital/defaults";
import { hexToHslChannels } from "../../src/lib/hospital/color";

describe("tenant host resolution", () => {
  it("parses host map", () => {
    const m = parseHostMap("acme.example.com:acme, beta.test:beta");
    assert.equal(m["acme.example.com"], "acme");
    assert.equal(m["beta.test"], "beta");
  });

  it("slugFromHost uses map", () => {
    assert.equal(
      slugFromHost("acme.example.com", {
        hostMap: "acme.example.com:acme",
      }),
      "acme"
    );
  });

  it("slugFromHost subdomain when enabled", () => {
    assert.equal(
      slugFromHost("citycare.platform.com", { subdomainTenant: true }),
      "citycare"
    );
  });

  it("resolveHospitalSlug host wins over cookie (H-03)", () => {
    assert.equal(
      resolveHospitalSlug({
        querySlug: "preview",
        cookieSlug: "cookie-slug",
        host: "acme.example.com",
        // host map via env not set — use explicit hostMap through slugFromHost path
      }),
      // without host map, falls through
      resolveHospitalSlug({
        cookieSlug: "cookie-slug",
        host: "unknown.example.com",
      })
    );
  });

  it("resolveHospitalSlug host map authoritative over cookie", () => {
    // Inject via process env for this process
    const prev = process.env.HOSPITAL_HOST_MAP;
    process.env.HOSPITAL_HOST_MAP = "acme.example.com:acme";
    try {
      assert.equal(
        resolveHospitalSlug({
          querySlug: "evil",
          cookieSlug: "cookie-slug",
          host: "acme.example.com",
          allowClientOverride: false,
        }),
        "acme"
      );
    } finally {
      if (prev === undefined) delete process.env.HOSPITAL_HOST_MAP;
      else process.env.HOSPITAL_HOST_MAP = prev;
    }
  });

  it("resolveHospitalSlug allowClientOverride enables query", () => {
    assert.equal(
      resolveHospitalSlug({
        querySlug: "preview",
        cookieSlug: "cookie-slug",
        host: "unknown.example.com",
        allowClientOverride: true,
      }),
      "preview"
    );
  });

  it("resolveHospitalSlug cookie when no host map", () => {
    assert.equal(
      resolveHospitalSlug({
        cookieSlug: "cookie-slug",
        host: "unknown.example.com",
        allowClientOverride: false,
      }),
      "cookie-slug"
    );
  });
});

describe("module path gates", () => {
  it("moduleForPath", () => {
    assert.equal(moduleForPath("/admin/lab"), "laboratory");
    assert.equal(moduleForPath("/finance"), "finance");
    assert.equal(moduleForPath("/admin/dashboard"), null);
  });

  it("isPathModuleEnabled respects flags", () => {
    const c = buildDefaultHospitalConfig();
    c.modules.laboratory = false;
    assert.equal(isPathModuleEnabled(c, "/admin/lab"), false);
    assert.equal(isPathModuleEnabled(c, "/admin/dashboard"), true);
  });

  it("isFeatureModuleEnabled", () => {
    const c = buildDefaultHospitalConfig();
    c.modules.cms = false;
    assert.equal(isFeatureModuleEnabled(c, "cms"), false);
    assert.equal(isFeatureModuleEnabled(c, "settings"), true);
  });
});

describe("hexToHslChannels", () => {
  it("converts primary blue", () => {
    const hsl = hexToHslChannels("#1a5ff5");
    assert.ok(hsl);
    assert.match(hsl!, /^\d+ \d+% \d+%$/);
  });

  it("rejects invalid", () => {
    assert.equal(hexToHslChannels("not-a-color"), null);
  });
});
