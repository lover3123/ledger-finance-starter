import { Router, type Response } from "express";
import mongoose from "mongoose";
import { budgetSchema, categorySchema, transactionSchema, categoryPatchSchema, DEFAULT_CATEGORIES, type Dashboard, type Transaction } from "@ledger/shared";
import type { Budget as BudgetDTO, Category as CategoryDTO } from "@ledger/shared";
import { Budget as BudgetModel, Category as CategoryModel, PersonalTransaction, BalanceAdjustment, User } from "../models/index.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { newId } from "../services/ids.js";

export const personalRouter = Router();

const toTransactionDTO = (txn: any): Transaction => ({
  id: String(txn._id),
  amount: txn.amount,
  type: txn.type,
  category: txn.category,
  description: txn.description,
  occurredAt: txn.occurredAt.toISOString()
});

personalRouter.get("/api/transactions", requireAuth, async (req: AuthedRequest, res) => {
  const query: Record<string, unknown> = { userId: req.userId };
  if (typeof req.query.type === "string" && ["income", "expense"].includes(req.query.type)) query.type = req.query.type;
  if (typeof req.query.category === "string" && req.query.category) query.category = req.query.category;
  if (typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)) {
    const [year, month] = req.query.month.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    query.occurredAt = { $gte: start, $lt: end };
  }
  const rows = await PersonalTransaction.find(query).sort({ occurredAt: -1 });
  res.json(rows.map(toTransactionDTO));
});

personalRouter.post("/api/transactions", requireAuth, async (req: AuthedRequest, res) => {
  const input = transactionSchema.parse(req.body);
  const txn = await PersonalTransaction.create({
    userId: req.userId,
    amount: input.amount,
    type: input.type,
    category: input.category,
    description: input.description,
    occurredAt: new Date(input.occurredAt)
  });
  res.status(201).json(toTransactionDTO(txn));
});

personalRouter.patch("/api/transactions/:id", requireAuth, async (req: AuthedRequest, res) => {
  const input = transactionSchema.partial().parse(req.body);
  const txn = await PersonalTransaction.findOne({ _id: req.params.id, userId: req.userId });
  if (!txn) return res.status(404).json({ message: "Transaction not found" });
  if (input.amount !== undefined) txn.amount = input.amount;
  if (input.type !== undefined) txn.type = input.type;
  if (input.category !== undefined) txn.category = input.category;
  if (input.description !== undefined) txn.description = input.description;
  if (input.occurredAt !== undefined) txn.occurredAt = new Date(input.occurredAt);
  await txn.save();
  res.json(toTransactionDTO(txn));
});

personalRouter.delete("/api/transactions/:id", requireAuth, async (req: AuthedRequest, res) => {
  const result = await PersonalTransaction.deleteOne({ _id: req.params.id, userId: req.userId });
  if (!result.deletedCount) return res.status(404).json({ message: "Transaction not found" });
  res.status(204).send();
});

personalRouter.get("/api/dashboard", requireAuth, async (req: AuthedRequest, res) => {
  const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : new Date().toISOString().slice(0, 7);
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));
  const userObjectId = new mongoose.Types.ObjectId(req.userId);
  const match = { userId: userObjectId, occurredAt: { $gte: start, $lt: end } };

  const user = await User.findById(req.userId);
  const startingBalance = user?.startingBalance ?? 0;

  // Calculate all-time income/expenses for balance
  const allTimeMatch = { userId: userObjectId };
  const [allSums] = await PersonalTransaction.aggregate([
    { $match: allTimeMatch },
    {
      $group: {
        _id: null,
        totalIncome: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
        totalExpenses: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } }
      }
    }
  ]);
  const totalIncome = Number(allSums?.totalIncome ?? 0);
  const totalExpenses = Number(allSums?.totalExpenses ?? 0);

  // Calculate total adjustments
  const adjustmentRows = await BalanceAdjustment.find({ userId: req.userId });
  const totalAdjustments = adjustmentRows.reduce((sum, adj) => sum + adj.amount, 0);

  // Current month sums
  const [sums] = await PersonalTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
        expenses: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } }
      }
    }
  ]);
  const recent = await PersonalTransaction.find(match).sort({ occurredAt: -1 }).limit(6);
  const categories = await PersonalTransaction.aggregate([
    { $match: { ...match, type: "expense" } },
    { $group: { _id: "$category", amount: { $sum: "$amount" } } },
    { $sort: { amount: -1 } }
  ]);

  const income = Number(sums?.income ?? 0);
  const expenses = Number(sums?.expenses ?? 0);
  const balance = Math.round((startingBalance + totalIncome - totalExpenses + totalAdjustments) * 100) / 100;

  const dashboard: Dashboard = {
    balance,
    startingBalance,
    adjustments: totalAdjustments,
    income,
    expenses,
    recentTransactions: recent.map(toTransactionDTO),
    spendingByCategory: categories.map((row) => ({ category: row._id, amount: Number(row.amount) }))
  };
  res.json(dashboard);
});

