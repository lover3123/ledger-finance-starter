import { Friendship, Relationship, User, PaymentRequest } from "../models/index.js";
import { TransitionError, isExpiredRequest } from "./stateMachine.js";
import { audit } from "./audit.js";
import { notify } from "./notify.js";
import { computePairBalance } from "./balances.js";
import type { PayUserDTO } from "@ledger/shared";
import type { IUser, IRelationship, IFriendship } from "../models/index.js";

export function toPayUser(user: IUser): PayUserDTO {
  return { id: String(user._id), name: user.name, email: user.email, upiId: user.upiId };
}

export async function userNameMap(ids: string[]) {
  const users = await User.find({ _id: { $in: ids } });
  return new Map(users.map((user) => [String(user._id), user]));
}

export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function getFriendshipBetween(a: string, b: string): Promise<IFriendship | null> {
  return Friendship.findOne({
    status: "ACCEPTED",
    $or: [
      { requester: a, recipient: b },
      { requester: b, recipient: a }
    ]
  });
}

export async function getOrCreateRelationship(a: string, b: string): Promise<IRelationship> {
  const [userA, userB] = pairKey(a, b);
  const existing = await Relationship.findOne({ userA, userB });
  if (existing) {
    const month = new Date().toISOString().slice(0, 7);
    if (existing.usedMonth !== month) {
      existing.usedMonth = month;
      existing.usedAmount = 0;
      await existing.save();
    }
    return existing;
  }
  return Relationship.create({ userA, userB, status: "ACCEPTED" });
}

export async function getRelationshipAuthorized(relationshipId: string, userId: string) {
  const relationship = await Relationship.findById(relationshipId);
  if (!relationship || (String(relationship.userA) !== userId && String(relationship.userB) !== userId)) {
    throw Object.assign(new Error("Relationship not found"), { status: 404 });
  }
  return relationship;
}

export async function expireIfNeeded(request: any) {
  if (isExpiredRequest(request.status, request.expiresAt)) {
    const previous = request.status;
    request.status = "EXPIRED";
    await request.save();
    await audit({
      actorId: String(request.senderId),
      entityType: "PaymentRequest",
      entityId: request.requestId,
      action: "REQUEST_EXPIRED",
      previousState: previous,
      newState: "EXPIRED"
    });
  }
  return request;
}

export async function relationshipContext(userId: string, counterpartyId: string) {
  const friendship = await getFriendshipBetween(userId, counterpartyId);
  if (!friendship) throw Object.assign(new Error("You are not connected to this user."), { status: 403 });
  const relationship = await getOrCreateRelationship(userId, counterpartyId);
  return { friendship, relationship };
}

export async function relationshipWithBalance(relationship: IRelationship, userId: string) {
  const [userA, userB] = [String(relationship.userA), String(relationship.userB)];
  const friendId = userA === userId ? userB : userA;
  const friend = await User.findById(friendId);
  if (!friend) throw Object.assign(new Error("Friend not found"), { status: 404 });
  const balance = await computePairBalance(String(relationship._id), userId);
  return { relationship, friend: toPayUser(friend), balance };
}

export async function assertWithinLimit(relationship: IRelationship, amount: number, actorId: string, counterpartyName: string) {
  const balance = await computePairBalance(String(relationship._id), actorId);
  const outstanding = Math.max(balance.iOwe, balance.owedToMe);
  const available = relationship.maxOutstanding > 0
    ? Math.max(0, relationship.maxOutstanding - outstanding)
    : relationship.monthlyLimit > 0
      ? Math.max(0, relationship.monthlyLimit - relationship.usedAmount)
      : Number.POSITIVE_INFINITY;
  if (Number.isFinite(available) && amount > available) {
    throw Object.assign(new Error("LIMIT_EXCEEDED"), {
      status: 422,
      limit: { available, requested: amount, excess: Math.round((amount - available) * 100) / 100, counterpartyName }
    });
  }
  if (relationship.maxTransaction > 0 && amount > relationship.maxTransaction) {
    throw Object.assign(new Error("LIMIT_EXCEEDED"), {
      status: 422,
      limit: { available, requested: amount, excess: Math.round((amount - relationship.maxTransaction) * 100) / 100, counterpartyName }
    });
  }
}

export async function countUsage(relationship: any, amount: number) {
  const month = new Date().toISOString().slice(0, 7);
  if (relationship.usedMonth !== month) {
    relationship.usedMonth = month;
    relationship.usedAmount = 0;
  }
  relationship.usedAmount += amount;
  await relationship.save();
}

export async function requireNotificationGuard(request: any, userId: string, action: "accept" | "reject" | "cancel") {
  if (action === "cancel") {
    if (String(request.senderId) !== userId) throw new TransitionError("Only the sender can cancel this request.");
    return;
  }
  if (String(request.payerId) !== userId) throw new TransitionError("Only the requested payer can respond to this request.");
}
