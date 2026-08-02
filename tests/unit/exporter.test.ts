import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toCsv, toJson, projectRows, buildPrintableHtml } from "../../src/lib/pharmacy/exporter";
import { inventoryRows, salesRows, paymentRows } from "../../src/lib/pharmacy/exporter/datasets";

describe("exporter serializers", () => {
  it("serializes rows to CSV with proper quoting", () => {
    const csv = toCsv([
      { name: "Aspirin", price: 10 },
      { name: "Tab, A", price: 15 },
    ]);
    assert.equal(csv.includes('"Tab, A"'), true);
    assert.equal(csv.split("\r\n").length, 3);
  });

  it("serializes to pretty JSON", () => {
    const json = toJson([{ a: 1 }]);
    assert.equal(JSON.parse(json)[0].a, 1);
  });

  it("projects + relabels columns in order", () => {
    const rows = projectRows(
      [{ name: "X", price: 5, extra: "ignored" }],
      [{ key: "name", label: "Medicine" }, { key: "price", label: "Rate" }]
    );
    assert.deepEqual(rows, [{ Medicine: "X", Rate: 5 }]);
  });

  it("builds a printable HTML table (PDF export path)", () => {
    const html = buildPrintableHtml("Report", [
      { A: 1, B: "<script>" },
    ]);
    assert.equal(html.includes("&lt;script&gt;"), true);
    assert.equal(html.includes("Report"), true);
  });
});

describe("exporter datasets", () => {
  it("shapes inventory rows with numeric coercion", () => {
    const rows = inventoryRows([{ name: "M", stock_qty: "5", selling_price: "10", reorder_level: "2" }]);
    assert.equal(rows[0].stock_qty, 5);
    assert.equal(rows[0].selling_price, 10);
  });

  it("shapes sales rows with totals and cashier", () => {
    const rows = salesRows([{ sale_number: "PH-1", grand_total: 100, subtotal: 90, line_items: [1, 2], payment_method: "cash" }]);
    assert.equal(rows[0].items, 2);
    assert.equal(rows[0].grand_total, 100);
    assert.equal(rows[0].payment_method, "cash");
  });

  it("shapes payment rows for export", () => {
    const rows = paymentRows([{ sale_number: "PH-2", grand_total: 50, payment_method: "upi" }]);
    assert.equal(rows[0].amount, 50);
    assert.equal(rows[0].payment_method, "upi");
  });
});
