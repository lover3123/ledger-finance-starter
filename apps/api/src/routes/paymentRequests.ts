import { Router, type NextFunction, type Request, type Response } from "express";
import { createRequestSchema } from "@ledger/shared";
import { PaymentRequest, PayTransaction, User } from "../models/index.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";
import { generateTransactionId, generateUniqueId } from "../services/ids.js";
import { TransitionError, assertTransition } from "../services/stateMachine.js";
import { assertWithinLimit, expireIfNeeded, getOrCreateRelationship, relationshipContext, toPayUser } from "../services/helpers.js";

/** Mongoose 9 crashes on $or when one branch tries to cast a non-ObjectId string.
 *  This helper tries requestId first, then _id only if it looks like a valid ObjectId. */
async function findRequestById(id: string) {
  let r = await PaymentRequest.findOne({ requestId: id });
  if (r) return r;
  if (/^[0-9a-fA-F]{24}$/.test(id)) {
    r = await PaymentRequest.findOne({ _id: id });
  }
  return r ?? null;
}

export const paymentRequestsRouter = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

function requestExpiry() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

export async function serializeRequest(request: any) {
  const [sender, payer, counterparty] = await Promise.all([
    User.findById(request.senderId),
    User.findById(request.payerId),
    User.findById(request.counterpartyId)
  ]);
  return {
    id: String(request._id),
    requestId: request.requestId,
    sender: sender ? toPayUser(sender) : null,
    payer: payer ? toPayUser(payer) : null,
    counterparty: counterparty ? toPayUser(counterparty) : null,
    amount: request.amount,
    currency: request.currency,
    reason: request.reason,
    description: request.description,
    type: request.type,
    merchantName: request.merchantName,
    merchantUpiId: request.merchantUpiId,
    dueDate: request.dueDate?.toISOString(),
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    transactionId: request.transactionId
  };
}

paymentRequestsRouter.post("/api/payment-requests", rateLimit("create-request", 30, 60_000), requireAuth, wrap(async (req: AuthedRequest, res) => {
  const input = createRequestSchema.parse(req.body);
  const counterparty = await User.findById(input.counterpartyId);
  if (!counterparty) return res.status(404).json({ message: "Recipient not found." });

  const { relationship } = await relationshipContext(req.userId!, input.counterpartyId);
  try {
    await assertWithinLimit(relationship, input.amount, req.userId!, counterparty.name);
  } catch (error: any) {
    if (error?.message === "LIMIT_EXCEEDED") {
      return res.status(422).json({
        message: `This request exceeds your current agreed limit with ${error.limit.counterpartyName}.`,
        code: "LIMIT_EXCEEDED",
        limit: error.limit
      });
    }
    throw error;
  }

  const payerId = input.type === "gift" ? req.userId! : input.counterpartyId;
  const requestId = await generateUniqueId("REQ", 4, async (candidate) => Boolean(await PaymentRequest.exists({ requestId: candidate })));
  const request = await PaymentRequest.create({
    requestId,
    senderId: req.userId,
    payerId,
    counterpartyId: input.counterpartyId,
    amount: input.amount,
    reason: input.reason,
    description: input.description,
    type: input.type,
    merchantName: input.upiIntent?.merchantName,
    merchantUpiId: input.upiIntent?.merchantUpiId,
    dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
    expiresAt: requestExpiry(),
    status: "REQUESTED"
  });

  await audit({
    actorId: req.userId!, entityType: "PaymentRequest", entityId: requestId,
    action: "REQUEST_CREATED", newState: "REQUESTED",
    metadata: { amount: input.amount, type: input.type, reason: input.reason }
  });
  await notify({
    userId: payerId, type: "NEW_REQUEST", title: "New payment request",
    message: `${(await User.findById(req.userId))?.name ?? "A contact"} requested ${input.type.replace("_", " ")} of ₹${input.amount}.`,
    relatedEntity: "payment-request", relatedEntityId: requestId
  });

  const senderDoc = await User.findById(req.userId);
  res.status(201).json({
    ...(await serializeRequest(request)),
    senderName: senderDoc?.name ?? "Unknown",
    limitApprovalRequired: false,
    message: `Request ${requestId} created. Waiting for ${counterparty.name.split(" ")[0]} to respond.`
  });
}));

paymentRequestsRouter.get("/api/payment-requests", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const box = req.query.box === "incoming" ? req.query.box : "all";
  const query: Record<string, unknown> = {
    $or: [{ senderId: req.userId }, { payerId: req.userId }, { counterpartyId: req.userId }]
  };
  if (box === "incoming") query.payerId = req.userId;
  const rows = await PaymentRequest.find(query).sort({ createdAt: -1 }).limit(100);
  for (const row of rows) await expireIfNeeded(row);
  const serialized = await Promise.all(rows.map(serializeRequest));
  res.json(serialized);
}));

paymentRequestsRouter.get("/api/payment-requests/:id", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  const request = await findRequestById(id);
  if (!request || ![request.senderId, request.payerId, request.counterpartyId].map(String).includes(req.userId!)) {
    return res.status(404).json({ message: "Request not found." });
  }
  await expireIfNeeded(request);
  res.json(await serializeRequest(request));
}));

