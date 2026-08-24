import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectMongo } from "./mongo.js";
import {
  AuditLog, Budget, Category, Friendship, Notification, PayTransaction,
  PaymentRequest, PersonalTransaction, Relationship, User
} from "../models/index.js";
import { DEFAULT_CATEGORIES } from "@ledger/shared";

const passwordHash = await bcrypt.hash("Demo@12345", 10);

async function upsertUser(name: string, email: string, upiId: string) {
  const existing = await User.findOne({ email });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.upiId = existing.upiId ?? upiId;
    await existing.save();
    return existing;
  }
  return User.create({ name, email, passwordHash, upiId });
}

await connectMongo();

const rohan = await upsertUser("Rohan Rajbanshi", "demo@ledger.local", "rohan@upi");
const rahul = await upsertUser("Rahul Sharma", "rahul@ledger.local", "rahul@upi");
const priya = await upsertUser("Priya Verma", "priya@ledger.local", "priya@upi");

const seedTag = "ledger-pay-seed-v1";
const alreadySeeded = await AuditLog.findOne({ "metadata.seedTag": seedTag });
if (alreadySeeded) {
  console.log("Ledger Pay seed already applied — refreshing credentials only.");
  await mongoose.disconnect();
  process.exit(0);
}

// --- personal finance for the demo user ---
await PersonalTransaction.deleteMany({ userId: rohan._id });
await Budget.deleteMany({ userId: rohan._id });
await Category.deleteMany({ userId: rohan._id });

const personalRows = [
  ["2500.00", "income", "Salary", "August salary", "2026-08-01T09:00:00"],
  ["42.50", "expense", "Food", "Groceries", "2026-08-03T18:00:00"],
  ["19.99", "expense", "Subscriptions", "Music subscription", "2026-08-05T10:00:00"],
  ["75.00", "expense", "Transport", "Fuel", "2026-08-07T08:15:00"],
  ["60.00", "income", "Freelance", "Landing page project", "2026-08-11T14:30:00"]
];
for (const [amount, type, category, description, occurredAt] of personalRows) {
  await PersonalTransaction.create({ userId: rohan._id, amount: Number(amount), type, category, description, occurredAt: new Date(occurredAt) });
}
await Budget.insertMany([
  { userId: rohan._id, category: "Food", limit: 300, month: "2026-08" },
  { userId: rohan._id, category: "Transport", limit: 180, month: "2026-08" },
  { userId: rohan._id, category: "Subscriptions", limit: 100, month: "2026-08" }
]);
await Category.insertMany(DEFAULT_CATEGORIES.map((name) => ({ userId: rohan._id, name })));

// --- relationships ---
await Friendship.deleteMany({});
await Relationship.deleteMany({});
await PaymentRequest.deleteMany({});
await PayTransaction.deleteMany({});
await Notification.deleteMany({});
await AuditLog.deleteMany({});

const friendshipRahul = await Friendship.create({ requester: rohan._id, recipient: rahul._id, status: "ACCEPTED" });
const friendshipPriya = await Friendship.create({ requester: priya._id, recipient: rohan._id, status: "ACCEPTED" });
await getPair(rahul._id, priya._id);

async function getPair(a: any, b: any) {
  const [x, y] = String(a) < String(b) ? [a, b] : [b, a];
  return Relationship.create({ userA: x, userB: y, status: "ACCEPTED", monthlyLimit: 5000, maxTransaction: 0, maxOutstanding: 0, usedAmount: 0, usedMonth: "2026-08" });
}

const relRahul = await getPair(rohan._id, rahul._id);
const relPriya = await getPair(rohan._id, priya._id);

// --- sample payment requests in different states ---
const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const requestRahul = await PaymentRequest.create({
  requestId: "REQ-20260824-DEMO1",
  senderId: rohan._id,
  payerId: rahul._id,
  counterpartyId: rahul._id,
  amount: 850,
  reason: "Restaurant payment",
  description: "ABC Restaurant dinner — please pay the bill for me.",
  type: "pay_on_behalf",
  merchantName: "ABC Restaurant",
  merchantUpiId: "abc@upi",
  status: "REQUESTED",
  expiresAt: expires
});
await PaymentRequest.create({
  requestId: "REQ-20260824-DEMO2",
  senderId: rahul._id,
  payerId: rohan._id,
  counterpartyId: rahul._id,
  amount: 1200,
  reason: "Dinner contribution",
  description: "Your half of the weekend dinner.",
  type: "split_expense",
  merchantName: "Weekend Dinner",
  status: "ACCEPTED",
  expiresAt: expires
});
await PaymentRequest.create({
  requestId: "REQ-20260824-DEMO3",
  senderId: priya._id,
  payerId: rohan._id,
  counterpartyId: priya._id,
  amount: 500,
  reason: "Movie tickets",
  description: "Please pay me back for the movie tickets.",
  type: "other",
  status: "REQUESTED",
  expiresAt: expires
});

