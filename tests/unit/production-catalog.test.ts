import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCTION_ASSETS,
  getDefaultGalleryAssets,
  getHeroFallback,
  getDoctorFallback,
  getPatientAvatar,
} from "../../src/lib/assets/production-catalog";

describe("production asset catalog", () => {
  it("has unique ids and required fields", () => {
    const ids = new Set<string>();
    for (const a of PRODUCTION_ASSETS) {
      assert.ok(a.id);
      assert.ok(
        a.src.startsWith("/images/") || a.src.startsWith("https://"),
        `unexpected src ${a.src}`
      );
      assert.ok(a.fallback.startsWith("/"));
      assert.ok(a.alt.length > 3);
      assert.ok(a.width > 0 && a.height > 0);
      assert.equal(ids.has(a.id), false);
      ids.add(a.id);
    }
  });

  it("exposes gallery and hero fallbacks", () => {
    assert.ok(getDefaultGalleryAssets().length >= 6);
    assert.ok(getHeroFallback().src.includes("hero") || getHeroFallback().src.includes("hospital"));
    assert.ok(getDoctorFallback().src.includes("doctor"));
    assert.ok(getPatientAvatar(0).includes("testimonials"));
  });
});
