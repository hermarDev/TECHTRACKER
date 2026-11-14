import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession, canUseMessaging } from "@/lib/rbac";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const messageSendSchema = z.object({
  conversationId: z.string().uuid().optional(),
  type: z.enum(["DIRECT", "BATCH"]).optional(),
  recipientIds: z.array(z.string().uuid()).optional(),
  batchId: z.string().uuid().optional(),
  body: z.string().min(1, "Message body is required"),
  attachmentKey: z.string().optional().nullable(),
  attachmentName: z.string().optional().nullable(),
  attachmentMime: z.string().optional().nullable(),
  attachmentSize: z.number().optional().nullable(),
});

export async function GET() {
  "use server";
  await cookies();
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  // Charter: SuperAdmin receives alerts only, no chat access.
  if (!canUseMessaging(user.role)) {
    return NextResponse.json({ error: "Forbidden: SuperAdmin has no chat access" }, { status: 403 });
  }

  const conversations = await db.conversation.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { updatedAt: "desc" },
    include: {
      members: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 5 },
      batch: { select: { id: true, name: true, section: true } },
    },
  });

  return NextResponse.json({ conversations });
}

export async function POST(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  if (!canUseMessaging(user.role)) {
    return NextResponse.json({ error: "Forbidden: SuperAdmin has no chat access" }, { status: 403 });
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

  const { conversationId, body: messageBody, attachmentKey, attachmentName, attachmentMime, attachmentSize } = parse.data;

  let conversation;
  if (conversationId) {
    const existing = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const isMember = existing.members.some((m) => m.userId === user.id);
    if (!isMember) {
      return NextResponse.json({ error: "Forbidden: not a member of this conversation" }, { status: 403 });
    }
    conversation = existing;
  } else {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

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
