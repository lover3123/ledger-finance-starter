import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(72)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72)
});

export const transactionSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(["income", "expense"]),
  category: z.string().min(1).max(40),
  description: z.string().max(160).optional().default(""),
  occurredAt: z.string().datetime()
});

export const budgetSchema = z.object({
  category: z.string().min(1).max(40),
  limit: z.number().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/)
});

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(40)
});

export const financialSetupSchema = z.object({
  startingBalance: z.number().min(0).max(100_000_000),
  startingBalanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const balanceAdjustmentSchema = z.object({
  amount: z.number().refine((n) => n !== 0, "Amount must be non-zero"),
  reason: z.string().trim().min(1).max(200)
});

export const categoryPatchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  archived: z.boolean().optional()
});

export const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE"),
  password: z.string().min(8).max(72)
});

export const DEFAULT_CATEGORIES = [
  "Food", "Transport", "Subscriptions", "Housing", "Utilities",
  "Health", "Shopping", "Entertainment", "Education", "Salary",
  "Freelance", "Other"
] as const;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type BudgetInput = z.infer<typeof budgetSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;

export type User = { id: string; name: string; email: string; currency?: string; startingBalance?: number; startingBalanceDate?: string };
export type AuthResponse = { token: string; user: User };export type Transaction = {
  id: string; amount: number; type: "income" | "expense"; category: string;
  description: string; occurredAt: string;
};
export type Budget = { id: string; category: string; limit: number; month: string };
export type BalanceAdjustment = { id: string; amount: number; reason: string; date: string; createdAt: string };
export type Category = { id: string; name: string; archived?: boolean };
export type Dashboard = {
  balance: number; income: number; expenses: number;
  startingBalance: number; adjustments: number;
  recentTransactions: Transaction[];
  spendingByCategory: { category: string; amount: number }[];
};

export type FinancialSetup = {
  startingBalance: number;
  startingBalanceDate: string;
  currency: string;
  monthlyBudget: number | null;
};

export * from "./pay.js";
