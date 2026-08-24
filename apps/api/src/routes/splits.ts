import { Router, type NextFunction, type Request, type Response } from "express";
import { splitSchema } from "@ledger/shared";
import { ExpenseSplit, PaymentRequest, User } from "../models/index.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";
import { generateUniqueId } from "../services/ids.js";
import { relationshipContext } from "../services/helpers.js";
import { config } from "../config.js";

export const splitsRouter = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

async function serializeSplit(split: any) {
  const creator = await User.findById(split.creatorId);
  const participantIds = split.participants.map((p: any) => String(p.userId));
  const users = await User.find({ _id: { $in: participantIds } });
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return {
    id: String(split._id),
    creator: creator ? { id: String(creator._id), name: creator.name, email: creator.email } : null,
    merchant: split.merchant,
    note: split.note,
    totalAmount: split.totalAmount,
    splitType: split.splitType,
    participants: split.participants.map((p: any) => ({
      userId: String(p.userId),
      name: byId.get(String(p.userId))?.name ?? "Unknown",
      share: p.share
    })),
    status: split.status,
    requestIds: split.requestIds,
    createdAt: split.createdAt.toISOString()
  };
}

splitsRouter.post("/api/splits", rateLimit("split", 20, 60_000), requireAuth, wrap(async (req: AuthedRequest, res) => {
  if (!config.flags.enableGroupSplit) return res.status(403).json({ message: "Group splitting is disabled." });
  const input = splitSchema.parse(req.body);

  const total = Math.round(input.totalAmount * 100) / 100;
  let shares: { userId: string; share: number }[];

  if (input.splitType === "equal") {
    const perHead = Math.floor((total / input.participants.length) * 100) / 100;
    shares = input.participants.map((p) => ({ userId: p.userId, share: perHead }));
    const drift = Math.round((total - perHead * shares.length) * 100) / 100;
    shares[0].share = Math.round((shares[0].share + drift) * 100) / 100;
  } else if (input.splitType === "percentage") {
    const percentTotal = input.participants.reduce((sum, p) => sum + p.share, 0);
    if (Math.round(percentTotal) !== 100) {
      return res.status(422).json({ message: `Percentages must add up to 100% (currently ${Math.round(percentTotal * 100) / 100}%).` });
    }
    shares = input.participants.map((p) => ({ userId: p.userId, share: Math.round(total * (p.share / 100) * 100) / 100 }));
  } else {
    shares = input.participants.map((p) => ({ userId: p.userId, share: Math.round(p.share * 100) / 100 }));
  }

  const shareTotal = Math.round(shares.reduce((sum, s) => sum + s.share, 0) * 100) / 100;
  if (Math.abs(shareTotal - total) > 0.01) {
    return res.status(422).json({ message: `Participant shares must add up to the total (₹${shareTotal} ≠ ₹${total}).` });
  }

  const split = await ExpenseSplit.create({
    creatorId: req.userId,
    merchant: input.merchant,
    note: input.note,
    totalAmount: total,
    splitType: input.splitType,
    participants: shares,
    status: "REQUESTED",
    requestIds: []
  });

  // Reimbursement requests for every other participant.
  for (const share of shares) {
    if (share.userId === req.userId || share.share <= 0) continue;
    await relationshipContext(req.userId!, share.userId);
    const requestId = await generateUniqueId("REQ", 4, async (candidate) => Boolean(await PaymentRequest.exists({ requestId: candidate })));
    await PaymentRequest.create({
      requestId,
      senderId: req.userId,
      payerId: share.userId,
      counterpartyId: share.userId,
      amount: share.share,
      reason: `Split — ${input.merchant}`,
      description: input.note || `Your share of ${input.merchant} (₹${total} total)`,
      type: "split_expense",
      merchantName: input.merchant,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "REQUESTED"
    });
    split.requestIds.push(requestId);
    await notify({ userId: share.userId, type: "NEW_REQUEST", title: "Expense split", message: `Your share of ${input.merchant} is ₹${share.share}.`, relatedEntity: "payment-request", relatedEntityId: requestId });
  }
  await split.save();

  await audit({ actorId: req.userId!, entityType: "ExpenseSplit", entityId: String(split._id), action: "SPLIT_CREATED", newState: "REQUESTED", metadata: { total, merchant: input.merchant, participants: shares.length } });

  res.status(201).json(await serializeSplit(split));
}));

splitsRouter.get("/api/splits", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const rows = await ExpenseSplit.find({
    $or: [{ creatorId: req.userId }, { "participants.userId": req.userId }]
  }).sort({ createdAt: -1 }).limit(50);
  res.json(await Promise.all(rows.map(serializeSplit)));
}));

splitsRouter.get("/api/splits/:id", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const split = await ExpenseSplit.findById(req.params.id);
  if (!split || ![String(split.creatorId), ...split.participants.map((p: { userId: string }) => String(p.userId))].includes(req.userId!)) {
    return res.status(404).json({ message: "Split not found." });
  }
  res.json(await serializeSplit(split));
}));
