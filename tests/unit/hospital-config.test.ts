import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultHospitalConfig,
  deepMerge,
  getDefaultHospitalSlug,
} from "../../src/lib/hospital/defaults";
import { brandCssVariables, isModuleEnabled } from "../../src/lib/hospital/service";
import { MODULE_KEYS } from "../../src/lib/hospital/types";

describe("hospital multi-tenant config", () => {
  it("builds defaults with branding and modules", () => {
    const c = buildDefaultHospitalConfig();
    assert.ok(c.branding.name.length > 0);
    assert.ok(c.contact.email.includes("@") || c.contact.email.length > 0);
    assert.equal(typeof c.modules.appointments, "boolean");
    assert.ok(MODULE_KEYS.every((k) => k in c.modules));
  });

  it("deepMerge overlays nested branding", () => {
    const base = buildDefaultHospitalConfig();
    const merged = deepMerge(base.branding as unknown as Record<string, unknown>, {
      name: "Acme Multispecialty",
      primary_color: "#ff0000",
    });
    assert.equal(merged.name, "Acme Multispecialty");
    assert.equal(merged.primary_color, "#ff0000");
    assert.ok(merged.tagline);
  });

  it("isModuleEnabled respects flags", () => {
    const c = buildDefaultHospitalConfig();
    c.modules.pharmacy = false;
    assert.equal(isModuleEnabled(c, "appointments"), true);
    assert.equal(isModuleEnabled(c, "pharmacy"), false);
  });

  it("brandCssVariables emits CSS custom properties", () => {
    const c = buildDefaultHospitalConfig();
    c.branding.primary_color = "#112233";
    const css = brandCssVariables(c);
    assert.match(css, /--hospital-primary:#112233/);
  });

  it("slug from defaults", () => {
    assert.ok(getDefaultHospitalSlug().length > 0);
  });
});
