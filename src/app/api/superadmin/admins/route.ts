import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireApiSession } from "@/lib/rbac";
import { normalizePagination } from "@/lib/validation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";

const adminCreateSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(120),
  email: z.string().trim().email("Enter a valid email address").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  phone: z.string().trim().max(40).optional().nullable(),
  program: z.string().trim().max(40).optional().nullable(),
  section: z.string().trim().max(40).optional().nullable(),
});

const adminPatchSchema = z.object({
  adminId: z.string().uuid("Invalid admin id"),
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email("Enter a valid email address").toLowerCase().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  status: z.enum(["ACTIVE", "DEACTIVATED"]).optional(),
});

const USER_STATUSES = ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;

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
  const status = url.searchParams.get("status") || undefined;

  const where: Prisma.UserWhereInput = { role: "ADMIN" };
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status && (USER_STATUSES as readonly string[]).includes(status)) {
    where.status = status as (typeof USER_STATUSES)[number];
  }

  const [items, total] = await db.$transaction([
    db.user.findMany({
      where,
      orderBy: { fullName: "asc" },
      skip,
      take,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        _count: { select: { coordinatedBatches: true, adminRooms: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  return NextResponse.json({
    data: items.map((a) => ({
      id: a.id,
      fullName: a.fullName,
      email: a.email,
      phone: a.phone,
      status: a.status,
      createdAt: a.createdAt,
      coordinatedBatches: a._count.coordinatedBatches,
      assignedRooms: a._count.adminRooms,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function POST(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession(["SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parse = adminCreateSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { fullName, email, password, phone, program, section } = parse.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const created = await db.user.create({
    data: {
      fullName,
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      status: "ACTIVE",
      phone: phone ?? null,
      program: program ?? null,
      section: section ?? null,
    },
    select: { id: true, fullName: true, email: true, role: true, status: true, createdAt: true },
  });

  await writeAuditLog({
    actorId: user.id,
    action: "ADMIN_CREATED",
    entityType: "User",
    entityId: created.id,
    details: { email: created.email, fullName: created.fullName },
  });

  return NextResponse.json({ admin: created }, { status: 201 });
}

export async function PATCH(req: Request) {
  "use server";
  await cookies();
  const auth = await requireApiSession(["SUPERADMIN"]);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parse = adminPatchSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { adminId, ...changes } = parse.data;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "No fields to update were provided" }, { status: 400 });
  }

  const admin = await db.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin account not found" }, { status: 404 });
  }

  if (adminId === user.id && changes.status && changes.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "You cannot deactivate your own SuperAdmin session account" },
      { status: 400 }
    );
  }

  if (changes.email && changes.email !== admin.email) {
    const emailTaken = await db.user.findUnique({ where: { email: changes.email } });
    if (emailTaken) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
  }

  const updated = await db.user.update({
    where: { id: adminId },
    data: {
      ...(changes.fullName !== undefined ? { fullName: changes.fullName } : {}),
      ...(changes.email !== undefined ? { email: changes.email } : {}),
      ...(changes.phone !== undefined ? { phone: changes.phone } : {}),
      ...(changes.status !== undefined
        ? {
            status: changes.status,
            // Deactivation immediately ends any lockout state.
            ...(changes.status === "DEACTIVATED" ? { lockedUntil: null, failedLoginCount: 0 } : {}),
          }
        : {}),
    },
    select: { id: true, fullName: true, email: true, role: true, status: true },
  });

  await writeAuditLog({
    actorId: user.id,
    action: changes.status && changes.status !== admin.status ? "ADMIN_STATUS_CHANGED" : "ADMIN_UPDATED",
    entityType: "User",
    entityId: adminId,
    details: {
      previousStatus: admin.status,
      status: updated.status,
      fields: Object.keys(changes),
    },
  });

  return NextResponse.json({ admin: updated }, { status: 200 });
}
