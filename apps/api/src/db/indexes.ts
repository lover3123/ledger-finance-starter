import mongoose from "mongoose";

/**
 * Ensure all production-critical indexes exist.
 * Called once at startup after connection.
 */
export async function ensureIndexes() {
  const db = mongoose.connection.db;
  if (!db) return;

  const collections: { name: string; indexes: Record<string, 1 | -1>[] }[] = [
    {
      name: "users",
      indexes: [
        { email: 1 },
        { phone: 1 },
        { upiId: 1 }
      ]
    },
    {
      name: "personaltransactions",
      indexes: [
        { userId: 1, occurredAt: -1 },
        { userId: 1, type: 1, occurredAt: -1 },
        { userId: 1, category: 1 }
      ]
    },
    {
      name: "budgets",
      indexes: [
        { userId: 1, month: 1, category: 1 }
      ]
    },
    {
      name: "categories",
      indexes: [
        { userId: 1, name: 1 }
      ]
    },
    {
      name: "friendships",
      indexes: [
        { requester: 1, recipient: 1 },
        { requester: 1, status: 1 },
        { recipient: 1, status: 1 }
      ]
    },
    {
      name: "relationships",
      indexes: [
        { userA: 1, userB: 1 },
        { userA: 1, status: 1 },
        { userB: 1, status: 1 }
      ]
    },
    {
      name: "paymentrequests",
      indexes: [
        { requestId: 1 },
        { senderId: 1, createdAt: -1 },
        { payerId: 1, status: 1, createdAt: -1 },
        { counterpartyId: 1, createdAt: -1 },
        { status: 1, expiresAt: 1 }
      ]
    },
    {
      name: "paymentsessions",
      indexes: [
        { sessionId: 1 },
        { requestId: 1 },
        { transactionId: 1 },
        { payerId: 1, createdAt: -1 },
        { idempotencyKey: 1 },
        { status: 1 }
      ]
    },
    {
      name: "paytransactions",
      indexes: [
        { transactionId: 1 },
        { requestId: 1 },
        { paymentSessionId: 1 },
        { relationshipId: 1, status: 1, createdAt: -1 },
        { payerId: 1, createdAt: -1 },
        { beneficiaryId: 1, createdAt: -1 },
        { counterpartyId: 1, createdAt: -1 },
        { idempotencyKey: 1 },
        { "debt.debtorId": 1, "debt.status": 1 },
        { "debt.creditorId": 1, "debt.status": 1 }
      ]
    },
    {
      name: "settlements",
      indexes: [
        { relationshipId: 1, createdAt: -1 },
        { payerId: 1, createdAt: -1 },
        { receiverId: 1, createdAt: -1 }
      ]
    },
    {
      name: "expensesplits",
      indexes: [
        { creatorId: 1, createdAt: -1 },
        { "participants.userId": 1 }
      ]
    },
    {
      name: "notifications",
      indexes: [
        { userId: 1, read: 1, createdAt: -1 },
        { userId: 1, createdAt: -1 }
      ]
    },
    {
      name: "auditlogs",
      indexes: [
        { entityType: 1, entityId: 1, createdAt: -1 },
        { actorId: 1, createdAt: -1 }
      ]
    },
    {
      name: "balanceadjustments",
      indexes: [
        { userId: 1, date: -1 }
      ]
    }
  ];

  for (const col of collections) {
    try {
      const collection = db.collection(col.name);
      for (const idx of col.indexes) {
        await collection.createIndex(idx, { background: true });
      }
    } catch {
      // Collection might not exist yet — that's fine
    }
  }
}