personalRouter.get("/api/budgets", requireAuth, async (req: AuthedRequest, res) => {
  const month = typeof req.query.month === "string" ? req.query.month : new Date().toISOString().slice(0, 7);
  const rows = await BudgetModel.find({ userId: req.userId, month, category: { $ne: "__overall__" } }).sort({ category: 1 });
  res.json(rows.map((row: any) => ({ id: String(row._id), category: row.category, limit: row.limit, month: row.month })) as BudgetDTO[]);
});

personalRouter.post("/api/budgets", requireAuth, async (req: AuthedRequest, res) => {
  const input = budgetSchema.parse(req.body);
  const row = await BudgetModel.findOneAndUpdate(
    { userId: req.userId, category: input.category, month: input.month },
    { $set: { limit: input.limit } },
    { new: true, upsert: true }
  );
  res.status(201).json({ id: String(row._id), category: row.category, limit: row.limit, month: row.month } as BudgetDTO);
});

personalRouter.patch("/api/budgets/:id", requireAuth, async (req: AuthedRequest, res) => {
  const input = budgetSchema.partial().parse(req.body);
  const row = await BudgetModel.findOne({ _id: req.params.id, userId: req.userId });
  if (!row) return res.status(404).json({ message: "Budget not found" });
  if (input.category !== undefined) row.category = input.category;
  if (input.limit !== undefined) row.limit = input.limit;
  if (input.month !== undefined) row.month = input.month;
  await row.save();
  res.json({ id: String(row._id), category: row.category, limit: row.limit, month: row.month } as BudgetDTO);
});

personalRouter.delete("/api/budgets/:id", requireAuth, async (req: AuthedRequest, res) => {
  const result = await BudgetModel.deleteOne({ _id: req.params.id, userId: req.userId });
  if (!result.deletedCount) return res.status(404).json({ message: "Budget not found" });
  res.status(204).send();
});

personalRouter.get("/api/categories", requireAuth, async (req: AuthedRequest, res) => {
  let rows = await CategoryModel.find({ userId: req.userId }).sort({ name: 1 });
  if (rows.length === 0) {
    await CategoryModel.insertMany(DEFAULT_CATEGORIES.map((name) => ({ userId: req.userId, name })));
    rows = await CategoryModel.find({ userId: req.userId }).sort({ name: 1 });
  }
  res.json(rows.map((row: any) => ({ id: String(row._id), name: row.name, archived: row.archived ?? false })) as CategoryDTO[]);
});

personalRouter.post("/api/categories", requireAuth, async (req: AuthedRequest, res) => {
  const input = categorySchema.parse(req.body);
  const name = input.name.trim();
  const existing = await CategoryModel.findOne({ userId: req.userId, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  if (existing) return res.status(409).json({ message: "Category already exists" });
  const row = await CategoryModel.create({ userId: req.userId, name });
  res.status(201).json({ id: String(row._id), name: row.name } as CategoryDTO);
});

personalRouter.patch("/api/categories/:id", requireAuth, async (req: AuthedRequest, res) => {
  const input = categoryPatchSchema.parse(req.body);
  const row = await CategoryModel.findOne({ _id: req.params.id, userId: req.userId });
  if (!row) return res.status(404).json({ message: "Category not found" });
  if (input.name !== undefined) row.name = input.name;
  if (input.archived !== undefined) row.archived = input.archived;
  await row.save();
  res.json({ id: String(row._id), name: row.name, archived: row.archived } as CategoryDTO);
});

personalRouter.patch("/api/categories/:id/archive", requireAuth, async (req: AuthedRequest, res) => {
  const row = await CategoryModel.findOne({ _id: req.params.id, userId: req.userId });
  if (!row) return res.status(404).json({ message: "Category not found" });
  row.archived = true;
  await row.save();
  res.json({ id: String(row._id), name: row.name, archived: row.archived } as CategoryDTO);
});

personalRouter.delete("/api/categories/:id", requireAuth, async (req: AuthedRequest, res) => {
  const result = await CategoryModel.deleteOne({ _id: req.params.id, userId: req.userId });
  if (!result.deletedCount) return res.status(404).json({ message: "Category not found" });
  res.status(204).send();
});
