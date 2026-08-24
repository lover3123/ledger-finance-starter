import { Router, type NextFunction, type Request, type Response } from "express";
import { AuditLog, PayTransaction, PaymentRequest } from "../models/index.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const auditRouter = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

auditRouter.get("/api/audit/:entityType/:entityId", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const { entityType, entityId } = req.params;

  // Authorization: only entities the user participates in.
  const eid = String(entityId);
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(eid);
  if (entityType === "PayTransaction") {
    let txn = await PayTransaction.findOne({ transactionId: eid });
    if (!txn && isObjectId) txn = await PayTransaction.findOne({ _id: eid });
    if (!txn || ![txn.payerId, txn.beneficiaryId, txn.counterpartyId].map(String).includes(req.userId!)) {
      return res.status(404).json({ message: "Entity not found." });
    }
  } else if (entityType === "PaymentRequest") {
    let request = await PaymentRequest.findOne({ requestId: eid });
    if (!request && isObjectId) request = await PaymentRequest.findOne({ _id: eid });
    if (!request || ![request.senderId, request.payerId, request.counterpartyId].map(String).includes(req.userId!)) {
      return res.status(404).json({ message: "Entity not found." });
    }
  }

  const events = await AuditLog.find({ entityType, entityId }).sort({ createdAt: 1 }).limit(100);
  res.json(events.map((event) => ({
    id: String(event._id),
    actor: String(event.actorId),
    action: event.action,
    previousState: event.previousState,
    newState: event.newState,
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString()
  })));
}));
