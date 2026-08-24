import type { PayTransactionStatus, PaymentRequestStatus } from "@ledger/shared";

export const REQUEST_TRANSITIONS: Record<PaymentRequestStatus, PaymentRequestStatus[]> = {
  REQUESTED: ["ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED", "COMPLETED"],
  ACCEPTED: ["COMPLETED", "CANCELLED", "EXPIRED"],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
  COMPLETED: []
};

export const TRANSACTION_TRANSITIONS: Record<PayTransactionStatus, PayTransactionStatus[]> = {
  REQUESTED: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["PAYMENT_STARTED", "CANCELLED"],
  PAYMENT_STARTED: ["UPI_RETURNED", "FAILED", "CANCELLED"],
  UPI_RETURNED: ["PENDING_VERIFICATION"],
  PENDING_VERIFICATION: ["EVIDENCE_SUBMITTED", "FAILED"],
  EVIDENCE_SUBMITTED: ["AWAITING_CONFIRMATION", "DISPUTED"],
  AWAITING_CONFIRMATION: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  FAILED: [],
  DISPUTED: []
};

export class TransitionError extends Error {
  status = 409;
  constructor(message: string) {
    super(message);
  }
}

export function assertTransition(
  kind: "request" | "transaction",
  from: string,
  to: string
) {
  const table = kind === "request" ? REQUEST_TRANSITIONS : TRANSACTION_TRANSITIONS;
  const allowed = table[from as keyof typeof table] ?? [];
  if (!allowed.includes(to as never)) {
    throw new TransitionError(`Invalid state change: ${from} → ${to} is not allowed.`);
  }
}

/** Lazy expiry: a REQUESTED request past its expiry becomes EXPIRED. */
export function isExpiredRequest(status: string, expiresAt: Date) {
  return status === "REQUESTED" && expiresAt.getTime() < Date.now();
}