paymentRequestsRouter.patch("/api/payment-requests/:id/accept", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const request = await findRequestById(String(req.params.id));
  if (!request || ![request.senderId, request.payerId, request.counterpartyId].map(String).includes(req.userId!)) {
    return res.status(404).json({ message: "Request not found." });
  }
  await expireIfNeeded(request);
  if (String(request.payerId) !== req.userId) throw new TransitionError("Only the requested payer can accept this request.");
  assertTransition("request", request.status, "ACCEPTED");
  const previous = request.status;
  request.status = "ACCEPTED";
  await request.save();

  await audit({ actorId: req.userId!, entityType: "PaymentRequest", entityId: request.requestId, action: "REQUEST_ACCEPTED", previousState: previous, newState: "ACCEPTED" });
  await notify({ userId: String(request.senderId), type: "REQUEST_ACCEPTED", title: "Request accepted", message: `Your request ${request.requestId} for ₹${request.amount} was accepted.`, relatedEntity: "payment-request", relatedEntityId: request.requestId });

  // Split expense: the debt exists the moment the split is accepted.
  if (request.type === "split_expense") {
    const relationship = await getOrCreateRelationship(String(request.senderId), String(request.payerId));
    const creator = await User.findById(request.senderId);
    const debtTxn = await PayTransaction.create({
      transactionId: generateTransactionId(),
      requestId: request.requestId,
      relationshipId: relationship._id,
      payerId: request.payerId,
      beneficiaryId: request.senderId,
      counterpartyId: request.counterpartyId,
      merchantName: request.merchantName || request.reason,
      merchantUpiId: request.merchantUpiId || creator?.upiId || "ledger@internal",
      amount: request.amount,
      type: "split_expense",
      reason: `Split — ${request.reason}`,
      status: "COMPLETED",
      verification: { upiAppResult: "NOT_STARTED", authority: "NOT_AVAILABLE", receiverConfirmation: "CONFIRMED" },
      debt: { debtorId: request.payerId, creditorId: request.senderId, kind: "CREATE", status: "OUTSTANDING", settledAmount: 0 }
    });
    await audit({ actorId: req.userId!, entityType: "PayTransaction", entityId: debtTxn.transactionId, action: "DEBT_CREATED", newState: "OUTSTANDING", metadata: { source: request.requestId } });
    request.transactionId = debtTxn.transactionId;
    await request.save();
  }

  res.json(await serializeRequest(request));
}));

paymentRequestsRouter.patch("/api/payment-requests/:id/reject", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const request = await findRequestById(String(req.params.id));
  if (!request || ![request.senderId, request.payerId, request.counterpartyId].map(String).includes(req.userId!)) {
    return res.status(404).json({ message: "Request not found." });
  }
  if (String(request.payerId) !== req.userId) throw new TransitionError("Only the requested payer can reject this request.");
  assertTransition("request", request.status, "REJECTED");
  const previous = request.status;
  request.status = "REJECTED";
  await request.save();
  await audit({ actorId: req.userId!, entityType: "PaymentRequest", entityId: request.requestId, action: "REQUEST_REJECTED", previousState: previous, newState: "REJECTED" });
  await notify({ userId: String(request.senderId), type: "REQUEST_REJECTED", title: "Request rejected", message: `Your request ${request.requestId} was rejected.`, relatedEntity: "payment-request", relatedEntityId: request.requestId });
  res.json(await serializeRequest(request));
}));

paymentRequestsRouter.patch("/api/payment-requests/:id/cancel", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const request = await findRequestById(String(req.params.id));
  if (!request || ![request.senderId, request.payerId, request.counterpartyId].map(String).includes(req.userId!)) {
    return res.status(404).json({ message: "Request not found." });
  }
  if (String(request.senderId) !== req.userId) throw new TransitionError("Only the sender can cancel this request.");
  assertTransition("request", request.status, "CANCELLED");
  const previous = request.status;
  request.status = "CANCELLED";
  await request.save();
  await audit({ actorId: req.userId!, entityType: "PaymentRequest", entityId: request.requestId, action: "REQUEST_CANCELLED", previousState: previous, newState: "CANCELLED" });
  await notify({ userId: String(request.payerId), type: "REQUEST_CANCELLED", title: "Request cancelled", message: `Request ${request.requestId} was cancelled by the sender.`, relatedEntity: "payment-request", relatedEntityId: request.requestId });
  res.json(await serializeRequest(request));
}));

// Route not used yet: reserved for limit-override approval flow (feature-flagged).
paymentRequestsRouter.post("/api/payment-requests/:id/request-approval", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const request = await findRequestById(String(req.params.id));
  if (!request || String(request.senderId) !== req.userId) return res.status(404).json({ message: "Request not found." });
  await notify({
    userId: String(request.payerId), type: "LIMIT_APPROVAL_REQUESTED", title: "Approval requested",
    message: `A request of ₹${request.amount} exceeds your agreed limit. Approve or decline in Pending Payments.`,
    relatedEntity: "payment-request", relatedEntityId: request.requestId
  });
  res.json({ message: "Approval requested from the payer." });
}));
