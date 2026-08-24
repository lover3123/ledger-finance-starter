import { Router } from "express";
import { financialSetupSchema, balanceAdjustmentSchema, deleteAccountSchema } from "@ledger/shared";
import { User, PersonalTransaction, Budget, Category, BalanceAdjustment, Friendship, Relationship, PaymentRequest, PaymentSession, PayTransaction, Settlement, ExpenseSplit, Notification, AuditLog } from "../models/index.js";
import { requireAuth, verifyPassword, type AuthedRequest } from "../middleware/auth.js";

export const settingsRouter = Router();

// ---------- Financial setup ----------

settingsRouter.get("/api/settings/financial", requireAuth, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  // Get overall monthly budget for current month
  const month = typeof req.query.month === "string" ? req.query.month : new Date().toISOString().slice(0, 7);
  const overallBudget = await Budget.findOne({ userId: req.userId, category: "__overall__", month });

  res.json({
    startingBalance: user.startingBalance ?? 0,
    startingBalanceDate: user.startingBalanceDate ?? "",
    currency: user.currency ?? "INR",
    monthlyBudget: overallBudget?.limit ?? null
  });
});

settingsRouter.patch("/api/settings/financial", requireAuth, async (req: AuthedRequest, res) => {
  const input = financialSetupSchema.partial().parse(req.body);
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (input.startingBalance !== undefined) user.startingBalance = input.startingBalance;
  if (input.startingBalanceDate !== undefined) user.startingBalanceDate = input.startingBalanceDate;
  await user.save();

  res.json({
    startingBalance: user.startingBalance,
    startingBalanceDate: user.startingBalanceDate,
    currency: user.currency
  });
});

// ---------- Balance adjustments ----------

settingsRouter.get("/api/balance-adjustments", requireAuth, async (req: AuthedRequest, res) => {
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const query: Record<string, unknown> = { userId: req.userId };
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, monthIndex] = month.split("-").map(Number);
    const start = new Date(Date.UTC(year, monthIndex - 1, 1));
    const end = new Date(Date.UTC(year, monthIndex, 1));
    query.date = { $gte: start, $lt: end };
  }
  const rows = await BalanceAdjustment.find(query).sort({ date: -1 });
  res.json(rows.map((row) => ({
    id: String(row._id),
    amount: row.amount,
    reason: row.reason,
    date: row.date.toISOString(),
    createdAt: row.createdAt.toISOString()
  })));
});

settingsRouter.post("/api/balance-adjustments", requireAuth, async (req: AuthedRequest, res) => {
  const input = balanceAdjustmentSchema.parse(req.body);
  const adjustment = await BalanceAdjustment.create({
    userId: req.userId,
    amount: input.amount,
    reason: input.reason,
    date: new Date(),
    createdBy: req.userId
  });
  res.status(201).json({
    id: String(adjustment._id),
    amount: adjustment.amount,
    reason: adjustment.reason,
    date: adjustment.date.toISOString(),
    createdAt: adjustment.createdAt.toISOString()
  });
});

// ---------- Account deletion ----------

settingsRouter.delete("/api/auth/account", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const input = deleteAccountSchema.parse(req.body);

    // Verify password
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    // Delete all user-owned data in a transaction-like sequence
    await PersonalTransaction.deleteMany({ userId: req.userId });
    await Budget.deleteMany({ userId: req.userId });
    await Category.deleteMany({ userId: req.userId });
    await BalanceAdjustment.deleteMany({ userId: req.userId });
    await Notification.deleteMany({ userId: req.userId });
    await AuditLog.deleteMany({ actorId: req.userId });

    // Delete relationships where user is involved
    await Friendship.deleteMany({ $or: [{ requester: req.userId }, { recipient: req.userId }] });
    await Relationship.deleteMany({ $or: [{ userA: req.userId }, { userB: req.userId }] });

    // Delete payment-related data
    await PaymentRequest.deleteMany({ $or: [{ senderId: req.userId }, { payerId: req.userId }, { counterpartyId: req.userId }] });
    await PaymentSession.deleteMany({ $or: [{ payerId: req.userId }, { counterpartyId: req.userId }] });
    await PayTransaction.deleteMany({ $or: [{ payerId: req.userId }, { beneficiaryId: req.userId }, { counterpartyId: req.userId }] });
    await Settlement.deleteMany({ $or: [{ payerId: req.userId }, { receiverId: req.userId }] });
    await ExpenseSplit.deleteMany({ $or: [{ creatorId: req.userId }, { "participants.userId": req.userId }] });

    // Finally, delete the user
    await User.deleteOne({ _id: req.userId });

    res.status(200).json({ message: "Your Ledger account has been permanently deleted." });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return res.status(400).json({ message: "Invalid request. Please enter DELETE and your password." });
    }
    console.error("Account deletion failed:", err);
    res.status(500).json({ message: "We couldn't delete your account. No changes were made. Please try again." });
  }
});
