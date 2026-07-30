import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hospitalBillSchema,
  labOrderCreateSchema,
  medicineSchema,
  pharmacySaleSchema,
  prescriptionSchema,
} from "../../src/lib/phase2/validation";
import { demoPhase2 } from "../../src/lib/phase2/demo-store";
import { canAccessFeature } from "../../src/lib/auth/roles";

describe("Phase 2 validation", () => {
  it("accepts lab order payload", () => {
    const r = labOrderCreateSchema.safeParse({
      patient_name: "Ravi Kumar",
      patient_phone: "9876543210",
      test_ids: ["cbc", "lipid"],
    });
    assert.equal(r.success, true);
  });

  it("accepts prescription with medicines", () => {
    const r = prescriptionSchema.safeParse({
      patient_name: "Ravi Kumar",
      patient_phone: "9876543210",
      doctor_name: "Dr. Sumanth",
      diagnosis: "Asthma",
      medicines: [
        {
          name: "Salbutamol",
          dosage: "2 puffs",
          morning: true,
          afternoon: false,
          night: true,
          food_instruction: "After food",
          duration: "7 days",
        },
      ],
    });
    assert.equal(r.success, true);
  });

  it("accepts pharmacy sale", () => {
    const r = pharmacySaleSchema.safeParse({
      patient_name: "Walk-in",
      items: [{ name: "PCM", qty: 2, price: 25 }],
    });
    assert.equal(r.success, true);
  });

  it("accepts hospital bill", () => {
    const r = hospitalBillSchema.safeParse({
      patient_name: "Ravi",
      patient_phone: "9876543210",
      consultation_fee: 500,
      lab_charges: 350,
      pharmacy_charges: 100,
      discount: 0,
      gst_percent: 0,
      payment_method: "upi",
      payment_status: "paid",
    });
    assert.equal(r.success, true);
  });

  it("accepts medicine inventory row", () => {
    const r = medicineSchema.safeParse({
      name: "Montelukast",
      manufacturer: "Sun",
      purchase_price: 50,
      selling_price: 90,
      stock_qty: 20,
    });
    assert.equal(r.success, true);
  });
});

describe("Phase 2 demo store", () => {
  it("creates lab order and advances status", () => {
    const o = demoPhase2.createOrder({
      patient_name: "Test",
      patient_phone: "9999999999",
      tests: [{ name: "CBC", price: 350 }],
    });
    assert.ok(o.order_number.startsWith("LAB"));
    const u = demoPhase2.updateOrderStatus(o.id, "sample_collected");
    assert.equal(u?.status, "sample_collected");
  });

  it("creates prescription and bill", () => {
    const rx = demoPhase2.createPrescription({
      patient_name: "Test",
      patient_phone: "9999999999",
      doctor_name: "Dr S",
      diagnosis: "COPD",
      notes: "",
      medicines: [
        {
          name: "Inhaler",
          dosage: "2p",
          morning: true,
          afternoon: false,
          night: true,
          food_instruction: "After food",
          duration: "30d",
        },
      ],
    });
    assert.ok(rx.prescription_number.startsWith("RX"));
    const bill = demoPhase2.createBill({
      patient_name: "Test",
      patient_phone: "9999999999",
      consultation_fee: 500,
      lab_charges: 0,
      pharmacy_charges: 0,
      other_charges: 0,
      discount: 0,
      gst_percent: 0,
      payment_method: "cash",
      payment_status: "paid",
    });
    assert.ok(bill.grand_total >= 500);
  });
});

describe("RBAC features", () => {
  it("admin and super_admin can access lab and pharmacy", () => {
    assert.equal(canAccessFeature("admin", "lab"), true);
    assert.equal(canAccessFeature("super_admin", "pharmacy"), true);
  });
  it("lab tech cannot access pharmacy settings", () => {
    assert.equal(canAccessFeature("lab_technician", "lab"), true);
    assert.equal(canAccessFeature("lab_technician", "settings"), false);
  });
  it("pharmacist can access pharmacy not departments", () => {
    assert.equal(canAccessFeature("pharmacist", "pharmacy"), true);
    assert.equal(canAccessFeature("pharmacist", "departments"), false);
  });
  it("billing role can access billing feature", () => {
    assert.equal(canAccessFeature("billing", "billing"), true);
    assert.equal(canAccessFeature("billing", "pharmacy"), false);
  });
});
