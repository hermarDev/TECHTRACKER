import { NextRequest, NextResponse } from "next/server";
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

const messageGetSchema = z.object({
  page: z.string().default("1"),
  pageSize: z.string().default("5"),
});

export async function GET(request: NextRequest) {
  "use server";
  await cookies();
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  // Charter: SuperAdmin receives alerts only, no chat access.
  if (!canUseMessaging(user.role)) {
    return NextResponse.json({ error: "Forbidden: SuperAdmin has no chat access" }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const parse = messageGetSchema.safeParse({
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "5",
  });
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid pagination params" }, { status: 400 });
  }

  const page = parse.data.page ? parseInt(parse.data.page, 10) : 1;
  const pageSize = parse.data.pageSize ? parseInt(parse.data.pageSize, 10) : 5;
  const skip = (page - 1) * pageSize;

  const conversations = await db.conversation.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { updatedAt: "desc" },
    include: {
      members: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: pageSize, skip },
      batch: { select: { id: true, name: true, section: true } },
    },
  });

  return NextResponse.json({ conversations, page, pageSize });
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

  const { conversationId, type, recipientIds, batchId, body: messageBody, attachmentKey, attachmentName, attachmentMime, attachmentSize } = parse.data;

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
    // Create new conversation
    if (!type) {
      return NextResponse.json({ error: "type (DIRECT | BATCH) is required when conversationId is omitted" }, { status: 400 });
    }
    if (type === "BATCH") {
      if (!batchId) {
        return NextResponse.json({ error: "batchId is required for BATCH type" }, { status: 400 });
      }
      // Verify batch exists and user is the coordinator
      const batch = await db.batch.findUnique({
        where: { id: batchId },
        include: { coordinator: true, students: { select: { id: true } } },
      });
      if (!batch) {
        return NextResponse.json({ error: "Batch not found" }, { status: 404 });
      }
      if (batch.coordinatorId !== user.id && user.role !== "SUPERADMIN") {
        return NextResponse.json({ error: "Forbidden: not the batch coordinator" }, { status: 403 });
      }
      // Create batch conversation with all students as members
      conversation = await db.conversation.create({
        data: {
          type: "BATCH",
          batchId: batch.id,
          members: {
            create: [
              { userId: user.id }, // coordinator
              ...batch.students.map((s) => ({ userId: s.id })), // all students in batch
            ],
          },
        },
        include: {
          members: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } },
          batch: { select: { id: true, name: true, section: true } },
        },
      });
    } else if (type === "DIRECT") {
      if (!recipientIds || recipientIds.length === 0) {
        return NextResponse.json({ error: "recipientIds is required for DIRECT type" }, { status: 400 });
      }
      // Verify all recipients exist and are eligible chat users (ADMIN or STUDENT; SuperAdmin has no chat access)
      const recipients = await db.user.findMany({
        where: { id: { in: recipientIds }, role: { in: ["ADMIN", "STUDENT"] }, status: "ACTIVE" },
      });
      if (recipients.length !== recipientIds.length) {
        return NextResponse.json({ error: "One or more recipients not found or ineligible for chat" }, { status: 404 });
      }
      // Create direct conversation
      conversation = await db.conversation.create({
        data: {
          type: "DIRECT",
          members: {
            create: [
              { userId: user.id }, // sender
              ...recipients.map((r) => ({ userId: r.id })),
            ],
          },
        },
        include: {
          members: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } },
          batch: { select: { id: true, name: true, section: true } },
        },
      });
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
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

  return NextResponse.json({ message, conversation }, { status: 201 });
}
