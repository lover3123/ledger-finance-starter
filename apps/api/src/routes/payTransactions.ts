import fs from "node:fs";
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import { disputeSchema, evidenceSchema } from "@ledger/shared";
import { AuditLog, PayTransaction, PaymentRequest, User } from "../models/index.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";
import { newId } from "../services/ids.js";
import { TransitionError, assertTransition } from "../services/stateMachine.js";
import { getRelationshipAuthorized } from "../services/helpers.js";
import { computePairBalance, debtEffectFor, netDirection } from "../services/balances.js";
import { config, isSandbox } from "../config.js";
import multer from "multer";

/** Mongoose 9: safe lookup by transactionId or _id */
async function findTxnById(id: string) {
  let r = await PayTransaction.findOne({ transactionId: id });
  if (r) return r;
  if (/^[0-9a-fA-F]{24}$/.test(id)) {
    r = await PayTransaction.findOne({ _id: id });
  }
  return r ?? null;
}

export const payTransactionsRouter = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

fs.mkdirSync(path.resolve(config.uploadDir), { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.resolve(config.uploadDir)),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${newId().slice(0, 8)}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  }
});

export async function serializePayTransaction(txn: any, userId?: string) {
  const [payer, beneficiary, counterparty] = await Promise.all([
    User.findById(txn.payerId),
    User.findById(txn.beneficiaryId),
    User.findById(txn.counterpartyId)
  ]);
  const toUser = (u: any) => (u ? { id: String(u._id), name: u.name, email: u.email, upiId: u.upiId } : null);
  const events = await AuditLog.find({ entityType: "PayTransaction", entityId: txn.transactionId }).sort({ createdAt: 1 });
  const relationship = await getRelationshipAuthorized(String(txn.relationshipId), userId ?? String(txn.payerId));
  const balance = await computePairBalance(String(txn.relationshipId), userId ?? String(txn.payerId));
  const names = await userNamePair(String(txn.payerId), String(txn.beneficiaryId));
  return {
    id: String(txn._id),
    transactionId: txn.transactionId,
    request: txn.requestId ? { id: txn.requestId, requestId: txn.requestId } : null,
    session: txn.paymentSessionId ? { id: txn.paymentSessionId, sessionId: txn.paymentSessionId, providerReference: txn.providerReference } : null,
    relationshipId: String(txn.relationshipId),
    payer: toUser(payer),
    beneficiary: toUser(beneficiary),
    counterparty: toUser(counterparty),
    merchantName: txn.merchantName,
    merchantUpiId: txn.merchantUpiId,
    amount: txn.amount,
    currency: txn.currency,
    type: txn.type,
    reason: txn.reason,
    status: txn.status,
    verification: txn.verification,
    debt: txn.debt ? {
      debtorId: String(txn.debt.debtorId),
      creditorId: String(txn.debt.creditorId),
      kind: txn.debt.kind,
      status: txn.debt.status
    } : null,
    evidence: txn.evidence.map((item: any) => ({
      id: item.id,
      transactionId: txn.transactionId,
      uploadedBy: String(item.uploadedBy),
      fileUrl: item.fileUrl,
      transactionReference: item.transactionReference,
      note: item.note,
      status: item.status,
      submittedAt: item.submittedAt.toISOString()
    })),
    timeline: events.map((event: any) => ({
      id: String(event._id),
      actor: String(event.actorId),
      action: event.action,
      previousState: event.previousState,
      newState: event.newState,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString()
    })),
    disputeReason: txn.disputeReason,
    dueDate: txn.dueDate?.toISOString(),
    createdAt: txn.createdAt.toISOString(),
    updatedAt: txn.updatedAt.toISOString(),
    netSentence: netDirection(balance, names.payer, names.beneficiary),
    sandbox: isSandbox
  };
}

async function userNamePair(payerId: string, beneficiaryId: string) {
  const [payer, beneficiary] = await Promise.all([User.findById(payerId), User.findById(beneficiaryId)]);
  return { payer: payer?.name ?? "Payer", beneficiary: beneficiary?.name ?? "Beneficiary" };
}

payTransactionsRouter.get("/api/pay/transactions", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const query: Record<string, unknown> = {
    $or: [{ payerId: req.userId }, { beneficiaryId: req.userId }, { counterpartyId: req.userId }]
  };
  if (typeof req.query.status === "string" && req.query.status) query.status = req.query.status;
  const rows = await PayTransaction.find(query).sort({ createdAt: -1 }).limit(100);
  const serialized = await Promise.all(rows.map((row) => serializePayTransaction(row, req.userId)));
  res.json(serialized);
}));

