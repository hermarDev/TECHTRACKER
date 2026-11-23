import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { normalizePagination } from "@/lib/validation";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

export async function GET(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const url = new URL(req.url);
  const { page, pageSize, skip, take } = normalizePagination(url.searchParams.get("page"), url.searchParams.get("pageSize"));
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const where = { userId: user.id, ...(unreadOnly ? { isRead: false } : {}) };

  const [items, unread, total] = await db.$transaction([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
    db.notification.count({ where }),
  ]);

  return NextResponse.json({ data: items, page, pageSize, total, unread, totalPages: Math.ceil(total / pageSize) });
}

export async function PATCH(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parse = markReadSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { ids, id, all } = parse.data;
  if (all) {
    const result = await db.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
    await writeAuditLog({
      actorId: user.id,
      action: "NOTIFICATIONS_MARK_READ",
      entityType: "Notification",
      entityId: "multiple",
      details: { count: result.count },
    });
    return NextResponse.json({ markedRead: result.count }, { status: 200 });
  }

  const targetIds = ids ?? (id ? [id] : []);
  if (targetIds.length === 0) {
    return NextResponse.json({ error: "No notification ids provided" }, { status: 400 });
  }

  await db.notification.updateMany({
    where: { id: { in: targetIds }, userId: user.id },
    data: { isRead: true },
  });

  await writeAuditLog({
    actorId: user.id,
    action: "NOTIFICATIONS_MARK_READ",
    entityType: "Notification",
    entityId: "multiple",
    details: { count: targetIds.length },
  });

  return NextResponse.json({ markedRead: targetIds.length }, { status: 200 });
}
