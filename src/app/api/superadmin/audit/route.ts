import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { normalizePagination } from "@/lib/validation";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession(["SUPERADMIN"]);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, skip, take } = normalizePagination(
    url.searchParams.get("page"),
    url.searchParams.get("pageSize")
  );
  const search = url.searchParams.get("search") || undefined;
  const entityType = url.searchParams.get("entityType") || undefined;
  const action = url.searchParams.get("action") || undefined;

  const where: {
    OR?: object[];
    entityType?: string;
    action?: string;
  } = {};
  if (search) {
    where.OR = [
      { action: { contains: search, mode: "insensitive" as const } },
      { entityType: { contains: search, mode: "insensitive" as const } },
      { entityId: { contains: search, mode: "insensitive" as const } },
      { actor: { is: { fullName: { contains: search, mode: "insensitive" as const } } } },
      { actor: { is: { email: { contains: search, mode: "insensitive" as const } } } },
    ];
  }
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;

  const [items, total] = await db.$transaction([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        actor: { select: { id: true, fullName: true, email: true, role: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);

  const distinctEntityTypes = await db.auditLog.findMany({
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });

  return NextResponse.json({
    data: items,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    entityTypes: distinctEntityTypes.map((e) => e.entityType),
  });
}
