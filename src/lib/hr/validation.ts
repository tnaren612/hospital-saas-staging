import { z } from "zod";

export const employeeCreateSchema = z.object({
  full_name: z.string().min(2).max(120),
  employee_code: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/)
    .optional()
    .nullable()
    .or(z.literal("")),
  role_title: z.string().min(1).max(80).default("Staff"),
  department: z.string().min(1).max(80).default("General"),
  employment_type: z
    .enum(["full_time", "part_time", "contract", "intern"])
    .default("full_time"),
  join_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  salary_monthly: z.coerce.number().min(0).max(10_000_000).default(0),
  status: z.enum(["active", "inactive", "terminated"]).default("active"),
  notes: z.string().max(2000).optional(),
});

export const leaveCreateSchema = z.object({
  employee_id: z.string().uuid(),
  leave_type: z
    .enum(["casual", "sick", "earned", "unpaid", "other"])
    .default("casual"),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.coerce.number().positive().max(365).optional(),
  reason: z.string().max(1000).optional(),
});

export const leaveStatusSchema = z.object({
  status: z.enum(["approved", "rejected", "cancelled", "pending"]),
});

export const attendanceSchema = z.object({
  employee_id: z.string().uuid(),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["present", "absent", "half_day", "leave", "holiday"]),
  check_in: z.string().max(20).optional().nullable(),
  check_out: z.string().max(20).optional().nullable(),
  notes: z.string().max(500).optional(),
});
