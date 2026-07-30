import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeJsonLd } from "@/lib/seo";

describe("serializeJsonLd", () => {
  it("escapes characters that can terminate a script element", () => {
    const result = serializeJsonLd({
      name: "</script><script>alert(1)</script>",
      detail: "care & safety",
    });

    assert.equal(result.includes("</script>"), false);
    assert.equal(result.includes("\\u003c/script\\u003e"), true);
    assert.equal(result.includes("\\u0026"), true);
  });
});