payTransactionsRouter.get("/api/pay/summary", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const rows = await PayTransaction.find({
    $or: [{ payerId: req.userId }, { beneficiaryId: req.userId }, { counterpartyId: req.userId }],
    status: { $in: ["COMPLETED"] }
  });
  let owedToMe = 0;
  let iOwe = 0;
  for (const row of rows) {
    const debt = row.debt;
    if (!debt) continue;
    const outstanding = debt.kind === "CREATE" ? row.amount - (debt.settledAmount ?? 0) : row.amount;
    if (outstanding <= 0) continue;
    if (debt.kind === "CREATE") {
      if (String(debt.creditorId) === req.userId) owedToMe += outstanding;
      if (String(debt.debtorId) === req.userId) iOwe += outstanding;
    } else {
      if (String(debt.debtorId) === req.userId) iOwe = Math.max(0, iOwe - outstanding);
      if (String(debt.creditorId) === req.userId) owedToMe = Math.max(0, owedToMe - outstanding);
    }
  }
  const pendingRequests = await PaymentRequest.countDocuments({
    status: "REQUESTED",
    $or: [{ senderId: req.userId }, { payerId: req.userId }, { counterpartyId: req.userId }]
  });
  const pendingConfirmations = await PayTransaction.countDocuments({
    status: "AWAITING_CONFIRMATION",
    beneficiaryId: req.userId
  });
  const recent = await PayTransaction.find({
    $or: [{ payerId: req.userId }, { beneficiaryId: req.userId }, { counterpartyId: req.userId }]
  }).sort({ createdAt: -1 }).limit(5);

  const recentActivity = [];
  for (const row of recent) {
    const names = await userNamePair(String(row.payerId), String(row.beneficiaryId));
    const iAmPayer = String(row.payerId) === req.userId;
    recentActivity.push({
      transactionId: row.transactionId,
      title: row.merchantName,
      counterparty: iAmPayer ? names.beneficiary : names.payer,
      direction: row.debt?.kind === "SETTLE"
        ? (String(row.debt.debtorId) === req.userId ? "you_owe" : "owes_you")
        : row.type === "gift" ? "owes_you" : (String(row.payerId) === req.userId ? "owes_you" : "you_owe"),
      amount: row.amount,
      createdAt: row.createdAt.toISOString()
    });
  }

  res.json({
    owedToMe: Math.round(owedToMe * 100) / 100,
    iOwe: Math.round(iOwe * 100) / 100,
    net: Math.round((owedToMe - iOwe) * 100) / 100,
    pendingRequests,
    pendingConfirmations,
    recentActivity
  });
}));

payTransactionsRouter.get("/api/pay/transactions/:id", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const txn = await findTxnById(String(req.params.id));
  if (!txn || ![txn.payerId, txn.beneficiaryId, txn.counterpartyId].map(String).includes(req.userId!)) {
    return res.status(404).json({ message: "Transaction not found." });
  }
  res.json(await serializePayTransaction(txn, req.userId));
}));

// Evidence upload (payer). Clearly labeled as user-submitted, not verified.
payTransactionsRouter.post("/api/pay/transactions/:id/evidence", rateLimit("evidence", 20, 60_000), requireAuth, upload.single("file"), wrap(async (req: AuthedRequest, res) => {
  if (!config.flags.enableEvidenceUpload) return res.status(403).json({ message: "Evidence upload is disabled." });
  const txn = await findTxnById(String(req.params.id));
  if (!txn || ![txn.payerId, txn.beneficiaryId, txn.counterpartyId].map(String).includes(req.userId!)) {
    return res.status(404).json({ message: "Transaction not found." });
  }
  if (String(txn.payerId) !== req.userId) throw new TransitionError("Only the payer can submit payment evidence.");
  if (!["PENDING_VERIFICATION", "EVIDENCE_SUBMITTED"].includes(txn.status)) {
    throw new TransitionError(`Evidence cannot be submitted while this transaction is ${txn.status}.`);
  }

  const input = evidenceSchema.parse(req.body);
  const duplicate = txn.evidence.find((item: { transactionReference: string }) => item.transactionReference === input.transactionReference);
  if (duplicate) return res.status(409).json({ message: "This transaction reference has already been submitted." });

  const previous = txn.status;
  if (previous === "PENDING_VERIFICATION") {
    assertTransition("transaction", previous, "EVIDENCE_SUBMITTED");
    txn.status = "EVIDENCE_SUBMITTED";
  }
  txn.evidence.push({
    id: newId(),
    uploadedBy: req.userId as never,
    fileUrl: req.file ? `/uploads/${req.file.filename}` : undefined,
    transactionReference: input.transactionReference,
    note: input.note,
    status: "SUBMITTED",
    submittedAt: new Date()
  });
  await txn.save();

  // Evidence moves the flow to the receiver's confirmation queue.
  if (txn.status === "EVIDENCE_SUBMITTED") {
    assertTransition("transaction", "EVIDENCE_SUBMITTED", "AWAITING_CONFIRMATION");
    txn.status = "AWAITING_CONFIRMATION";
    await txn.save();
  }

  await audit({ actorId: req.userId!, entityType: "PayTransaction", entityId: txn.transactionId, action: "EVIDENCE_SUBMITTED", previousState: previous, newState: "AWAITING_CONFIRMATION", metadata: { reference: input.transactionReference, file: Boolean(req.file) } });
  await notify({ userId: String(txn.beneficiaryId), type: "CONFIRMATION_REQUIRED", title: "Confirmation required", message: `${(await User.findById(req.userId))?.name ?? "The payer"} submitted evidence for a ₹${txn.amount} payment. Please confirm.`, relatedEntity: "pay-transaction", relatedEntityId: txn.transactionId });

  res.status(201).json(await serializePayTransaction(txn, req.userId));
}));

