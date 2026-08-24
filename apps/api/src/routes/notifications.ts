import { Router, type NextFunction, type Request, type Response } from "express";
import { Notification } from "../models/index.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const notificationsRouter = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

notificationsRouter.get("/api/notifications", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const rows = await Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(60);
  const unread = await Notification.countDocuments({ userId: req.userId, read: false });
  res.json({
    unread,
    notifications: rows.map((row) => ({
      id: String(row._id),
      type: row.type,
      title: row.title,
      message: row.message,
      relatedEntity: row.relatedEntity,
      relatedEntityId: row.relatedEntityId,
      read: row.read,
      createdAt: row.createdAt.toISOString()
    }))
  });
}));

notificationsRouter.patch("/api/notifications/:id/read", requireAuth, wrap(async (req: AuthedRequest, res) => {
  const row = await Notification.findOne({ _id: req.params.id, userId: req.userId });
  if (!row) return res.status(404).json({ message: "Notification not found." });
  row.read = true;
  await row.save();
  res.json({ ok: true });
}));

notificationsRouter.patch("/api/notifications/read-all", requireAuth, wrap(async (req: AuthedRequest, res) => {
  await Notification.updateMany({ userId: req.userId, read: false }, { $set: { read: true } });
  res.json({ ok: true });
}));
