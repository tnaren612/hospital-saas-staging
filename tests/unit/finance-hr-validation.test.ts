import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expenseCreateSchema } from "../../src/lib/finance/validation";
import {
  employeeCreateSchema,
  leaveCreateSchema,
  attendanceSchema,
} from "../../src/lib/hr/validation";
import { demoFinance } from "../../src/lib/finance/demo-store";
import { demoHr } from "../../src/lib/hr/demo-store";

describe("finance validation", () => {
  it("accepts expense", () => {
    const r = expenseCreateSchema.safeParse({
      description: "Oxygen refill",
      amount: 12000,
      category: "medical_supplies",
    });
    assert.equal(r.success, true);
  });

  it("rejects negative amount", () => {
    const r = expenseCreateSchema.safeParse({
      description: "Bad",
      amount: -1,
    });
    assert.equal(r.success, false);
  });

  it("demo store create", () => {
    const e = demoFinance.create({
      category: "general",
      description: "Test",
      amount: 100,
      expense_date: "2026-07-01",
      payment_method: "cash",
    });
    assert.ok(e.id);
    assert.equal(demoFinance.list().some((x) => x.id === e.id), true);
  });
});

describe("hr validation", () => {
  it("accepts employee", () => {
    const r = employeeCreateSchema.safeParse({
      full_name: "Nurse A",
      role_title: "Staff Nurse",
      department: "IPD",
      salary_monthly: 30000,
    });
    assert.equal(r.success, true);
  });

  it("accepts leave", () => {
    const r = leaveCreateSchema.safeParse({
      employee_id: "11111111-1111-1111-1111-111111111111",
      from_date: "2026-08-01",
      to_date: "2026-08-03",
      leave_type: "sick",
    });
    assert.equal(r.success, true);
  });

  it("accepts attendance", () => {
    const r = attendanceSchema.safeParse({
      employee_id: "11111111-1111-1111-1111-111111111111",
      work_date: "2026-07-28",
      status: "present",
    });
    assert.equal(r.success, true);
  });

  it("demo hr employee", () => {
    const e = demoHr.createEmployee({
      full_name: "Temp Staff",
      role_title: "Aide",
      department: "Support",
      employment_type: "contract",
      salary_monthly: 15000,
      status: "active",
    });
    assert.ok(demoHr.listEmployees().find((x) => x.id === e.id));
  });
});
