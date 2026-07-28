import { describe, it } from "node:test";
import assert from "node:assert/strict";
import testimonialsJson from "../../src/data/testimonials.json";

describe("testimonials data contract", () => {
  it("includes required public fields", () => {
    assert.ok(Array.isArray(testimonialsJson));
    assert.ok(testimonialsJson.length >= 3);
    for (const t of testimonialsJson) {
      assert.ok(t.id);
      assert.ok(t.name);
      assert.ok(t.content.length >= 10);
      assert.ok(t.rating >= 1 && t.rating <= 5);
      assert.ok(t.image);
      assert.ok(t.date);
      assert.ok(t.treatment || t.role);
    }
  });

  it("marks at least one featured published story", () => {
    const featured = testimonialsJson.filter(
      (t) => t.featured && t.published !== false
    );
    assert.ok(featured.length >= 1);
  });
});
