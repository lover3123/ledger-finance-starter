import { Router, type NextFunction, type Request, type Response } from "express";
import { sessionReturnSchema, sessionStartSchema } from "@ledger/shared";
import { PaymentRequest, PaymentSession, PayTransaction } from "../models/index.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";
import { generateSessionId, generateTransactionId } from "../services/ids.js";
import { assertTransition, TransitionError } from "../services/stateMachine.js";
import { getOrCreateRelationship } from "../services/helpers.js";
import { getProvider } from "../services/payments/provider.js";
import { isSandbox } from "../config.js";

async function findSessionById(id: string) {
  let r = await PaymentSession.findOne({ sessionId: id });
  if (r) return r;
  if (/^[0-9a-fA-F]{24}$/.test(id)) {
    r = await PaymentSession.findOne({ _id: id });
  }
  return r ?? null;
}

export const paymentSessionsRouter = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

async function serializeSession(session: any) {
  return {
    id: String(session._id),
    sessionId: session.sessionId,
    requestId: session.requestId,
    transactionId: session.transactionId,
    payerId: String(session.payerId),
    merchantName: session.merchantName,
    merchantUpiId: session.merchantUpiId,
    amount: session.amount,
    currency: session.currency,
    upiIntent: session.upiIntent,
    provider: session.provider,
    providerReference: session.providerReference,
    status: session.status,
    appLinks: session.providerResponse?.appLinks ?? [],
    sandbox: isSandbox,
    sandboxResult: session.sandboxResult,
    createdAt: session.createdAt.toISOString()
  };
}

async function createTransactionForSession(session: any, request: any, payerId: string, counterpartyId: string) {
  const relationship = await getOrCreateRelationship(payerId, counterpartyId);
  const beneficiaryId = String(request.senderId) === payerId ? String(request.counterpartyId) : String(request.senderId);
  return PayTransaction.create({
    transactionId: generateTransactionId(),
    requestId: request?.requestId,
    paymentSessionId: session.sessionId,
    relationshipId: relationship._id,
    payerId,
    beneficiaryId,
    counterpartyId,
    merchantName: session.merchantName,
    merchantUpiId: session.merchantUpiId,
    amount: session.amount,
    type: request?.type ?? "other",
    reason: request?.reason ?? session.merchantName,
    status: "ACCEPTED",
    dueDate: request?.dueDate,
    debt: null
  });
}

// Create a session for an accepted request (payer action).
paymentSessionsRouter.post("/api/payment-sessions", rateLimit("session-create", 20, 60_000), requireAuth, wrap(async (req: AuthedRequest, res) => {
  const input = sessionStartSchema.parse(req.body);
  let request = await PaymentRequest.findOne({ requestId: input.requestId });
  if (!request && /^[0-9a-fA-F]{24}$/.test(input.requestId)) {
    request = await PaymentRequest.findOne({ _id: input.requestId });
  }
  if (!request || ![request.senderId, request.payerId, request.counterpartyId].map(String).includes(req.userId!)) {
    return res.status(404).json({ message: "Request not found." });
  }
  if (request.status !== "ACCEPTED") {
    throw new TransitionError(`This request is ${request.status} — it must be accepted before payment can start.`);
  }
  if (String(request.payerId) !== req.userId) throw new TransitionError("Only the accepted payer can start this payment.");

  const idempotencyKey = (req.headers["idempotency-key"] as string) || undefined;
  if (idempotencyKey) {
    const existing = await PaymentSession.findOne({ idempotencyKey, payerId: req.userId });
    if (existing) return res.json({ ...(await serializeSession(existing)), duplicate: true });
  }

  const counterpartyId = String(request.senderId) === req.userId ? String(request.counterpartyId) : String(request.senderId);
  const sessionId = generateSessionId();
  const provider = getProvider();
  const created = provider.createSession({
    amount: request.amount,
    merchantName: input.merchantName,
    merchantUpiId: input.merchantUpiId,
    note: request.reason,
    sessionId
  });

  const session = await PaymentSession.create({
    sessionId,
    requestId: request.requestId,
    payerId: req.userId,
    counterpartyId,
    merchantName: input.merchantName,
    merchantUpiId: input.merchantUpiId,
    amount: request.amount,
    provider: provider.name,
    providerResponse: { ...created.providerResponse, appLinks: created.appLinks },
    providerReference: created.providerReference,
    upiIntent: created.upiIntent,
    status: "CREATED",
    idempotencyKey
  });

  const txn = await createTransactionForSession(session, request, req.userId!, counterpartyId);
  session.transactionId = txn.transactionId;
  await session.save();

  assertTransition("transaction", txn.status, "PAYMENT_STARTED");
  txn.status = "PAYMENT_STARTED";
  txn.verification.upiAppResult = "NOT_STARTED";
  await txn.save();

  await audit({ actorId: req.userId!, entityType: "PaymentSession", entityId: session.sessionId, action: "PAYMENT_STARTED", newState: "PAYMENT_STARTED", metadata: { transactionId: txn.transactionId, provider: provider.name } });
  await notify({ userId: counterpartyId, type: "PAYMENT_STARTED", title: "Payment started", message: `A payment of ₹${session.amount} for ${request.requestId} has been started.`, relatedEntity: "pay-transaction", relatedEntityId: txn.transactionId });

  res.status(201).json({ ...(await serializeSession(session)), transactionId: txn.transactionId });
}));