// Receiver confirms → COMPLETED + debt effects + notifications + audit.
payTransactionsRouter.post("/api/pay/transactions/:id/confirm", rateLimit("confirm", 30, 60_000), requireAuth, wrap(async (req: AuthedRequest, res) => {
  const txn = await findTxnById(String(req.params.id));
  if (!txn || ![txn.payerId, txn.beneficiaryId, txn.counterpartyId].map(String).includes(req.userId!)) {
    return res.status(404).json({ message: "Transaction not found." });
  }
  if (String(txn.beneficiaryId) !== req.userId) throw new TransitionError("Only the payment recipient can confirm this payment.");
  if (txn.status !== "AWAITING_CONFIRMATION") {
    throw new TransitionError(`This payment is ${txn.status} — nothing is awaiting your confirmation.`);
  }

  const idempotencyKey = (req.headers["idempotency-key"] as string) || undefined;
  if (idempotencyKey && txn.idempotencyKey === idempotencyKey) {
    return res.json(await serializePayTransaction(txn, req.userId));
  }

  assertTransition("transaction", txn.status, "COMPLETED");
  const previous = txn.status;
  txn.status = "COMPLETED";
  txn.verification.receiverConfirmation = "CONFIRMED";
  txn.confirmedBy = req.userId as never;
  txn.confirmedAt = new Date();
  if (idempotencyKey) txn.idempotencyKey = idempotencyKey;
  for (const item of txn.evidence) item.status = "ACCEPTED";
  await txn.save();

  // Debt effects (split reimbursements already carry their CREATE entry from acceptance).
  if (!txn.debt) {
    const effect = debtEffectFor(txn.type, String(txn.payerId), String(txn.beneficiaryId));
    if (effect) {
      txn.debt = { ...effect, status: "OUTSTANDING", settledAmount: 0 } as never;
      await txn.save();
    }
  }

  await audit({ actorId: req.userId!, entityType: "PayTransaction", entityId: txn.transactionId, action: "PAYMENT_CONFIRMED", previousState: previous, newState: "COMPLETED" });
  await audit({ actorId: req.userId!, entityType: "PayTransaction", entityId: txn.transactionId, action: "TRANSACTION_COMPLETED", newState: "COMPLETED" });
  await notify({ userId: String(txn.payerId), type: "PAYMENT_CONFIRMED", title: "Payment confirmed", message: `Your ₹${txn.amount} payment for ${txn.merchantName} was confirmed.`, relatedEntity: "pay-transaction", relatedEntityId: txn.transactionId });

  const request = txn.requestId ? await PaymentRequest.findOne({ requestId: txn.requestId }) : null;
  if (request && request.status === "ACCEPTED") {
    request.status = "COMPLETED";
    request.transactionId = txn.transactionId;
    await request.save();
  }

  res.json(await serializePayTransaction(txn, req.userId));
}));

// Receiver rejects the evidence → DISPUTED (reason required).
payTransactionsRouter.post("/api/pay/transactions/:id/dispute", rateLimit("dispute", 30, 60_000), requireAuth, wrap(async (req: AuthedRequest, res) => {
  const txn = await findTxnById(String(req.params.id));
  if (!txn || ![txn.payerId, txn.beneficiaryId, txn.counterpartyId].map(String).includes(req.userId!)) {
    return res.status(404).json({ message: "Transaction not found." });
  }
  if (String(txn.beneficiaryId) !== req.userId) throw new TransitionError("Only the payment recipient can dispute this payment.");
  if (!["AWAITING_CONFIRMATION", "EVIDENCE_SUBMITTED", "PENDING_VERIFICATION"].includes(txn.status)) {
    throw new TransitionError(`This payment is ${txn.status} and can no longer be disputed here.`);
  }
  const input = disputeSchema.parse(req.body);

  const previous = txn.status;
  assertTransition("transaction", previous, "DISPUTED");
  txn.status = "DISPUTED";
  txn.verification.receiverConfirmation = "REJECTED";
  txn.disputeReason = input.reason;
  for (const item of txn.evidence) if (item.status === "SUBMITTED") item.status = "FLAGGED";
  await txn.save();

  if (txn.debt) {
    txn.debt.status = "DISPUTED";
    await txn.save();
  }

  await audit({ actorId: req.userId!, entityType: "PayTransaction", entityId: txn.transactionId, action: "PAYMENT_REJECTED", previousState: previous, newState: "DISPUTED", metadata: { reason: input.reason } });
  await audit({ actorId: req.userId!, entityType: "PayTransaction", entityId: txn.transactionId, action: "TRANSACTION_DISPUTED", previousState: previous, newState: "DISPUTED" });
  await notify({ userId: String(txn.payerId), type: "PAYMENT_DISPUTED", title: "Payment disputed", message: `Your ₹${txn.amount} payment was disputed: ${input.reason}`, relatedEntity: "pay-transaction", relatedEntityId: txn.transactionId });

  res.json(await serializePayTransaction(txn, req.userId));
}));
