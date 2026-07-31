import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractInvoicePdfPath } from "../../src/lib/payments/storage";

describe("invoice PDF storage path extraction (private bucket)", () => {
  it("extracts path from public URL", () => {
    const path = extractInvoicePdfPath(
      "https://xyz.supabase.co/storage/v1/object/public/invoices/inv-123/SSH-INV-0001.pdf"
    );
    assert.equal(path, "inv-123/SSH-INV-0001.pdf");
  });

  it("extracts path from signed URL (private bucket serves signed links)", () => {
    const path = extractInvoicePdfPath(
      "https://xyz.supabase.co/storage/v1/object/sign/invoices/inv-123/SSH-INV-0001.pdf?token=abc"
    );
    assert.equal(path, "inv-123/SSH-INV-0001.pdf");
  });

  it("decodes URL-encoded segments", () => {
    const path = extractInvoicePdfPath(
      "https://xyz.supabase.co/storage/v1/object/public/invoices/inv-1/a%20b.pdf"
    );
    assert.equal(path, "inv-1/a b.pdf");
  });

  it("returns null for other buckets (must not sign foreign objects)", () => {
    const path = extractInvoicePdfPath(
      "https://xyz.supabase.co/storage/v1/object/public/gallery/img.jpg"
    );
    assert.equal(path, null);
  });

  it("returns null for external URLs and non-URLs", () => {
    assert.equal(extractInvoicePdfPath("https://example.com/x.pdf"), null);
    assert.equal(extractInvoicePdfPath("not-a-url"), null);
    assert.equal(extractInvoicePdfPath(""), null);
  });
});