// Get a payment session by sessionId or _id
paymentSessionsRouter.get("/api/payment-sessions/:id", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const session = await findSessionById(String(req.params.id));
  if (!session || String(session.payerId) !== req.userId) return res.status(404).json({ message: "Payment session not found." });
  res.json(await serializeSession(session));
}));

// The payer returned from the UPI app. This is NOT verification.
paymentSessionsRouter.post("/api/payment-sessions/:id/return", rateLimit("session-return", 40, 60_000), requireAuth, wrap(async (req: AuthedRequest, res) => {
  const input = sessionReturnSchema.parse(req.body);
  const session = await findSessionById(String(req.params.id));
  if (!session || String(session.payerId) !== req.userId) return res.status(404).json({ message: "Payment session not found." });
  if (["RETURNED", "COMPLETED"].includes(session.status)) {
    return res.status(409).json({ message: "This payment session has already been processed." });
  }

  const provider = getProvider();
  const outcome = provider.handleReturn(input);
  session.status = "RETURNED";
  session.providerReference = outcome.providerReference ?? session.providerReference;
  session.providerResponse = { ...session.providerResponse, return: outcome.providerResponse };
  session.sandboxResult = input.result;
  await session.save();

  const txn = await PayTransaction.findOne({ paymentSessionId: session.sessionId });
  if (!txn) return res.status(404).json({ message: "Linked transaction not found." });

  assertTransition("transaction", txn.status, "UPI_RETURNED");
  const previous = txn.status;
  txn.status = "UPI_RETURNED";
  txn.providerReference = outcome.providerReference ?? txn.providerReference;
  txn.verification.upiAppResult = input.result === "SUCCESS" ? "RETURNED" : input.result === "FAILED" ? "FAILED" : input.result === "CANCELLED" ? "CANCELLED" : input.result === "PENDING" ? "PENDING" : "UNKNOWN";
  await txn.save();
  await audit({ actorId: req.userId!, entityType: "PayTransaction", entityId: txn.transactionId, action: "UPI_RETURNED", previousState: previous, newState: "UPI_RETURNED", metadata: { result: input.result } });

  if (input.result === "SUCCESS") {
    assertTransition("transaction", txn.status, "PENDING_VERIFICATION");
    txn.status = "PENDING_VERIFICATION";
    await txn.save();
    await audit({ actorId: req.userId!, entityType: "PayTransaction", entityId: txn.transactionId, action: "PENDING_VERIFICATION", newState: "PENDING_VERIFICATION" });
    await notify({ userId: String(txn.counterpartyId) === req.userId ? String(txn.beneficiaryId) : String(txn.counterpartyId), type: "PAYMENT_RETURNED", title: "Payment returned", message: `₹${txn.amount} payment returned from the UPI app. Verification pending.`, relatedEntity: "pay-transaction", relatedEntityId: txn.transactionId });
    res.json({
      session: await serializeSession(session),
      transactionStatus: txn.status,
      verification: txn.verification,
      message: "Payment result received. Independent verification is unavailable — you may submit payment evidence.",
      canSubmitEvidence: true
    });
    return;
  }

  assertTransition("transaction", txn.status, "FAILED");
  txn.status = input.result === "CANCELLED" ? "CANCELLED" : "FAILED";
  txn.verification.upiAppResult = input.result === "CANCELLED" ? "CANCELLED" : "FAILED";
  await txn.save();
  await audit({ actorId: req.userId!, entityType: "PayTransaction", entityId: txn.transactionId, action: input.result === "CANCELLED" ? "PAYMENT_CANCELLED" : "PAYMENT_FAILED", previousState: "UPI_RETURNED", newState: txn.status });
  await notify({ userId: String(txn.beneficiaryId), type: "PAYMENT_FAILED", title: "Payment not completed", message: `The ₹${txn.amount} payment did not complete (${input.result.toLowerCase()}).`, relatedEntity: "pay-transaction", relatedEntityId: txn.transactionId });
  res.json({ session: await serializeSession(session), transactionStatus: txn.status, verification: txn.verification, message: `Payment ${input.result.toLowerCase()}. Nothing has been verified or recorded as paid.` });
}));

// Sandbox-only explicit simulation endpoint (development convenience).
paymentSessionsRouter.post("/api/payment-sessions/:id/sandbox", rateLimit("sandbox", 60, 60_000), requireAuth, wrap(async (req: AuthedRequest, res) => {
  if (!isSandbox) return res.status(403).json({ message: "Sandbox controls are disabled." });
  const { result } = req.body as { result?: string };
  if (!["SUCCESS", "FAILED", "PENDING", "CANCEL"].includes(result ?? "")) {
    return res.status(400).json({ message: "Unknown sandbox result." });
  }
  const mapped = result === "CANCEL" ? "CANCELLED" : result;
  const upiRef = `SBX${Date.now().toString(36).toUpperCase()}`;
  res.json({ ok: true, result: mapped, upiTransactionReference: upiRef, providerResponse: { simulated: true, sandboxResult: result } });
}));
