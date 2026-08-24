import { Router, type NextFunction, type Request, type Response } from "express";
import { settlementSchema } from "@ledger/shared";
import { PayTransaction, Settlement, User } from "../models/index.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";
import { generateTransactionId } from "../services/ids.js";
import { getRelationshipAuthorized, toPayUser } from "../services/helpers.js";
import { computePairBalance } from "../services/balances.js";

export const settlementsRouter = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

settlementsRouter.post("/api/relationships/:id/settlements", rateLimit("settle", 20, 60_000), requireAuth, wrap(async (req: AuthedRequest, res) => {
  const relationship = await getRelationshipAuthorized(String(req.params.id), req.userId!);
  const input = settlementSchema.parse(req.body);
  const balance = await computePairBalance(String(relationship._id), req.userId!);

  const iAmDebtor = balance.iOwe > 0;
  const payable = iAmDebtor ? balance.iOwe : balance.owedToMe;
  if (payable <= 0) return res.status(422).json({ message: "There is no outstanding balance to settle with this person." });
  if (input.amount > payable) {
    return res.status(422).json({ message: `You can settle at most ₹${payable} — that is the current outstanding balance.` });
  }

  const counterpartyId = String(relationship.userA) === req.userId ? String(relationship.userB) : String(relationship.userA);
  const counterparty = await User.findById(counterpartyId);
  const me = await User.findById(req.userId);
  if (!counterparty || !me) return res.status(404).json({ message: "User not found." });

  const debtorId = iAmDebtor ? req.userId! : counterpartyId;
  const creditorId = iAmDebtor ? counterpartyId : req.userId!;

  const settlement = await Settlement.create({
    relationshipId: relationship._id,
    payerId: debtorId,
    receiverId: creditorId,
    amount: input.amount,
    status: "CREATED"
  });

  // The settlement payment is recorded as a SETTLE entry, completed immediately:
  // settling inside Ledger is an acknowledged in-app transfer of record.
  const txn = await PayTransaction.create({
    transactionId: generateTransactionId(),
    relationshipId: relationship._id,
    payerId: debtorId,
    beneficiaryId: creditorId,
    counterpartyId: creditorId === String(relationship.userA) ? String(relationship.userB) : String(relationship.userA),
    merchantName: `Settlement — ${me.name} ↔ ${counterparty.name}`,
    merchantUpiId: counterparty.upiId || me.upiId || "ledger@internal",
    amount: input.amount,
    type: "other",
    reason: iAmDebtor ? `Balance settlement to ${counterparty.name}` : `Balance settlement received from ${counterparty.name}`,
    status: "COMPLETED",
    verification: { upiAppResult: "NOT_STARTED", authority: "NOT_AVAILABLE", receiverConfirmation: "CONFIRMED" },
    debt: { debtorId, creditorId, kind: "SETTLE", status: "SETTLED", settledAmount: input.amount },
    confirmedBy: creditorId as never,
    confirmedAt: new Date()
  });

  settlement.transactionId = txn.transactionId;
  settlement.status = "COMPLETED";
  await settlement.save();

  await audit({ actorId: req.userId!, entityType: "PayTransaction", entityId: txn.transactionId, action: "SETTLEMENT_CREATED", newState: "COMPLETED", metadata: { settlementId: String(settlement._id), amount: input.amount } });
  await audit({ actorId: req.userId!, entityType: "Settlement", entityId: String(settlement._id), action: "SETTLEMENT_COMPLETED", newState: "COMPLETED", metadata: { amount: input.amount } });
  await notify({ userId: counterpartyId, type: "SETTLEMENT_COMPLETED", title: "Balance settled", message: `${me.name} recorded a settlement of ₹${input.amount}.`, relatedEntity: "relationship", relatedEntityId: String(relationship._id) });

  const newBalance = await computePairBalance(String(relationship._id), req.userId!);
  res.status(201).json({
    id: String(settlement._id),
    relationshipId: String(relationship._id),
    payer: toPayUser(await User.findById(debtorId) ?? me),
    receiver: toPayUser(await User.findById(creditorId) ?? counterparty),
    amount: input.amount,
    status: settlement.status,
    transactionId: txn.transactionId,
    createdAt: settlement.createdAt.toISOString(),
    balance: newBalance,
    message: `Settlement of ₹${input.amount} recorded.`
  });
}));

settlementsRouter.get("/api/settlements", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const rows = await Settlement.find({
    $or: [{ payerId: req.userId }, { receiverId: req.userId }]
  }).sort({ createdAt: -1 }).limit(100);
  const serialized = [];
  for (const row of rows) {
    const [payer, receiver] = await Promise.all([User.findById(row.payerId), User.findById(row.receiverId)]);
    serialized.push({
      id: String(row._id),
      relationshipId: String(row.relationshipId),
      payer: payer ? toPayUser(payer) : null,
      receiver: receiver ? toPayUser(receiver) : null,
      amount: row.amount,
      status: row.status,
      transactionId: row.transactionId,
      createdAt: row.createdAt.toISOString()
    });
  }
  res.json(serialized);
}));
