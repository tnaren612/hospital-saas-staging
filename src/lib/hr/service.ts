import { createServiceRoleClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { demoHr } from "@/lib/hr/demo-store";
import type { HrAttendance, HrEmployee, HrLeaveRequest } from "@/lib/hr/types";
import type { z } from "zod";
import type {
  attendanceSchema,
  employeeCreateSchema,
  leaveCreateSchema,
} from "@/lib/hr/validation";

function canUseDb() {
  return hasSupabaseConfig();
}
function client() {
  return createServiceRoleClient();
}

type EmpIn = z.infer<typeof employeeCreateSchema>;
type LeaveIn = z.infer<typeof leaveCreateSchema>;
type AttIn = z.infer<typeof attendanceSchema>;

export async function listEmployees(
  hospitalId?: string | null
): Promise<HrEmployee[]> {
  if (!canUseDb()) return demoHr.listEmployees();
  try {
    let q = client()
      .from("hr_employees")
      .select("*")
      .order("full_name")
      .limit(300);
    if (hospitalId) q = q.eq("hospital_id", hospitalId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as HrEmployee[];
  } catch {
    return demoHr.listEmployees();
  }
}

export async function createEmployee(
  input: EmpIn,
  hospitalId?: string | null
): Promise<HrEmployee> {
  const row: Record<string, unknown> = {
    full_name: input.full_name.trim(),
    employee_code: input.employee_code || null,
    email: input.email || null,
    phone: input.phone || null,
    role_title: input.role_title || "Staff",
    department: input.department || "General",
    employment_type: input.employment_type || "full_time",
    join_date: input.join_date || null,
    salary_monthly: input.salary_monthly ?? 0,
    status: input.status || "active",
    notes: input.notes || "",
  };
  if (hospitalId) row.hospital_id = hospitalId;
  if (!canUseDb()) {
    return demoHr.createEmployee(row as Omit<HrEmployee, "id">);
  }
  try {
    const { data, error } = await client()
      .from("hr_employees")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data as HrEmployee;
  } catch {
    return demoHr.createEmployee(row as Omit<HrEmployee, "id">);
  }
}

export async function listLeaves(
  hospitalId?: string | null
): Promise<HrLeaveRequest[]> {
  if (!canUseDb()) return demoHr.listLeaves();
  try {
    let q = client()
      .from("hr_leave_requests")
      .select("*, employee:hr_employees(full_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (hospitalId) q = q.eq("hospital_id", hospitalId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as HrLeaveRequest[];
  } catch {
    return demoHr.listLeaves();
  }
}

export async function createLeave(input: LeaveIn): Promise<HrLeaveRequest> {
  const from = new Date(input.from_date);
  const to = new Date(input.to_date);
  const days =
    input.days ||
    Math.max(
      1,
      Math.round((to.getTime() - from.getTime()) / 86400000) + 1
    );

  if (!canUseDb()) {
    return demoHr.createLeave({
      employee_id: input.employee_id,
      leave_type: input.leave_type || "casual",
      from_date: input.from_date,
      to_date: input.to_date,
      days,
      reason: input.reason || "",
    });
  }
  try {
    const { data, error } = await client()
      .from("hr_leave_requests")
      .insert({
        employee_id: input.employee_id,
        leave_type: input.leave_type || "casual",
        from_date: input.from_date,
        to_date: input.to_date,
        days,
        reason: input.reason || "",
        status: "pending",
      })
      .select("*, employee:hr_employees(full_name)")
      .single();
    if (error) throw error;
    return data as HrLeaveRequest;
  } catch {
    return demoHr.createLeave({
      employee_id: input.employee_id,
      leave_type: input.leave_type || "casual",
      from_date: input.from_date,
      to_date: input.to_date,
      days,
      reason: input.reason || "",
    });
  }
}

export async function updateLeaveStatus(
  id: string,
  status: HrLeaveRequest["status"],
  reviewerId?: string | null
) {
  if (!canUseDb()) return demoHr.updateLeave(id, status);
  try {
    const { data, error } = await client()
      .from("hr_leave_requests")
      .update({
        status,
        reviewed_by: reviewerId || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*, employee:hr_employees(full_name)")
      .single();
    if (error) throw error;
    return data as HrLeaveRequest;
  } catch {
    return demoHr.updateLeave(id, status);
  }
}

export async function listAttendance(from?: string, to?: string) {
  if (!canUseDb()) return demoHr.listAttendance();
  try {
    let q = client()
      .from("hr_attendance")
      .select("*, employee:hr_employees(full_name)")
      .order("work_date", { ascending: false })
      .limit(300);
    if (from) q = q.gte("work_date", from);
    if (to) q = q.lte("work_date", to);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as HrAttendance[];
  } catch {
    return demoHr.listAttendance();
  }
}

export async function upsertAttendance(input: AttIn): Promise<HrAttendance> {
  if (!canUseDb()) {
    return demoHr.upsertAttendance({
      employee_id: input.employee_id,
      work_date: input.work_date,
      status: input.status,
      check_in: input.check_in,
      check_out: input.check_out,
      notes: input.notes || "",
    });
  }
  try {
    const { data, error } = await client()
      .from("hr_attendance")
      .upsert(
        {
          employee_id: input.employee_id,
          work_date: input.work_date,
          status: input.status,
          check_in: input.check_in || null,
          check_out: input.check_out || null,
          notes: input.notes || "",
        },
        { onConflict: "employee_id,work_date" }
      )
      .select("*, employee:hr_employees(full_name)")
      .single();
    if (error) throw error;
    return data as HrAttendance;
  } catch {
    return demoHr.upsertAttendance({
      employee_id: input.employee_id,
      work_date: input.work_date,
      status: input.status,
      check_in: input.check_in,
      check_out: input.check_out,
      notes: input.notes || "",
    });
  }
}

/** Simple payroll estimate: sum active monthly salaries */
export async function payrollSummary() {
  const emps = await listEmployees();
  const active = emps.filter((e) => e.status === "active");
  const total = active.reduce((s, e) => s + Number(e.salary_monthly || 0), 0);
  return {
    headcount: active.length,
    monthly_payroll: total,
    employees: active.map((e) => ({
      id: e.id,
      name: e.full_name,
      role: e.role_title,
      salary: e.salary_monthly,
    })),
  };
}
