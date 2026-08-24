import { Notification } from "../models/index.js";

export async function notify(entry: {
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedEntity?: string;
  relatedEntityId?: string;
}) {
  await Notification.create({
    userId: entry.userId,
    type: entry.type,
    title: entry.title,
    message: entry.message,
    relatedEntity: entry.relatedEntity,
    relatedEntityId: entry.relatedEntityId
  });
}
