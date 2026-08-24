import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
import type {
  AuthorityVerification, DebtKind, EvidenceStatus, FriendshipStatus, LendingStatus,
  PayTransactionStatus, PaymentRequestStatus, PaymentType, ReceiverConfirmation,
  SettlementStatus, SplitType, UpiAppResult
} from "@ledger/shared";

const { ObjectId } = Schema.Types;

const options = { timestamps: true } as const;

// ---------- core identity ----------

export interface IUser {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  upiId?: string;
  passwordHash: string;
  currency: string;
  startingBalance: number;
  startingBalanceDate: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  phone: String,
  upiId: { type: String, index: true },
  passwordHash: { type: String, required: true },
  currency: { type: String, default: "INR" },
  startingBalance: { type: Number, default: 0 },
  startingBalanceDate: { type: String, default: "" }
}, options);

export const User = models.User ?? model<IUser>("User", userSchema);

// ---------- personal finance (existing Ledger) ----------

export interface IPersonalTransaction {
  _id: string;
  userId: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  description: string;
  occurredAt: Date;
}

const personalTransactionSchema = new Schema({
  userId: { type: ObjectId, required: true, index: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ["income", "expense"], required: true },
  category: { type: String, required: true },
  description: { type: String, default: "" },
  occurredAt: { type: Date, required: true, index: true }
}, options);

export const PersonalTransaction = models.PersonalTransaction ?? model<IPersonalTransaction>("PersonalTransaction", personalTransactionSchema);

export interface IBudget {
  _id: string;
  userId: string;
  category: string;
  limit: number;
  month: string;
}

const budgetSchema = new Schema({
  userId: { type: ObjectId, required: true, index: true },
  category: { type: String, required: true },
  limit: { type: Number, required: true },
  month: { type: String, required: true }
}, options);
budgetSchema.index({ userId: 1, category: 1, month: 1 }, { unique: true });

export const Budget = models.Budget ?? model<IBudget>("Budget", budgetSchema);

export interface ICategory {
  _id: string;
  userId: string;
  name: string;
  archived: boolean;
}

const categorySchema = new Schema({
  userId: { type: ObjectId, required: true, index: true },
  name: { type: String, required: true },
  archived: { type: Boolean, default: false }
}, options);
categorySchema.index({ userId: 1, name: 1 }, { unique: true });

export const Category = models.Category ?? model<ICategory>("Category", categorySchema);

export interface IBalanceAdjustment {
  _id: string;
  userId: string;
  amount: number;
  reason: string;
  date: Date;
  createdBy: string;
}

const balanceAdjustmentSchema = new Schema({
  userId: { type: ObjectId, required: true, index: true },
  amount: { type: Number, required: true },
  reason: { type: String, required: true },
  date: { type: Date, default: Date.now },
  createdBy: { type: ObjectId, required: true }
}, options);

export const BalanceAdjustment = models.BalanceAdjustment ?? model<IBalanceAdjustment>("BalanceAdjustment", balanceAdjustmentSchema);

// ---------- people ----------

export interface IFriendship {
  _id: string;
  requester: string;
  recipient: string;
  status: FriendshipStatus;
}

const friendshipSchema = new Schema({
  requester: { type: ObjectId, required: true, index: true },
  recipient: { type: ObjectId, required: true, index: true },
  status: { type: String, enum: ["PENDING", "ACCEPTED", "BLOCKED", "REJECTED", "REMOVED"], default: "PENDING" }
}, options);
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });

export const Friendship = models.Friendship ?? model<IFriendship>("Friendship", friendshipSchema);

export interface IRelationship {
  _id: string;
  userA: string;
  userB: string;
  monthlyLimit: number;
  maxTransaction: number;
  maxOutstanding: number;
  usedAmount: number;
  usedMonth: string;
  status: FriendshipStatus;
}

const relationshipSchema = new Schema({
  userA: { type: ObjectId, required: true, index: true },
  userB: { type: ObjectId, required: true, index: true },
  monthlyLimit: { type: Number, default: 5000 },
  maxTransaction: { type: Number, default: 0 },
  maxOutstanding: { type: Number, default: 0 },
  usedAmount: { type: Number, default: 0 },
  usedMonth: { type: String, default: "" },
  status: { type: String, default: "ACCEPTED" }
}, options);
relationshipSchema.index({ userA: 1, userB: 1 }, { unique: true });

