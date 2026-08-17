/**
 * Return line amounts must survive cloud apply (050).
 * Local POS items use quantity / unit_price / total_price.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { returnLinesFromPayload } from "../../src/lib/pharmacy/hybrid-apply";

const MED_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("return line amounts", () => {
  it("maps quantity 1 / unit_price 44.80 / total_price 44.80 into p_lines", () => {
    const lines = returnLinesFromPayload({
      items: [
        {
          medicine_id: MED_ID,
          medicine_name: "Return Med",
          quantity: 1,
          unit_price: 44.8,
          total_price: 44.8,
        },
      ],
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].medicine_id, MED_ID);
    assert.equal(lines[0].qty, 1);
    assert.equal(lines[0].quantity, 1);
    assert.equal(lines[0].unit_price, 44.8);
    assert.equal(lines[0].price, 44.8);
    assert.equal(lines[0].total_price, 44.8);
  });

  it("050 writes p_lines unit_price and total_price, not hardcoded zeros", () => {
    const sql = readFileSync("supabase/migrations/050_pharmacy_apply_return.sql", "utf8");
    assert.match(sql, /v_line->>'unit_price'/);
    assert.match(sql, /v_line->>'total_price'/);
    assert.match(sql, /v_line->>'quantity'/);
    assert.doesNotMatch(
      sql,
      /insert into public\.pharmacy_return_items[\s\S]*\n\s+0,\s*\n\s+0\s*$/m
    );
    assert.match(sql, /v_unit,/);
    assert.match(sql, /v_total/);
  });
});
