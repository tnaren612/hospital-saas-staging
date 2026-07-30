export type HrEmployee = {
  id: string;
  employee_code?: string | null;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  role_title: string;
  department: string;
  employment_type: string;
  join_date?: string | null;
  salary_monthly: number;
  status: "active" | "inactive" | "terminated";
  notes?: string;
};

export type HrLeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  employee?: { full_name: string } | null;
};

export type HrAttendance = {
  id: string;
  employee_id: string;
  work_date: string;
  status: string;
  check_in?: string | null;
  check_out?: string | null;
  notes?: string;
  employee?: { full_name: string } | null;
};
