export type FinanceExpense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: string;
  vendor?: string | null;
  reference_no?: string | null;
  notes?: string;
  created_at?: string;
};

export type FinanceSummary = {
  revenue_period: number;
  expenses_period: number;
  profit_period: number;
  revenue_today: number;
  expenses_today: number;
  by_category: { name: string; value: number }[];
  from: string;
  to: string;
};
