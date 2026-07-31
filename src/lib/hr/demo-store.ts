import type { HrAttendance, HrEmployee, HrLeaveRequest } from "@/lib/hr/types";
import { generateId } from "@/lib/utils";
import { gatedDemoStore } from "@/lib/supabase/demo-gate";

const employees: HrEmployee[] = [
  {
    id: "emp-demo-1",
    employee_code: "SSH-001",
    full_name: "Demo Clinician",
    role_title: "Consultant Pulmonologist",
    department: "Pulmonology",
    employment_type: "full_time",
    salary_monthly: 0,
    status: "active",
    phone: "9876543210",
  },
  {
    id: "emp-demo-2",
    employee_code: "SSH-002",
    full_name: "Reception Lead",
    role_title: "Receptionist",
    department: "Front Office",
    employment_type: "full_time",
    salary_monthly: 25000,
    status: "active",
  },
];

const leaves: HrLeaveRequest[] = [];
const attendance: HrAttendance[] = [];

const rawDemoHr = {
  listEmployees: () => [...employees],
  createEmployee(input: Omit<HrEmployee, "id">): HrEmployee {
    const row: HrEmployee = { id: generateId("emp"), ...input };
    employees.unshift(row);
    return row;
  },
  listLeaves: () =>
    leaves.map((l) => ({
      ...l,
      employee: employees.find((e) => e.id === l.employee_id)
        ? { full_name: employees.find((e) => e.id === l.employee_id)!.full_name }
        : null,
    })),
  createLeave(input: Omit<HrLeaveRequest, "id" | "status" | "employee">): HrLeaveRequest {
    const row: HrLeaveRequest = {
      id: generateId("lv"),
      status: "pending",
      ...input,
    };
    leaves.unshift(row);
    return row;
  },
  updateLeave(id: string, status: HrLeaveRequest["status"]) {
    const l = leaves.find((x) => x.id === id);
    if (!l) return null;
    l.status = status;
    return l;
  },
  listAttendance: () => [...attendance],
  upsertAttendance(input: Omit<HrAttendance, "id">): HrAttendance {
    const existing = attendance.find(
      (a) =>
        a.employee_id === input.employee_id && a.work_date === input.work_date
    );
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const row: HrAttendance = { id: generateId("att"), ...input };
    attendance.unshift(row);
    return row;
  },
};

export const demoHr = gatedDemoStore("hr demo store", rawDemoHr);
