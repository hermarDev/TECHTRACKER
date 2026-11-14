import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { requireApiSession } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { changePasswordSchema } from "@/lib/validation";

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(120).optional(),
  phone: z
    .string()
    .trim()
    .max(32, "Phone number is too long")
    .regex(/^[0-9+()\-\s]*$/, "Phone may only contain digits, spaces and + ( ) -")
    .transform((v) => (v === "" ? null : v))
    .optional(),
  program: z.string().trim().min(2, "Program is required").max(40).optional(),
  section: z.string().trim().min(1, "Section is required").max(40).optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const user = await db.user.findUnique({
    where: { id: auth.user.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      studentIdNo: true,
      program: true,
      section: true,
      phone: true,
      batchId: true,
      requiredHours: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user });
}

export async function PUT(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = profileUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid profile details" },
      { status: 400 }
    );
  }

  const user = await db.user.update({
    where: { id: auth.user.id },
    data: {
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      program: parsed.data.program,
      section: parsed.data.section,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      program: true,
      section: true,
    },
  });

  await writeAuditLog({
    actorId: auth.user.id,
    action: "PROFILE_UPDATED",
    entityType: "User",
    entityId: auth.user.id,
    details: { fullName: user.fullName, phone: user.phone },
  });

  return NextResponse.json({ user, message: "Profile updated successfully." });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = changePasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid password change details" },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({ where: { id: auth.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const currentValid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!currentValid) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 400 }
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });

  await writeAuditLog({
    actorId: user.id,
    action: "AUTH_PASSWORD_CHANGED",
    entityType: "User",
    entityId: user.id,
    details: { email: user.email, via: "PROFILE" },
  });

  return NextResponse.json({ message: "Password changed successfully." });
}
