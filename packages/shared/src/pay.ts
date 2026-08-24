import { z } from "zod";

export const PAYMENT_TYPES = ["borrow", "pay_on_behalf", "split_expense", "gift", "other"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_REQUEST_STATUSES = [
  "REQUESTED", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED", "COMPLETED"
] as const;
export type PaymentRequestStatus = (typeof PAYMENT_REQUEST_STATUSES)[number];

export const PAY_TRANSACTION_STATUSES = [
  "REQUESTED", "ACCEPTED", "PAYMENT_STARTED", "UPI_RETURNED", "PENDING_VERIFICATION",
  "EVIDENCE_SUBMITTED", "AWAITING_CONFIRMATION", "COMPLETED",
  "REJECTED", "CANCELLED", "FAILED", "DISPUTED"
] as const;
export type PayTransactionStatus = (typeof PAY_TRANSACTION_STATUSES)[number];

export type AuthorityVerification = "NOT_AVAILABLE" | "VERIFIED" | "FAILED";
export type ReceiverConfirmation = "PENDING" | "CONFIRMED" | "REJECTED";
export type UpiAppResult = "NOT_STARTED" | "RETURNED" | "FAILED" | "CANCELLED" | "PENDING" | "UNKNOWN";
export type EvidenceStatus = "SUBMITTED" | "ACCEPTED" | "REJECTED" | "FLAGGED";
export type FriendshipStatus = "PENDING" | "ACCEPTED" | "BLOCKED" | "REJECTED" | "REMOVED";
export type DebtKind = "CREATE" | "SETTLE";
export type LendingStatus = "OUTSTANDING" | "PARTIALLY_SETTLED" | "SETTLED" | "DISPUTED" | "CANCELLED";
export type SettlementStatus = "CREATED" | "COMPLETED" | "CANCELLED";
export type SplitType = "equal" | "custom" | "percentage";
export type PaymentResultStatus = "SUCCESS" | "FAILED" | "CANCELLED" | "PENDING" | "UNKNOWN";

export type PayUserDTO = { id: string; name: string; email: string; upiId?: string };

export type FriendDTO = {
  friendshipId: string;
  user: PayUserDTO;
  status: FriendshipStatus;
  direction: "incoming" | "outgoing" | "mutual";
  relationshipId?: string;
  netBalance?: number;
};

export type RelationshipDTO = {
  id: string;
  friend: PayUserDTO;
  status: FriendshipStatus;
  monthlyLimit: number;
  maxTransaction: number;
  maxOutstanding: number;
  usedAmount: number;
  owedToMe: number;
  iOwe: number;
  net: number;
};

export type PaymentRequestDTO = {
  id: string;
  requestId: string;
  sender: PayUserDTO;
  payer: PayUserDTO;
  counterparty: PayUserDTO;
  amount: number;
  currency: string;
  reason: string;
  merchantName?: string;
  description: string;
  type: PaymentType;
  dueDate?: string;
  status: PaymentRequestStatus;
  createdAt: string;
  expiresAt: string;
  limitExceeded?: { available: number; requested: number; excess: number } | null;
};

export type EvidenceDTO = {
  id: string;
  transactionId: string;
  uploadedBy: string;
  uploadedByName?: string;
  fileUrl?: string;
  transactionReference?: string;
  note?: string;
  status: EvidenceStatus;
  submittedAt: string;
};

export type AuditEventDTO = {
  id: string;
  actor: string;
  action: string;
  previousState?: string;
  newState?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type PayTransactionDTO = {
  id: string;
  transactionId: string;
  request?: { id: string; requestId: string } | null;
  session?: { id: string; sessionId: string; providerReference?: string } | null;
  relationshipId: string;
  payer: PayUserDTO;
  beneficiary: PayUserDTO;
  counterparty: PayUserDTO;
  merchantName: string;
  merchantUpiId: string;
  amount: number;
  currency: string;
  type: PaymentType;
  reason: string;
  status: PayTransactionStatus;
  verification: {
    upiAppResult: UpiAppResult;
    authority: AuthorityVerification;
    receiverConfirmation: ReceiverConfirmation;
  };
  debt: { debtorId: string; creditorId: string; kind: DebtKind; status: LendingStatus; settledAmount?: number } | null;
  evidence: EvidenceDTO[];
  timeline: AuditEventDTO[];
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  providerReference?: string;
  netSentence?: string;
  disputeReason?: string;
};

export type SettlementDTO = {
  id: string;
  relationshipId: string;
  payer: PayUserDTO;
  receiver: PayUserDTO;
  amount: number;
  status: SettlementStatus;
  transactionId?: string;
  createdAt: string;
};

export type SplitParticipantDTO = { userId: string; name: string; share: number };

export type ExpenseSplitDTO = {
  id: string;
  creator: PayUserDTO;
  merchant: string;
  note: string;
  totalAmount: number;
  splitType: SplitType;
  participants: SplitParticipantDTO[];
  status: string;
  createdAt: string;
};

export type NotificationDTO = {
  id: string;
  type: string;
  title: string;
  message: string;
  relatedEntity?: string;
  relatedEntityId?: string;
  read: boolean;
  createdAt: string;
};

export type PaySummaryDTO = {
  owedToMe: number;
  iOwe: number;
  net: number;
  pendingRequests: number;
  pendingConfirmations: number;
  recentActivity: {
    transactionId: string;
    title: string;
    counterparty: string;
    direction: "owes_you" | "you_owe";
    amount: number;
    createdAt: string;
  }[];
};

// ---------- validation schemas ----------

export const createRequestSchema = z.object({
  counterpartyId: z.string().min(1),
  amount: z.number().positive().max(10_000_000),
  type: z.enum(PAYMENT_TYPES),
  reason: z.string().trim().min(3).max(80),
  description: z.string().trim().max(300).optional().default(""),
  dueDate: z.string().datetime().optional(),
  upiIntent: z.object({
    merchantName: z.string().trim().min(1).max(80),
    merchantUpiId: z.string().trim().min(3).max(120)
  }).optional()
});

export const merchantSchema = z.object({
  merchantName: z.string().trim().min(1).max(80),
  merchantUpiId: z.string().trim().min(3).max(120),
  amount: z.number().positive().optional(),
  note: z.string().trim().max(120).optional()
});

export const sessionStartSchema = z.object({
  requestId: z.string().min(1),
  merchantName: z.string().trim().min(1).max(80),
  merchantUpiId: z.string().trim().min(3).max(120)
});

export const sessionReturnSchema = z.object({
  result: z.enum(["SUCCESS", "FAILED", "CANCELLED", "PENDING", "UNKNOWN"]),
  upiTransactionReference: z.string().trim().max(80).optional(),
  providerResponse: z.record(z.string(), z.unknown()).optional()
});

export const evidenceSchema = z.object({
  transactionReference: z.string().trim().min(4).max(80),
  note: z.string().trim().max(300).optional().default("")
});

export const disputeSchema = z.object({
  reason: z.string().trim().min(3).max(200)
});

export const settlementSchema = z.object({
  amount: z.number().positive()
});

export const splitSchema = z.object({
  merchant: z.string().trim().min(1).max(80),
  note: z.string().trim().max(120).optional().default(""),
  totalAmount: z.number().positive(),
  splitType: z.enum(["equal", "custom", "percentage"]),
  participants: z.array(z.object({
    userId: z.string().min(1),
    share: z.number().nonnegative()
  })).min(1).max(20)
});

export const relationshipLimitsSchema = z.object({
  monthlyLimit: z.number().min(0).max(10_000_000).optional(),
  maxTransaction: z.number().min(0).max(10_000_000).optional(),
  maxOutstanding: z.number().min(0).max(10_000_000).optional()
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  upiId: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional()
});
