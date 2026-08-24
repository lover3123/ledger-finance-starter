import { Router } from "express";
import { relationshipLimitsSchema } from "@ledger/shared";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { relationshipWithBalance, getRelationshipAuthorized, toPayUser } from "../services/helpers.js";
import { PayTransaction, Relationship } from "../models/index.js";

export const relationshipsRouter = Router();

relationshipsRouter.get("/api/relationships", requireAuth, async (req: AuthedRequest, res) => {
  const relationships = await Relationship.find({
    $or: [{ userA: req.userId }, { userB: req.userId }]
  });
  const result = [];
  for (const relationship of relationships) {
    result.push(await relationshipWithBalance(relationship, req.userId!));
  }
  res.json(result);
});

relationshipsRouter.get("/api/relationships/:id", requireAuth, async (req: AuthedRequest, res) => {
  const relationship = await getRelationshipAuthorized(String(req.params.id), req.userId!);
  const context = await relationshipWithBalance(relationship, req.userId!);
  const rows = await PayTransaction.find({ relationshipId: relationship._id }).sort({ createdAt: -1 }).limit(12);
  res.json({ ...context, recentActivity: rows.map((row) => ({
    transactionId: row.transactionId,
    merchantName: row.merchantName,
    amount: row.amount,
    type: row.type,
    status: row.status,
    createdAt: row.createdAt
  })) });
});

relationshipsRouter.patch("/api/relationships/:id/limits", requireAuth, async (req: AuthedRequest, res) => {
  const relationship = await getRelationshipAuthorized(String(req.params.id), req.userId!);
  const input = relationshipLimitsSchema.parse(req.body);
  if (input.monthlyLimit !== undefined) relationship.monthlyLimit = input.monthlyLimit;
  if (input.maxTransaction !== undefined) relationship.maxTransaction = input.maxTransaction;
  if (input.maxOutstanding !== undefined) relationship.maxOutstanding = input.maxOutstanding;
  await relationship.save();
  await audit({ actorId: req.userId!, entityType: "Relationship", entityId: String(relationship._id), action: "LIMITS_UPDATED", metadata: input });
  const context = await relationshipWithBalance(relationship, req.userId!);
  res.json(context);
});
