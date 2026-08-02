import type { FinanceExpense } from "@/lib/finance/types";
import { generateId } from "@/lib/utils";
import { gatedDemoStore } from "@/lib/supabase/demo-gate";

const expenses: FinanceExpense[] = [
  {
    id: "exp-demo-1",
    category: "utilities",
    description: "Electricity — July",
    amount: 45000,
    expense_date: new Date().toISOString().slice(0, 10),
    payment_method: "bank",
    vendor: "APSPDCL",
  },
  {
    id: "exp-demo-2",
    category: "medical_supplies",
    description: "Oxygen cylinders refill",
    amount: 12000,
    expense_date: new Date().toISOString().slice(0, 10),
    payment_method: "upi",
    vendor: "Local supplier",
  },
];

const rawDemoFinance = {
  list(): FinanceExpense[] {
    return [...expenses].sort((a, b) =>
      b.expense_date.localeCompare(a.expense_date)
    );
  },
  create(input: Omit<FinanceExpense, "id">): FinanceExpense {
    const row: FinanceExpense = {
      id: generateId("exp"),
      ...input,
      created_at: new Date().toISOString(),
    };
    expenses.unshift(row);
    return row;
  },
  remove(id: string): boolean {
    const i = expenses.findIndex((e) => e.id === id);
    if (i < 0) return false;
    expenses.splice(i, 1);
    return true;
  },
};

export const demoFinance = gatedDemoStore("finance demo store", rawDemoFinance);
