import { AuditLog } from "../models/index.js";

export async function audit(entry: {
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  previousState?: string;
  newState?: string;
  metadata?: Record<string, unknown>;
}) {
  await AuditLog.create({
    actorId: entry.actorId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    previousState: entry.previousState,
    newState: entry.newState,
    metadata: entry.metadata ?? {}
  });
}
