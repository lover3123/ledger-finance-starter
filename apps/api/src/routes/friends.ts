import { Router, type Response } from "express";
import { Friendship, User } from "../models/index.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { audit } from "../services/audit.js";
import { notify } from "../services/notify.js";
import { getOrCreateRelationship, toPayUser } from "../services/helpers.js";
import { computePairBalance } from "../services/balances.js";
import type { FriendDTO } from "@ledger/shared";

export const friendsRouter = Router();

friendsRouter.get("/api/users/search", requireAuth, async (req: AuthedRequest, res) => {
  const term = String(req.query.q ?? "").trim();
  if (term.length < 2) return res.json([]);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const users = await User.find({
    _id: { $ne: req.userId },
    $or: [
      { email: new RegExp(escaped, "i") },
      { name: new RegExp(escaped, "i") },
      { phone: new RegExp(escaped, "i") }
    ]
  }).limit(8);
  const results = [];
  for (const user of users) {
    const friendship = await Friendship.findOne({
      $or: [
        { requester: req.userId, recipient: user._id },
        { requester: user._id, recipient: req.userId }
      ]
    });
    results.push({
      id: String(user._id),
      name: user.name,
      email: user.email,
      connectionStatus: friendship?.status ?? "NONE",
      direction: friendship ? (String(friendship.requester) === req.userId ? "outgoing" : "incoming") : "none"
    });
  }
  res.json(results);
});

friendsRouter.post("/api/friends", rateLimit("friend-request", 20, 60_000), requireAuth, async (req: AuthedRequest, res) => {
  const { userId: targetId } = req.body as { userId?: string };
  if (!targetId || targetId === req.userId) return res.status(400).json({ message: "A valid user is required." });
  const target = await User.findById(targetId);
  if (!target) return res.status(404).json({ message: "User not found" });
  const existing = await Friendship.findOne({
    $or: [
      { requester: req.userId, recipient: targetId },
      { requester: targetId, recipient: req.userId }
    ]
  });
  if (existing && ["PENDING", "ACCEPTED"].includes(existing.status)) {
    return res.status(409).json({ message: existing.status === "ACCEPTED" ? "You are already connected." : "A connection request is already pending." });
  }
  if (existing) {
    existing.requester = req.userId as never;
    existing.recipient = targetId as never;
    existing.status = "PENDING";
    await existing.save();
  } else {
    await Friendship.create({ requester: req.userId, recipient: targetId, status: "PENDING" });
  }
  await audit({ actorId: req.userId!, entityType: "Friendship", entityId: targetId, action: "CONNECTION_REQUESTED", newState: "PENDING" });
  await notify({ userId: targetId, type: "CONNECTION_REQUEST", title: "Connection request", message: `${(await User.findById(req.userId))?.name ?? "Someone"} wants to connect on Ledger Pay.`, relatedEntity: "people", relatedEntityId: String(req.userId) });
  res.status(201).json({ message: "Connection request sent." });
});

friendsRouter.get("/api/friends", requireAuth, async (req: AuthedRequest, res) => {
  const friendships = await Friendship.find({
    status: { $in: ["PENDING", "ACCEPTED"] },
    $or: [{ requester: req.userId }, { recipient: req.userId }]
  }).sort({ updatedAt: -1 });

  const friendIds = friendships.map((f) => (String(f.requester) === req.userId ? String(f.recipient) : String(f.requester)));
  const users = await User.find({ _id: { $in: friendIds } });
  const byId = new Map(users.map((user) => [String(user._id), user]));

  const friends: FriendDTO[] = [];
  for (const friendship of friendships) {
    const friendId = String(friendship.requester) === req.userId ? String(friendship.recipient) : String(friendship.requester);
    const user = byId.get(friendId);
    if (!user) continue;
    const direction = friendship.status === "ACCEPTED" ? "mutual" : String(friendship.requester) === req.userId ? "outgoing" : "incoming";
    const friend: FriendDTO = {
      friendshipId: String(friendship._id),
      user: toPayUser(user),
      status: friendship.status,
      direction
    };
    if (friendship.status === "ACCEPTED") {
      const relationship = await getOrCreateRelationship(req.userId!, friendId);
      friend.relationshipId = String(relationship._id);
      const balance = await computePairBalance(String(relationship._id), req.userId!);
      friend.netBalance = balance.net;
    }
    friends.push(friend);
  }
  res.json(friends);
});

friendsRouter.patch("/api/friends/:friendshipId/accept", requireAuth, async (req: AuthedRequest, res) => {
  const friendship = await Friendship.findById(req.params.friendshipId);
  if (!friendship || String(friendship.recipient) !== req.userId) return res.status(404).json({ message: "Connection request not found." });
  if (friendship.status !== "PENDING") return res.status(409).json({ message: "This request has already been handled." });
  friendship.status = "ACCEPTED";
  await friendship.save();
  await getOrCreateRelationship(String(friendship.requester), String(friendship.recipient));
  await audit({ actorId: req.userId!, entityType: "Friendship", entityId: String(friendship._id), action: "CONNECTION_ACCEPTED", previousState: "PENDING", newState: "ACCEPTED" });
  await notify({ userId: String(friendship.requester), type: "CONNECTION_ACCEPTED", title: "Connection accepted", message: "You are now connected. You can request and settle money.", relatedEntity: "people", relatedEntityId: String(friendship.recipient) });
  res.json({ message: "Connection accepted." });
});

friendsRouter.patch("/api/friends/:friendshipId/reject", requireAuth, async (req: AuthedRequest, res) => {
  const friendship = await Friendship.findById(req.params.friendshipId);
  if (!friendship || String(friendship.recipient) !== req.userId) return res.status(404).json({ message: "Connection request not found." });
  if (friendship.status !== "PENDING") return res.status(409).json({ message: "This request has already been handled." });
  friendship.status = "REJECTED";
  await friendship.save();
  await audit({ actorId: req.userId!, entityType: "Friendship", entityId: String(friendship._id), action: "CONNECTION_REJECTED", previousState: "PENDING", newState: "REJECTED" });
  res.json({ message: "Connection request rejected." });
});

friendsRouter.delete("/api/friends/:friendshipId", requireAuth, async (req: AuthedRequest, res) => {
  const friendship = await Friendship.findById(req.params.friendshipId);
  if (!friendship || ![String(friendship.requester), String(friendship.recipient)].includes(req.userId!)) {
    return res.status(404).json({ message: "Connection not found." });
  }
  friendship.status = "REMOVED";
  await friendship.save();
  await audit({ actorId: req.userId!, entityType: "Friendship", entityId: String(friendship._id), action: "CONNECTION_REMOVED", previousState: friendship.status, newState: "REMOVED" });
  res.status(204).send();
});
