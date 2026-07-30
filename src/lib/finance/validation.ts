import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "salaries",
  "utilities",
  "medical_supplies",
  "pharmacy_procurement",
  "maintenance",
  "marketing",
  "rent",
  "equipment",
  "general",
  "other",
] as const;

export const expenseCreateSchema = z.object({
  category: z.string().min(1).max(80).default("general"),
  description: z.string().min(2).max(500),
  amount: z.coerce.number().min(0).max(100_000_000),
  expense_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  payment_method: z.string().max(40).default("cash"),
  vendor: z.string().max(160).optional().nullable(),
  reference_no: z.string().max(80).optional().nullable(),
  notes: z.string().max(1000).optional(),
});

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