export const Relationship = models.Relationship ?? model<IRelationship>("Relationship", relationshipSchema);

// ---------- payment requests ----------

export interface IPaymentRequest {
  _id: string;
  requestId: string;
  senderId: string;
  payerId: string;
  counterpartyId: string;
  amount: number;
  currency: string;
  reason: string;
  description: string;
  type: PaymentType;
  merchantName?: string;
  merchantUpiId?: string;
  dueDate?: Date;
  status: PaymentRequestStatus;
  expiresAt: Date;
  transactionId?: string;
}

const paymentRequestSchema = new Schema({
  requestId: { type: String, required: true, unique: true, index: true },
  senderId: { type: ObjectId, required: true, index: true },
  payerId: { type: ObjectId, required: true, index: true },
  counterpartyId: { type: ObjectId, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  reason: { type: String, required: true },
  description: { type: String, default: "" },
  type: { type: String, enum: ["borrow", "pay_on_behalf", "split_expense", "gift", "other"], required: true },
  merchantName: String,
  merchantUpiId: String,
  dueDate: Date,
  status: { type: String, enum: ["REQUESTED", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED", "COMPLETED"], default: "REQUESTED", index: true },
  expiresAt: { type: Date, required: true },
  transactionId: String
}, options);

export const PaymentRequest = models.PaymentRequest ?? model<IPaymentRequest>("PaymentRequest", paymentRequestSchema);

// ---------- payment sessions ----------

export interface IPaymentSession {
  _id: string;
  sessionId: string;
  requestId?: string;
  transactionId?: string;
  payerId: string;
  counterpartyId: string;
  merchantName: string;
  merchantUpiId: string;
  amount: number;
  currency: string;
  upiIntent?: string;
  provider: string;
  providerResponse: Record<string, unknown>;
  providerReference?: string;
  status: string;
  idempotencyKey?: string;
  sandboxResult?: string;
}

const paymentSessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  requestId: { type: String, index: true },
  transactionId: { type: String, index: true },
  payerId: { type: ObjectId, required: true, index: true },
  counterpartyId: { type: ObjectId },
  merchantName: { type: String, required: true },
  merchantUpiId: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  upiIntent: String,
  provider: { type: String, default: "sandbox" },
  providerResponse: { type: Schema.Types.Mixed, default: {} },
  providerReference: String,
  status: { type: String, default: "CREATED", index: true },
  idempotencyKey: { type: String, index: true, sparse: true },
  sandboxResult: String
}, options);

export const PaymentSession = models.PaymentSession ?? model<IPaymentSession>("PaymentSession", paymentSessionSchema);

// ---------- relationship transactions (the pay ledger) ----------

export interface IEvidence {
  id: string;
  uploadedBy: string;
  fileUrl?: string;
  transactionReference: string;
  note?: string;
  status: EvidenceStatus;
  submittedAt: Date;
}

export interface IPayTransaction {
  _id: string;
  transactionId: string;
  requestId?: string;
  paymentSessionId?: string;
  relationshipId: string;
  payerId: string;
  beneficiaryId: string;
  counterpartyId: string;
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
  providerReference?: string;
  debt?: {
    debtorId: string;
    creditorId: string;
    kind: DebtKind;
    status: LendingStatus;
    settledAmount: number;
  };
  evidence: IEvidence[];
  confirmedBy?: string;
  confirmedAt?: Date;
  disputeReason?: string;
  dueDate?: Date;
  idempotencyKey?: string;
}

const evidenceSchema = new Schema({
  id: { type: String, required: true },
  uploadedBy: { type: ObjectId, required: true },
  fileUrl: String,
  transactionReference: { type: String, required: true },
  note: String,
  status: { type: String, enum: ["SUBMITTED", "ACCEPTED", "REJECTED", "FLAGGED"], default: "SUBMITTED" },
  submittedAt: { type: Date, default: Date.now }
}, { _id: false });

const payTransactionSchema = new Schema({
  transactionId: { type: String, required: true, unique: true, index: true },
  requestId: { type: String, index: true },
  paymentSessionId: { type: String, index: true },
  relationshipId: { type: ObjectId, required: true, index: true },
  payerId: { type: ObjectId, required: true, index: true },
  beneficiaryId: { type: ObjectId, required: true, index: true },
  counterpartyId: { type: ObjectId, required: true },
  merchantName: { type: String, required: true },
  merchantUpiId: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  type: { type: String, enum: ["borrow", "pay_on_behalf", "split_expense", "gift", "other"], required: true },
  reason: { type: String, default: "" },
  status: {
    type: String,
    enum: ["REQUESTED", "ACCEPTED", "PAYMENT_STARTED", "UPI_RETURNED", "PENDING_VERIFICATION", "EVIDENCE_SUBMITTED", "AWAITING_CONFIRMATION", "COMPLETED", "REJECTED", "CANCELLED", "FAILED", "DISPUTED"],
    default: "REQUESTED",
    index: true
  },
  verification: {
    upiAppResult: { type: String, enum: ["NOT_STARTED", "RETURNED", "FAILED", "CANCELLED", "PENDING", "UNKNOWN"], default: "NOT_STARTED" },
    authority: { type: String, enum: ["NOT_AVAILABLE", "VERIFIED", "FAILED"], default: "NOT_AVAILABLE" },
    receiverConfirmation: { type: String, enum: ["PENDING", "CONFIRMED", "REJECTED"], default: "PENDING" }
  },
  providerReference: String,
  debt: {
    debtorId: { type: ObjectId },
    creditorId: { type: ObjectId },
    kind: { type: String, enum: ["CREATE", "SETTLE"] },
    status: { type: String, enum: ["OUTSTANDING", "PARTIALLY_SETTLED", "SETTLED", "DISPUTED", "CANCELLED"] },
    settledAmount: { type: Number, default: 0 }
  },
  evidence: [evidenceSchema],
  confirmedBy: { type: ObjectId },
  confirmedAt: Date,
  disputeReason: String,
  dueDate: Date,
  idempotencyKey: { type: String, index: true, sparse: true }
}, options);
payTransactionSchema.index({ relationshipId: 1, status: 1, createdAt: -1 });

export const PayTransaction = models.PayTransaction ?? model<IPayTransaction>("PayTransaction", payTransactionSchema);

// ---------- settlements ----------

export interface ISettlement {
  _id: string;
  relationshipId: string;
  payerId: string;
  receiverId: string;
  amount: number;
  status: SettlementStatus;
  transactionId?: string;
}

const settlementSchema = new Schema({
  relationshipId: { type: ObjectId, required: true, index: true },
  payerId: { type: ObjectId, required: true },
  receiverId: { type: ObjectId, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["CREATED", "COMPLETED", "CANCELLED"], default: "CREATED" },
  transactionId: String
}, options);

export const Settlement = models.Settlement ?? model<ISettlement>("Settlement", settlementSchema);

// ---------- expense splits ----------

export interface IExpenseSplit {
  _id: string;
  creatorId: string;
  merchant: string;
  note: string;
  totalAmount: number;
  splitType: SplitType;
  participants: { userId: string; share: number }[];
  status: string;
  requestIds: string[];
}

const expenseSplitSchema = new Schema({
  creatorId: { type: ObjectId, required: true, index: true },
  merchant: { type: String, required: true },
  note: { type: String, default: "" },
  totalAmount: { type: Number, required: true },
  splitType: { type: String, enum: ["equal", "custom", "percentage"], required: true },
  participants: [{ userId: { type: ObjectId, required: true }, share: { type: Number, required: true } }],
  status: { type: String, default: "OPEN" },
  requestIds: [String]
}, options);

export const ExpenseSplit = models.ExpenseSplit ?? model<IExpenseSplit>("ExpenseSplit", expenseSplitSchema);

// ---------- notifications ----------

export interface INotification {
  _id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedEntity?: string;
  relatedEntityId?: string;
  read: boolean;
}

const notificationSchema = new Schema({
  userId: { type: ObjectId, required: true, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  relatedEntity: String,
  relatedEntityId: String,
  read: { type: Boolean, default: false, index: true }
}, options);
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = models.Notification ?? model<INotification>("Notification", notificationSchema);

// ---------- audit ----------

export interface IAuditLog {
  _id: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  previousState?: string;
  newState?: string;
  metadata: Record<string, unknown>;
}

const auditLogSchema = new Schema({
  actorId: { type: ObjectId, required: true, index: true },
  entityType: { type: String, required: true, index: true },
  entityId: { type: String, required: true, index: true },
  action: { type: String, required: true },
  previousState: String,
  newState: String,
  metadata: { type: Schema.Types.Mixed, default: {} }
}, options);
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export const AuditLog = models.AuditLog ?? model<IAuditLog>("AuditLog", auditLogSchema);
