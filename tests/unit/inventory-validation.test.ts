import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adjustmentSchema, inventoryItemSchema, purchaseOrderSchema, receiptSchema, transferSchema,
} from "../../src/lib/inventory/validation";

const id = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";
describe("inventory validation", () => {
  it("accepts a tracked inventory item", () => {
    assert.equal(inventoryItemSchema.safeParse({
      item_code: "MED-001", barcode: "8901234567890", name: "Sterile Dressing", unit: "piece",
      purchase_price: 20, selling_price: 30, minimum_stock: 5, maximum_stock: 100,
      reorder_level: 10, expiry_tracking: true, batch_tracking: true, serial_tracking: false,
    }).success, true);
  });
  it("rejects invalid stock boundaries and negative prices", () => {
    assert.equal(inventoryItemSchema.safeParse({
      item_code: "MED-001", name: "Sterile Dressing", unit: "piece",
      purchase_price: -1, selling_price: 30, minimum_stock: 20, maximum_stock: 10,
    }).success, false);
  });
  it("prevents same-location transfers", () => {
    assert.equal(transferSchema.safeParse({ item_id:id,from_location_id:id2,to_location_id:id2,quantity:1 }).success,false);
  });
  it("validates purchase orders, receipts, and adjustments", () => {
    assert.equal(purchaseOrderSchema.safeParse({supplier_id:id,location_id:id2,items:[{item_id:id,ordered_quantity:10,unit_price:5,gst_percent:5}]}).success,true);
    assert.equal(receiptSchema.safeParse({purchase_order_id:id,item_id:id2,location_id:id,quantity:5,unit_cost:5,batch_number:"B-1",expiry_date:"2027-01-01"}).success,true);
    assert.equal(adjustmentSchema.safeParse({item_id:id,location_id:id2,adjustment_type:"damage",quantity:1,reason:"Package damaged"}).success,true);
  });
});