// --- lending ledger entries (confirmed debts) ---
await PayTransaction.create({
  transactionId: "TXN-20260820-DEMOA1",
  requestId: "REQ-20260820-DEMO0",
  relationshipId: relRahul._id,
  payerId: rahul._id,
  beneficiaryId: rohan._id,
  counterpartyId: rahul._id,
  merchantName: "Groceries",
  merchantUpiId: "rahul@upi",
  amount: 300,
  type: "pay_on_behalf",
  reason: "Paid for groceries on my behalf",
  status: "COMPLETED",
  verification: { upiAppResult: "RETURNED", authority: "NOT_AVAILABLE", receiverConfirmation: "CONFIRMED" },
  debt: { debtorId: rohan._id, creditorId: rahul._id, kind: "CREATE", status: "OUTSTANDING", settledAmount: 0 },
  confirmedBy: rohan._id,
  confirmedAt: new Date()
});
await PayTransaction.create({
  transactionId: "TXN-20260822-DEMOA2",
  relationshipId: relPriya._id,
  payerId: rohan._id,
  beneficiaryId: priya._id,
  counterpartyId: priya._id,
  merchantName: "Movie Tickets",
  merchantUpiId: "priya@upi",
  amount: 500,
  type: "pay_on_behalf",
  reason: "Movie tickets for Priya",
  status: "COMPLETED",
  verification: { upiAppResult: "RETURNED", authority: "NOT_AVAILABLE", receiverConfirmation: "CONFIRMED" },
  debt: { debtorId: priya._id, creditorId: rohan._id, kind: "CREATE", status: "OUTSTANDING", settledAmount: 0 },
  confirmedBy: priya._id,
  confirmedAt: new Date()
});
await PayTransaction.create({
  transactionId: "TXN-20260823-DEMOA3",
  relationshipId: relRahul._id,
  payerId: rahul._id,
  beneficiaryId: rohan._id,
  counterpartyId: rohan._id,
  merchantName: "Weekend Dinner",
  merchantUpiId: "rohan@upi",
  amount: 1200,
  type: "split_expense",
  reason: "Split — Weekend Dinner",
  status: "COMPLETED",
  verification: { upiAppResult: "NOT_STARTED", authority: "NOT_AVAILABLE", receiverConfirmation: "CONFIRMED" },
  debt: { debtorId: rohan._id, creditorId: rahul._id, kind: "CREATE", status: "OUTSTANDING", settledAmount: 0 },
  confirmedBy: rohan._id,
  confirmedAt: new Date()
});

// --- notifications for the demo user ---
await Notification.insertMany([
  { userId: rohan._id, type: "NEW_REQUEST", title: "New payment request", message: "Priya requested ₹500 for movie tickets.", relatedEntity: "payment-request", relatedEntityId: "REQ-20260824-DEMO3" },
  { userId: rohan._id, type: "CONFIRMATION_REQUIRED", title: "Confirmation required", message: "Rahul accepted your dinner split request of ₹1,200.", relatedEntity: "payment-request", relatedEntityId: "REQ-20260824-DEMO2" },
  { userId: rahul._id, type: "NEW_REQUEST", title: "New payment request", message: "Rohan requested a restaurant payment of ₹850.", relatedEntity: "payment-request", relatedEntityId: "REQ-20260824-DEMO1" },
  { userId: priya._id, type: "CONNECTION_ACCEPTED", title: "Connection accepted", message: "You are connected with Rohan.", relatedEntity: "people", relatedEntityId: String(rohan._id) }
]);

await AuditLog.create({
  actorId: rohan._id,
  entityType: "System",
  entityId: seedTag,
  action: "SEED_APPLIED",
  newState: "OK",
  metadata: { seedTag }
});

console.log("Seeded Ledger Pay: demo@ledger.local / rahul@ledger.local / priya@ledger.local (password: Demo@12345)");
await mongoose.disconnect();
