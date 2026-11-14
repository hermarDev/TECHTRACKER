import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession, canUseMessaging } from "@/lib/rbac";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const messageSendSchema = z.object({
  body: z.string().min(1, "Message body is required"),
  attachmentKey: z.string().optional().nullable(),
  attachmentName: z.string().optional().nullable(),
  attachmentMime: z.string().optional().nullable(),
  attachmentSize: z.number().optional().nullable(),
});

export async function POST(req: Request, context: { params: Promise<{ conversationId: string }> }) {
  "use server";
  await cookies();
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  if (!canUseMessaging(user.role)) {
    return NextResponse.json({ error: "Forbidden: SuperAdmin has no chat access" }, { status: 403 });
  }

  const params = await context.params;
  const conversation = await db.conversation.findUnique({
    where: { id: params.conversationId },
    include: { members: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  const isMember = conversation.members.some((m) => m.userId === user.id);
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden: not a member of this conversation" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parse = messageSendSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { body: messageBody, attachmentKey, attachmentName, attachmentMime, attachmentSize } = parse.data;

  const message = await db.message.create({
    data: {
      conversationId: conversation.id,
      senderId: user.id,
      body: messageBody,
      attachmentKey: attachmentKey ?? null,
      attachmentName: attachmentName ?? null,
      attachmentMime: attachmentMime ?? null,
      attachmentSize: attachmentSize ?? null,
    },
    include: { sender: { select: { id: true, fullName: true, email: true } } },
  });

  await db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

  await writeAuditLog({
    actorId: user.id,
    action: "MESSAGE_SENT",
    entityType: "Message",
    entityId: message.id,
    details: { conversationId: conversation.id },
  });

  return NextResponse.json({ message }, { status: 201 });
}
