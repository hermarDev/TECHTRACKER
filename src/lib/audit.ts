import type { Prisma } from "@prisma/client";
import { db } from "./db";

export async function writeAuditLog(params: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details?: Prisma.InputJsonValue;
}) {
  return db.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details ?? {},
    },
  });
}

export async function queueEmailOutbox(params: {
  toEmail: string;
  subject: string;
  body: string;
  category: "VERIFICATION" | "PASSWORD_RESET" | "SECURITY_ALERT";
}) {
  return db.emailOutbox.create({
    data: {
      toEmail: params.toEmail,
      subject: params.subject,
      body: params.body,
      category: params.category,
    },
  });
}
